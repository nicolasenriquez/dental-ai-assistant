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
    <div className="space-y-3">
      <p className="text-sm text-muted">
        {notes.context.note_type === 'treatment'
          ? 'Nota del tratamiento seleccionado'
          : notes.context.note_type === 'treatment_plan'
            ? 'Nota del plan seleccionado'
            : 'Nota de diagnóstico'}
      </p>
      <label className="block text-sm">
        {notes.editing ? 'Editar nota' : 'Nueva nota clínica'}
        <textarea
          aria-label="Texto de nota clínica"
          value={notes.body}
          maxLength={4000}
          disabled={frozen}
          onChange={(event) => notes.setBody(event.target.value)}
          className="mt-2 min-h-[140px] w-full rounded border border-border bg-surface px-3 py-2 text-foreground"
        />
      </label>
      {!notes.editing && (
        <>
          <label className="block text-sm">
            Categoría de plantillas
            <select
              value={notes.category}
              disabled={frozen}
              onChange={(event) => notes.setCategory(event.target.value)}
              className="w-full rounded border border-border bg-surface p-2"
            >
              {[
                ['diagnosis', 'Diagnóstico'],
                ['general', 'General'],
                ['endodontics', 'Endodoncia'],
                ['periodontics', 'Periodoncia'],
                ['implantology', 'Implantología'],
              ].map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Plantillas
            <select
              aria-label="Plantillas"
              value=""
              disabled={frozen}
              onChange={(event) => {
                const template = notes.templates.find((t) => t.id === event.target.value);
                if (template) notes.appendTemplate(template);
              }}
              className="w-full rounded border border-border bg-surface p-2"
            >
              <option value="">Seleccionar plantilla</option>
              {notes.templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.label}
                </option>
              ))}
            </select>
          </label>
          {notes.templateError && (
            <p role="alert">Plantillas no disponibles. Puedes escribir la nota.</p>
          )}
          {tooth && (
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
        </>
      )}
      {notes.editing && (
        <p className="text-sm text-muted">
          Vínculo guardado:{' '}
          {tooth ? `Diente ${tooth}` : (notes.editing.entity_label ?? 'Sin pieza')}. Solo se
          modifica el texto.
        </p>
      )}
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
      <div className="flex flex-wrap gap-2">
        <Button
          variant="clinical"
          className="inline-flex min-w-[150px] items-center justify-center gap-2"
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
        <Button variant="clinicalSecondary" disabled={notes.busy} onClick={notes.cancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
