import { useCallback, useEffect, useRef, useState } from 'react';
import { consumeSse } from '../lib/sse';
import {
  type ClinicalDraft,
  type ClinicalPendingAction,
  type ClinicalPatient,
  type ClinicalThread,
  getClinicalThread,
  prepareClinicalSave,
  regenerateClinicalDraft,
  resolveClinicalAction,
  setClinicalActivePatient,
  streamClinicalTurn,
} from '../lib/api';

export type ClinicalItemStatus = 'pending' | 'running' | 'completed' | 'failed' | 'declined';

export interface ClinicalBaseItem {
  id: string;
  turnId: string;
  status: ClinicalItemStatus;
  createdAt: string;
}

export interface ClinicalUserItem extends ClinicalBaseItem {
  type: 'user';
  content: string;
}

export interface ClinicalAssistantItem extends ClinicalBaseItem {
  type: 'assistant';
  content: string;
}

export interface ClinicalActivityItem extends ClinicalBaseItem {
  type: 'activity';
  label: string;
}

export interface ClinicalDraftItem extends ClinicalBaseItem {
  type: 'draft';
  draft: ClinicalDraft;
  baseline: ClinicalDraft;
  sourceNote: string;
  edited: boolean;
  stale: boolean;
}

export interface ClinicalApprovalItem extends ClinicalBaseItem {
  type: 'approval';
  action: ClinicalPendingAction;
  patient: ClinicalPatient;
}

export interface ClinicalResultItem extends ClinicalBaseItem {
  type: 'result';
  message: string;
  evolutionId?: string | null;
  patientId?: string | null;
}

export interface ClinicalErrorItem extends ClinicalBaseItem {
  type: 'error';
  code: string;
  message: string;
}

export type ClinicalTranscriptItem =
  | ClinicalUserItem
  | ClinicalAssistantItem
  | ClinicalActivityItem
  | ClinicalDraftItem
  | ClinicalApprovalItem
  | ClinicalResultItem
  | ClinicalErrorItem;

export interface ClinicalPatientSwitch {
  current: ClinicalPatient;
  detected: ClinicalPatient;
}

export type ClinicalRuntime = 'idle' | 'streaming' | 'awaiting_approval' | 'saving' | 'failed';

const now = () => new Date().toISOString();
const RUT_CANDIDATE = /(?<!\d)(?:(?:[\d•]{1,2}(?:[.\s]\d{3}){1,2}|[\d•]{4,8})-[0-9kK](?!\d)|(?<![\d.])(\d{5,8})([0-9kK])(?!\d))/g;

function redactIdentifiers(content: string): string {
  return content.replace(RUT_CANDIDATE, '••••');
}

function safeError(code: string): string {
  const messages: Record<string, string> = {
    ACTION_EXPIRED: 'Esta confirmación expiró. Prepara nuevamente la evolución.',
    CLINICAL_EXTERNAL_LLM_DISABLED: 'La asistencia clínica externa está deshabilitada.',
    CLINICAL_CONTENT_INSUFFICIENT: 'Añade un poco más de contexto para preparar la evolución.',
    CLINICAL_MODEL_UNAVAILABLE: 'No pudimos preparar la evolución. Tu nota se conserva.',
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

export function useClinicalAssistant(threadId: string | undefined) {
  const [thread, setThread] = useState<ClinicalThread | null>(null);
  const [items, setItems] = useState<ClinicalTranscriptItem[]>([]);
  const [runtime, setRuntime] = useState<ClinicalRuntime>('idle');
  const [error, setError] = useState<string | null>(null);
  const [patientSwitch, setPatientSwitch] = useState<ClinicalPatientSwitch | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const turnFailedRef = useRef(false);
  const loadSeqRef = useRef(0);

  const load = useCallback(async () => {
    if (!threadId) return;
    const seq = ++loadSeqRef.current;
    const loaded = await getClinicalThread(threadId);
    if (seq !== loadSeqRef.current) return;
    setThread(loaded);
    const hydrated = messageItems(loaded);
    if (loaded.pending_action?.proposal_payload) {
      hydrated.push({
        id: loaded.pending_action.id,
        turnId: loaded.pending_action.turn_id,
        status: 'pending',
        createdAt: loaded.pending_action.created_at,
        type: 'approval',
        action: loaded.pending_action,
        patient: loaded.pending_action_patient ?? loaded.active_patient ?? {
          id: loaded.pending_action.patient_id,
          first_name: 'Paciente',
          last_name: '',
          rut_masked: '••••',
        },
      });
      setRuntime('awaiting_approval');
    } else {
      setRuntime('idle');
    }
    setItems(hydrated);
  }, [threadId]);

  useEffect(() => {
    let cancelled = false;
    loadSeqRef.current += 1;
    if (!threadId) {
      setThread(null);
      setItems([]);
      setRuntime('idle');
      setError(null);
      setPatientSwitch(null);
      return;
    }
    setThread(null);
    setItems([]);
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
      if (!threadId || !content.trim()) return false;
      const turnId = crypto.randomUUID();
      const createdAt = now();
      turnFailedRef.current = false;
      setError(null);
      setRuntime('streaming');
      setItems((current) => [
        ...current,
        { id: crypto.randomUUID(), turnId, status: 'completed', createdAt, type: 'user', content: redactIdentifiers(content) },
      ]);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const response = await streamClinicalTurn(threadId, { turn_id: turnId, content }, controller.signal);
        await consumeSse(response, ({ event, data }) => {
          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(data) as Record<string, unknown>;
          } catch {
            return;
          }
          const itemId = typeof payload.item_id === 'string' ? payload.item_id : crypto.randomUUID();
          const itemStatus: ClinicalItemStatus = payload.status === 'running' ? 'running' : 'completed';
          if (event === 'turn.started' && typeof payload.user_content === 'string') {
            setItems((current) => current.map((item) => (
              item.turnId === turnId && item.type === 'user'
                ? { ...item, content: payload.user_content as string }
                : item
            )));
          }
          if (event === 'item.started' || event === 'item.completed') {
            const itemType = payload.item_type;
            const contentValue = payload.content;
            const labelValue = payload.label;
            if (itemType === 'assistant_message' && typeof contentValue === 'string') {
              setItems((current) => [
                ...current,
                {
                  id: itemId,
                  turnId,
                  status: 'completed',
                  createdAt: typeof payload.created_at === 'string' ? payload.created_at : now(),
                  type: 'assistant',
                  content: contentValue,
                },
              ]);
            } else if (itemType === 'clinical_draft' && payload.draft) {
              const draft = payload.draft as ClinicalDraft;
              const sourceNote = typeof payload.source_note === 'string'
                ? payload.source_note
                : redactIdentifiers(content);
              setItems((current) => [
                ...current,
                {
                  id: itemId,
                  turnId,
                  status: 'completed',
                  createdAt: typeof payload.created_at === 'string' ? payload.created_at : now(),
                  type: 'draft',
                  draft,
                  baseline: draft,
                  sourceNote,
                  edited: false,
                  stale: false,
                },
              ]);
            } else if (itemType === 'activity' && typeof labelValue === 'string') {
              setItems((current) => {
                const activity = {
                  id: itemId,
                  turnId,
                  status: itemStatus,
                  createdAt: typeof payload.created_at === 'string' ? payload.created_at : now(),
                  type: 'activity' as const,
                  label: labelValue,
                };
                const existing = current.findIndex((entry) => entry.id === itemId);
                if (existing < 0) return [...current, activity];
                return current.map((entry, index) => index === existing ? { ...entry, ...activity } : entry);
              });
            }
          } else if (event === 'patient.bound') {
            const patient = payload.patient as ClinicalPatient | undefined;
            if (patient?.id) {
              setThread((current) => current ? { ...current, active_patient: patient } : current);
            }
          } else if (event === 'patient.switch_required') {
            const currentPatient = payload.current_patient as ClinicalPatient | undefined;
            const detectedPatient = payload.detected_patient as ClinicalPatient | undefined;
            if (currentPatient?.id && detectedPatient?.id) {
              setPatientSwitch({ current: currentPatient, detected: detectedPatient });
            }
          } else if (event === 'turn.failed') {
            turnFailedRef.current = true;
            const code = typeof payload.error_code === 'string' ? payload.error_code : 'CLINICAL_ERROR';
            setError(code === 'PATIENT_SWITCH_REQUIRED' ? null : safeError(code));
            setRuntime('failed');
          } else if (event === 'turn.completed') {
            setRuntime('idle');
          }
        }, controller.signal);
        return !turnFailedRef.current;
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === 'AbortError')) {
          setError(safeError('CLINICAL_TURN_FAILED'));
          setRuntime('failed');
        }
        return false;
      } finally {
        abortRef.current = null;
      }
    },
    [threadId],
  );

  const updateDraft = useCallback((itemId: string, draft: ClinicalDraft) => {
    setItems((current) =>
      current.map((item) =>
        item.id === itemId && item.type === 'draft'
          ? { ...item, draft, edited: JSON.stringify(draft) !== JSON.stringify(item.baseline) }
          : item,
      ),
    );
  }, []);

  const updateDraftSource = useCallback((itemId: string, sourceNote: string) => {
    setItems((current) => current.map((item) => (
      item.id === itemId && item.type === 'draft'
        ? { ...item, sourceNote, stale: true }
        : item
    )));
  }, []);

  const regenerateDraft = useCallback(async (item: ClinicalDraftItem) => {
    if (!threadId) return;
    try {
      const draft = await regenerateClinicalDraft(threadId, item.sourceNote);
      setItems((current) => current.map((entry) => (
        entry.id === item.id && entry.type === 'draft'
          ? { ...entry, draft, baseline: draft, edited: false, stale: false }
          : entry
      )));
      setError(null);
    } catch {
      setError(safeError('CLINICAL_MODEL_UNAVAILABLE'));
      setRuntime('failed');
    }
  }, [threadId]);

  const prepareDraft = useCallback(
    async (item: ClinicalDraftItem) => {
      if (!threadId || item.stale) return;
      try {
        const action = await prepareClinicalSave(threadId, {
          raw_note: item.sourceNote,
          draft: item.draft,
          generated_draft: item.baseline,
          evolution_at: new Date().toISOString(),
          final_text: undefined,
        });
        setItems((current) => {
          const approval: ClinicalApprovalItem = {
            id: action.id,
            turnId: item.turnId,
            status: 'pending',
            createdAt: action.created_at,
            type: 'approval',
            action,
            patient: action.patient,
          };
          const existing = current.findIndex((entry) => entry.type === 'approval');
          if (existing < 0) return [...current, approval];
          return current.map((entry, index) => index === existing ? approval : entry);
        });
        setRuntime('awaiting_approval');
      } catch {
        setError('No pudimos preparar la evolución. Tu borrador se conserva.');
        setRuntime('failed');
      }
    },
    [threadId],
  );

  const resolve = useCallback(
    async (item: ClinicalApprovalItem, decision: 'approve' | 'decline') => {
      setRuntime('saving');
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: 'running' } : entry));
      try {
        const result = await resolveClinicalAction(item.action.id, decision, item.action.proposal_hash);
        setItems((current) =>
          current.map((entry) =>
            entry.id === item.id ? { ...entry, status: decision === 'decline' ? 'declined' : 'completed' } : entry,
          ),
        );
        setItems((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            turnId: item.turnId,
            status: result.status === 'declined' ? 'declined' : 'completed',
            createdAt: now(),
            type: 'result',
            message: result.status === 'declined' ? 'Guardado descartado. No se realizaron cambios.' : 'Evolución guardada.',
            evolutionId: result.result_resource_id,
            patientId: item.action.patient_id,
          },
        ]);
        setRuntime('idle');
        setThread((current) => (current ? { ...current, pending_action: null } : current));
      } catch {
        setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: 'pending' } : entry));
        setError('No pudimos guardar la evolución. Tu borrador se conserva.');
        setRuntime('awaiting_approval');
      }
    },
    [],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

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
    items,
    runtime,
    error,
    send,
    stop,
    setActivePatient,
    updateDraft,
    updateDraftSource,
    regenerateDraft,
    prepareDraft,
    resolve,
    patientSwitch,
    cancelPatientSwitch,
    confirmPatientSwitch,
    reload: load,
  };
}
