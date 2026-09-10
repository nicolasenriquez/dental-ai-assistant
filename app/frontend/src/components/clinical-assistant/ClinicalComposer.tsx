import { Check, ChevronsUpDown, ListPlus, Search, X } from 'lucide-react';
import { type KeyboardEvent, type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { useAutosizeTextarea } from '../../hooks/useAutosizeTextarea';
import { type VoiceState, isVoiceInFlight } from '../../hooks/useVoiceDictation';
import type { ClinicalPatient } from '../../lib/api';
import { ComposerShell } from '../ComposerShell';
import { VoiceDictationStatus } from '../voice/VoiceDictationStatus';

export interface ClinicalVoiceControls {
  state: VoiceState;
  elapsed: number;
  error: string | null;
  canRetry: boolean;
  stream?: MediaStream | null;
  onStart: () => void;
  onStop: () => void;
  onCancel: () => void;
  onRetry: () => void;
}

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
  voice: ClinicalVoiceControls;
  patientControlsDisabled?: boolean;
  submitDisabled?: boolean;
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
  voice,
  patientControlsDisabled = false,
  submitDisabled = false,
}: ClinicalComposerProps) {
  const [focused, setFocused] = useState(false);
  const [patientPickerOpen, setPatientPickerOpen] = useState(false);
  const [patientQuery, setPatientQuery] = useState('');
  const [activeOption, setActiveOption] = useState(0);
  const patientPickerRef = useRef<HTMLDivElement>(null);
  const patientTriggerRef = useRef<HTMLButtonElement>(null);
  const voiceInFlight = isVoiceInFlight(voice.state);
  const patientControlsLocked = patientControlsDisabled || voiceInFlight;
  useAutosizeTextarea({ ref: textareaRef, value });
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
    if (patientControlsLocked) return;
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
    if (patientControlsLocked) setPatientPickerOpen(false);
  }, [patientControlsLocked]);
  useEffect(() => {
    if (!patientPickerOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!patientPickerRef.current?.contains(event.target as Node)) setPatientPickerOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [patientPickerOpen]);
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape' && voice.state === 'recording') {
      event.preventDefault();
      voice.onCancel();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (submitDisabled || voiceInFlight) return;
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
            disabled={patientControlsLocked}
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
                  disabled={patientControlsLocked}
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
                      disabled={patientControlsLocked}
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
            disabled={patientControlsLocked}
            aria-label="Quitar paciente activo"
          >
            <X aria-hidden="true" size={17} />
          </button>
        )}
      </div>
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
        aria-busy={voice.state === 'transcribing'}
      />
      <div className="clinical-composer-actions">
        <VoiceDictationStatus
          voiceState={voice.state}
          voiceElapsed={voice.elapsed}
          voiceError={voice.error}
          canRetry={voice.canRetry}
          stream={voice.stream ?? null}
          onStartVoice={voice.onStart}
          onStopVoice={voice.onStop}
          onCancelVoice={voice.onCancel}
          onRetryVoice={voice.onRetry}
        />
        <button
          type="button"
          className={`chat-send-button active:brightness-90 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none${!value.trim() ? ' is-disabled' : ''}`}
          onClick={onSubmit}
          disabled={!value.trim() || submitDisabled || voiceInFlight}
          aria-label={busy ? 'Poner mensaje en cola' : 'Enviar mensaje'}
          title={busy ? 'Agregar a cola' : 'Enviar'}
        >
          {voice.state === 'stopping' || voice.state === 'transcribing' ? (
            <span aria-hidden="true" className="spinner" />
          ) : busy ? (
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
