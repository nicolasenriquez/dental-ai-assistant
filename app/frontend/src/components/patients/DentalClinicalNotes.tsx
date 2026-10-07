import { NotebookPen } from 'lucide-react';
import type { useDentalClinicalNotes } from '../../hooks/useDentalClinicalNotes';
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
import { DentalNoteCard } from './DentalNoteCard';
import { DentalNoteComposer } from './DentalNoteComposer';

interface DentalClinicalNotesProps {
  notes: ReturnType<typeof useDentalClinicalNotes>;
  onHighlight?: (teeth: number[]) => void;
  hideSaveIndicator?: boolean;
}

export function DentalClinicalNotes({
  notes,
  onHighlight = () => {},
  hideSaveIndicator = false,
}: DentalClinicalNotesProps): JSX.Element {
  const deleting = notes.deleting;
  return (
    <aside aria-label="Notas clínicas" className="space-y-4">
      <h3 className="flex items-center gap-2 font-semibold">
        <NotebookPen size={18} aria-hidden="true" />
        Notas
      </h3>
      <DentalNoteComposer notes={notes} hideSaveIndicator={hideSaveIndicator} />
      {notes.loading && <p role="status">Cargando notas…</p>}
      {notes.readError && (
        <div role="alert">
          <p>No pudimos completar la lectura de notas.</p>
          <Button variant="clinicalSecondary" onClick={() => void notes.load()}>
            Reintentar lectura
          </Button>
        </div>
      )}
      {!notes.loading && !notes.readError && !notes.items.length && (
        <p className="text-sm text-muted">Sin notas</p>
      )}
      <div className="max-h-[600px] space-y-2 overflow-y-auto pb-4">
        {notes.items.map((note) => (
          <DentalNoteCard
            key={`${note.note_type}:${note.id}`}
            note={note}
            onHighlight={onHighlight}
            disabled={notes.busy || notes.dirty}
            onEdit={() => notes.edit(note)}
            onDelete={() => notes.requestDelete(note)}
          />
        ))}
        {notes.cursor && (
          <Button
            variant="clinicalSecondary"
            disabled={notes.loading}
            onClick={() => void notes.load(notes.cursor ?? undefined)}
          >
            Cargar más
          </Button>
        )}
      </div>
      {deleting && (
        <AlertDialog
          open
          onOpenChange={(open) => {
            if (!open && !notes.busy) notes.cancelDelete();
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar nota</AlertDialogTitle>
              <AlertDialogDescription>
                Se quitará del feed de esta ficha. Sus revisiones se conservarán.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {notes.error && <p role="alert">{notes.error}</p>}
            {notes.latest && (
              <div className="space-y-2">
                <p className="whitespace-pre-wrap break-words">
                  Versión guardada: {notes.latest.body}
                </p>
                {notes.latest.deleted_at ? (
                  <p>Esta nota ya fue eliminada. Cancela para actualizar el feed.</p>
                ) : (
                  <Button variant="clinicalSecondary" onClick={notes.reconcile}>
                    Revisar eliminación de versión actual
                  </Button>
                )}
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={notes.busy}>Cancelar</AlertDialogCancel>
              <Button
                variant="clinical"
                disabled={notes.busy || !!notes.latest}
                onClick={async () => {
                  await (notes.attempt ? notes.retry() : notes.remove(deleting));
                }}
              >
                {notes.attempt ? 'Reintentar eliminación' : 'Confirmar eliminación'}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </aside>
  );
}
