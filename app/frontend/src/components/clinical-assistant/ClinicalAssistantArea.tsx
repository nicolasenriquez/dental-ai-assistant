import { Stethoscope } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useClinicalAssistant } from '../../hooks/useClinicalAssistant';
import { isVoiceInFlight, useVoiceDictation } from '../../hooks/useVoiceDictation';
import { type ClinicalDraft, type ClinicalPatient, type Patient, getPatients } from '../../lib/api';
import {
  type ComposerSelection,
  captureComposerSelection,
  insertTranscript,
} from '../../lib/composerSelection';
import { WorkspaceHeader } from '../WorkspaceHeader';
import { composeClinicalDraft } from '../clinical/evolutionFields';
import { ClinicalComposer } from './ClinicalComposer';
import { ClinicalTranscript } from './ClinicalTranscript';

interface ClinicalAssistantAreaProps {
  threadId: string;
  onThreadStateChanged?: () => void;
  guardTransition?: (continuation: () => void) => void;
  onActivePatientChange?: (patient: ClinicalPatient | null) => void;
  onComposerInsertReady?: (insert: (text: string) => void) => void;
  onSaveToDrive?: (seed: { name: string; content: string }) => void;
}

type QueuedEntry = { id: string; content: string; patientId: string | null; patientName: string };

export function ClinicalAssistantArea({
  threadId,
  onThreadStateChanged,
  guardTransition,
  onActivePatientChange,
  onComposerInsertReady,
  onSaveToDrive,
}: ClinicalAssistantAreaProps) {
  const assistant = useClinicalAssistant(threadId);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [patientsError, setPatientsError] = useState(false);
  const [draftByThread, setDraftByThread] = useState<Record<string, string>>({});
  const [queueByThread, setQueueByThread] = useState<Record<string, QueuedEntry[]>>({});
  const [preparingDraftId, setPreparingDraftId] = useState<string | null>(null);
  const [autoOpenApprovalId, setAutoOpenApprovalId] = useState<string | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const voiceSelectionRef = useRef<ComposerSelection>({ start: 0, end: 0, selectedText: '' });
  const voiceCaretRef = useRef<number | null>(null);
  const previousVoiceInFlightRef = useRef(false);
  const value = draftByThread[threadId] ?? '';
  const queued = queueByThread[threadId] ?? [];
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
    (text: string) => {
      if (!text) return;
      setValue((current) => (current ? `${current}\n${text}` : text));
      textareaRef.current?.focus();
    },
    [setValue],
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
    void assistant.send(next.content).then((accepted) => {
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
    const message = value.trim();
    const busy =
      assistant.runtime === 'streaming' ||
      assistant.runtime === 'stopping' ||
      assistant.runtime === 'awaiting_approval' ||
      assistant.runtime === 'saving';
    if (busy) {
      if (queued.length >= 3) {
        setQueueError('Ya tienes 3 mensajes pendientes.');
        return;
      }
      setQueueError(null);
      setValue('');
      updateQueue((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          content: message,
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
    void assistant.send(message).then((ok) => {
      if (!ok) setValue((current) => current || message);
      else onThreadStateChanged?.();
    });
  };

  const onDraftChange = (id: string, draft: ClinicalDraft) => assistant.updateDraft(id, draft);
  const editQueued = useCallback(
    (id: string, content: string) => {
      setValue(content);
      updateQueue((current) => current.filter((item) => item.id !== id));
      textareaRef.current?.focus();
    },
    [setValue, updateQueue],
  );

  return (
    <main className="chat-area clinical-assistant-area">
      <WorkspaceHeader
        title={assistant.thread?.title ?? 'Asistente'}
        description={
          assistant.thread?.active_patient
            ? `Paciente · ${assistant.thread.active_patient.rut_masked}`
            : 'Sin paciente activo'
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
            <p>Selecciona un paciente y escribe o dicta una nota clínica.</p>
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
      {assistant.patientSwitch && (
        <section
          className="clinical-patient-switch"
          role="alert"
          aria-labelledby="patient-switch-title"
        >
          <h2 id="patient-switch-title">Cambiar paciente activo</h2>
          <p>Este mensaje identificó un paciente distinto al activo.</p>
          <div className="clinical-patient-switch-grid">
            <span>
              Actual:{' '}
              <strong>
                {assistant.patientSwitch.current.first_name}{' '}
                {assistant.patientSwitch.current.last_name} ·{' '}
                {assistant.patientSwitch.current.rut_masked}
              </strong>
            </span>
            <span>
              Detectado:{' '}
              <strong>
                {assistant.patientSwitch.detected.first_name}{' '}
                {assistant.patientSwitch.detected.last_name} ·{' '}
                {assistant.patientSwitch.detected.rut_masked}
              </strong>
            </span>
          </div>
          <div className="clinical-artifact-actions">
            <button
              type="button"
              className="clinical-secondary-button"
              onClick={assistant.cancelPatientSwitch}
              disabled={voiceInFlight}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="clinical-primary-button"
              onClick={() => {
                const change = () => void assistant.confirmPatientSwitch();
                guardTransition ? guardTransition(change) : change();
              }}
              disabled={voiceInFlight}
            >
              Cambiar paciente
            </button>
          </div>
        </section>
      )}
      <div className="chat-input-dock clinical-composer-dock">
        <div className="chat-input-dock-inner">
          {queued.length > 0 && (
            <div className="clinical-queue" aria-label="Mensajes en cola">
              <strong>
                {queued.length} {queued.length === 1 ? 'mensaje' : 'mensajes'} en cola
              </strong>
              {queued.map((entry) => (
                <div key={entry.id} className="clinical-queue-item">
                  <span>{entry.content}</span>
                  <small>{entry.patientName}</small>
                  <div className="clinical-queue-actions">
                    <button type="button" onClick={() => editQueued(entry.id, entry.content)}>
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
                        const change = () => void assistant.setActivePatient(queued[0].patientId);
                        guardTransition ? guardTransition(change) : change();
                      }}
                      disabled={voiceInFlight}
                    >
                      Volver a {queued[0].patientName}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          <ClinicalComposer
            patient={assistant.thread?.active_patient ?? null}
            patients={patients}
            patientsLoading={patientsLoading}
            patientsError={patientsError}
            onRetryPatients={() => void loadPatients()}
            value={value}
            busy={
              assistant.runtime === 'streaming' ||
              assistant.runtime === 'stopping' ||
              assistant.runtime === 'awaiting_approval' ||
              assistant.runtime === 'saving'
            }
            textareaRef={textareaRef}
            onChange={setValue}
            onPatientChange={(patientId) => {
              const change = () => void assistant.setActivePatient(patientId);
              guardTransition ? guardTransition(change) : change();
            }}
            onSubmit={send}
            onStop={
              assistant.runtime === 'streaming' || assistant.runtime === 'stopping'
                ? assistant.stop
                : undefined
            }
            stopping={assistant.runtime === 'stopping'}
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
            patientControlsDisabled={voiceInFlight}
            submitDisabled={voiceInFlight}
          />
        </div>
      </div>
    </main>
  );
}
