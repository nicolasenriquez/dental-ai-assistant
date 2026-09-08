import type { ClinicalPatient, Patient } from '../../lib/api';

interface PatientContextProps {
  patient: ClinicalPatient | null;
  patients: Patient[];
  onChange: (patientId: string | null) => void;
}

export function PatientContext({ patient, patients, onChange }: PatientContextProps) {
  return (
    <div className="clinical-patient-context">
      <div>
        <span className="clinical-patient-label">Paciente activo</span>
        <strong>{patient ? `${patient.first_name} ${patient.last_name}` : 'Sin paciente seleccionado'}</strong>
        {patient && <span>{patient.rut_masked}</span>}
      </div>
      {patient && <button type="button" className="clinical-patient-clear" onClick={() => onChange(null)} aria-label="Quitar paciente activo">×</button>}
      <select aria-label="Seleccionar paciente activo" value={patient?.id ?? ''} onChange={(event) => onChange(event.target.value || null)}>
        <option value="">Seleccionar paciente</option>
        {patients.map((option) => <option key={option.id} value={option.id}>{option.first_name} {option.last_name} · {option.rut_masked}</option>)}
      </select>
    </div>
  );
}
