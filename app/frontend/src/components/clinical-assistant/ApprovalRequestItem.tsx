import { Check, ChevronRight, CircleX, Clock, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { ClinicalApprovalItem as ApprovalItemData } from '../../hooks/useClinicalAssistant';
import { formatClinicalDateTime } from '../../lib/clinicalDate';
import { Spinner } from '../Spinner';

interface ApprovalRequestItemProps {
  item: ApprovalItemData;
  onResolve: (decision: 'approve' | 'decline') => void;
  onBackToEdit: () => void;
  autoOpen?: boolean;
  embedded?: boolean;
}

export function ApprovalRequestItem({
  item,
  onResolve,
  onBackToEdit,
  autoOpen = false,
  embedded = false,
}: ApprovalRequestItemProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const payload = item.action.proposal_payload;
  const evolutionAt = typeof payload?.evolution_at === 'string' ? payload.evolution_at : null;
  const committing = item.status === 'running';
  const saved = item.status === 'completed';
  const pending = item.status === 'pending' || committing;
  const statusLabel = {
    pending: 'Requiere confirmación',
    running: 'Guardando',
    completed: 'Guardada',
    declined: 'Descartada',
    failed: 'No disponible',
  }[item.status];

  const openDialog = () => {
    if (dialogRef.current?.open) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.showModal();
  };

  const closeDialog = () => {
    if (dialogRef.current?.open) dialogRef.current.close();
    if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus();
    previousFocusRef.current = null;
  };

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Tab' || !dialogRef.current?.open) return;

      const items = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (!items.length) return;

      const index = items.indexOf(document.activeElement as HTMLElement);
      const atStart = index === 0;
      const atEnd = index === items.length - 1;
      if ((!event.shiftKey && !atEnd) || (event.shiftKey && !atStart)) return;

      event.preventDefault();
      (event.shiftKey ? items[items.length - 1] : items[0])?.focus();
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  useEffect(() => {
    if ((!pending || (embedded && committing)) && dialogRef.current?.open) closeDialog();
  }, [committing, embedded, pending]);
  useEffect(() => {
    if (autoOpen && item.status === 'pending' && !dialogRef.current?.open) openDialog();
  }, [autoOpen, item.status]);

  if (saved) {
    if (embedded) return null;
    const content = (
      <>
        <Check aria-hidden="true" size={15} />
        <span>
          <strong>Evolución guardada</strong>
          <small className="clinical-status-badge">{statusLabel}</small>
          {evolutionAt && (
            <time dateTime={evolutionAt}>
              {item.patient.first_name} {item.patient.last_name} ·{' '}
              {formatClinicalDateTime(evolutionAt)}
            </time>
          )}
        </span>
        {item.action.result_resource_id && (
          <span>
            Ver en ficha <ChevronRight aria-hidden="true" size={15} />
          </span>
        )}
      </>
    );
    return item.action.result_resource_id ? (
      <Link
        className="clinical-receipt"
        to={`/patients/${item.action.patient_id}/evolutions/${item.action.result_resource_id}`}
      >
        {content}
      </Link>
    ) : (
      <output className="clinical-receipt">{content}</output>
    );
  }

  if (embedded && committing) return null;

  if (!pending) {
    return (
      <div
        className={`${embedded ? 'clinical-evolution-approval-terminal' : 'clinical-approval-terminal'} clinical-approval-terminal--${item.status}`}
        role="status"
      >
        {item.status === 'declined' ? (
          <X aria-hidden="true" size={14} />
        ) : (
          <CircleX aria-hidden="true" size={14} />
        )}
        <span>
          <strong>{statusLabel}</strong>
          {item.status === 'declined'
            ? 'No se realizaron cambios.'
            : 'Esta confirmación expiró o ya no puede recuperarse.'}
        </span>
      </div>
    );
  }

  return (
    <>
      {!autoOpen && !committing && (
        <div
          className={embedded ? 'clinical-evolution-approval-prompt' : 'clinical-approval-prompt'}
        >
          <span>
            <Clock aria-hidden="true" size={15} /> Guardado pendiente
          </span>
          {embedded ? (
            <div className="clinical-evolution-approval-actions">
              <button type="button" className="clinical-secondary-button" onClick={onBackToEdit}>
                Seguir editando
              </button>
              <button type="button" className="clinical-primary-button" onClick={openDialog}>
                Confirmar guardado
              </button>
            </div>
          ) : (
            <button type="button" className="clinical-primary-button" onClick={openDialog}>
              Continuar
            </button>
          )}
        </div>
      )}
      <dialog
        ref={dialogRef}
        className="clinical-approval-dialog"
        aria-labelledby={`approval-${item.id}`}
        onCancel={(event) => {
          event.preventDefault();
          if (!committing) closeDialog();
        }}
      >
        <div className="clinical-approval-dialog__body">
          <h2 id={`approval-${item.id}`}>Guardar evolución</h2>
          <span className="clinical-status-badge">
            {committing && !embedded && <Spinner />}
            {statusLabel}
          </span>
          <p>
            <strong>
              {item.patient.first_name} {item.patient.last_name}
            </strong>
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
            onClick={() => {
              closeDialog();
              onBackToEdit();
            }}
          >
            {embedded ? 'Volver a editar' : 'Seguir editando'}
          </button>
          <button
            type="button"
            className="clinical-primary-button"
            disabled={committing}
            onClick={() => onResolve('approve')}
          >
            {committing ? 'Guardando…' : embedded ? 'Guardar evolución' : 'Guardar'}
          </button>
        </div>
      </dialog>
    </>
  );
}
