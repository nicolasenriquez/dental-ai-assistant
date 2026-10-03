import { useCallback, useEffect, useRef, useState } from 'react';
import { type PatientNoteRevisionPage, getPatientNoteRevisions } from '../../lib/api';
import { formatClinicalDateShort, formatClinicalTime } from '../../lib/clinicalDate';
import { Button } from '../ui/Button';

export function PatientNoteHistory({
  patientId,
  noteId,
}: { patientId: string; noteId: string }): JSX.Element {
  const [page, setPage] = useState<PatientNoteRevisionPage | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const sequence = useRef(0);
  const load = useCallback(
    async (cursor?: string): Promise<void> => {
      const request = ++sequence.current;
      setError(false);
      setLoading(true);
      try {
        const next = await getPatientNoteRevisions(patientId, noteId, cursor);
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
    [patientId, noteId],
  );
  useEffect(() => {
    setPage(null);
    void load();
    return () => {
      sequence.current++;
    };
  }, [load]);
  return (
    <section aria-label="Revisiones de nota" className="space-y-3 border-l border-border pl-4">
      <h3 className="font-medium">Historial de revisiones</h3>
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
          <h4>
            Revisión {item.revision} · {item.action === 'created' ? 'Creada' : 'Editada'}
          </h4>
          <p className="text-xs text-muted">
            {formatClinicalDateShort(item.changed_at)} {formatClinicalTime(item.changed_at)}
            {item.actor.display_name ? ` · ${item.actor.display_name}` : ''}
          </p>
          {item.previous_body !== null && (
            <div>
              <strong>Antes</strong>
              <p className="whitespace-pre-wrap break-words">{item.previous_body}</p>
            </div>
          )}
          <div>
            <strong>Después</strong>
            <p className="whitespace-pre-wrap break-words">{item.new_body}</p>
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
