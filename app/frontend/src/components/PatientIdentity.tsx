import type { Patient } from '../lib/api';
import { formatClinicalDateLong } from '../lib/clinicalDate';

interface PatientIdentityProps {
  patient: Patient;
  showName?: boolean;
}

export function PatientIdentity({ patient, showName = true }: PatientIdentityProps) {
  const birthDate = patient.birth_date
    ? formatClinicalDateLong(`${patient.birth_date}T00:00:00`)
    : null;

  return (
    <div className="patient-identity">
      {showName && (
        <strong className="patient-identity__name">
          {patient.first_name} {patient.last_name}
        </strong>
      )}
      <div className="patient-identity__meta">
        <span>{birthDate ? `Nacimiento ${birthDate}` : 'Nacimiento no registrado'}</span>
        <span aria-hidden="true">·</span>
        <span>RUT {patient.rut_masked}</span>
      </div>
    </div>
  );
}
