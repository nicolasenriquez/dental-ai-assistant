import { useCallback, useEffect, useState } from 'react';
import { type ClinicalPlan, getClinicalPlans } from '../../lib/api';
import { Button } from '../ui/Button';

interface PatientPlanContinuationProps {
  patientId: string;
  onContinue: (planId?: string) => void;
}

export function PatientPlanContinuation({
  patientId,
  onContinue,
}: PatientPlanContinuationProps): JSX.Element {
  const [plans, setPlans] = useState<ClinicalPlan[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState('');
  const load = useCallback(
    async (next?: string): Promise<void> => {
      setLoading(true);
      setError(false);
      try {
        const page = await getClinicalPlans(patientId, { state: 'draft', cursor: next });
        setPlans((previous) => (next ? [...previous, ...page.items] : page.items));
        setCursor(page.next_cursor);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [patientId],
  );
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <section aria-label="Continuar planificación" className="space-y-3 border-t border-border pt-4">
      <h3 className="font-semibold">Plan clínico</h3>
      <p className="text-sm text-muted">
        Crea un borrador o continúa uno guardado. El diagnóstico permanece disponible para revisión.
      </p>
      <Button variant="clinical" onClick={() => onContinue()}>
        Crear nuevo plan
      </Button>
      {loading && <p role="status">Cargando borradores</p>}
      {error && (
        <div role="alert">
          <p>No pudimos cargar los borradores.</p>
          <Button variant="clinicalSecondary" onClick={() => void load(cursor ?? undefined)}>
            Reintentar borradores
          </Button>
        </div>
      )}
      {plans.length > 0 && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-0 text-sm">
            Borrador para continuar
            <select
              className="mt-1 block max-w-full rounded border border-border bg-surface p-2"
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              <option value="">Selecciona un borrador</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.title || 'Plan sin título'}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="clinicalSecondary"
            disabled={!selected || loading}
            onClick={() => onContinue(selected)}
          >
            Continuar borrador
          </Button>
        </div>
      )}
      {cursor && !error && (
        <Button variant="clinicalSecondary" disabled={loading} onClick={() => void load(cursor)}>
          Cargar más borradores
        </Button>
      )}
    </section>
  );
}
