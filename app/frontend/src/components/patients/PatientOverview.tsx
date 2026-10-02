import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useClinicalPendingWork } from '../../hooks/useClinicalPendingWork';
import type { EvolutionSummary } from '../../lib/api';
import { formatClinicalDateShort } from '../../lib/clinicalDate';
import { Button } from '../ui/Button';

export function PatientOverview({
  patientId,
  evolutions,
  revision,
  onAssistant,
}: {
  patientId: string;
  evolutions: EvolutionSummary[];
  revision?: string;
  onAssistant: (prefill?: string) => void;
}): JSX.Element {
  const pending = useClinicalPendingWork(patientId);
  useEffect(() => {
    if (revision) void pending.refresh();
  }, [revision]);
  return (
    <section
      aria-label="Resumen del paciente"
      className="my-6 space-y-5 border-y border-border py-5"
    >
      <dl className="flex flex-wrap gap-x-10 gap-y-4 text-sm">
        <div>
          <dt className="text-muted">Última evolución</dt>
          <dd className="mt-1 font-medium">
            {evolutions[0]
              ? formatClinicalDateShort(evolutions[0].evolution_at)
              : 'Sin evoluciones'}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Evoluciones</dt>
          <dd className="mt-1 font-medium">{evolutions.length}</dd>
        </div>
        <div>
          <dt className="text-muted">Pendientes</dt>
          <dd className="mt-1 font-medium">
            {pending.loading
              ? 'Cargando…'
              : pending.error
                ? 'No disponible'
                : (pending.page?.total ?? 0)}
          </dd>
        </div>
      </dl>
      {pending.error && (
        <p role="alert" className="text-error">
          No pudimos cargar el trabajo pendiente.{' '}
          <button type="button" className="underline" onClick={() => void pending.refresh()}>
            Reintentar
          </button>
        </p>
      )}
      {!pending.error && pending.page?.items[0] && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p>
            {pending.page.items[0].kind === 'drive_export_failed'
              ? 'Evolución guardada con sincronización por recuperar'
              : 'Tienes trabajo clínico por continuar'}
          </p>
          <Link
            className="py-2 text-primary hover:underline"
            to={
              pending.page.items[0].action.kind === 'retry_drive_export' &&
              !pending.page.items[0].action.thread_id
                ? `/patients/${patientId}/evolutions/${pending.page.items[0].action.evolution_id}`
                : `/a/${pending.page.items[0].action.thread_id}`
            }
          >
            Continuar trabajo
          </Link>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="clinicalSecondary"
          onClick={() => onAssistant('Quiero preparar una evolución con mi nota clínica.')}
        >
          Preparar evolución
        </Button>
        {evolutions.length > 0 && (
          <Button
            variant="clinicalSecondary"
            onClick={() => onAssistant('Consulta las evoluciones anteriores de este paciente.')}
          >
            Consultar evoluciones anteriores
          </Button>
        )}
      </div>
    </section>
  );
}
