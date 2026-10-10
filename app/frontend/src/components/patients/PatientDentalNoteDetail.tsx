import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type DentalClinicalNote,
  type DentalNoteRevision,
  getDentalClinicalNote,
  getDentalClinicalNoteRevisions,
} from '../../lib/api';
import { formatClinicalDateShort, formatClinicalTime } from '../../lib/clinicalDate';
import { Button } from '../ui/Button';
import { PatientActorLabel } from './PatientActorLabel';

export function PatientDentalNoteDetail({
  patientId,
  noteId,
}: { patientId: string; noteId: string }): JSX.Element {
  const [note, setNote] = useState<DentalClinicalNote | null>(null);
  const [history, setHistory] = useState<DentalNoteRevision[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const destination = useRef<HTMLElement>(null);
  const load = useCallback(
    async (next?: string): Promise<void> => {
      const request = ++generation.current;
      setError(false);
      setLoading(true);
      try {
        const [record, revisions] = await Promise.all([
          getDentalClinicalNote(patientId, noteId),
          getDentalClinicalNoteRevisions(patientId, noteId, next),
        ]);
        if (generation.current !== request) return;
        setNote(record);
        setHistory((previous) => (next ? [...previous, ...revisions.items] : revisions.items));
        setCursor(revisions.next_cursor);
        if (!next) destination.current?.focus();
      } catch {
        if (generation.current === request) setError(true);
      } finally {
        if (generation.current === request) setLoading(false);
      }
    },
    [patientId, noteId],
  );
  useEffect(() => {
    setNote(null);
    setHistory([]);
    void load();
    return () => {
      generation.current++;
    };
  }, [load]);
  return (
    <section
      ref={destination}
      tabIndex={-1}
      aria-label="Nota clínica seleccionada"
      className="space-y-3 border-t border-border pt-4 focus-visible:ring-2 focus-visible:ring-primary"
    >
      <h3 className="font-semibold">Nota clínica e historial</h3>
      {loading && <p role="status">Cargando nota clínica</p>}
      {error && (
        <div role="alert">
          <p>Nota clínica o historial no disponible para este paciente.</p>
          <Button variant="clinicalSecondary" onClick={() => void load(cursor ?? undefined)}>
            Reintentar nota clínica
          </Button>
        </div>
      )}
      {note && (
        <>
          <p>
            {note.deleted_at ? 'Eliminada; su historial se conserva.' : 'Guardada'} · Revisión{' '}
            {note.revision}
          </p>
          <p>{note.tooth_fdi ? `Diente ${note.tooth_fdi}` : note.entity_label}</p>
          <p className="whitespace-pre-wrap break-words">{note.body}</p>
        </>
      )}
      <ol className="space-y-2">
        {history.map((entry) => (
          <li key={entry.id}>
            Revisión {entry.revision} ·{' '}
            {entry.action === 'created'
              ? 'Nota creada'
              : entry.action === 'edited'
                ? 'Nota editada'
                : 'Nota eliminada'}{' '}
            · {formatClinicalDateShort(entry.changed_at)} {formatClinicalTime(entry.changed_at)} ·{' '}
            <PatientActorLabel actor={{ user_id: entry.actor_user_id, display_name: null }} />
          </li>
        ))}
      </ol>
      {cursor && !error && (
        <Button variant="clinicalSecondary" disabled={loading} onClick={() => void load(cursor)}>
          Cargar más revisiones de nota
        </Button>
      )}
    </section>
  );
}
