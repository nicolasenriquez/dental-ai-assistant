import { Link } from 'react-router-dom';
import { formatClinicalDateTime } from '../../lib/clinicalDate';

interface EvolutionRow {
  id: string;
  evolution_at: string;
}

function isEvolutionRow(row: unknown): row is EvolutionRow {
  return (
    !!row &&
    typeof row === 'object' &&
    typeof (row as EvolutionRow).id === 'string' &&
    typeof (row as EvolutionRow).evolution_at === 'string'
  );
}

export function EvolutionListResult({
  payload,
}: { payload: Record<string, unknown> }): JSX.Element {
  const rows = Array.isArray(payload.evolutions) ? payload.evolutions : [];
  const patientId = payload.patient_id;
  const validRows = typeof patientId === 'string' ? rows.filter(isEvolutionRow) : [];
  // ponytail: an ordinal is added only to rows whose displayed timestamp collides,
  // assigned in payload order; it is a list label, not a persistent identifier.
  const seen = new Map<string, number>();
  const labelledRows = validRows.map((row) => {
    const label = formatClinicalDateTime(row.evolution_at);
    const ordinal = (seen.get(label) ?? 0) + 1;
    seen.set(label, ordinal);
    return { row, label, ordinal };
  });

  return (
    <section aria-label="Evoluciones consultadas" className="space-y-2 text-sm">
      <h3 className="font-medium">Evoluciones consultadas</h3>
      {rows.length === 0 && (
        <p className="text-muted">No hay evoluciones anteriores disponibles.</p>
      )}
      <ul className="space-y-2">
        {typeof patientId === 'string' &&
          labelledRows.map(({ row, label, ordinal }) => (
            <li key={row.id}>
              <Link
                className="inline-block py-2 text-primary hover:underline"
                to={`/patients/${encodeURIComponent(patientId)}/evolutions/${encodeURIComponent(row.id)}`}
              >
                {(seen.get(label) ?? 0) > 1
                  ? `Ver evolución ${ordinal} del ${label}`
                  : `Ver evolución del ${label}`}
              </Link>
            </li>
          ))}
      </ul>
    </section>
  );
}
