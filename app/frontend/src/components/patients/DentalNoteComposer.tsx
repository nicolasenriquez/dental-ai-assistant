import type { useDentalClinicalNotes } from '../../hooks/useDentalClinicalNotes';
import { Spinner } from '../Spinner';
import { Button } from '../ui/Button';

interface DentalNoteComposerProps {
  notes: ReturnType<typeof useDentalClinicalNotes>;
  hideSaveIndicator?: boolean;
}

export function DentalNoteComposer({
  notes,
  hideSaveIndicator = false,
}: DentalNoteComposerProps): JSX.Element {
  if (!notes.open)
    return (
      <Button variant="clinicalSecondary" onClick={() => notes.setOpen(true)}>
        Añadir nota
      </Button>
    );
  const frozen = notes.busy || !!notes.attempt;
  const tooth = notes.editing
    ? notes.editing.tooth_fdi
    : notes.context.note_type === 'diagnosis'
      ? notes.candidate?.tooth
      : null;
  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface p-3">
      <label className="block text-sm">
        <span className="sr-only">{notes.editing ? 'Editar nota' : 'Nueva nota clínica'}</span>
        <textarea
          aria-label="Texto de nota clínica"
          value={notes.body}
          placeholder="Escribe una nota clínica…"
          maxLength={4000}
          disabled={frozen}
          onChange={(event) => notes.setBody(event.target.value)}
          className="min-h-[140px] w-full rounded border border-border bg-surface px-3 py-2 text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        {!notes.editing && tooth && (
          <label className="flex min-h-[44px] items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={notes.bound}
              disabled={frozen}
              onChange={(event) => notes.setBound(event.target.checked)}
            />
            Asociar al diente {tooth}
          </label>
        )}
        {notes.editing && (
          <p className="text-sm text-muted">
            Vínculo guardado:{' '}
            {tooth ? `Diente ${tooth}` : (notes.editing.entity_label ?? 'Sin pieza')}. Solo se
            modifica el texto.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="clinicalSecondary" disabled={notes.busy} onClick={notes.cancel}>
            Cancelar
          </Button>
          <Button
            variant="clinical"
            disabled={
              notes.busy ||
              !notes.body.trim() ||
              notes.body.trim().length > 4000 ||
              !!notes.latest ||
              notes.attempt?.kind === 'delete'
            }
            aria-busy={notes.busy && !hideSaveIndicator}
            onClick={() => void notes.save()}
          >
            {notes.busy && !hideSaveIndicator && <Spinner />}
            {notes.busy && !hideSaveIndicator
              ? 'Guardando…'
              : notes.attempt && notes.attempt.kind !== 'delete'
                ? 'Reintentar misma operación'
                : 'Guardar'}
          </Button>
        </div>
      </div>
      {notes.error && notes.attempt?.kind !== 'delete' && (
        <p role="alert" className="text-error">
          {notes.error}
        </p>
      )}
      {notes.latest && notes.attempt?.kind !== 'delete' && (
        <div className="space-y-2">
          <p className="whitespace-pre-wrap break-words">Versión guardada: {notes.latest.body}</p>
          <Button
            variant="clinicalSecondary"
            disabled={!!notes.latest.deleted_at}
            onClick={notes.reconcile}
          >
            Conservar texto local sobre versión actual
          </Button>
        </div>
      )}
    </div>
  );
}
