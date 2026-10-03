import { FileText, History, Pencil, Plus } from 'lucide-react';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { UNSAFE_DataRouterContext } from 'react-router-dom';
import { useOptionalTransitionGuard } from '../../hooks/useTransitionGuard';
import {
  ApiError,
  type PatientNote,
  type PatientNotePage,
  createPatientNote,
  getPatientNote,
  getPatientNotes,
  updatePatientNote,
} from '../../lib/api';
import { formatClinicalDateShort, formatClinicalTime } from '../../lib/clinicalDate';
import { Button } from '../ui/Button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { PatientNoteHistory } from './PatientNoteHistory';
import { PatientNoteNavigationGuard } from './PatientNoteNavigationGuard';

interface NoteDraft {
  id: string;
  body: string;
  baseline: string;
  expectedRevision?: number;
}
interface NoteAttempt {
  id: string;
  body: string;
  expectedRevision?: number;
}

export function PatientNotes({
  patientId,
  focusedNoteId,
}: { patientId: string; focusedNoteId?: string }): JSX.Element {
  const guard = useOptionalTransitionGuard();
  const dataRouter = useContext(UNSAFE_DataRouterContext);
  const [page, setPage] = useState<PatientNotePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState(false);
  const [focused, setFocused] = useState<PatientNote | null>(null);
  const [focusError, setFocusError] = useState<'missing' | 'error' | null>(null);
  const [draft, setDraft] = useState<NoteDraft | null>(null);
  const [attempt, setAttempt] = useState<NoteAttempt | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<PatientNote | null>(null);
  const [conflictPending, setConflictPending] = useState(false);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const sequence = useRef(0);
  const focusSequence = useRef(0);
  const savingRef = useRef(false);
  const routeCancel = useRef<(() => void) | null>(null);
  const onRouteBlocked = useCallback((proceed: () => void, cancel: () => void): void => {
    routeCancel.current = cancel;
    setPending(() => proceed);
  }, []);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const initiatingRef = useRef<HTMLElement | null>(null);
  const focusRef = useRef<HTMLElement | null>(null);
  const dirty =
    draft !== null && (draft.body !== draft.baseline || attempt !== null || conflictPending);
  const load = useCallback(
    async (cursor?: string): Promise<void> => {
      const request = ++sequence.current;
      setLoading(true);
      setReadError(false);
      try {
        const next = await getPatientNotes(patientId, cursor);
        if (request !== sequence.current) return;
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
        if (request === sequence.current) setReadError(true);
      } finally {
        if (request === sequence.current) setLoading(false);
      }
    },
    [patientId],
  );
  const loadFocused = useCallback(async (): Promise<void> => {
    const request = ++focusSequence.current;
    setFocused(null);
    setFocusError(null);
    if (!focusedNoteId) return;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(focusedNoteId)) {
      setFocusError('missing');
      return;
    }
    try {
      const note = await getPatientNote(patientId, focusedNoteId);
      if (request === focusSequence.current) setFocused(note);
    } catch (error) {
      if (request === focusSequence.current)
        setFocusError(error instanceof ApiError && error.status === 404 ? 'missing' : 'error');
    }
  }, [patientId, focusedNoteId]);
  useEffect(() => {
    setPage(null);
    void load();
    return () => {
      sequence.current++;
    };
  }, [load]);
  useEffect(() => {
    void loadFocused();
    return () => {
      focusSequence.current++;
    };
  }, [loadFocused]);
  useEffect(() => {
    if (focused) focusRef.current?.focus();
  }, [focused]);
  useEffect(() => {
    if (draft) editorRef.current?.focus();
  }, [draft?.id]);
  useEffect(() => {
    if (!dirty && !saving) return;
    const beforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    const remove = guard?.registerBlocker((continuation) => {
      setPending(() => continuation);
      return true;
    });
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      remove?.();
    };
  }, [dirty, saving, guard]);
  const transition = (continuation: () => void): void => {
    if (guard) guard.guardTransition(continuation);
    else if (dirty || saving) setPending(() => continuation);
    else continuation();
  };
  const reset = (): void => {
    setDraft(null);
    setAttempt(null);
    setSaveError(null);
    setConflict(null);
    setConflictPending(false);
    initiatingRef.current?.focus();
  };
  const start = (note?: PatientNote): void => {
    const trigger = document.activeElement as HTMLElement;
    transition(() => {
      initiatingRef.current = trigger;
      setAttempt(null);
      setSaveError(null);
      setConflict(null);
      setConflictPending(false);
      setDraft(
        note
          ? { id: note.id, body: note.body, baseline: note.body, expectedRevision: note.revision }
          : { id: crypto.randomUUID(), body: '', baseline: '' },
      );
    });
  };
  const save = async (): Promise<boolean> => {
    if (!draft || savingRef.current || conflictPending || !draft.body.trim()) return false;
    const frozen = attempt ?? {
      id: draft.id,
      body: draft.body.trim(),
      expectedRevision: draft.expectedRevision,
    };
    setAttempt(frozen);
    setSaveError(null);
    setSaving(true);
    savingRef.current = true;
    try {
      const saved =
        frozen.expectedRevision === undefined
          ? await createPatientNote(patientId, { id: frozen.id, body: frozen.body })
          : await updatePatientNote(patientId, frozen.id, {
              expected_revision: frozen.expectedRevision,
              body: frozen.body,
            });
      setPage((current) => ({
        items: [saved, ...(current?.items ?? []).filter((item) => item.id !== saved.id)],
        total: current?.total ?? 1,
        next_cursor: null,
      }));
      if (focused?.id === saved.id) setFocused(saved);
      setAnnouncement('Nota guardada');
      reset();
      void load();
      const continuation = pending;
      setPending(null);
      guard?.cancelTransition();
      if (continuation) window.requestAnimationFrame(continuation);
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setAttempt(null);
        setConflictPending(true);
        setSaveError(
          'La nota cambió. Conservamos tus cambios; carga la versión actual antes de continuar.',
        );
        try {
          setConflict(await getPatientNote(patientId, draft.id));
        } catch {
          setSaveError('No pudimos cargar la versión actual. Reintenta sin perder tus cambios.');
        }
      } else if (error instanceof ApiError && (error.status === 422 || error.status === 404)) {
        setAttempt(null);
        setSaveError(
          error.status === 404
            ? 'La nota ya no está disponible. Conservamos tu texto.'
            : 'Revisa la nota: debe contener entre 1 y 4000 caracteres.',
        );
      } else {
        setSaveError(
          'No confirmamos el guardado. Reintenta con el mismo contenido o descarta el intento y actualiza la lista.',
        );
      }
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const discard = (): void => {
    const continuation = pending;
    reset();
    setPending(null);
    guard?.cancelTransition();
    void load();
    if (continuation) window.requestAnimationFrame(continuation);
  };
  const notes = focused
    ? [focused, ...(page?.items ?? []).filter((note) => note.id !== focused.id)]
    : (page?.items ?? []);
  return (
    <section
      aria-label="Notas generales"
      className="mt-6 space-y-4 rounded border border-border p-5"
    >
      {dataRouter && (
        <PatientNoteNavigationGuard dirty={dirty || saving} onBlocked={onRouteBlocked} />
      )}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <FileText size={18} aria-hidden="true" />
          Notas generales
        </h2>
        <Button
          variant="clinicalSecondary"
          className="inline-flex items-center gap-2"
          onClick={() => start()}
          disabled={saving}
        >
          <Plus size={16} aria-hidden="true" />
          Nueva nota
        </Button>
      </header>
      <p className="text-sm text-muted">
        Notas manuales, separadas de las evoluciones y del contexto del asistente.
      </p>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {focusError && (
        <div role="alert">
          <p>
            {focusError === 'missing' ? 'No se encontró esta nota' : 'No pudimos cargar esta nota'}
          </p>
          <Button variant="clinicalSecondary" onClick={() => void loadFocused()}>
            Reintentar nota
          </Button>
        </div>
      )}
      {loading && !page && <p role="status">Cargando notas…</p>}
      {readError && (
        <div role="alert">
          <p>No pudimos cargar las notas. Los datos mostrados pueden estar desactualizados.</p>
          <Button variant="clinicalSecondary" onClick={() => void load()}>
            Reintentar notas
          </Button>
        </div>
      )}
      {!loading && !readError && notes.length === 0 && <p className="text-muted">Sin notas</p>}
      {draft && (
        <form
          className="space-y-3 border-y border-border py-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label className="block text-sm font-medium" htmlFor="patient-note-body">
            Nota general
          </label>
          <textarea
            id="patient-note-body"
            ref={editorRef}
            className="min-h-32 w-full rounded border border-border bg-surface p-3 text-foreground focus-visible:ring-2 focus-visible:ring-primary"
            value={draft.body}
            maxLength={4000}
            disabled={saving || attempt !== null}
            onChange={(event) => setDraft({ ...draft, body: event.target.value })}
          />
          {saveError && (
            <p role="alert" className="text-error">
              {saveError}
            </p>
          )}
          {conflictPending && (
            <div className="space-y-2">
              <p className="text-sm text-muted">
                {conflict ? `Versión actual: ${conflict.revision}` : 'Versión actual no disponible'}
              </p>
              {conflict && (
                <p className="whitespace-pre-wrap break-words text-sm">{conflict.body}</p>
              )}
              <Button
                type="button"
                variant="clinicalSecondary"
                disabled={saving}
                onClick={() => {
                  void getPatientNote(patientId, draft.id)
                    .then(setConflict)
                    .catch(() => setSaveError('No pudimos cargar la versión actual. Reintenta.'));
                }}
              >
                Cargar versión actual
              </Button>
              {conflict && (
                <>
                  <Button
                    type="button"
                    variant="clinicalSecondary"
                    onClick={() => {
                      setDraft({
                        ...draft,
                        expectedRevision: conflict.revision,
                        baseline: conflict.body,
                      });
                      setConflictPending(false);
                      setConflict(null);
                      setSaveError(null);
                    }}
                  >
                    Rebasar mis cambios
                  </Button>
                  <Button
                    type="button"
                    variant="clinicalSecondary"
                    onClick={() => {
                      setDraft({
                        ...draft,
                        body: conflict.body,
                        baseline: conflict.body,
                        expectedRevision: conflict.revision,
                      });
                      setConflictPending(false);
                      setConflict(null);
                      setSaveError(null);
                    }}
                  >
                    Usar versión actual
                  </Button>
                </>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="clinicalSecondary"
              disabled={saving}
              onClick={() => transition(reset)}
            >
              Cancelar nota
            </Button>
            <Button
              type="submit"
              variant="clinical"
              disabled={saving || conflictPending || !draft.body.trim()}
            >
              {saving ? 'Guardando…' : attempt ? 'Reintentar guardado' : 'Guardar nota'}
            </Button>
          </div>
        </form>
      )}
      <ol className="divide-y divide-border">
        {notes.map((note) => (
          <li key={note.id}>
            <article
              ref={
                note.id === focusedNoteId
                  ? (node) => {
                      focusRef.current = node;
                    }
                  : undefined
              }
              tabIndex={-1}
              className="space-y-3 py-4 focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={`Nota · revisión ${note.revision}`}
            >
              <p className="whitespace-pre-wrap break-words">{note.body}</p>
              <p className="text-xs text-muted">
                {formatClinicalDateShort(note.updated_at)} {formatClinicalTime(note.updated_at)} ·
                Revisión {note.revision}
                {note.updated_by.display_name ? ` · ${note.updated_by.display_name}` : ''}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="clinicalSecondary"
                  className="inline-flex items-center gap-2"
                  onClick={() => start(note)}
                  disabled={saving}
                >
                  <Pencil size={16} aria-hidden="true" />
                  Editar nota
                </Button>
                <Button
                  variant="clinicalSecondary"
                  className="inline-flex items-center gap-2"
                  onClick={() => setHistoryId(historyId === note.id ? null : note.id)}
                >
                  <History size={16} aria-hidden="true" />
                  Historial de nota
                </Button>
              </div>
              {historyId === note.id && (
                <PatientNoteHistory
                  key={`${note.id}:${note.revision}`}
                  patientId={patientId}
                  noteId={note.id}
                />
              )}
            </article>
          </li>
        ))}
      </ol>
      {page?.next_cursor && (
        <Button
          variant="clinicalSecondary"
          disabled={loading}
          onClick={() => void load(page.next_cursor ?? undefined)}
        >
          Ver más notas
        </Button>
      )}
      {pending && (
        <AlertDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              routeCancel.current?.();
              routeCancel.current = null;
              setPending(null);
              guard?.cancelTransition();
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Nota sin guardar</AlertDialogTitle>
              <AlertDialogDescription>
                Guarda tu nota, descarta los cambios o sigue editando.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {saveError && (
              <p role="alert" className="text-error">
                {saveError}
              </p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel
                disabled={saving}
                onClick={() => {
                  routeCancel.current?.();
                  routeCancel.current = null;
                  setPending(null);
                  guard?.cancelTransition();
                }}
              >
                Seguir editando
              </AlertDialogCancel>
              <Button variant="clinicalSecondary" disabled={saving} onClick={discard}>
                Descartar nota
              </Button>
              <Button
                variant="clinical"
                disabled={saving || conflictPending || !draft?.body.trim()}
                onClick={() => void save()}
              >
                {saving ? 'Guardando…' : 'Guardar y continuar'}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </section>
  );
}
