import type { ClinicalApprovalItem as ApprovalItemData } from '../../hooks/useClinicalAssistant';
import { formatClinicalDateTime } from '../../lib/clinicalDate';
import { Link } from 'react-router-dom';

interface ApprovalRequestItemProps {
  item: ApprovalItemData;
  onResolve: (decision: 'approve' | 'decline') => void;
}

export function ApprovalRequestItem({ item, onResolve }: ApprovalRequestItemProps) {
  const payload = item.action.proposal_payload;
  const evolutionAt = typeof payload?.evolution_at === 'string' ? payload.evolution_at : null;
  const committing = item.status === 'running';
  const saved = item.status === 'completed';
  const declined = item.status === 'declined';
  const unavailable = item.status === 'failed';
  const resolved = saved || declined || unavailable;
  return (
    <article className="clinical-artifact clinical-approval" aria-labelledby={`approval-${item.id}`}>
      <h3 id={`approval-${item.id}`}>{committing ? 'Guardando evolución…' : saved ? 'Evolución guardada' : declined ? 'Guardado descartado' : unavailable ? 'Confirmación no disponible' : 'Antes de guardar'}</h3>
      <p>{resolved ? (saved ? 'La evolución ya está en la ficha.' : declined ? 'No se realizaron cambios.' : 'Esta confirmación expiró o ya no puede recuperarse.') : 'Revisa exactamente lo que se incorporará a la ficha.'}</p>
      <dl className="clinical-approval-details">
        <div><dt>Paciente</dt><dd>{item.patient.first_name} {item.patient.last_name} · {item.patient.rut_masked}</dd></div>
        {evolutionAt && <div><dt>Fecha</dt><dd><time dateTime={evolutionAt}>{formatClinicalDateTime(evolutionAt)}</time></dd></div>}
        <div><dt>Evolución</dt><dd><pre>{payload?.final_text ?? 'El contenido de esta confirmación ya no está disponible.'}</pre></dd></div>
      </dl>
      {saved && item.action.result_resource_id && <Link to={`/patients/${item.action.patient_id}/evolutions/${item.action.result_resource_id}`}>Ver evolución guardada</Link>}
      {!resolved && <p className="clinical-muted">Esto todavía no se ha guardado.</p>}
      {!resolved && <div className="clinical-artifact-actions">
        <button type="button" className="clinical-secondary-button" disabled={committing} onClick={() => onResolve('decline')}>Descartar</button>
        <button type="button" className="clinical-primary-button" disabled={committing} onClick={() => onResolve('approve')}>{committing ? 'Guardando…' : 'Confirmar y guardar'}</button>
      </div>}
    </article>
  );
}
