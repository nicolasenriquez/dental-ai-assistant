import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useClinicalPendingWork } from '../../hooks/useClinicalPendingWork';
import type { EvolutionSummary, PendingWorkItem } from '../../lib/api';
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
  const approval = useClinicalPendingWork(patientId, 'approval_required', 1);
  const draft = useClinicalPendingWork(patientId, 'recoverable_draft', 1);
  const drive = useClinicalPendingWork(patientId, 'drive_export_failed', 1);
  useEffect(() => {
    if (revision) {
      void approval.refresh();
      void draft.refresh();
      void drive.refresh();
    }
  }, [revision]);
  const clinical =
    !approval.error && !approval.loading && approval.page?.items[0]
      ? approval.page.items[0]
      : !approval.error && !approval.loading
        ? draft.page?.items[0]
        : undefined;
  const href = (item: PendingWorkItem): string =>
    item.action.kind === 'retry_drive_export' && !item.action.thread_id
      ? `/patients/${patientId}/evolutions/${item.action.evolution_id}`
      : `/a/${item.action.thread_id}`;
  return (
    <section
      aria-label="Resumen del paciente"
      className="my-6 space-y-5 border-y border-border py-5"
    >
      <dl className="flex flex-wrap gap-x-10 gap-y-4 text-sm">
        <div>
          <dt className="text-muted">Última evolución</dt>
          <dd className="mt-1 font-medium">
            {evolutions[0] ? (
              <Link
                className="text-primary hover:underline"
                to={`/patients/${patientId}/evolutions/${evolutions[0].id}`}
              >
                {formatClinicalDateShort(evolutions[0].evolution_at)}
              </Link>
            ) : (
              'Sin evoluciones aprobadas'
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Evoluciones</dt>
          <dd className="mt-1 font-medium">{evolutions.length}</dd>
        </div>
        {(
          [
            ['Por revisar', approval],
            ['Borradores', draft],
            ['Sincronización Drive', drive],
          ] as const
        ).map(([label, result]) => (
          <div key={label}>
            <dt className="text-muted">{label}</dt>
            <dd className="mt-1 font-medium">
              {result.error ? (
                <span role="alert">
                  No disponible ·{' '}
                  <button type="button" className="underline" onClick={() => void result.refresh()}>
                    Reintentar {label.toLowerCase()}
                  </button>
                </span>
              ) : result.loading ? (
                'Cargando…'
              ) : (
                (result.page?.total ?? 0)
              )}
            </dd>
          </div>
        ))}
      </dl>
      {clinical && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p>Tienes trabajo clínico por continuar</p>
          <Link className="py-2 text-primary hover:underline" to={href(clinical)}>
            {clinical.kind === 'approval_required' ? 'Revisar' : 'Continuar trabajo'}
          </Link>
        </div>
      )}
      {!drive.error && drive.page?.items[0] && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p>Guardada en ficha · Sincronización por recuperar</p>
          <Link className="py-2 text-primary hover:underline" to={href(drive.page.items[0])}>
            Recuperar sincronización
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
        <Button
          variant="clinicalSecondary"
          onClick={() => onAssistant('Consulta las evoluciones anteriores de este paciente.')}
        >
          Consultar evoluciones anteriores
        </Button>
        <Link className="py-2 text-primary hover:underline" to="/assistant?view=pending">
          Ver pendientes
        </Link>
      </div>
    </section>
  );
}
