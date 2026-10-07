import { useState } from 'react';
import type { ClinicalPlanItem } from '../../lib/api';
import { ConfirmDialog } from '../ConfirmDialog';
import { Button } from '../ui/Button';

interface ClinicalPlanCorrectionProps {
  item: ClinicalPlanItem;
  planTitle: string;
  blocked: boolean;
  busy: boolean;
  uncertain: boolean;
  onDirty: (dirty: boolean) => void;
  onCorrect: (itemId: string, reason: string) => Promise<boolean>;
}

export function ClinicalPlanCorrection({
  item,
  planTitle,
  blocked,
  busy,
  uncertain,
  onDirty,
  onCorrect,
}: ClinicalPlanCorrectionProps): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="space-y-3">
      {item.treatment.state === 'entered_in_error' ? (
        <p className="text-sm text-warning">
          Registro marcado como erróneo. Las sesiones realizadas se conservan en el historial.
          {item.treatment.replacement_id && ` Reemplazo: ${item.treatment.replacement_id}`}
        </p>
      ) : !editing ? (
        <Button
          variant="clinicalSecondary"
          disabled={blocked || busy}
          onClick={() => {
            setEditing(true);
            onDirty(true);
          }}
        >
          Corregir registro del procedimiento
        </Button>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (reason.trim()) setConfirming(true);
          }}
        >
          <label className="block text-sm">
            Motivo de corrección
            <textarea
              required
              maxLength={1000}
              value={reason}
              disabled={busy || uncertain}
              onChange={(event) => setReason(event.target.value)}
              className="mt-1 block w-full rounded border border-border bg-surface p-2"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button variant="clinical" type="submit" disabled={busy || uncertain || !reason.trim()}>
              Revisar corrección
            </Button>
            <Button
              variant="clinicalSecondary"
              disabled={busy || uncertain}
              onClick={() => {
                setEditing(false);
                setReason('');
                onDirty(false);
              }}
            >
              Cancelar corrección
            </Button>
          </div>
        </form>
      )}
      {confirming && (
        <ConfirmDialog
          title="Corregir registro del procedimiento"
          description={`${planTitle}. ${item.treatment.label_es}. Se marcará el registro como erróneo. El estado del plan y la evidencia de sus sesiones no cambiarán. Motivo: ${reason.trim()}`}
          confirmLabel="Marcar como erróneo"
          cancelLabel="Volver"
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            void onCorrect(item.id, reason.trim()).then((saved) => {
              setConfirming(false);
              if (saved) {
                setEditing(false);
                setReason('');
                onDirty(false);
              }
            });
          }}
        />
      )}
    </div>
  );
}
