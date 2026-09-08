import { useCallback, useEffect, useRef, useState } from 'react';
import { getPatients, type ClinicalDraft, type Patient } from '../../lib/api';
import { useClinicalAssistant } from '../../hooks/useClinicalAssistant';
import { useClinicalVoiceInput } from '../../hooks/useClinicalVoiceInput';
import { ClinicalComposer } from './ClinicalComposer';
import { ClinicalTranscript } from './ClinicalTranscript';

interface ClinicalAssistantAreaProps {
  threadId: string;
  onThreadStateChanged?: () => void;
}

type QueuedEntry = { id: string; content: string; patientId: string | null; patientName: string };

export function ClinicalAssistantArea({ threadId, onThreadStateChanged }: ClinicalAssistantAreaProps) {
  const assistant = useClinicalAssistant(threadId);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [draftByThread, setDraftByThread] = useState<Record<string, string>>({});
  const [queueByThread, setQueueByThread] = useState<Record<string, QueuedEntry[]>>({});
  const value = draftByThread[threadId] ?? '';
  const queued = queueByThread[threadId] ?? [];
  const setValue = useCallback((next: string | ((current: string) => string)) => {
    setDraftByThread((current) => ({
      ...current,
      [threadId]: typeof next === 'function' ? next(current[threadId] ?? '') : next,
    }));
  }, [threadId]);
  const updateQueue = useCallback((next: (current: QueuedEntry[]) => QueuedEntry[]) => {
    setQueueByThread((current) => ({ ...current, [threadId]: next(current[threadId] ?? []) }));
  }, [threadId]);
  const voice = useClinicalVoiceInput(threadId, (text) => setValue((current) => current ? `${current}\n${text}` : text));
  const composerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { void getPatients().then(setPatients).catch(() => setPatients([])); }, []);
  useEffect(() => {
    const composer = composerRef.current;
    const root = composer?.parentElement;
    if (!composer || !root || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => root.style.setProperty('--composer-clearance', `${entry.contentRect.height + 48}px`));
    observer.observe(composer);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const patientId = assistant.thread?.active_patient?.id ?? null;
    const next = queued[0];
    if (assistant.runtime !== 'idle' || !next || next.patientId !== patientId) return;
    updateQueue((current) => current.slice(1));
    void assistant.send(next.content);
  }, [assistant.runtime, assistant.send, assistant.thread?.active_patient?.id, queued, threadId, updateQueue]);

  const send = () => {
    if (!value.trim()) return;
    const message = value.trim();
    setValue('');
    const busy = assistant.runtime === 'streaming' || assistant.runtime === 'awaiting_approval' || assistant.runtime === 'saving';
    if (busy) {
      if (queued.length < 3) {
        updateQueue((current) => [...current, {
          id: crypto.randomUUID(),
          content: message,
          patientId: assistant.thread?.active_patient?.id ?? null,
          patientName: assistant.thread?.active_patient ? `${assistant.thread.active_patient.first_name} ${assistant.thread.active_patient.last_name}` : 'Sin paciente',
        }]);
      }
      return;
    }
    void assistant.send(message).then((ok) => {
      if (!ok) setValue((current) => current || message);
    });
  };

  const onDraftChange = (id: string, draft: ClinicalDraft) => assistant.updateDraft(id, draft);
  const editQueued = useCallback((id: string, content: string) => {
    setValue(content);
    updateQueue((current) => current.filter((item) => item.id !== id));
    textareaRef.current?.focus();
  }, [setValue, updateQueue]);

  return (
    <main className="clinical-assistant-area">
      <header className="clinical-header">
        <h1>Asistente clínico</h1>
        <p>Prepara evoluciones para tu revisión. La decisión de guardar siempre es tuya.</p>
      </header>
      {!assistant.items.length && <section className="clinical-empty-state"><h2>Trabaja más rápido con tus evoluciones</h2><p>Selecciona un paciente y escribe o dicta una nota clínica.</p></section>}
      <ClinicalTranscript
        threadId={threadId}
        items={assistant.items}
        onDraftChange={onDraftChange}
        onDraftSourceChange={assistant.updateDraftSource}
        onDraftRegenerate={(item) => void assistant.regenerateDraft(item)}
        onPrepare={(item) => void assistant.prepareDraft(item)}
        onResolve={async (item, decision) => {
          await assistant.resolve(item, decision);
          onThreadStateChanged?.();
        }}
      />
      {assistant.error && <p className="clinical-error" role="alert">{assistant.error}</p>}
      {assistant.patientSwitch && (
        <section className="clinical-patient-switch" role="alert" aria-labelledby="patient-switch-title">
          <h2 id="patient-switch-title">Cambiar paciente activo</h2>
          <p>Este mensaje identificó un paciente distinto al activo.</p>
          <div className="clinical-patient-switch-grid">
            <span>Actual: <strong>{assistant.patientSwitch.current.first_name} {assistant.patientSwitch.current.last_name} · {assistant.patientSwitch.current.rut_masked}</strong></span>
            <span>Detectado: <strong>{assistant.patientSwitch.detected.first_name} {assistant.patientSwitch.detected.last_name} · {assistant.patientSwitch.detected.rut_masked}</strong></span>
          </div>
          <div className="clinical-artifact-actions">
            <button type="button" className="clinical-secondary-button" onClick={assistant.cancelPatientSwitch}>Cancelar</button>
            <button type="button" className="clinical-primary-button" onClick={() => void assistant.confirmPatientSwitch()}>Cambiar paciente</button>
          </div>
        </section>
      )}
      <div ref={composerRef} className="clinical-composer-dock">
        {queued.length > 0 && <div className="clinical-queue" aria-label="Mensajes en cola">
          <strong>{queued.length} {queued.length === 1 ? 'mensaje' : 'mensajes'} en cola</strong>
          {queued.map((entry) => <div key={entry.id} className="clinical-queue-item"><span>{entry.content}</span><small>{entry.patientName}</small><div className="clinical-queue-actions"><button type="button" onClick={() => editQueued(entry.id, entry.content)}>Editar</button><button type="button" onClick={() => updateQueue((current) => current.filter((item) => item.id !== entry.id))} aria-label="Quitar mensaje de la cola">×</button></div></div>)}
          {queued[0]?.patientId !== (assistant.thread?.active_patient?.id ?? null) && <div className="clinical-queue-conflict">
            <p className="clinical-warning">Este mensaje fue escrito para {queued[0]?.patientName}. El paciente activo cambió; vuelve a seleccionarlo para continuar.</p>
            {queued[0]?.patientId && <button type="button" className="clinical-secondary-button" onClick={() => void assistant.setActivePatient(queued[0].patientId)}>Volver a {queued[0].patientName}</button>}
          </div>}
        </div>}
        <ClinicalComposer
          patient={assistant.thread?.active_patient ?? null}
          patients={patients}
          value={value}
          busy={assistant.runtime === 'streaming' || assistant.runtime === 'awaiting_approval' || assistant.runtime === 'saving'}
          textareaRef={textareaRef}
          onChange={setValue}
          onPatientChange={(patientId) => void assistant.setActivePatient(patientId)}
          onSend={send}
          onQueue={send}
          onVoice={() => void voice.start()}
          onStopVoice={voice.stop}
          onCancelVoice={voice.cancel}
          onRetryVoice={voice.retry}
          voiceState={voice.state}
          voiceElapsed={voice.elapsed}
          voiceError={voice.error}
        />
      </div>
    </main>
  );
}
