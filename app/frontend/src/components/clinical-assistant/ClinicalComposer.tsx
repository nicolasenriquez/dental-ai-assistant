import { Mic } from 'lucide-react';
import { type KeyboardEvent, type RefObject, useState } from 'react';
import type { VoiceState } from '../../hooks/useClinicalVoiceInput';
import type { ClinicalPatient } from '../../lib/api';

interface ClinicalComposerProps {
  patient: ClinicalPatient | null;
  patients: import('../../lib/api').Patient[];
  value: string;
  busy: boolean;
  textareaRef: RefObject<HTMLTextAreaElement>;
  onChange: (value: string) => void;
  onPatientChange: (patientId: string | null) => void;
  onSubmit: () => void;
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
  onSubmit,
  onVoice,
  onStopVoice,
  onCancelVoice,
  onRetryVoice,
  voiceState,
  voiceElapsed,
  voiceError,
}: ClinicalComposerProps) {
  const [focused, setFocused] = useState(false);
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  };

  return (
    <div
      className={`chat-composer clinical-composer${focused ? ' is-focused' : ''}`}
      data-testid="clinical-composer"
    >
      <div className="clinical-patient-context">
        <span className="clinical-patient-label">Paciente activo</span>
        <select
          aria-label="Seleccionar paciente activo"
          value={patient?.id ?? ''}
          onChange={(event) => onPatientChange(event.target.value || null)}
        >
          <option value="">Seleccionar paciente</option>
          {patients.map((option) => (
            <option key={option.id} value={option.id}>
              {option.first_name} {option.last_name} · {option.rut_masked}
            </option>
          ))}
        </select>
        {patient && (
          <button
            type="button"
            className="clinical-patient-clear focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
            onClick={() => onPatientChange(null)}
            aria-label="Quitar paciente activo"
          >
            ×
          </button>
        )}
      </div>
      {(voiceState === 'recording' || voiceState === 'stopping') && (
        <div className="clinical-voice-state" role="status" aria-live="polite">
          <strong>{voiceState === 'stopping' ? '○ Preparando audio…' : '● Grabando'}</strong>
          <span>
            {Math.floor(voiceElapsed / 1000)
              .toString()
              .padStart(2, '0')}
            s
          </span>
          <small>Habla con naturalidad.</small>
          <div className="clinical-voice-actions">
            <button
              type="button"
              className="clinical-secondary-button"
              onClick={onCancelVoice}
              disabled={voiceState === 'stopping'}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="clinical-primary-button"
              onClick={onStopVoice}
              disabled={voiceState === 'stopping'}
            >
              {voiceState === 'stopping' ? 'Terminando…' : 'Terminar'}
            </button>
          </div>
        </div>
      )}
      {voiceState === 'transcribing' && (
        <p className="clinical-voice-status" role="status" aria-live="polite">
          Transcribiendo… Puedes seguir editando la nota.
        </p>
      )}
      {voiceState !== 'recording' && voiceState !== 'stopping' && (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          rows={2}
          aria-label="Nota clínica"
          placeholder={
            patient
              ? 'Escribe o dicta la nota clínica…'
              : 'Selecciona un paciente y escribe una nota…'
          }
          className="chat-composer-input clinical-composer-input"
          aria-busy={voiceState === 'transcribing'}
        />
      )}
      {voiceError && (
        <div className="clinical-voice-recovery" role="alert">
          <p className="clinical-voice-error">{voiceError}</p>
          <div className="clinical-voice-actions">
            <button type="button" className="clinical-secondary-button" onClick={onCancelVoice}>
              Descartar
            </button>
            <button type="button" className="clinical-primary-button" onClick={onRetryVoice}>
              Reintentar transcripción
            </button>
          </div>
        </div>
      )}
      {voiceState === 'success' && (
        <p className="clinical-voice-status" role="status">
          Dictado añadido a la nota.
        </p>
      )}
      <div className="clinical-composer-actions">
        {voiceState !== 'recording' && voiceState !== 'stopping' && (
          <button
            type="button"
            className="clinical-secondary-button"
            onClick={onVoice}
            aria-label="Dictar nota"
          >
            <Mic size={15} strokeWidth={1.8} aria-hidden="true" />
            Dictar
          </button>
        )}
        <button
          type="button"
          className={`chat-send-button active:brightness-90 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none${!value.trim() ? ' is-disabled' : ''}`}
          onClick={onSubmit}
          disabled={!value.trim()}
          aria-label={busy ? 'Poner mensaje en cola' : 'Enviar mensaje'}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="8" y1="14" x2="8" y2="3" />
            <polyline points="3,8 8,3 13,8" />
          </svg>
        </button>
      </div>
    </div>
  );
}
