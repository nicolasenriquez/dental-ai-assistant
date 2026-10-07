import { useState } from 'react';
import type { ClinicalPlanItem, ClinicalPlanStage } from '../../lib/api';
import { ConfirmDialog } from '../ConfirmDialog';
import { Button } from '../ui/Button';
import { PatientActorLabel } from './PatientActorLabel';

interface ClinicalPlanExecutionProps {
  item: ClinicalPlanItem;
  planTitle: string;
  active: boolean;
  editable: boolean;
  blocked: boolean;
  busy: boolean;
  uncertain: boolean;
  onDirty: (dirty: boolean) => void;
  onEdit: (stage: ClinicalPlanStage) => void;
  onExecute: (
    itemId: string,
    stageId: string | null,
    action: 'complete' | 'cancel',
    text: string | null,
  ) => Promise<boolean>;
}

export function ClinicalPlanExecution({
  item,
  planTitle,
  active,
  editable,
  blocked,
  busy,
  uncertain,
  onDirty,
  onEdit,
  onExecute,
}: ClinicalPlanExecutionProps): JSX.Element {
  const [selected, setSelected] = useState<{
    stageId: string | null;
    action: 'complete' | 'cancel';
  } | null>(null);
  const [text, setText] = useState('');
  const [confirming, setConfirming] = useState(false);
  const completed = item.stages.filter((s) => s.status === 'completed').length;
  const executable = active && item.status === 'pending' && item.treatment.state === 'planned';
  const pending = item.stages.filter((s) => s.status === 'pending');
  const selectedStage = item.stages.find((s) => s.id === selected?.stageId) ?? pending[0];
  const select = (stageId: string | null, action: 'complete' | 'cancel'): void => {
    setSelected({ stageId, action });
    setText('');
    onDirty(true);
  };
  const allowed = executable && selectedStage?.status === 'pending';
  return (
    <section aria-label={`Sesiones de ${item.treatment.label_es}`} className="my-3 space-y-3">
      <p role="status">
        {completed}/{item.stages.length} sesiones completadas
      </p>
      <ul className="space-y-3">
        {item.stages.map((stage) => (
          <li key={stage.id} className="space-y-2">
            <p>
              {stage.sequence}. {stage.label} ·{' '}
              {stage.status === 'pending'
                ? 'Pendiente'
                : stage.status === 'completed'
                  ? 'Completada'
                  : 'Cancelada'}
            </p>
            {stage.note && <p className="whitespace-pre-wrap text-sm text-muted">{stage.note}</p>}
            {(stage.completed_at || stage.cancelled_at) && (
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                {new Date(stage.completed_at ?? stage.cancelled_at ?? '').toLocaleString('es-CL')} ·
                <PatientActorLabel
                  actor={
                    stage.completed_by || stage.cancelled_by
                      ? {
                          user_id: stage.completed_by ?? stage.cancelled_by ?? '',
                          display_name: null,
                        }
                      : null
                  }
                />
                {stage.cancellation_reason && <span>{stage.cancellation_reason}</span>}
              </div>
            )}
            {stage.clinical_note && !stage.clinical_note.deleted_at && (
              <div className="border-l border-border pl-3 text-sm">
                <p className="text-muted">Nota clínica del procedimiento</p>
                <p className="whitespace-pre-wrap break-words">{stage.clinical_note.body}</p>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {editable && stage.status === 'pending' && (
                <Button
                  variant="clinicalSecondary"
                  disabled={blocked || busy || !!selected}
                  onClick={() => onEdit(stage)}
                >
                  Editar sesión {stage.sequence}
                </Button>
              )}
              {executable && stage.status === 'pending' && (
                <>
                  <Button
                    variant="clinicalSecondary"
                    disabled={blocked || busy || !!selected}
                    onClick={() => select(stage.id, 'complete')}
                  >
                    Completar sesión {stage.sequence}
                  </Button>
                  <Button
                    variant="clinicalSecondary"
                    disabled={blocked || busy || !!selected}
                    onClick={() => select(stage.id, 'cancel')}
                  >
                    Cancelar sesión {stage.sequence}
                  </Button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
      {executable && pending.length > 0 && (
        <Button
          variant="clinical"
          disabled={blocked || busy || !!selected}
          onClick={() => select(null, 'complete')}
        >
          {item.stages.length > 1 ? 'Completar siguiente sesión' : 'Completar procedimiento'}
        </Button>
      )}
      {selected && !confirming && (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            setConfirming(true);
          }}
        >
          <p className="text-sm">{selectedStage?.label}. Esta acción afecta una sola sesión.</p>
          {!allowed && (
            <p className="text-warning">
              La sesión ya no está disponible para ejecutar. Conservamos tu texto para revisión.
            </p>
          )}
          <label className="block text-sm">
            {selected.action === 'complete'
              ? 'Nota clínica del procedimiento (opcional)'
              : 'Motivo de cancelación (opcional)'}
            <textarea
              maxLength={selected.action === 'complete' ? 4000 : 1000}
              value={text}
              disabled={busy || uncertain}
              onChange={(event) => setText(event.target.value)}
              className="mt-1 block w-full rounded border border-border bg-surface p-2"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button variant="clinical" type="submit" disabled={busy || uncertain || !allowed}>
              Revisar ejecución
            </Button>
            <Button
              variant="clinicalSecondary"
              disabled={busy || uncertain}
              onClick={() => {
                setSelected(null);
                setText('');
                onDirty(false);
              }}
            >
              Cancelar acción
            </Button>
          </div>
        </form>
      )}
      {selected && confirming && (
        <ConfirmDialog
          title={selected.action === 'complete' ? 'Completar sesión' : 'Cancelar sesión'}
          description={`${planTitle}. ${item.treatment.label_es}: ${selectedStage?.label}. ${selected.action === 'complete' ? 'Registrarás esta sesión como realizada; las demás sesiones no cambian.' : 'Esta sesión quedará cancelada; no se registrará trabajo realizado.'}${text.trim() ? ` Texto: ${text.trim()}` : ''}`}
          confirmLabel={selected.action === 'complete' ? 'Completar sesión' : 'Cancelar sesión'}
          cancelLabel="Volver"
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            void onExecute(item.id, selected.stageId, selected.action, text.trim() || null).then(
              (saved) => {
                setConfirming(false);
                if (saved) {
                  setSelected(null);
                  setText('');
                  onDirty(false);
                }
              },
            );
          }}
        />
      )}
    </section>
  );
}
