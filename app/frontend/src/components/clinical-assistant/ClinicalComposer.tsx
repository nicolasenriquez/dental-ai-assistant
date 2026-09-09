import { Check, ChevronsUpDown, ListPlus, Mic, Search, X } from 'lucide-react';
import { type KeyboardEvent, type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import type { VoiceState } from '../../hooks/useClinicalVoiceInput';
import type { ClinicalPatient } from '../../lib/api';
import { ComposerShell } from '../ComposerShell';
import { Spinner } from '../Spinner';

interface ClinicalComposerProps {
  patient: ClinicalPatient | null;
  patients: import('../../lib/api').Patient[];
  patientsLoading?: boolean;
  patientsError?: boolean;
  onRetryPatients?: () => void;
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
  patientsLoading = false,
  patientsError = false,
  onRetryPatients,
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
  const [patientPickerOpen, setPatientPickerOpen] = useState(false);
  const [patientQuery, setPatientQuery] = useState('');
  const [activeOption, setActiveOption] = useState(0);
  const patientPickerRef = useRef<HTMLDivElement>(null);
  const patientTriggerRef = useRef<HTMLButtonElement>(null);
  const filteredPatients = useMemo(() => {
    const query = patientQuery.trim().toLocaleLowerCase();
    if (!query) return patients;
    return patients.filter((option) =>
      `${option.first_name} ${option.last_name} ${option.rut_masked}`
        .toLocaleLowerCase()
        .includes(query),
    );
  }, [patientQuery, patients]);
  const choosePatient = (patientId: string) => {
    onPatientChange(patientId);
    setPatientPickerOpen(false);
    setPatientQuery('');
    setActiveOption(0);
  };
  const closePatientPicker = () => {
    setPatientPickerOpen(false);
    requestAnimationFrame(() => patientTriggerRef.current?.focus());
  };
  useEffect(() => {
    if (!patientPickerOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!patientPickerRef.current?.contains(event.target as Node)) setPatientPickerOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [patientPickerOpen]);
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  };

  return (
    <ComposerShell className="clinical-composer" focused={focused} testId="clinical-composer">
      <div className="clinical-patient-context">
        <span className="clinical-patient-label">Paciente activo</span>
        <div ref={patientPickerRef} className="clinical-patient-picker">
          <button
            ref={patientTriggerRef}
            type="button"
            className="clinical-patient-trigger"
            aria-label="Seleccionar paciente activo"
            aria-haspopup="listbox"
            aria-expanded={patientPickerOpen}
            onClick={() => setPatientPickerOpen((current) => !current)}
          >
            <span>
              {patient
                ? `${patient.first_name} ${patient.last_name} · ${patient.rut_masked}`
                : 'Seleccionar paciente'}
            </span>
            <ChevronsUpDown aria-hidden="true" size={15} />
          </button>
          {patientPickerOpen && (
            <div className="clinical-patient-popover">
              <label className="clinical-patient-search">
                <Search aria-hidden="true" size={15} />
                <input
                  autoFocus
                  role="combobox"
                  aria-label="Buscar paciente por nombre o RUT"
                  aria-controls="clinical-patient-options"
                  aria-expanded="true"
                  aria-activedescendant={filteredPatients[activeOption]?.id}
                  value={patientQuery}
                  onChange={(event) => {
                    setPatientQuery(event.target.value);
                    setActiveOption(0);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') closePatientPicker();
                    if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      if (filteredPatients.length > 0) {
                        setActiveOption((current) =>
                          Math.min(current + 1, filteredPatients.length - 1),
                        );
                      }
                    }
                    if (event.key === 'ArrowUp') {
                      event.preventDefault();
                      setActiveOption((current) => Math.max(current - 1, 0));
                    }
                    if (event.key === 'Enter' && filteredPatients[activeOption]) {
                      event.preventDefault();
                      choosePatient(filteredPatients[activeOption].id);
                    }
                  }}
                  placeholder="Buscar por nombre o RUT…"
                />
              </label>
              <div id="clinical-patient-options" role="listbox" tabIndex={-1}>
                {patientsLoading ? (
                  <p role="status">Cargando pacientes…</p>
                ) : patientsError ? (
                  <div role="alert">
                    <p>No pudimos cargar los pacientes.</p>
                    {onRetryPatients && (
                      <button type="button" onClick={onRetryPatients}>
                        Reintentar
                      </button>
                    )}
                  </div>
                ) : filteredPatients.length === 0 ? (
                  <p>No se encontraron pacientes.</p>
                ) : (
                  filteredPatients.map((option, index) => (
                    <button
                      type="button"
                      role="option"
                      id={option.id}
                      key={option.id}
                      aria-selected={option.id === patient?.id}
                      className={index === activeOption ? 'is-active' : undefined}
                      onMouseEnter={() => setActiveOption(index)}
                      onClick={() => choosePatient(option.id)}
                    >
                      <span>
                        <strong>
                          {option.first_name} {option.last_name}
                        </strong>
                        <small>{option.rut_masked}</small>
                      </span>
                      {option.id === patient?.id && <Check aria-hidden="true" size={15} />}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        {patient && (
          <button
            type="button"
            className="clinical-patient-clear focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
            onClick={() => onPatientChange(null)}
            aria-label="Quitar paciente activo"
          >
            <X aria-hidden="true" size={17} />
          </button>
        )}
      </div>
      {(voiceState === 'recording' || voiceState === 'stopping') && (
        <div className="clinical-voice-state" role="status" aria-live="polite">
          <strong>
            {voiceState === 'stopping' ? (
              <>
                <Spinner /> Preparando audio…
              </>
            ) : (
              <>
                <span className="clinical-recording-dot" aria-hidden="true" /> Grabando
              </>
            )}
          </strong>
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
              {voiceState === 'stopping' ? (
                <>
                  <Spinner /> Terminando…
                </>
              ) : (
                'Terminar'
              )}
            </button>
          </div>
        </div>
      )}
      {voiceState === 'transcribing' && (
        <p className="clinical-voice-status" role="status" aria-live="polite">
          <Spinner />
          <span>Transcribiendo… Puedes seguir editando la nota.</span>
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
          rows={1}
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
          title={busy ? 'Agregar a cola' : 'Enviar'}
        >
          {busy ? (
            <ListPlus aria-hidden="true" size={16} strokeWidth={1.8} />
          ) : (
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
          )}
        </button>
      </div>
    </ComposerShell>
  );
}
