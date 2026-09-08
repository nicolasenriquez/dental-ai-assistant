import type { KeyboardEvent, RefObject } from 'react';
import type { ClinicalPatient } from '../../lib/api';
import type { VoiceState } from '../../hooks/useClinicalVoiceInput';

interface ClinicalComposerProps {
  patient: ClinicalPatient | null;
  patients: import('../../lib/api').Patient[];
  value: string;
  busy: boolean;
  textareaRef: RefObject<HTMLTextAreaElement>;
  onChange: (value: string) => void;
  onPatientChange: (patientId: string | null) => void;
  onSend: () => void;
  onQueue: () => void;
  onVoice: () => void;
  onStopVoice: () => void;
  onCancelVoice: () => void;
  onRetryVoice: () => void;
  voiceState: VoiceState;
  voiceElapsed: number;
  voiceError: string | null;
}

export function ClinicalComposer({
  patient,
  patients,
  value,
  busy,
  textareaRef,
  onChange,
  onPatientChange,
  onSend,
  onQueue,
  onVoice,
  onStopVoice,
  onCancelVoice,
  onRetryVoice,
  voiceState,
  voiceElapsed,
  voiceError,
}: ClinicalComposerProps) {
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      busy ? onQueue() : onSend();
    }
  };

  return (
    <div className="clinical-composer" data-testid="clinical-composer">
      <div className="clinical-patient-context">
        <span className="clinical-patient-label">Paciente activo</span>
        <select aria-label="Seleccionar paciente activo" value={patient?.id ?? ''} onChange={(event) => onPatientChange(event.target.value || null)}>
          <option value="">Seleccionar paciente</option>
          {patients.map((option) => <option key={option.id} value={option.id}>{option.first_name} {option.last_name} · {option.rut_masked}</option>)}
        </select>
        {patient && <button type="button" className="clinical-patient-clear" onClick={() => onPatientChange(null)} aria-label="Quitar paciente activo">×</button>}
      </div>
      {(voiceState === 'recording' || voiceState === 'stopping') && <div className="clinical-voice-state" role="status" aria-live="polite">
        <strong>{voiceState === 'stopping' ? '○ Preparando audio…' : '● Grabando'}</strong>
        <span>{Math.floor(voiceElapsed / 1000).toString().padStart(2, '0')}s</span>
        <small>Habla con naturalidad.</small>
        <div className="clinical-voice-actions">
          <button type="button" className="clinical-secondary-button" onClick={onCancelVoice} disabled={voiceState === 'stopping'}>Cancelar</button>
          <button type="button" className="clinical-primary-button" onClick={onStopVoice} disabled={voiceState === 'stopping'}>{voiceState === 'stopping' ? 'Terminando…' : 'Terminar'}</button>
        </div>
      </div>}
      {voiceState === 'transcribing' && <p className="clinical-voice-status" role="status" aria-live="polite">Transcribiendo… Puedes seguir editando la nota.</p>}
      {voiceState !== 'recording' && voiceState !== 'stopping' && <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        rows={2}
        aria-label="Nota clínica"
        placeholder={patient ? 'Escribe o dicta la nota clínica…' : 'Selecciona un paciente y escribe una nota…'}
        className="clinical-composer-input"
        aria-busy={voiceState === 'transcribing'}
      />}
      {voiceError && <div className="clinical-voice-recovery" role="alert">
        <p className="clinical-voice-error">{voiceError}</p>
        <div className="clinical-voice-actions">
          <button type="button" className="clinical-secondary-button" onClick={onCancelVoice}>Descartar</button>
          <button type="button" className="clinical-primary-button" onClick={onRetryVoice}>Reintentar transcripción</button>
        </div>
      </div>}
      {voiceState === 'success' && <p className="clinical-voice-status" role="status">Dictado añadido a la nota.</p>}
      <div className="clinical-composer-actions">
        {voiceState !== 'recording' && voiceState !== 'stopping' && <button type="button" className="clinical-secondary-button" onClick={onVoice} aria-label="Dictar nota">🎙 Dictar</button>}
        {busy && <button type="button" className="clinical-secondary-button" onClick={onQueue} disabled={!value.trim()}>Enviar luego</button>}
        <button type="button" className="clinical-primary-button" onClick={onSend} disabled={!value.trim()}>
          {busy ? 'En cola' : 'Enviar'}
        </button>
      </div>
    </div>
  );
}
