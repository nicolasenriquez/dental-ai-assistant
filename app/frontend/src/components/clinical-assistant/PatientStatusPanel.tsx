import type { ClinicalPatient } from '../../lib/api';

interface PatientStatusPanelProps {
  patient: ClinicalPatient;
  onClose: () => void;
  onChangePatient: () => void;
}

export function PatientStatusPanel({ patient, onClose, onChangePatient }: PatientStatusPanelProps) {
  return (
    <section
      id="patient-status-panel"
      aria-labelledby="patient-status-title"
      className="mb-2 w-full rounded-[var(--conversation-composer-radius)] border border-border bg-surface p-4 shadow-[0_10px_28px_rgb(0_0_0/18%)]"
    >
      <header className="mb-4 flex items-center justify-between gap-3">
        <h2 id="patient-status-title" className="text-sm font-semibold text-foreground">
          Paciente
        </h2>
        <button
          type="button"
          className="text-xs text-muted hover:text-foreground"
          onClick={onClose}
        >
          Cerrar
        </button>
      </header>
      <dl className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-6 gap-y-3 text-sm max-[520px]:grid-cols-1 max-[520px]:gap-y-1">
        <dt className="text-muted-foreground">Paciente</dt>
        <dd className="text-foreground">
          {patient.first_name} {patient.last_name}
        </dd>
        <dt className="text-muted-foreground">RUT</dt>
        <dd className="text-foreground">{patient.rut_masked}</dd>
        <dt className="text-muted-foreground">Contexto</dt>
        <dd className="text-foreground">Activo en esta conversación</dd>
      </dl>
      <div className="mt-4 flex justify-end">
        <button type="button" className="clinical-secondary-button" onClick={onChangePatient}>
          Cambiar paciente
        </button>
      </div>
    </section>
  );
}
