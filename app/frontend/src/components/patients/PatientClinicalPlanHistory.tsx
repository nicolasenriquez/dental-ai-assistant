import { useEffect, useRef, useState } from 'react';
import {
  type ClinicalPlan,
  type PlanRevision,
  getClinicalPlan,
  getClinicalPlanRevisions,
} from '../../lib/api';
import { Button } from '../ui/Button';

interface PatientClinicalPlanHistoryProps {
  patientId: string;
  planId?: string;
}

// Activity links retain their evidence without reopening plan authoring.
export function PatientClinicalPlanHistory({
  patientId,
  planId,
}: PatientClinicalPlanHistoryProps): JSX.Element {
  const [plan, setPlan] = useState<ClinicalPlan | null>(null);
  const [revisions, setRevisions] = useState<PlanRevision[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const destination = useRef<HTMLElement>(null);
  useEffect(() => {
    let alive = true;
    setPlan(null);
    setRevisions([]);
    setCursor(null);
    setError(false);
    if (!planId) return;
    setLoading(true);
    void Promise.all([
      getClinicalPlan(patientId, planId),
      getClinicalPlanRevisions(patientId, planId),
    ])
      .then(([record, history]) => {
        if (!alive) return;
        setPlan(record);
        setRevisions(history.items);
        setCursor(history.next_cursor);
        destination.current?.focus();
      })
      .catch(() => {
        if (alive) setError(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [patientId, planId, retry]);
  return (
    <section
      ref={destination}
      tabIndex={-1}
      aria-label="Historial de plan clínico"
      className="space-y-4 focus-visible:ring-2 focus-visible:ring-primary"
    >
      <h3 className="font-semibold">Historial de plan clínico</h3>
      <p className="text-sm text-muted">Registros anteriores, disponibles para consulta.</p>
      {loading && <p role="status">Cargando historial…</p>}
      {error && (
        <div role="alert">
          No pudimos leer el historial.{' '}
          <Button variant="clinicalSecondary" onClick={() => setRetry((value) => value + 1)}>
            Reintentar lectura
          </Button>
        </div>
      )}
      {!planId && <p>Selecciona Diagnóstico para continuar la atención.</p>}
      {plan && (
        <>
          <h4 className="font-semibold">{plan.title || 'Plan sin título'}</h4>
          <p className="whitespace-pre-wrap break-words">{plan.diagnosis}</p>
          <p className="whitespace-pre-wrap break-words">{plan.internal_notes}</p>
          <ul className="space-y-3">
            {plan.items.map((item) => (
              <li key={item.id} className="rounded border border-border p-3">
                <p>{item.treatment.label_es}</p>
                <ul>
                  {item.stages.map((stage) => (
                    <li key={stage.id}>
                      {stage.label} ·{' '}
                      {
                        { pending: 'Pendiente', completed: 'Completada', cancelled: 'Cancelada' }[
                          stage.status
                        ]
                      }
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <h4 className="font-semibold">Revisiones</h4>
          <ul className="space-y-2">
            {revisions.map((entry) => (
              <li key={entry.id} className="rounded border border-border p-3">
                <p>Revisión {entry.after.revision}</p>
                <p className="whitespace-pre-wrap break-words">{entry.after.diagnosis}</p>
                <p className="whitespace-pre-wrap break-words">{entry.after.internal_notes}</p>
              </li>
            ))}
          </ul>
          {cursor && (
            <Button
              variant="clinicalSecondary"
              disabled={loading}
              onClick={async () => {
                setLoading(true);
                try {
                  const history = await getClinicalPlanRevisions(patientId, plan.id, cursor);
                  setRevisions((previous) => [...previous, ...history.items]);
                  setCursor(history.next_cursor);
                } catch {
                  setError(true);
                } finally {
                  setLoading(false);
                }
              }}
            >
              Cargar más revisiones
            </Button>
          )}
        </>
      )}
    </section>
  );
}
