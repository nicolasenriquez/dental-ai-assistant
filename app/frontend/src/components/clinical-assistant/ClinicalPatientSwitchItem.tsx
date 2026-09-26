import type { ClinicalPatientSwitchItem as PatientSwitchItem } from '../../hooks/useClinicalAssistant';
import { Button } from '../ui/Button';

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
        <p className="text-xs text-muted">
          {item.resolution === 'changed_patient'
            ? `Paciente cambiado a ${item.detected.first_name} ${item.detected.last_name}.`
            : `Se mantuvo ${item.current.first_name} ${item.current.last_name}.`}
        </p>
      ) : (
        <div className="clinical-artifact-actions">
          <Button variant="clinicalSecondary" onClick={onKeep}>
            Mantener {item.current.first_name}
          </Button>
          <Button variant="clinical" onClick={onChange}>
            Cambiar a {item.detected.first_name}
          </Button>
        </div>
      )}
    </section>
  );
}
