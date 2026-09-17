import type { ClinicalPatientSwitchItem as PatientSwitchItem } from '../../hooks/useClinicalAssistant';

interface ClinicalPatientSwitchItemProps {
  item: PatientSwitchItem;
  onKeep: () => void;
  onChange: () => void;
}

export function ClinicalPatientSwitchItem({
  item,
  onKeep,
  onChange,
}: ClinicalPatientSwitchItemProps) {
  const resolved = item.resolution !== 'pending';
  return (
    <section className="clinical-patient-switch" aria-label="Decisión de paciente">
      <h2>Este mensaje parece corresponder a otro paciente.</h2>
      <div className="clinical-patient-switch-grid">
        <span>
          Actual{' '}
          <strong>
            {item.current.first_name} {item.current.last_name}
          </strong>
        </span>
        <span>
          Detectado{' '}
          <strong>
            {item.detected.first_name} {item.detected.last_name}
          </strong>
        </span>
      </div>
      {resolved ? (
        <p className="text-xs text-[var(--text-secondary)]">
          {item.resolution === 'changed_patient'
            ? `Paciente cambiado a ${item.detected.first_name} ${item.detected.last_name}.`
            : `Se mantuvo ${item.current.first_name} ${item.current.last_name}.`}
        </p>
      ) : (
        <div className="clinical-artifact-actions">
          <button type="button" className="clinical-secondary-button" onClick={onKeep}>
            Mantener {item.current.first_name}
          </button>
          <button type="button" className="clinical-primary-button" onClick={onChange}>
            Cambiar a {item.detected.first_name}
          </button>
        </div>
      )}
    </section>
  );
}
