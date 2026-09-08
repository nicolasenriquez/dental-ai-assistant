import { Link } from 'react-router-dom';
import type { ClinicalResultItem } from '../../hooks/useClinicalAssistant';

export function ActionResultItem({ item }: { item: ClinicalResultItem }) {
  return (
    <output className="clinical-result">
      <strong>{item.message}</strong>
      {item.evolutionId && item.patientId && <Link to={`/patients/${item.patientId}/evolutions/${item.evolutionId}`}>Ver en ficha</Link>}
    </output>
  );
}
