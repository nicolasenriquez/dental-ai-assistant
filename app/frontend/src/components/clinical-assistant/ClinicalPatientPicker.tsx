import { Check, ChevronsUpDown, Search, X } from 'lucide-react';
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { ClinicalPatient, Patient } from '../../lib/api';

interface ClinicalPatientPickerProps {
  patient: ClinicalPatient | null;
  patients: Patient[];
  patientsLoading?: boolean;
  patientsError?: boolean;
  onRetryPatients?: () => void;
  onPatientChange: (patientId: string | null) => void;
  disabled?: boolean;
}

export function ClinicalPatientPicker({
  patient,
  patients,
  patientsLoading = false,
  patientsError = false,
  onRetryPatients,
  onPatientChange,
  disabled = false,
}: ClinicalPatientPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeOption, setActiveOption] = useState(0);
  const pickerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const filteredPatients = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return patients;
    return patients.filter((option) =>
      `${option.first_name} ${option.last_name} ${option.rut_masked}`
        .toLocaleLowerCase()
        .includes(normalizedQuery),
    );
  }, [patients, query]);

  const choosePatient = (patientId: string) => {
    if (disabled) return;
    onPatientChange(patientId);
    setOpen(false);
    setQuery('');
    setActiveOption(0);
  };

  const closePicker = () => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [open]);

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      closePicker();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (filteredPatients.length > 0) {
        setActiveOption((current) => Math.min(current + 1, filteredPatients.length - 1));
      }
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveOption((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === 'Enter' && filteredPatients[activeOption]) {
      event.preventDefault();
      choosePatient(filteredPatients[activeOption].id);
    }
  };

  return (
    <div className="clinical-patient-context">
      <span className="clinical-patient-label">
        {patient ? 'Paciente' : 'Selecciona un paciente'}
      </span>
      <div ref={pickerRef} className="clinical-patient-picker">
        <button
          ref={triggerRef}
          type="button"
          className="clinical-patient-trigger"
          aria-label="Seleccionar paciente activo"
          aria-haspopup="listbox"
          aria-expanded={open}
          disabled={disabled}
          onClick={() => setOpen((current) => !current)}
        >
          <span title={patient ? `${patient.first_name} ${patient.last_name}` : undefined}>
            {patient
              ? `${patient.first_name} ${patient.last_name} · ${patient.rut_masked}`
              : 'Seleccionar paciente'}
          </span>
          <ChevronsUpDown aria-hidden="true" size={15} />
        </button>
        {open && (
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
                value={query}
                disabled={disabled}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveOption(0);
                }}
                onKeyDown={handleSearchKeyDown}
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
                    disabled={disabled}
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
          disabled={disabled}
          aria-label="Quitar paciente activo"
        >
          <X aria-hidden="true" size={17} />
        </button>
      )}
    </div>
  );
}
