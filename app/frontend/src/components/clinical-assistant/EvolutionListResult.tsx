import { Link } from 'react-router-dom';
import { formatClinicalDateTime } from '../../lib/clinicalDate';

export function EvolutionListResult({
  payload,
}: { payload: Record<string, unknown> }): JSX.Element {
  const rows = Array.isArray(payload.evolutions) ? payload.evolutions : [];
  return (
    <section aria-label="Evoluciones consultadas" className="space-y-2 text-sm">
      <h3 className="font-medium">Evoluciones consultadas</h3>
      {rows.length === 0 && (
        <p className="text-muted">No hay evoluciones anteriores disponibles.</p>
      )}
      <ul className="space-y-2">
        {rows.map((row) => {
          if (
            !row ||
            typeof row !== 'object' ||
            typeof row.id !== 'string' ||
            typeof row.evolution_at !== 'string' ||
            typeof payload.patient_id !== 'string'
          )
            return null;
          return (
            <li key={row.id}>
              <Link
                className="inline-block py-2 text-primary hover:underline"
                to={`/patients/${encodeURIComponent(payload.patient_id)}/evolutions/${encodeURIComponent(row.id)}`}
              >
                Ver evolución del {formatClinicalDateTime(row.evolution_at)}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
