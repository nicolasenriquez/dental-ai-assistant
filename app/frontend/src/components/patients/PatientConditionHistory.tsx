import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type ConditionSnapshot,
  type PatientConditionRevisionPage,
  getPatientConditionRevisions,
} from '../../lib/api';
import { formatClinicalDateShort, formatClinicalTime } from '../../lib/clinicalDate';
import { Button } from '../ui/Button';

export function PatientConditionHistory({
  patientId,
  conditionId,
  labels,
}: { patientId: string; conditionId: string; labels: Record<string, string> }): JSX.Element {
  const [page, setPage] = useState<PatientConditionRevisionPage | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const sequence = useRef(0);
  const load = useCallback(
    async (cursor?: string): Promise<void> => {
      const request = ++sequence.current;
      setLoading(true);
      setError(false);
      try {
        const next = await getPatientConditionRevisions(patientId, conditionId, cursor);
        if (request === sequence.current)
          setPage((current) =>
            cursor && current
              ? {
                  ...next,
                  items: [...current.items, ...next.items].filter(
                    (item, index, items) =>
                      items.findIndex((candidate) => candidate.id === item.id) === index,
                  ),
                }
              : next,
          );
      } catch {
        if (request === sequence.current) setError(true);
      } finally {
        if (request === sequence.current) setLoading(false);
      }
    },
    [patientId, conditionId],
  );
  useEffect(() => {
    void load();
    return () => {
      sequence.current++;
    };
  }, [load]);
  const describe = (value: ConditionSnapshot): string =>
    `Pieza ${value.tooth_fdi} · ${labels[value.condition_code] ?? value.condition_code} · ${value.surfaces.join(', ') || 'Sin superficies'} · ${value.status === 'active' ? 'Activa' : 'Resuelta'}`;
  return (
    <section aria-label="Revisiones de condición" className="space-y-3 border-l border-border pl-4">
      <h4 className="font-medium">Historial de revisiones</h4>
      {loading && <p role="status">Cargando revisiones…</p>}
      {error && (
        <div role="alert">
          <p>No pudimos cargar el historial.</p>
          <Button variant="clinicalSecondary" onClick={() => void load()}>
            Reintentar historial
          </Button>
        </div>
      )}
      {page?.items.map((item) => (
        <article key={item.id} className="space-y-2 text-sm">
          <h5>
            Revisión {item.revision} ·{' '}
            {item.action === 'created'
              ? 'Creada'
              : item.action === 'resolved'
                ? 'Resuelta'
                : 'Editada'}
          </h5>
          <p className="text-xs text-muted">
            {formatClinicalDateShort(item.changed_at)} {formatClinicalTime(item.changed_at)}
            {item.actor.display_name ? ` · ${item.actor.display_name}` : ''}
          </p>
          {item.before && (
            <div>
              <strong>Antes</strong>
              <p>{describe(item.before)}</p>
              <p className="whitespace-pre-wrap break-words">{item.before.note}</p>
            </div>
          )}
          <div>
            <strong>Después</strong>
            <p>{describe(item.after)}</p>
            <p className="whitespace-pre-wrap break-words">{item.after.note}</p>
          </div>
        </article>
      ))}
      {page?.next_cursor && (
        <Button
          variant="clinicalSecondary"
          disabled={loading}
          onClick={() => void load(page.next_cursor ?? undefined)}
        >
          Ver más revisiones
        </Button>
      )}
    </section>
  );
}
