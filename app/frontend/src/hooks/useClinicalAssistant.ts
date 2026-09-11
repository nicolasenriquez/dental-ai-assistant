import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  ApiError,
  type ClinicalDraft,
  type ClinicalPatient,
  type ClinicalThread,
  getClinicalThread,
  prepareClinicalSave,
  regenerateClinicalDraft,
  resolveClinicalAction,
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
  type ClinicalPatientSwitch,
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
  ClinicalPatientSwitch,
  ClinicalTranscriptItem,
  ClinicalRuntime,
} from './clinicalRuntime';

const now = () => new Date().toISOString();
const RUT_CANDIDATE =
  /(?<!\d)(?:(?:[\d•]{1,2}(?:[.\s]\d{3}){1,2}|[\d•]{4,8})-[0-9kK](?!\d)|(?<![\d.])(\d{5,8})([0-9kK])(?!\d))/g;

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
  return thread.messages.map((message) => ({
    id: message.id,
    turnId: message.turn_id,
    status: 'completed',
    createdAt: message.created_at,
    type: message.role,
    content: message.content,
  }));
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
  const [patientSwitch, setPatientSwitch] = useState<ClinicalPatientSwitch | null>(null);
  const [artifactSyncState, setArtifactSyncState] = useState<
    Record<string, 'idle' | 'saving' | 'saved' | 'error'>
  >({});
  const abortRef = useRef<AbortController | null>(null);
  const turnFailedRef = useRef(false);
  const loadSeqRef = useRef(0);
  const turnInputRef = useRef<Record<string, string>>({});
  const artifactTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const load = useCallback(async (): Promise<ClinicalThread | null> => {
    if (!threadId) return null;
    const seq = ++loadSeqRef.current;
    const loaded = await getClinicalThread(threadId);
    if (seq !== loadSeqRef.current) return null;
    setThread(loaded);
    const actions = loaded.actions ?? [];
    const hydrated = hydrateItems({ ...loaded, actions });
    dispatch({ type: 'reset', items: hydrated });
    setRuntime(
      actions.some((action) => action.status === 'pending') ? 'awaiting_approval' : 'idle',
    );
    return loaded;
  }, [threadId]);

  useEffect(() => {
    let cancelled = false;
    loadSeqRef.current += 1;
    if (!threadId) {
      setThread(null);
      dispatch({ type: 'reset', items: [] });
      setRuntime('idle');
      setError(null);
      setPatientSwitch(null);
      return;
    }
    setThread(null);
    dispatch({ type: 'reset', items: [] });
    setRuntime('idle');
    setError(null);
    setPatientSwitch(null);
    void load().catch(() => {
      if (!cancelled) setError('No pudimos cargar este hilo clínico.');
    });
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [load, threadId]);

  const setActivePatient = useCallback(
    async (patientId: string | null) => {
      if (!threadId) return;
      const updated = await setClinicalActivePatient(threadId, patientId);
      setThread(updated);
    },
    [threadId],
  );

  const send = useCallback(
    async (content: string): Promise<boolean> => {
      const currentThreadId = threadId;
      if (!currentThreadId || !content.trim()) return false;
      const turnId = crypto.randomUUID();
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
        },
      });
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const response = await streamClinicalTurn(
          currentThreadId,
          { turn_id: turnId, content },
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
                setPatientSwitch({ current: currentPatient, detected: detectedPatient });
              }
            } else if (event === 'turn.failed') {
              turnFailedRef.current = true;
              const code =
                typeof payload.error_code === 'string' ? payload.error_code : 'CLINICAL_ERROR';
              setError(code === 'PATIENT_SWITCH_REQUIRED' ? null : safeError(code));
              setRuntime('failed');
            } else if (event === 'turn.completed') {
              setRuntime('idle');
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
      if (!threadId) return;
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
        void updateClinicalArtifact(threadId, itemId, {
          source_note: nextSource,
          draft: nextDraft,
          evolution_at: nextEvolutionAt,
        })
          .then(() => setArtifactSyncState((state) => ({ ...state, [itemId]: 'saved' })))
          .catch(() => setArtifactSyncState((state) => ({ ...state, [itemId]: 'error' })));
      }, 300);
    },
    [clinicalState.items, threadId],
  );

  const updateDraft = useCallback(
    (itemId: string, draft: ClinicalDraft) => {
      dispatch({ type: 'updateDraft', itemId, draft });
      scheduleArtifactSync(itemId, { draft });
    },
    [scheduleArtifactSync],
  );

  const updateDraftSource = useCallback(
    async (itemId: string, sourceNote: string): Promise<boolean> => {
      if (!threadId) return false;
      const current = clinicalState.items.find(
        (item) => item.id === itemId && item.type === 'draft',
      );
      if (!current || current.type !== 'draft') return false;
      dispatch({ type: 'updateSource', itemId, sourceNote });
      try {
        await updateClinicalArtifact(threadId, itemId, {
          source_note: sourceNote,
          draft: current.draft,
          evolution_at: current.evolutionAt,
        });
        setError(null);
        return true;
      } catch {
        return false;
      }
    },
    [clinicalState.items, threadId],
  );

  const updateDraftDate = useCallback(
    (itemId: string, evolutionAt: string) => {
      dispatch({ type: 'updateDate', itemId, evolutionAt });
      scheduleArtifactSync(itemId, { evolutionAt });
    },
    [scheduleArtifactSync],
  );

  const regenerateDraft = useCallback(
    async (item: ClinicalDraftItem) => {
      if (!threadId) return;
      try {
        const draft = await regenerateClinicalDraft(threadId, item.id);
        dispatch({ type: 'replaceDraft', itemId: item.id, draft });
        setError(null);
      } catch {
        setError(safeError('CLINICAL_MODEL_UNAVAILABLE'));
        setRuntime('failed');
      }
    },
    [threadId],
  );

  const prepareDraft = useCallback(
    async (item: ClinicalDraftItem): Promise<ClinicalApprovalItem | null> => {
      if (!threadId || item.stale) return null;
      try {
        const syncTimer = artifactTimersRef.current[item.id];
        if (syncTimer) clearTimeout(syncTimer);
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
    if (!abortRef.current) return;
    setRuntime('stopping');
    abortRef.current.abort();
  }, []);

  const retryTurn = useCallback(
    (turnId: string) => {
      const userItem = clinicalState.items.find(
        (item) => item.type === 'user' && item.turnId === turnId,
      );
      const content =
        turnInputRef.current[turnId] ?? (userItem?.type === 'user' ? userItem.content : undefined);
      if (content) void send(content);
    },
    [clinicalState.items, send],
  );

  const cancelPatientSwitch = useCallback(() => {
    setPatientSwitch(null);
    setError(null);
    setRuntime('idle');
  }, []);

  const confirmPatientSwitch = useCallback(async () => {
    if (!patientSwitch || !threadId) return;
    try {
      await setActivePatient(patientSwitch.detected.id);
      setPatientSwitch(null);
      setError(null);
      setRuntime('idle');
    } catch {
      setError('No pudimos cambiar el paciente activo.');
    }
  }, [patientSwitch, setActivePatient, threadId]);

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
    patientSwitch,
    cancelPatientSwitch,
    confirmPatientSwitch,
    reload: load,
    retryTurn,
    artifactSyncState,
    retryArtifactSync: (item: ClinicalDraftItem) =>
      scheduleArtifactSync(item.id, {
        draft: item.draft,
        sourceNote: item.sourceNote,
        evolutionAt: item.evolutionAt,
      }),
  };
}
