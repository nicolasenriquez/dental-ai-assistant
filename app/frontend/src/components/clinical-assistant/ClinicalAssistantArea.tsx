import { HardDrive, Stethoscope } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClinicalAssistantController } from '../../hooks/useClinicalAssistant';
import { isVoiceInFlight, useVoiceDictation } from '../../hooks/useVoiceDictation';
import {
  type ClinicalDraft,
  type ClinicalPatient,
  type ComposerContextItem,
  type DriveJournalTarget,
  type Patient,
  getPatients,
} from '../../lib/api';
import {
  type ComposerSelection,
  captureComposerSelection,
  insertTranscript,
} from '../../lib/composerSelection';
import { WorkspaceHeader } from '../WorkspaceHeader';
import { composeClinicalDraft } from '../clinical/evolutionFields';
import { ClinicalComposer } from './ClinicalComposer';
import { ClinicalPatientPicker, type ClinicalPatientSelectionState } from './ClinicalPatientPicker';
import { ClinicalTranscript } from './ClinicalTranscript';
import { PatientStatusPanel } from './PatientStatusPanel';

interface ClinicalAssistantAreaProps {
  threadId: string;
  assistant: ClinicalAssistantController;
  onThreadStateChanged?: () => void;
  guardTransition?: (continuation: () => void) => void;
  onActivePatientChange?: (patient: ClinicalPatient | null) => void;
  onComposerInsertReady?: (insert: (item: ComposerContextItem) => void) => void;
  onSaveToDrive?: (seed: { name: string; content: string }) => void;
  driveOpen?: boolean;
  onToggleDrive?: () => void;
  onOpenDriveJournal?: (target: DriveJournalTarget) => void;
}

type QueuedEntry = {
  id: string;
  content: string;
  contextItems: ComposerContextItem[];
  patientId: string | null;
  patientName: string;
};

export function ClinicalAssistantArea({
  threadId,
  assistant,
  onThreadStateChanged,
  guardTransition,
  onActivePatientChange,
  onComposerInsertReady,
  onSaveToDrive,
  driveOpen = false,
  onToggleDrive,
  onOpenDriveJournal,
}: ClinicalAssistantAreaProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [patientsError, setPatientsError] = useState(false);
  const [patientSelectionState, setPatientSelectionState] =
    useState<ClinicalPatientSelectionState>('idle');
  const [patientSelectionError, setPatientSelectionError] = useState<string | null>(null);
  const [draftByThread, setDraftByThread] = useState<Record<string, string>>({});
  const [queueByThread, setQueueByThread] = useState<Record<string, QueuedEntry[]>>({});
  const [preparingDraftId, setPreparingDraftId] = useState<string | null>(null);
  const [autoOpenApprovalId, setAutoOpenApprovalId] = useState<string | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [contextByThread, setContextByThread] = useState<Record<string, ComposerContextItem[]>>({});
  const [patientStatusOpen, setPatientStatusOpen] = useState(false);
  const [patientPickerOpen, setPatientPickerOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const voiceSelectionRef = useRef<ComposerSelection>({ start: 0, end: 0, selectedText: '' });
  const voiceCaretRef = useRef<number | null>(null);
  const previousVoiceInFlightRef = useRef(false);
  const patientChangeRequestRef = useRef(0);
  const lastPatientChangeRef = useRef<string | null | undefined>(undefined);
  const value = draftByThread[threadId] ?? '';
  const queued = queueByThread[threadId] ?? [];
  const contextItems = contextByThread[threadId] ?? [];
  const setValue = useCallback(
    (next: string | ((current: string) => string)) => {
      setDraftByThread((current) => ({
        ...current,
        [threadId]: typeof next === 'function' ? next(current[threadId] ?? '') : next,
      }));
    },
    [threadId],
  );
  const updateQueue = useCallback(
    (next: (current: QueuedEntry[]) => QueuedEntry[]) => {
      setQueueByThread((current) => ({ ...current, [threadId]: next(current[threadId] ?? []) }));
    },
    [threadId],
  );
  const voiceScope = `clinical:${threadId}:${assistant.thread?.active_patient?.id ?? 'none'}`;
  const appendVoiceText = useCallback(
    (text: string) =>
      setValue((current) => {
        const inserted = insertTranscript(current, text, voiceSelectionRef.current);
        voiceCaretRef.current = inserted.caret;
        return inserted.value;
      }),
    [setValue],
  );
  const voice = useVoiceDictation(voiceScope, appendVoiceText);
  const voiceInFlight = isVoiceInFlight(voice.state);
  const activePatient = assistant.thread?.active_patient ?? null;
  useEffect(() => {
    setPatientStatusOpen(false);
  }, [threadId, activePatient?.id]);
  useEffect(() => {
    patientChangeRequestRef.current += 1;
    lastPatientChangeRef.current = undefined;
    setPatientSelectionState('idle');
    setPatientSelectionError(null);
  }, [threadId]);

  const persistPatientChange = useCallback(
    (patientId: string | null) => {
      const requestId = ++patientChangeRequestRef.current;
      lastPatientChangeRef.current = patientId;
      setPatientSelectionState('saving');
      setPatientSelectionError(null);
      void Promise.resolve(assistant.setActivePatient(patientId))
        .then(() => {
          if (patientChangeRequestRef.current !== requestId) return;
          setPatientSelectionState('idle');
        })
        .catch(() => {
          if (patientChangeRequestRef.current !== requestId) return;
          setPatientSelectionState('error');
          setPatientSelectionError('No pudimos cambiar el paciente activo.');
        });
    },
    [assistant.setActivePatient],
  );

  const requestPatientChange = useCallback(
    (patientId: string | null) => {
      if (patientSelectionState === 'saving') return;
      const change = () => persistPatientChange(patientId);
      guardTransition ? guardTransition(change) : change();
    },
    [guardTransition, patientSelectionState, persistPatientChange],
  );

  const retryPatientChange = useCallback(() => {
    const patientId = lastPatientChangeRef.current;
    if (patientId === undefined) return;
    requestPatientChange(patientId);
  }, [requestPatientChange]);

  useEffect(() => {
    if (previousVoiceInFlightRef.current && !voiceInFlight) {
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        if (textareaRef.current && voiceCaretRef.current !== null) {
          textareaRef.current.setSelectionRange(voiceCaretRef.current, voiceCaretRef.current);
          voiceCaretRef.current = null;
        }
      });
    }
    previousVoiceInFlightRef.current = voiceInFlight;
  }, [voiceInFlight]);

  const insertIntoComposer = useCallback(
    (item: ComposerContextItem) => {
      if (!item.content) return;
      setContextByThread((current) => ({
        ...current,
        [threadId]: [...(current[threadId] ?? []), item],
      }));
      textareaRef.current?.focus();
    },
    [threadId],
  );

  useEffect(() => {
    onActivePatientChange?.(activePatient);
  }, [activePatient?.id, onActivePatientChange]);

  useEffect(() => {
    onComposerInsertReady?.(insertIntoComposer);
    return () => onComposerInsertReady?.(() => undefined);
  }, [insertIntoComposer, onComposerInsertReady]);

  const loadPatients = useCallback(async () => {
    setPatientsLoading(true);
    setPatientsError(false);
    try {
      setPatients(await getPatients());
    } catch {
      setPatientsError(true);
    } finally {
      setPatientsLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadPatients();
  }, [loadPatients]);
  useEffect(() => {
    const patientId = assistant.thread?.active_patient?.id ?? null;
    const next = queued[0];
    if (assistant.runtime !== 'idle' || voiceInFlight || !next || next.patientId !== patientId)
      return;
    void assistant.send(next.content, next.contextItems).then((accepted) => {
      if (accepted) updateQueue((current) => current.filter((item) => item.id !== next.id));
    });
  }, [
    assistant.runtime,
    assistant.send,
    assistant.thread?.active_patient?.id,
    queued,
    threadId,
    updateQueue,
    voiceInFlight,
  ]);

  const send = () => {
    if (!value.trim() || voiceInFlight) return;
    const instruction = value.trim();
    const queueable = assistant.runtime === 'streaming' || assistant.runtime === 'stopping';
    if (assistant.runtime === 'saving' || assistant.runtime === 'awaiting_approval') return;
    if (queueable) {
      if (queued.length >= 3) {
        setQueueError('Ya tienes 3 mensajes pendientes.');
        return;
      }
      setQueueError(null);
      setValue('');
      setContextByThread((current) => ({ ...current, [threadId]: [] }));
      updateQueue((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          content: instruction,
          contextItems,
          patientId: assistant.thread?.active_patient?.id ?? null,
          patientName: assistant.thread?.active_patient
            ? `${assistant.thread.active_patient.first_name} ${assistant.thread.active_patient.last_name}`
            : 'Sin paciente',
        },
      ]);
      return;
    }
    setQueueError(null);
    setValue('');
    setContextByThread((current) => ({ ...current, [threadId]: [] }));
    void assistant.send(instruction, contextItems).then((ok) => {
      if (!ok) {
        setValue((current) => current || instruction);
        setContextByThread((current) => ({ ...current, [threadId]: contextItems }));
      } else onThreadStateChanged?.();
    });
  };

  const onDraftChange = (id: string, draft: ClinicalDraft) => assistant.updateDraft(id, draft);
  const editQueued = useCallback(
    (id: string, content: string, items: ComposerContextItem[]) => {
      setValue(content);
      setContextByThread((current) => ({ ...current, [threadId]: items }));
      updateQueue((current) => current.filter((item) => item.id !== id));
      textareaRef.current?.focus();
    },
    [setValue, updateQueue],
  );

  return (
    <main className="chat-area clinical-assistant-area">
      <WorkspaceHeader
        title={assistant.thread?.title ?? 'Asistente'}
        actions={
          onToggleDrive ? (
            <button
              type="button"
              className="clinical-secondary-button"
              data-drive-utility="true"
              aria-expanded={driveOpen}
              aria-label={driveOpen ? 'Cerrar Google Drive' : 'Abrir Google Drive'}
              onClick={onToggleDrive}
            >
              <HardDrive aria-hidden="true" size={16} />
              Google Drive
            </button>
          ) : undefined
        }
        workspaceContext={
          <ClinicalPatientPicker
            patient={activePatient}
            patients={patients}
            patientsLoading={patientsLoading}
            patientsError={patientsError}
            onRetryPatients={() => void loadPatients()}
            onPatientChange={requestPatientChange}
            selectionState={patientSelectionState}
            selectionError={patientSelectionError}
            onRetryPatientChange={retryPatientChange}
            disabled={voiceInFlight}
            open={patientPickerOpen}
            onOpenChange={setPatientPickerOpen}
          />
        }
      />
      <ClinicalTranscript
        threadId={threadId}
        items={assistant.items}
        busy={assistant.runtime === 'streaming' || assistant.runtime === 'saving'}
        emptyState={
          <section className="chat-empty-state clinical-empty-state">
            <Stethoscope size={36} strokeWidth={1.5} aria-hidden="true" />
            <h1>Trabaja más rápido con tus evoluciones</h1>
            <p>Pregunta algo o selecciona un paciente para trabajar con su ficha.</p>
          </section>
        }
        onDraftChange={onDraftChange}
        onDraftSourceChange={assistant.updateDraftSource}
        onDraftDateChange={assistant.updateDraftDate}
        onDraftRegenerate={(item) => void assistant.regenerateDraft(item)}
        onSaveToDrive={
          onSaveToDrive
            ? (item) => onSaveToDrive({ name: 'Respuesta del asistente', content: item.content })
            : undefined
        }
        onSaveDraftToDrive={
          onSaveToDrive
            ? (item) =>
                onSaveToDrive({
                  name: 'Evolución propuesta',
                  content: composeClinicalDraft(item.draft),
                })
            : undefined
        }
        driveTransferDisabled={!activePatient}
        activePatientId={activePatient?.id}
        activePatient={activePatient}
        onRecoverDriveExport={(evolutionId) => void assistant.retryDriveExport(evolutionId)}
        onReconnectDrive={() => {
          if (!driveOpen) onToggleDrive?.();
        }}
        onOpenDriveJournal={onOpenDriveJournal}
        onKeepPatient={assistant.cancelPatientSwitch}
        onChangePatient={(item) => {
          const change = () => void assistant.confirmPatientSwitch(item);
          guardTransition ? guardTransition(change) : change();
        }}
        onPrepare={(item) => {
          setPreparingDraftId(item.id);
          void assistant.prepareDraft(item).then((approval) => {
            setPreparingDraftId(null);
            if (approval) setAutoOpenApprovalId(approval.id);
          });
        }}
        preparingDraftId={preparingDraftId}
        autoOpenApprovalId={autoOpenApprovalId}
        artifactSyncState={assistant.artifactSyncState}
        onRetryArtifactSync={assistant.retryArtifactSync}
        onRetry={assistant.retryTurn}
        onResolve={async (item, decision) => {
          await assistant.resolve(item, decision);
          setAutoOpenApprovalId(null);
          onThreadStateChanged?.();
        }}
        onBackToEdit={(item) => {
          void assistant.backToEdit(item).then((ok) => {
            if (!ok) return;
            setAutoOpenApprovalId(null);
            window.requestAnimationFrame(() =>
              document
                .querySelector<HTMLElement>(`[data-artifact-id="${item.action.artifact_id}"]`)
                ?.focus(),
            );
            onThreadStateChanged?.();
          });
        }}
      />
      {assistant.error && (
        <p className="clinical-error" role="alert">
          {assistant.error}
        </p>
      )}
      {queueError && (
        <p className="clinical-error" role="alert">
          {queueError}
        </p>
      )}
      <div
        className="chat-input-dock clinical-composer-dock"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && patientStatusOpen && !voiceInFlight) {
            event.preventDefault();
            setPatientStatusOpen(false);
          }
        }}
      >
        <div className="chat-input-dock-inner">
          {(assistant.runtime === 'streaming' || assistant.runtime === 'stopping') && (
            <div
              className="mb-2 flex items-center justify-between gap-3 text-xs text-[var(--text-secondary)]"
              role="status"
            >
              <span>Assistant trabajando · los mensajes nuevos quedarán pendientes</span>
              <button
                type="button"
                className="clinical-secondary-button"
                onClick={assistant.stop}
                disabled={assistant.runtime === 'stopping'}
              >
                {assistant.runtime === 'stopping' ? 'Deteniendo…' : 'Detener'}
              </button>
            </div>
          )}
          {assistant.runtime === 'saving' && (
            <p className="clinical-composer-lock" role="status">
              Espera mientras guardamos la evolución.
            </p>
          )}
          {assistant.runtime === 'awaiting_approval' && (
            <p className="clinical-composer-lock" role="status">
              Evolución pendiente de revisión · Ver
            </p>
          )}
          {queued.length > 0 && (
            <div className="clinical-queue" aria-label="Mensajes en cola">
              <strong>Pendientes {queued.length}/3</strong>
              {queued.map((entry) => (
                <div key={entry.id} className="clinical-queue-item">
                  <span>{entry.content}</span>
                  <small>{entry.patientName}</small>
                  <div className="clinical-queue-actions">
                    <button
                      type="button"
                      onClick={() => editQueued(entry.id, entry.content, entry.contextItems)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateQueue((current) => current.filter((item) => item.id !== entry.id))
                      }
                      aria-label="Quitar mensaje de la cola"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
              {queued[0]?.patientId !== (assistant.thread?.active_patient?.id ?? null) && (
                <div className="clinical-queue-conflict">
                  <p className="clinical-warning">
                    Este mensaje fue escrito para {queued[0]?.patientName}. El paciente activo
                    cambió; vuelve a seleccionarlo para continuar.
                  </p>
                  {queued[0]?.patientId && (
                    <button
                      type="button"
                      className="clinical-secondary-button"
                      onClick={() => {
                        requestPatientChange(queued[0].patientId);
                      }}
                      disabled={voiceInFlight || patientSelectionState === 'saving'}
                    >
                      Volver a {queued[0].patientName}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {patientStatusOpen && activePatient && (
            <PatientStatusPanel
              patient={activePatient}
              onClose={() => setPatientStatusOpen(false)}
              onChangePatient={() => {
                setPatientStatusOpen(false);
                setPatientPickerOpen(true);
              }}
            />
          )}
          <ClinicalComposer
            patient={assistant.thread?.active_patient ?? null}
            value={value}
            textareaRef={textareaRef}
            onChange={setValue}
            onSubmit={send}
            patientStatusOpen={patientStatusOpen}
            onTogglePatientStatus={() => setPatientStatusOpen((open) => !open)}
            contextItems={contextItems}
            onRemoveContext={(id) =>
              setContextByThread((current) => ({
                ...current,
                [threadId]: (current[threadId] ?? []).filter((item) => item.id !== id),
              }))
            }
            voice={{
              state: voice.state,
              elapsed: voice.elapsed,
              error: voice.error,
              canRetry: voice.canRetry,
              stream: voice.stream,
              onStart: () => {
                voiceSelectionRef.current = captureComposerSelection(textareaRef.current);
                void voice.start();
              },
              onStop: voice.stop,
              onCancel: voice.cancel,
              onRetry: voice.retry,
            }}
            submitDisabled={
              voiceInFlight ||
              assistant.runtime === 'saving' ||
              assistant.runtime === 'awaiting_approval'
            }
          />
        </div>
      </div>
    </main>
  );
}
