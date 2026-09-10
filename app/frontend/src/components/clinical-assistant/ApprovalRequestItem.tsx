import { Check, ChevronRight, Clock, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { ClinicalApprovalItem as ApprovalItemData } from '../../hooks/useClinicalAssistant';
import { formatClinicalDateTime } from '../../lib/clinicalDate';
import { Spinner } from '../Spinner';

interface ApprovalRequestItemProps {
  item: ApprovalItemData;
  onResolve: (decision: 'approve' | 'decline') => void;
  autoOpen?: boolean;
}

export function ApprovalRequestItem({
  item,
  onResolve,
  autoOpen = false,
}: ApprovalRequestItemProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const payload = item.action.proposal_payload;
  const evolutionAt = typeof payload?.evolution_at === 'string' ? payload.evolution_at : null;
  const committing = item.status === 'running';
  const saved = item.status === 'completed';
  const pending = item.status === 'pending' || committing;

  useEffect(() => {
    if (!pending && dialogRef.current?.open) dialogRef.current.close();
  }, [pending]);
  useEffect(() => {
    if (autoOpen && item.status === 'pending' && !dialogRef.current?.open)
      dialogRef.current?.showModal();
  }, [autoOpen, item.status]);

  if (saved) {
    return (
      <Link
        className="clinical-receipt"
        to={`/patients/${item.action.patient_id}/evolutions/${item.action.result_resource_id}`}
      >
        <Check aria-hidden="true" size={15} />
        <span>
          <strong>Evolución guardada</strong>
          {evolutionAt && (
            <time dateTime={evolutionAt}>
              {item.patient.first_name} {item.patient.last_name} ·{' '}
              {formatClinicalDateTime(evolutionAt)}
            </time>
          )}
        </span>
        <span>
          Ver en ficha <ChevronRight aria-hidden="true" size={15} />
        </span>
      </Link>
    );
  }

  if (!pending) {
    return (
      <p className="clinical-activity" role="status">
        <X aria-hidden="true" size={14} />
        {item.status === 'declined' ? 'Guardado descartado.' : 'Confirmación no disponible.'}
      </p>
    );
  }

  return (
    <>
      {!autoOpen && (
        <div className="clinical-approval-prompt">
          <span>
            <Clock aria-hidden="true" size={15} /> Guardado pendiente
          </span>
          <button
            type="button"
            className="clinical-primary-button"
            onClick={() => dialogRef.current?.showModal()}
          >
            Continuar
          </button>
        </div>
      )}
      <dialog
        ref={dialogRef}
        className="clinical-approval-dialog"
        aria-labelledby={`approval-${item.id}`}
        onCancel={(event) => committing && event.preventDefault()}
      >
        <div className="clinical-approval-dialog__body">
          <h2 id={`approval-${item.id}`}>Confirmar guardado</h2>
          <p>
            <strong>
              {item.patient.first_name} {item.patient.last_name}
            </strong>
            {' · '}
            {item.patient.rut_masked}
          </p>
          {evolutionAt && <time dateTime={evolutionAt}>{formatClinicalDateTime(evolutionAt)}</time>}
          <p>Se incorporará esta evolución a la ficha clínica del paciente.</p>
        </div>
        <div className="clinical-approval-dialog__footer">
          <button
            type="button"
            className="clinical-secondary-button"
            disabled={committing}
            autoFocus
            onClick={() => onResolve('decline')}
          >
            Volver a editar
          </button>
          <button
            type="button"
            className="clinical-primary-button"
            disabled={committing}
            onClick={() => onResolve('approve')}
          >
            {committing ? (
              <>
                <Spinner /> Guardando…
              </>
            ) : (
              'Guardar evolución'
            )}
          </button>
        </div>
      </dialog>
    </>
  );
}
