import { type RefObject, useState } from 'react';
import type { ClinicalPlanStage } from '../../lib/api';
import { Button } from '../ui/Button';

interface ClinicalPlanStageEditorProps {
  formRef?: RefObject<HTMLFormElement>;
  stage?: ClinicalPlanStage;
  busy: boolean;
  onSave: (value: { label: string; note: string | null }) => Promise<boolean>;
  onCancel: () => void;
  onDirty: (dirty: boolean) => void;
}
export function ClinicalPlanStageEditor({
  formRef,
  stage,
  busy,
  onSave,
  onCancel,
  onDirty,
}: ClinicalPlanStageEditorProps): JSX.Element {
  const [label, setLabel] = useState(stage?.label ?? '');
  const [note, setNote] = useState(stage?.note ?? '');
  return (
    <form
      ref={formRef}
      className="space-y-3 border-l border-border pl-3"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave({ label: label.trim(), note: note.trim() || null }).then((saved) => {
          if (saved) {
            onDirty(false);
            onCancel();
          }
        });
      }}
    >
      <label className="block text-sm">
        Nombre de sesión
        <input
          disabled={busy}
          required
          maxLength={200}
          value={label}
          onChange={(event) => {
            setLabel(event.target.value);
            onDirty(true);
          }}
          className="mt-1 block w-full rounded border border-border bg-surface p-2 text-foreground"
        />
      </label>
      <label className="block text-sm">
        Nota de sesión
        <textarea
          disabled={busy}
          maxLength={1000}
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
            onDirty(true);
          }}
          className="mt-1 block w-full rounded border border-border bg-surface p-2 text-foreground"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button variant="clinical" type="submit" disabled={busy || !label.trim()}>
          Guardar sesión
        </Button>
        <Button
          variant="clinicalSecondary"
          onClick={() => {
            onDirty(false);
            onCancel();
          }}
          disabled={busy}
        >
          Cancelar sesión
        </Button>
      </div>
    </form>
  );
}
