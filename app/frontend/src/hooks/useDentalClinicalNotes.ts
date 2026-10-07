import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  type CreateDentalNote,
  type DentalClinicalNote,
  type DentalNoteContext,
  type DentalNoteTemplate,
  type Dentition,
  type PlanCommand,
  createDentalClinicalNote,
  deleteDentalClinicalNote,
  editDentalClinicalNote,
  getDentalClinicalNotes,
  getDentalNoteTemplates,
} from '../lib/api';

type Attempt =
  | { kind: 'create'; body: CreateDentalNote }
  | { kind: 'edit'; id: string; body: PlanCommand & { body: string } }
  | { kind: 'delete'; id: string; body: PlanCommand };

export function useDentalClinicalNotes(patientId: string, context: DentalNoteContext) {
  const [body, setBody] = useState('');
  const [candidate, setCandidate] = useState<{ tooth: number; dentition: Dentition } | null>(null);
  const [bound, setBound] = useState(true);
  const [editing, setEditing] = useState<DentalClinicalNote | null>(null);
  const [deleting, setDeleting] = useState<DentalClinicalNote | null>(null);
  const [open, setOpen] = useState(true);
  const [items, setItems] = useState<DentalClinicalNote[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [readError, setReadError] = useState(false);
  const [category, setCategory] = useState(
    context.note_type === 'diagnosis' ? 'diagnosis' : 'general',
  );
  const [templates, setTemplates] = useState<DentalNoteTemplate[]>([]);
  const [templateError, setTemplateError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [commits, setCommits] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [latest, setLatest] = useState<DentalClinicalNote | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const lock = useRef(false);
  useEffect(() => {
    setCategory(context.note_type === 'diagnosis' ? 'diagnosis' : 'general');
  }, [context.note_type, context.entity_id]);
  const sequence = useRef(0);
  const load = useCallback(
    async (next?: string): Promise<void> => {
      const current = ++sequence.current;
      setLoading(true);
      try {
        const page = await getDentalClinicalNotes(patientId, next);
        if (current !== sequence.current) return;
        setItems((previous) =>
          next
            ? [
                ...previous,
                ...page.items.filter(
                  (n) => !previous.some((p) => p.id === n.id && p.note_type === n.note_type),
                ),
              ]
            : page.items,
        );
        setCursor(page.next_cursor);
        setTotal(page.total);
        setReadError(false);
      } catch {
        if (current === sequence.current) setReadError(true);
      } finally {
        if (current === sequence.current) setLoading(false);
      }
    },
    [patientId],
  );
  useEffect(() => {
    void load();
    return () => {
      sequence.current++;
    };
  }, [load]);
  useEffect(() => {
    let alive = true;
    setTemplateError(false);
    setTemplates([]);
    void getDentalNoteTemplates(category)
      .then((page) => {
        if (alive) setTemplates(page.items);
      })
      .catch(() => {
        if (alive) {
          setTemplates([]);
          setTemplateError(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [category]);
  const cancel = (): void => {
    setBody('');
    setEditing(null);
    setDeleting(null);
    setAttempt(null);
    setLatest(null);
    setError(null);
    setOpen(false);
  };
  const run = async (command: Attempt): Promise<boolean> => {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError(null);
    setAttempt(command);
    try {
      if (command.kind === 'create') await createDentalClinicalNote(patientId, command.body);
      else if (command.kind === 'edit')
        await editDentalClinicalNote(patientId, command.id, command.body);
      else await deleteDentalClinicalNote(patientId, command.id, command.body);
      if (command.kind !== 'delete') {
        setBody('');
        setEditing(null);
        setOpen(false);
      }
      if (command.kind === 'delete') setDeleting(null);
      setAttempt(null);
      setLatest(null);
      await load();
      setCommits((value) => value + 1);
      return true;
    } catch (e) {
      const detail =
        e instanceof ApiError
          ? (e.body as { detail?: { latest?: DentalClinicalNote } })?.detail
          : undefined;
      if (e instanceof ApiError && e.status === 409 && detail?.latest) {
        setLatest(detail.latest);
        setError('La nota cambió. Compara la versión guardada antes de volver a guardar.');
      } else if (e instanceof ApiError && e.status === 422) {
        setAttempt(null);
        setError('Revisa el texto y la asociación. La nota admite hasta 4000 caracteres.');
      } else setError('No pudimos confirmar el guardado. Reintenta la misma operación.');
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const save = (): Promise<boolean> => {
    if (attempt) return run(attempt);
    if (!body.trim() || latest) return Promise.resolve(false);
    if (editing)
      return run({
        kind: 'edit',
        id: editing.id,
        body: {
          operation_id: crypto.randomUUID(),
          expected_revision: editing.revision,
          body: body.trim(),
        },
      });
    return run({
      kind: 'create',
      body: {
        ...context,
        id: crypto.randomUUID(),
        operation_id: crypto.randomUUID(),
        expected_revision: 0,
        body: body.trim(),
        ...(context.note_type === 'diagnosis' && candidate && bound
          ? { tooth_fdi: candidate.tooth, dentition: candidate.dentition }
          : {}),
      },
    });
  };
  return {
    context,
    body,
    setBody,
    candidate,
    bound,
    setBound,
    editing,
    deleting,
    requestDelete: (note: DentalClinicalNote): void => setDeleting(note),
    cancelDelete: (): void => {
      if (busy) return;
      setDeleting(null);
      if (attempt?.kind === 'delete') {
        setAttempt(null);
        setLatest(null);
        setError(null);
        void load();
      }
    },
    open,
    setOpen,
    items,
    cursor,
    total,
    loading,
    readError,
    load,
    templates,
    templateError,
    category,
    setCategory,
    busy,
    commits,
    error,
    latest,
    attempt,
    dirty: busy || !!attempt || (editing ? body !== editing.body : !!body.trim()),
    candidateFromChart: (tooth: number, dentition: Dentition): void => {
      if (!tooth || editing || attempt) return;
      if (candidate?.tooth !== tooth || candidate.dentition !== dentition) {
        setCandidate({ tooth, dentition });
        setBound(true);
      }
    },
    clearCandidate: (): void => setCandidate(null),
    appendTemplate: (template: DentalNoteTemplate): void =>
      setBody((value) => `${value.trimEnd()}${value.trim() ? '\n\n' : ''}${template.body}`),
    edit: (note: DentalClinicalNote): void => {
      if (!busy && !body.trim() && !attempt) {
        setEditing(note);
        setBody(note.body);
        setOpen(true);
      }
    },
    cancel,
    save,
    remove: (note: DentalClinicalNote): Promise<boolean> =>
      run({
        kind: 'delete',
        id: note.id,
        body: { operation_id: crypto.randomUUID(), expected_revision: note.revision },
      }),
    retry: (): Promise<boolean> => (attempt ? run(attempt) : Promise.resolve(false)),
    reconcile: (): void => {
      if (latest && !latest.deleted_at) {
        if (attempt?.kind === 'delete') setDeleting(latest);
        else setEditing(latest);
        setLatest(null);
        setAttempt(null);
        setError(null);
      }
    },
  };
}
