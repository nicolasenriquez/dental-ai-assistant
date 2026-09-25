import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  ApiError,
  type ClinicalDraft,
  type ClinicalPatient,
  type ClinicalThread,
  type ComposerContextItem,
  cancelClinicalTurn,
  getClinicalThread,
  prepareClinicalSave,
  regenerateClinicalDraft,
  resolveClinicalAction,
  resolveClinicalPatientSwitch,
  retryClinicalDriveExport,
  returnClinicalActionToEditing,
  setClinicalActivePatient,
  streamClinicalTurn,
  updateClinicalArtifact,
} from '../lib/api';
import { clinicalTrace } from '../lib/clinicalTelemetry';
import { consumeSse } from '../lib/sse';
import {
  type ClinicalApprovalItem,
  type ClinicalDraftItem,
  type ClinicalItemStatus,
  type ClinicalPatientSwitchItem,
  type ClinicalRuntime,
  type ClinicalTranscriptItem,
  artifactToDraftItem,
  classifyClinicalDecodeFailure,
  clinicalReducer,
  createClinicalReducerState,
  decodeClinicalEvent,
} from './clinicalRuntime';

export type {
  ClinicalApprovalItem,
  ClinicalDraftItem,
  ClinicalPatientSwitchItem,
  ClinicalTranscriptItem,
  ClinicalRuntime,
} from './clinicalRuntime';

const now = () => new Date().toISOString();
const RUT_CANDIDATE =
  /(?<![\d.])(?:[\d•]{1,2}(?:[.\s][\d•]{3}){1,2}(?:\s*-\s*|\s*)|[\d•]{4,8}(?:\s*-\s*|\s+)|\d{5,8})[0-9kK](?!\d)/g;

function redactIdentifiers(content: string): string {
  return content.replace(RUT_CANDIDATE, '••••');
}

function safeError(code: string): string {
  const messages: Record<string, string> = {
    ACTION_EXPIRED: 'Esta confirmación expiró. Prepara nuevamente la evolución.',
    CLINICAL_EXTERNAL_LLM_DISABLED: 'La asistencia clínica externa está deshabilitada.',
    CLINICAL_CONTENT_INSUFFICIENT: 'Añade un poco más de contexto para preparar la evolución.',
    CLINICAL_MODEL_UNAVAILABLE: 'No pudimos preparar la evolución. Tu nota se conserva.',
    CLINICAL_PENDING_ACTION_EXISTS: 'Ya existe una confirmación pendiente en este hilo.',
    CLINICAL_RATE_LIMIT_EXCEEDED: 'Alcanzaste el límite diario del asistente clínico.',
    CLINICAL_TURN_CANCELLED: 'Respuesta detenida. Tu nota se conserva y puedes reintentar.',
    CLINICAL_TURN_STALE: 'La respuesta se interrumpió. Tu nota se conserva y puedes reintentar.',
    PATIENT_REFERENCE_AMBIGUOUS: 'Detecté más de un paciente. Selecciona uno antes de continuar.',
    PATIENT_SWITCH_REQUIRED: 'Revisa el cambio de paciente antes de continuar.',
    PROPOSAL_STALE: 'La propuesta cambió. Vuelve a prepararla antes de confirmar.',
    SENSITIVE_INPUT_FAILURE: 'No pudimos revisar la nota. Tu texto se conserva.',
    TURN_ALREADY_RUNNING: 'Ya hay una respuesta en curso. Espera a que termine.',
    TOOL_EXECUTION_FAILED: 'No pudimos completar la consulta. Tu nota se conserva.',
    EVOLUTION_SAVE_FAILED: 'No pudimos guardar la evolución. Tu borrador se conserva.',
  };
  return messages[code] ?? 'No pudimos completar la acción. Tu trabajo se conserva.';
}

function apiErrorCode(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const detail =
    error.body && typeof error.body === 'object' && 'detail' in error.body
      ? (error.body as { detail?: unknown }).detail
      : null;
  return detail && typeof detail === 'object' && 'code' in detail && typeof detail.code === 'string'
    ? detail.code
    : null;
}

function messageItems(thread: ClinicalThread): ClinicalTranscriptItem[] {
  return thread.messages.flatMap((message): ClinicalTranscriptItem[] => {
    const items: ClinicalTranscriptItem[] = [
      {
        id: message.id,
        turnId: message.turn_id,
        status: 'completed',
        createdAt: message.created_at,
        type: message.role,
        content: message.content,
        ...(message.role === 'user' && message.context_items
          ? {
              contextItems: message.context_items.map((item) => ({
                id: item.id,
                kind: item.kind,
                sourceId: item.source_id,
                sourceName: item.source_name,
                content: item.content,
              })),
            }
          : {}),
      },
    ];
    if (message.role === 'user' && message.patient_switch) {
      items.push({
        id: message.patient_switch.item_id,
        turnId: message.turn_id,
        status: message.patient_switch.resolution === 'pending' ? 'pending' : 'completed',
        createdAt: message.created_at,
        type: 'patient_switch',
        current: message.patient_switch.current_patient,
        detected: message.patient_switch.detected_patient,
        resolution: message.patient_switch.resolution,
      });
    }
    if (
      message.role === 'user' &&
      message.turn_status === 'failed' &&
      message.turn_error_code !== 'PATIENT_SWITCH_REQUIRED'
    ) {
      const code = message.turn_error_code ?? 'CLINICAL_TURN_FAILED';
      items.push({
        id: `error:${message.turn_id}`,
        turnId: message.turn_id,
        status: 'failed',
        createdAt: message.created_at,
        type: 'error',
        code,
        message: safeError(code),
      });
    }
    return items;
  });
}

function actionItems(thread: ClinicalThread): ClinicalTranscriptItem[] {
  return (thread.actions ?? []).map((action) => ({
    id: action.id,
    turnId: action.turn_id,
    status:
      action.status === 'pending'
        ? 'pending'
        : action.status === 'approved'
          ? 'completed'
          : action.status === 'declined'
            ? 'declined'
            : 'failed',
    createdAt: action.created_at,
    type: 'approval' as const,
    action,
    patient: action.patient ??
      thread.active_patient ?? {
        id: action.patient_id,
        first_name: 'Paciente',
        last_name: '',
        rut_masked: '••••',
      },
  }));
}

function hydrateItems(thread: ClinicalThread): ClinicalTranscriptItem[] {
  return [
    ...messageItems(thread),
    ...(thread.artifacts ?? []).map(artifactToDraftItem),
    ...actionItems(thread),
  ].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function useClinicalAssistant(threadId: string | undefined) {
  const [thread, setThread] = useState<ClinicalThread | null>(null);
  const [clinicalState, dispatch] = useReducer(clinicalReducer, undefined, () =>
    createClinicalReducerState(),
  );
  const [runtime, setRuntime] = useState<ClinicalRuntime>('idle');
  const [error, setError] = useState<string | null>(null);
  const [artifactSyncState, setArtifactSyncState] = useState<
    Record<string, 'idle' | 'saving' | 'saved' | 'error'>
  >({});
  const abortRef = useRef<AbortController | null>(null);
  const stopInFlightRef = useRef<string | null>(null);
  const activeTurnRef = useRef<string | null>(null);
  const threadIdRef = useRef(threadId);
  threadIdRef.current = threadId;
  const turnFailedRef = useRef(false);
  const loadSeqRef = useRef(0);
  const activePatientRequestSeqRef = useRef(0);
  const turnInputRef = useRef<Record<string, string>>({});
  const artifactTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const artifactSyncsRef = useRef<Record<string, Promise<void>>>({});
  // ponytail: local exclusion; cross-session editing needs server-side conditional writes.
  const busyArtifactsRef = useRef(new Set<string>());
  const recoveredExportsRef = useRef(new Set<string>());
  const patientSwitchItemsRef = useRef<ClinicalPatientSwitchItem[]>([]);

  const load = useCallback(async (): Promise<ClinicalThread | null> => {
    if (!threadId || threadIdRef.current !== threadId) return null;
    const seq = ++loadSeqRef.current;
    const loaded = await getClinicalThread(threadId);
    if (seq !== loadSeqRef.current || threadIdRef.current !== threadId) return null;
    setThread(loaded);
    activeTurnRef.current = loaded.active_turn_id;
    const actions = loaded.actions ?? [];
    const hydrated = hydrateItems({ ...loaded, actions });
    dispatch({ type: 'reset', items: hydrated });
    for (const item of patientSwitchItemsRef.current) dispatch({ type: 'append', item });
    setRuntime(
      loaded.active_turn_id
        ? 'streaming'
        : actions.some((action) => action.status === 'pending')
          ? 'awaiting_approval'
          : 'idle',
    );
    for (const action of actions) {
      const exportState = action.drive_export;
      const evolutionId = action.result_resource_id;
      if (
        !evolutionId ||
        !exportState ||
        !['pending', 'syncing', 'unknown'].includes(exportState.status)
      )
        continue;
      const recoveryKey = `${loaded.id}:${evolutionId}`;
      if (recoveredExportsRef.current.has(recoveryKey)) continue;
      recoveredExportsRef.current.add(recoveryKey);
      void retryClinicalDriveExport(evolutionId)
        .then(({ drive_export }) => {
          dispatch({ type: 'updateDriveExport', evolutionId, driveExport: drive_export });
        })
        .catch(() => undefined);
    }
    return loaded;
  }, [threadId]);

  useEffect(() => {
    let cancelled = false;
    loadSeqRef.current += 1;
    activePatientRequestSeqRef.current += 1;
    if (!threadId) {
      setThread(null);
      dispatch({ type: 'reset', items: [] });
      setRuntime('idle');
      setError(null);
      patientSwitchItemsRef.current = [];
      return;
    }
    setThread(null);
    dispatch({ type: 'reset', items: [] });
    setRuntime('idle');
    setError(null);
    patientSwitchItemsRef.current = [];
    void load().catch(() => {
      if (!cancelled) setError('No pudimos cargar este hilo clínico.');
    });
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [load, threadId]);

  useEffect(() => {
    if (!threadId || !thread?.active_turn_id || abortRef.current) return;
    const timer = setInterval(() => {
      void getClinicalThread(threadId)
        .then((fresh) => {
          if (!fresh.active_turn_id) void load();
        })
        .catch(() => setError('No pudimos actualizar este hilo clínico.'));
    }, 2000);
    return () => clearInterval(timer);
  }, [threadId, thread?.active_turn_id, load]);

  const setActivePatient = useCallback(
    async (patientId: string | null) => {
      if (!threadId) return;
      const requestSeq = ++activePatientRequestSeqRef.current;
      const updated = await setClinicalActivePatient(threadId, patientId);
      if (requestSeq !== activePatientRequestSeqRef.current) return;
      setThread(updated);
    },
    [threadId],
  );

  const send = useCallback(
    async (content: string, contextItems: ComposerContextItem[] = []): Promise<boolean> => {
      const currentThreadId = threadId;
      if (!currentThreadId || !content.trim()) return false;
      const turnId = crypto.randomUUID();
      activeTurnRef.current = turnId;
      const createdAt = now();
      // A slow initial hydration must not overwrite the optimistic user item
      // or the streamed artifact for the turn that is already in progress.
      loadSeqRef.current += 1;
      turnFailedRef.current = false;
      turnInputRef.current[turnId] = content;
      setError(null);
      setRuntime('streaming');
      dispatch({
        type: 'append',
        item: {
          id: `user:${turnId}`,
          turnId,
          status: 'completed',
          createdAt,
          type: 'user',
          content: redactIdentifiers(content),
          contextItems: contextItems.map((item) => ({
            ...item,
            sourceName: redactIdentifiers(item.sourceName),
            content: redactIdentifiers(item.content),
          })),
        },
      });
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const response = await streamClinicalTurn(
          currentThreadId,
          {
            turn_id: turnId,
            content,
            context_items: contextItems.map((item) => ({
              id: item.id,
              kind: item.kind,
              source_id: item.sourceId,
              source_name: item.sourceName,
              content: item.content,
            })),
          },
          controller.signal,
        );
        await consumeSse(
          response,
          ({ event, data }) => {
            if (!event) return;
            clinicalTrace('clinical.sse.received', {
              event,
              thread_id: currentThreadId,
              turn_id: turnId,
            });
            const decoded = decodeClinicalEvent(event, data, { threadId: currentThreadId, turnId });
            if (!decoded) {
              const failure = classifyClinicalDecodeFailure(event, data);
              clinicalTrace('clinical.sse.rejected', {
                event,
                thread_id: currentThreadId,
                turn_id: turnId,
                reason: failure ?? 'unknown',
              });
              if (failure === 'critical') {
                turnFailedRef.current = true;
                dispatch({
                  type: 'append',
                  item: {
                    id: `error:${turnId}`,
                    turnId,
                    status: 'failed',
                    createdAt: now(),
                    type: 'error',
                    code: 'MALFORMED_CLINICAL_ARTIFACT',
                    message: 'No pudimos mostrar el borrador clínico. Tu nota se conserva.',
                  },
                });
                setError('No pudimos mostrar el borrador clínico. Tu nota se conserva.');
                setRuntime('failed');
              } else {
                console.warn('clinical_event_discarded', {
                  event,
                  threadId: currentThreadId,
                  turnId,
                });
              }
              return;
            }
            const payload = decoded.data;
            clinicalTrace('clinical.sse.decoded', {
              event,
              thread_id: decoded.threadId,
              turn_id: decoded.turnId,
              item_id: decoded.itemId,
              item_type: decoded.itemType,
              sequence: decoded.sequence,
              status: decoded.status,
            });
            dispatch({ type: 'event', event: decoded });
            clinicalTrace('clinical.reducer.applied', {
              thread_id: decoded.threadId,
              turn_id: decoded.turnId,
              item_id: decoded.itemId,
              item_type: decoded.itemType,
              sequence: decoded.sequence,
            });
            if (decoded.itemType === 'approval_request') {
              setRuntime('awaiting_approval');
            }
            if (event === 'turn.started' && typeof payload.user_content === 'string') {
              dispatch({
                type: 'append',
                item: {
                  id: `user:${turnId}`,
                  turnId,
                  status: 'completed',
                  createdAt: typeof payload.created_at === 'string' ? payload.created_at : now(),
                  type: 'user',
                  content: payload.user_content,
                },
              });
            }
            if (event === 'patient.bound') {
              const patient = payload.patient as ClinicalPatient | undefined;
              if (patient?.id) {
                setThread((current) =>
                  current ? { ...current, active_patient: patient } : current,
                );
              }
            } else if (event === 'patient.switch_required') {
              const currentPatient = payload.current_patient as ClinicalPatient | undefined;
              const detectedPatient = payload.detected_patient as ClinicalPatient | undefined;
              if (currentPatient?.id && detectedPatient?.id) {
                patientSwitchItemsRef.current = [
                  ...patientSwitchItemsRef.current.filter((item) => item.id !== decoded.itemId),
                  {
                    id: decoded.itemId,
                    turnId: decoded.turnId,
                    status: 'pending',
                    createdAt: now(),
                    type: 'patient_switch',
                    current: currentPatient,
                    detected: detectedPatient,
                    resolution: 'pending',
                  },
                ];
              }
            } else if (event === 'turn.failed') {
              turnFailedRef.current = true;
              const code =
                typeof payload.error_code === 'string' ? payload.error_code : 'CLINICAL_ERROR';
              setError(code === 'PATIENT_SWITCH_REQUIRED' ? null : safeError(code));
              setRuntime('failed');
            } else if (event === 'turn.completed') {
              setRuntime((current) => (current === 'awaiting_approval' ? current : 'idle'));
            }
          },
          controller.signal,
        );
        clinicalTrace('clinical.stream.closed', {
          thread_id: currentThreadId,
          turn_id: turnId,
        });
        // SSE is the fast path. The persisted thread is the final source of truth,
        // so a dropped or malformed live event never requires a page refresh.
        try {
          clinicalTrace('clinical.reconciliation.started', {
            thread_id: currentThreadId,
            turn_id: turnId,
          });
          const reconciled = await load();
          clinicalTrace('clinical.reconciliation.merged', {
            thread_id: currentThreadId,
            turn_id: turnId,
            item_count:
              (reconciled?.messages.length ?? 0) +
              (reconciled?.artifacts?.length ?? 0) +
              (reconciled?.actions?.length ?? 0),
          });
          if (reconciled?.artifacts?.some((artifact) => artifact.turn_id === turnId)) {
            turnFailedRef.current = false;
            setError(null);
          }
        } catch {
          // The live result remains usable. A later load will retry reconciliation.
        }
        return !turnFailedRef.current;
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === 'AbortError') {
          setRuntime('idle');
          setError(null);
          try {
            await load();
          } catch {
            // The composer must remain usable even if reconciliation fails.
          }
        } else {
          const started = Date.now();
          try {
            const reconciled = await load();
            const savedTurn = reconciled?.messages.find((message) => message.turn_id === turnId);
            const savedArtifact = reconciled?.artifacts?.some((item) => item.turn_id === turnId);
            const savedAction = reconciled?.actions?.some((item) => item.turn_id === turnId);
            const outcome =
              savedArtifact || savedAction || savedTurn?.turn_status === 'completed'
                ? 'completed'
                : reconciled?.active_turn_id === turnId
                  ? 'running'
                  : savedTurn?.turn_status === 'failed'
                    ? 'failed'
                    : 'missing';
            clinicalTrace('clinical.reconciliation.finished', {
              thread_id: currentThreadId,
              turn_id: turnId,
              outcome,
              attempt_count: 1,
              latency_ms: Date.now() - started,
              failure_class: 'transport',
            });
            if (outcome === 'completed' || outcome === 'running') {
              setError(null);
              return true;
            }
            if (outcome === 'failed') {
              setError(safeError(savedTurn?.turn_error_code ?? 'CLINICAL_TURN_FAILED'));
              setRuntime('failed');
              return false;
            }
          } catch {
            clinicalTrace('clinical.reconciliation.finished', {
              thread_id: currentThreadId,
              turn_id: turnId,
              outcome: 'unavailable',
              attempt_count: 1,
              latency_ms: Date.now() - started,
              failure_class: 'transport',
            });
          }
          if (threadIdRef.current === currentThreadId) {
            dispatch({
              type: 'append',
              item: {
                id: `user:${turnId}`,
                turnId,
                status: 'completed',
                createdAt,
                type: 'user',
                content: redactIdentifiers(content),
              },
            });
          }
          setError(safeError('CLINICAL_TURN_FAILED'));
          setRuntime('failed');
        }
        return false;
      } finally {
        abortRef.current = null;
      }
    },
    [load, threadId],
  );

  const scheduleArtifactSync = useCallback(
    (
      itemId: string,
      patch: { draft?: ClinicalDraft; sourceNote?: string; evolutionAt?: string },
    ) => {
      if (!threadId || busyArtifactsRef.current.has(itemId)) return;
      const current = clinicalState.items.find(
        (item) => item.id === itemId && item.type === 'draft',
      );
      if (!current || current.type !== 'draft') return;
      const nextDraft = patch.draft ?? current.draft;
      const nextSource = patch.sourceNote ?? current.sourceNote;
      const nextEvolutionAt = patch.evolutionAt ?? current.evolutionAt;
      const previousTimer = artifactTimersRef.current[itemId];
      if (previousTimer) clearTimeout(previousTimer);
      setArtifactSyncState((state) => ({ ...state, [itemId]: 'saving' }));
      artifactTimersRef.current[itemId] = setTimeout(() => {
        delete artifactTimersRef.current[itemId];
        const previous = artifactSyncsRef.current[itemId] ?? Promise.resolve();
        artifactSyncsRef.current[itemId] = previous
          .catch(() => undefined)
          .then(() =>
            updateClinicalArtifact(threadId, itemId, {
              source_note: nextSource,
              draft: nextDraft,
              evolution_at: nextEvolutionAt,
            }),
          )
          .then(() => undefined);
        void artifactSyncsRef.current[itemId]
          .then(() => setArtifactSyncState((state) => ({ ...state, [itemId]: 'saved' })))
          .catch(() => setArtifactSyncState((state) => ({ ...state, [itemId]: 'error' })));
      }, 300);
    },
    [clinicalState.items, threadId],
  );

  const updateDraft = useCallback(
    (itemId: string, draft: ClinicalDraft) => {
      if (busyArtifactsRef.current.has(itemId)) return;
      dispatch({ type: 'updateDraft', itemId, draft });
      scheduleArtifactSync(itemId, { draft });
    },
    [scheduleArtifactSync],
  );

  const updateDraftSource = useCallback(
    async (itemId: string, sourceNote: string): Promise<boolean> => {
      if (!threadId || busyArtifactsRef.current.has(itemId)) return false;
      const current = clinicalState.items.find(
        (item) => item.id === itemId && item.type === 'draft',
      );
      if (!current || current.type !== 'draft') return false;
      busyArtifactsRef.current.add(itemId);
      dispatch({ type: 'setDraftBusy', itemId, busy: true });
      clearTimeout(artifactTimersRef.current[itemId]);
      delete artifactTimersRef.current[itemId];
      setArtifactSyncState((state) => ({ ...state, [itemId]: 'saving' }));
      dispatch({ type: 'updateSource', itemId, sourceNote });
      try {
        const previous = artifactSyncsRef.current[itemId] ?? Promise.resolve();
        const sync = previous
          .catch(() => undefined)
          .then(() =>
            updateClinicalArtifact(threadId, itemId, {
              source_note: sourceNote,
              draft: current.draft,
              evolution_at: current.evolutionAt,
            }),
          );
        artifactSyncsRef.current[itemId] = sync.then(() => undefined);
        void artifactSyncsRef.current[itemId].catch(() => undefined);
        await sync;
        setArtifactSyncState((state) => ({ ...state, [itemId]: 'saved' }));
        setError(null);
        return true;
      } catch {
        setArtifactSyncState((state) => ({ ...state, [itemId]: 'error' }));
        return false;
      } finally {
        busyArtifactsRef.current.delete(itemId);
        dispatch({ type: 'setDraftBusy', itemId, busy: false });
      }
    },
    [clinicalState.items, threadId],
  );

  const updateDraftDate = useCallback(
    (itemId: string, evolutionAt: string) => {
      if (busyArtifactsRef.current.has(itemId)) return;
      dispatch({ type: 'updateDate', itemId, evolutionAt });
      scheduleArtifactSync(itemId, { evolutionAt });
    },
    [scheduleArtifactSync],
  );

  const regenerateDraft = useCallback(
    async (item: ClinicalDraftItem) => {
      if (!threadId || busyArtifactsRef.current.has(item.id)) return;
      busyArtifactsRef.current.add(item.id);
      dispatch({ type: 'setDraftBusy', itemId: item.id, busy: true });
      setArtifactSyncState((state) => ({ ...state, [item.id]: 'saving' }));
      let persisted = false;
      try {
        clearTimeout(artifactTimersRef.current[item.id]);
        delete artifactTimersRef.current[item.id];
        await artifactSyncsRef.current[item.id];
        await updateClinicalArtifact(threadId, item.id, {
          source_note: item.sourceNote,
          draft: item.draft,
          evolution_at: item.evolutionAt,
        });
        persisted = true;
        setArtifactSyncState((state) => ({ ...state, [item.id]: 'saved' }));
        const draft = await regenerateClinicalDraft(threadId, item.id);
        dispatch({ type: 'replaceDraft', itemId: item.id, draft });
        setError(null);
      } catch {
        if (!persisted) setArtifactSyncState((state) => ({ ...state, [item.id]: 'error' }));
        setError(safeError('CLINICAL_MODEL_UNAVAILABLE'));
        setRuntime('failed');
      } finally {
        busyArtifactsRef.current.delete(item.id);
        dispatch({ type: 'setDraftBusy', itemId: item.id, busy: false });
      }
    },
    [threadId],
  );

  const prepareDraft = useCallback(
    async (item: ClinicalDraftItem): Promise<ClinicalApprovalItem | null> => {
      if (!threadId || item.stale || busyArtifactsRef.current.has(item.id)) return null;
      busyArtifactsRef.current.add(item.id);
      dispatch({ type: 'setDraftBusy', itemId: item.id, busy: true });
      try {
        const syncTimer = artifactTimersRef.current[item.id];
        if (syncTimer) clearTimeout(syncTimer);
        await artifactSyncsRef.current[item.id]?.catch(() => undefined);
        await updateClinicalArtifact(threadId, item.id, {
          source_note: item.sourceNote,
          draft: item.draft,
          evolution_at: item.evolutionAt,
        });
        const action = await prepareClinicalSave(threadId, {
          turn_id: item.turnId,
          artifact_id: item.id,
        });
        const approval: ClinicalApprovalItem = {
          id: action.id,
          turnId: item.turnId,
          status: 'pending',
          createdAt: action.created_at,
          type: 'approval',
          action,
          patient: action.patient,
        };
        dispatch({ type: 'upsertApproval', item: approval });
        setRuntime('awaiting_approval');
        return approval;
      } catch (caught) {
        const code = apiErrorCode(caught) ?? 'CLINICAL_PREPARE_FAILED';
        setError(safeError(code));
        setRuntime(code === 'CLINICAL_PENDING_ACTION_EXISTS' ? 'awaiting_approval' : 'failed');
        return null;
      } finally {
        busyArtifactsRef.current.delete(item.id);
        dispatch({ type: 'setDraftBusy', itemId: item.id, busy: false });
      }
    },
    [threadId],
  );

  const resolve = useCallback(
    async (item: ClinicalApprovalItem, decision: 'approve' | 'decline') => {
      setRuntime('saving');
      dispatch({ type: 'resolveApproval', itemId: item.id, status: 'running' });
      try {
        const result = await resolveClinicalAction(
          item.action.id,
          decision,
          item.action.proposal_hash,
        );
        const resolvedStatus: ClinicalItemStatus =
          result.status === 'approved'
            ? 'completed'
            : result.status === 'declined'
              ? 'declined'
              : 'failed';
        dispatch({
          type: 'resolveApproval',
          itemId: item.id,
          status: resolvedStatus,
          action: result,
        });
        setRuntime('idle');
        setThread((current) => (current ? { ...current, pending_action: null } : current));
      } catch (caught) {
        const code = apiErrorCode(caught);
        const unavailable = code === 'ACTION_EXPIRED' || code === 'EVOLUTION_SAVE_FAILED';
        dispatch({
          type: 'resolveApproval',
          itemId: item.id,
          status: unavailable ? 'failed' : 'pending',
        });
        setError(safeError(code ?? 'EVOLUTION_SAVE_FAILED'));
        setRuntime(unavailable ? 'failed' : 'awaiting_approval');
      }
    },
    [],
  );

  const retryDriveExport = useCallback(async (evolutionId: string) => {
    try {
      const { drive_export } = await retryClinicalDriveExport(evolutionId);
      dispatch({ type: 'updateDriveExport', evolutionId, driveExport: drive_export });
    } catch (caught) {
      setError(safeError(apiErrorCode(caught) ?? 'DRIVE_EXPORT_RECOVERY_FAILED'));
    }
  }, []);

  const backToEdit = useCallback(async (item: ClinicalApprovalItem): Promise<boolean> => {
    try {
      const result = await returnClinicalActionToEditing(item.action.id);
      dispatch({
        type: 'returnToEditing',
        approvalId: item.id,
        artifactId: result.artifact_id,
      });
      setThread((current) => (current ? { ...current, pending_action: null } : current));
      setRuntime('idle');
      clinicalTrace('artifact.back_to_edit', { thread_id: item.action.thread_id });
      return true;
    } catch {
      setError('No pudimos volver a la edición. Intenta nuevamente.');
      return false;
    }
  }, []);

  const stop = useCallback(() => {
    const turnId = activeTurnRef.current;
    if (!threadId || !turnId || stopInFlightRef.current === turnId) return;
    stopInFlightRef.current = turnId;
    const started = Date.now();
    setRuntime('stopping');
    void (async () => {
      try {
        for (let attempt = 0; attempt < 8; attempt += 1) {
          try {
            await cancelClinicalTurn(threadId, turnId);
            abortRef.current?.abort();
            await load();
            clinicalTrace('clinical.cancellation.finished', {
              thread_id: threadId,
              turn_id: turnId,
              outcome: 'cancelled',
              attempt_count: attempt + 1,
              latency_ms: Date.now() - started,
              failure_class: null,
            });
            return;
          } catch (caught) {
            if (caught instanceof ApiError && caught.status === 409) {
              if (attempt < 7) {
                // The Stop request can reach the server before the turn POST.
                await new Promise((resolve) => setTimeout(resolve, 250));
                continue;
              }
              await load();
              clinicalTrace('clinical.cancellation.finished', {
                thread_id: threadId,
                turn_id: turnId,
                outcome: 'already_terminal',
                attempt_count: attempt + 1,
                latency_ms: Date.now() - started,
                failure_class: 'routing',
              });
              return;
            }
            setError('No pudimos detener la respuesta. Intenta nuevamente.');
            setRuntime('streaming');
            clinicalTrace('clinical.cancellation.finished', {
              thread_id: threadId,
              turn_id: turnId,
              outcome: 'failed',
              attempt_count: attempt + 1,
              latency_ms: Date.now() - started,
              failure_class: 'transport',
            });
            return;
          }
        }
      } finally {
        if (stopInFlightRef.current === turnId) stopInFlightRef.current = null;
      }
    })();
  }, [load, threadId]);

  const retryTurn = useCallback(
    (turnId: string) => {
      const userItem = clinicalState.items.find(
        (item) => item.type === 'user' && item.turnId === turnId,
      );
      const content =
        turnInputRef.current[turnId] ?? (userItem?.type === 'user' ? userItem.content : undefined);
      const contextItems = userItem?.type === 'user' ? (userItem.contextItems ?? []) : [];
      if (content) void send(content, contextItems);
    },
    [clinicalState.items, send],
  );

  const cancelPatientSwitch = useCallback(
    async (itemId: string) => {
      const item = clinicalState.items.find(
        (candidate) => candidate.id === itemId && candidate.type === 'patient_switch',
      );
      if (!threadId || !item || item.type !== 'patient_switch') return;
      try {
        const updated = await resolveClinicalPatientSwitch(threadId, item.turnId, 'keep_current');
        setThread(updated);
        patientSwitchItemsRef.current = patientSwitchItemsRef.current.map((candidate) =>
          candidate.id === itemId
            ? { ...candidate, status: 'completed', resolution: 'kept_current' }
            : candidate,
        );
        dispatch({ type: 'resolvePatientSwitch', itemId, resolution: 'kept_current' });
        setError(null);
        setRuntime('idle');
      } catch {
        setError('No pudimos guardar la decisión de paciente.');
      }
    },
    [clinicalState.items, threadId],
  );

  const confirmPatientSwitch = useCallback(
    async (item: ClinicalPatientSwitchItem) => {
      if (!threadId) return;
      try {
        const updated = await resolveClinicalPatientSwitch(threadId, item.turnId, 'change_patient');
        setThread(updated);
        patientSwitchItemsRef.current = patientSwitchItemsRef.current.map((candidate) =>
          candidate.id === item.id
            ? { ...candidate, status: 'completed', resolution: 'changed_patient' }
            : candidate,
        );
        dispatch({ type: 'resolvePatientSwitch', itemId: item.id, resolution: 'changed_patient' });
        setError(null);
        setRuntime('idle');
      } catch {
        setError('No pudimos cambiar el paciente activo.');
      }
    },
    [threadId],
  );

  return {
    thread,
    items: clinicalState.items,
    runtime,
    error,
    send,
    stop,
    setActivePatient,
    updateDraft,
    updateDraftSource,
    updateDraftDate,
    regenerateDraft,
    prepareDraft,
    resolve,
    backToEdit,
    cancelPatientSwitch,
    confirmPatientSwitch,
    reload: load,
    retryTurn,
    retryDriveExport,
    artifactSyncState,
    retryArtifactSync: (item: ClinicalDraftItem) =>
      scheduleArtifactSync(item.id, {
        draft: item.draft,
        sourceNote: item.sourceNote,
        evolutionAt: item.evolutionAt,
      }),
  };
}

export type ClinicalAssistantController = ReturnType<typeof useClinicalAssistant>;
