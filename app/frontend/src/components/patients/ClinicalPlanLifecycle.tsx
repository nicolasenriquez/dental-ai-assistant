import { useState } from 'react';
import { planActionLabels } from '../../hooks/usePatientClinicalPlan';
import type { ClinicalPlan, PlanAction, PlanClosureReason } from '../../lib/api';
import { ConfirmDialog } from '../ConfirmDialog';
import { Button } from '../ui/Button';
import { PatientActorLabel } from './PatientActorLabel';

export const closureLabels: Record<PlanClosureReason, string> = {
  rejected_by_patient: 'Rechazado por el paciente',
  expired: 'Vencido',
  cancelled_by_clinic: 'Cancelado por la clínica',
  patient_abandoned: 'Abandono del paciente',
  other: 'Otro motivo',
};
const descriptions: Record<PlanAction, string> = {
  confirm: 'El plan pasará a pendiente de aceptación. Los procedimientos siguen planificados.',
  accept:
    'Registrarás una aceptación clínica manual. No representa una firma de consentimiento ni una aprobación financiera.',
  reopen: 'El plan volverá a borrador para revisión. Se conservará su historial.',
  close:
    'El plan quedará cerrado y no permitirá cambios. Las sesiones y su historial se conservarán.',
  reactivate:
    'El plan volverá a borrador. Se conservarán las sesiones y el cierre anterior en el historial.',
  archive: 'El plan completado quedará archivado y de solo lectura. Se conservará su historial.',
};
interface ClinicalPlanLifecycleProps {
  plan: ClinicalPlan;
  actions: PlanAction[];
  blocked: boolean;
  busy: boolean;
  onDirty: (dirty: boolean) => void;
  onTransition: (
    action: PlanAction,
    note: string | null,
    reason: PlanClosureReason,
  ) => Promise<boolean>;
}
export function ClinicalPlanLifecycle({
  plan,
  actions,
  blocked,
  busy,
  onDirty,
  onTransition,
}: ClinicalPlanLifecycleProps): JSX.Element {
  const [selected, setSelected] = useState<PlanAction | null>(null);
  const [reason, setReason] = useState<PlanClosureReason>('other');
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  return (
    <section aria-label="Ciclo clínico del plan" className="space-y-3 border-y border-border py-4">
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button
            key={action}
            variant={action === 'confirm' || action === 'accept' ? 'clinical' : 'clinicalSecondary'}
            disabled={blocked || busy || selected !== null}
            onClick={() => {
              setSelected(action);
              setNote('');
              setReason('other');
              setConfirming(action !== 'accept' && action !== 'close');
              if (action === 'accept' || action === 'close') onDirty(true);
            }}
          >
            {planActionLabels[action]}
          </Button>
        ))}
      </div>
      {selected && (selected === 'accept' || selected === 'close') && !confirming && (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            setConfirming(true);
          }}
        >
          {selected === 'close' && (
            <label className="block text-sm">
              Motivo del cierre
              <select
                required
                disabled={busy}
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value as PlanClosureReason);
                  onDirty(true);
                }}
                className="mt-1 block w-full rounded border border-border bg-surface p-2"
              >
                {Object.entries(closureLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-sm">
            {selected === 'accept' ? 'Nota de aceptación (opcional)' : 'Nota del cierre (opcional)'}
            <textarea
              maxLength={2000}
              value={note}
              disabled={busy}
              onChange={(event) => {
                setNote(event.target.value);
                onDirty(true);
              }}
              className="mt-1 block w-full rounded border border-border bg-surface p-2"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button variant="clinical" type="submit" disabled={busy || blocked}>
              Revisar acción
            </Button>
            <Button
              variant="clinicalSecondary"
              disabled={busy}
              onClick={() => {
                setSelected(null);
                setNote('');
                onDirty(false);
              }}
            >
              Cancelar acción
            </Button>
          </div>
        </form>
      )}
      {confirming && selected && (
        <ConfirmDialog
          title={planActionLabels[selected]}
          description={`${plan.title || 'Plan sin título'}. ${descriptions[selected]}${selected === 'close' ? ` Motivo: ${closureLabels[reason]}.` : ''}${note.trim() ? ` Nota: ${note.trim()}` : ''}`}
          confirmLabel={planActionLabels[selected]}
          cancelLabel="Volver"
          busy={busy}
          onCancel={() => {
            setConfirming(false);
            if (selected !== 'accept' && selected !== 'close') setSelected(null);
          }}
          onConfirm={() => {
            void onTransition(selected, note.trim() || null, reason).then((saved) => {
              setConfirming(false);
              if (saved) {
                setSelected(null);
                setNote('');
                onDirty(false);
              } else if (selected !== 'accept' && selected !== 'close') {
                setSelected(null);
              }
            });
          }}
        />
      )}
      {plan.confirmed_at && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          Confirmado {new Date(plan.confirmed_at).toLocaleString('es-CL')} ·
          <PatientActorLabel
            actor={plan.confirmed_by ? { user_id: plan.confirmed_by, display_name: null } : null}
          />
        </div>
      )}
      {plan.accepted_at && (
        <div className="flex flex-wrap items-center gap-2 whitespace-pre-wrap text-sm text-muted">
          Aceptación registrada {new Date(plan.accepted_at).toLocaleString('es-CL')} ·
          <PatientActorLabel
            actor={plan.accepted_by ? { user_id: plan.accepted_by, display_name: null } : null}
          />
          {plan.acceptance_note && ` · ${plan.acceptance_note}`}
        </div>
      )}
      {plan.closed_at && (
        <div className="flex flex-wrap items-center gap-2 whitespace-pre-wrap text-sm text-muted">
          Cerrado {new Date(plan.closed_at).toLocaleString('es-CL')} ·
          <PatientActorLabel
            actor={plan.closed_by ? { user_id: plan.closed_by, display_name: null } : null}
          />
          · {closureLabels[plan.closure_reason as PlanClosureReason] ?? plan.closure_reason}
          {plan.closure_note && ` · ${plan.closure_note}`}
        </div>
      )}
    </section>
  );
}
