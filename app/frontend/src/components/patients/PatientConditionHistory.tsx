import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type ConditionCatalog,
  type ConditionSnapshot,
  type PatientConditionRevisionPage,
  getPatientConditionRevisions,
} from '../../lib/api';
import { formatClinicalDateShort, formatClinicalTime } from '../../lib/clinicalDate';
import { resolveCondition, surfaceDescription } from '../../lib/odontogramPresentation';
import { Button } from '../ui/Button';
import { PatientActorLabel } from './PatientActorLabel';

export function PatientConditionHistory({
  patientId,
  conditionId,
  labels,
  catalog,
  targetRevisionId,
}: {
  patientId: string;
  conditionId: string;
  labels: Record<string, string>;
  catalog?: ConditionCatalog | null;
  targetRevisionId?: string;
}): JSX.Element {
  const [page, setPage] = useState<PatientConditionRevisionPage | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const sequence = useRef(0);
  const failedCursor = useRef<string | undefined>();
  const targetRef = useRef<HTMLElement>(null);
  const load = useCallback(
    async (cursor?: string): Promise<void> => {
      const request = ++sequence.current;
      setLoading(true);
      setError(false);
      try {
        const next = await getPatientConditionRevisions(patientId, conditionId, cursor, 50);
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
        if (request === sequence.current) {
          failedCursor.current = cursor;
          setError(true);
        }
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
  const target = page?.items.find((item) => item.id === targetRevisionId);
  useEffect(() => {
    if (targetRevisionId && !target && page?.next_cursor && !loading && !error)
      void load(page.next_cursor);
    if (target) targetRef.current?.focus();
  }, [targetRevisionId, target, page?.next_cursor, loading, error, load]);
  const describe = (value: ConditionSnapshot): string =>
    `Pieza ${value.tooth_fdi} · ${labels[value.condition_code] ?? resolveCondition(catalog, value.condition_code).label} · ${surfaceDescription(catalog, value.condition_code, value.surfaces)} · ${value.status === 'active' ? 'Activa' : value.status === 'resolved' ? 'Resuelta' : 'Registrada por error'}`;
  return (
    <section aria-label="Revisiones de condición" className="space-y-3 border-l border-border pl-4">
      <h4 className="font-medium">Historial de revisiones</h4>
      {loading && <p role="status">Cargando revisiones…</p>}
      {error && (
        <div role="alert">
          <p>No pudimos cargar el historial.</p>
          <Button variant="clinicalSecondary" onClick={() => void load(failedCursor.current)}>
            Reintentar historial
          </Button>
        </div>
      )}
      {targetRevisionId && !loading && !error && page && !page.next_cursor && !target && (
        <p role="alert">
          La revisión exacta no está disponible. No se sustituye por el estado actual.
        </p>
      )}
      {page?.items.map((item) => (
        <article
          key={item.id}
          ref={item.id === targetRevisionId ? targetRef : undefined}
          tabIndex={-1}
          aria-label={item.id === targetRevisionId ? 'Revisión exacta del resultado' : undefined}
          className="space-y-2 text-sm focus-visible:ring-2 focus-visible:ring-primary"
        >
          {item.id === targetRevisionId && (
            <p>Revisión exacta del resultado. Puede diferir del estado actual del registro.</p>
          )}
          <h5>
            Revisión {item.revision} ·{' '}
            {item.action === 'created'
              ? 'Creada'
              : item.action === 'resolved'
                ? 'Resuelta'
                : item.action === 'corrected'
                  ? 'Corregida'
                  : 'Editada'}
          </h5>
          <p className="text-xs text-muted">
            {formatClinicalDateShort(item.changed_at)} {formatClinicalTime(item.changed_at)}
          </p>
          <PatientActorLabel
            actor={item.actor}
            actors={page?.items.map((revision) => revision.actor)}
          />
          {item.correction && (
            <p className="whitespace-pre-wrap break-words">
              Motivo de corrección: {item.correction.reason}
            </p>
          )}
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
