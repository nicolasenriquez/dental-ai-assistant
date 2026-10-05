import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useClinicalPendingWork } from '../../hooks/useClinicalPendingWork';
import type { EvolutionSummary, PendingWorkItem } from '../../lib/api';
import { formatClinicalDateShort } from '../../lib/clinicalDate';
import { Button, buttonVariants } from '../ui/Button';

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
  const href = (item: PendingWorkItem): string =>
    item.action.kind === 'retry_drive_export' && !item.action.thread_id
      ? `/patients/${patientId}/evolutions/${item.action.evolution_id}`
      : `/a/${item.action.thread_id}`;
  return (
    <section
      aria-label="Resumen del paciente"
      className="my-6 space-y-6 border-t border-border pt-5"
    >
      <h2 className="text-base font-semibold">Resumen clínico</h2>
      <dl className="grid grid-cols-2 gap-4 text-sm">
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
          <dt className="text-muted">Evoluciones guardadas en ficha</dt>
          <dd className="mt-1 font-medium">{evolutions.length.toLocaleString('es-CL')}</dd>
        </div>
      </dl>
      {[
        {
          title: 'Trabajo clínico pendiente',
          rows: [
            { label: 'Por revisar', result: approval, action: 'Revisar', primary: true },
            {
              label: 'Borradores recuperables',
              result: draft,
              action: 'Continuar trabajo',
              primary: false,
            },
          ],
        },
        {
          title: 'Sincronización con Drive',
          rows: [
            {
              label: 'Exportaciones Drive fallidas',
              result: drive,
              action: 'Recuperar sincronización',
              primary: false,
            },
          ],
        },
      ].map(({ title, rows }) => (
        <section key={title} aria-label={title} className="space-y-2 border-t border-border pt-4">
          <h3 className="text-sm font-medium text-muted">{title}</h3>
          <dl className="space-y-2 text-sm">
            {rows.map(({ label, result, action, primary }) => (
              <div
                key={label}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
              >
                <div>
                  <dt className="text-muted">{label}</dt>
                  <dd className="mt-1 font-medium" aria-live="polite">
                    {result.error ? (
                      <span role="alert">
                        No disponible ·{' '}
                        <button
                          type="button"
                          className="inline-flex min-h-[44px] items-center underline"
                          onClick={() => void result.refresh()}
                        >
                          Reintentar {label.toLowerCase()}
                        </button>
                      </span>
                    ) : result.loading ? (
                      'Cargando…'
                    ) : (
                      (result.page?.total ?? 0).toLocaleString('es-CL')
                    )}
                  </dd>
                </div>
                {!result.loading && !result.error && result.page?.items[0] && (
                  <Link
                    className={buttonVariants({
                      variant: primary ? 'clinical' : 'clinicalSecondary',
                    })}
                    to={href(result.page.items[0])}
                  >
                    {action}
                  </Link>
                )}
              </div>
            ))}
          </dl>
          {title === 'Sincronización con Drive' && (
            <p className="text-xs text-muted">
              El guardado en ficha es independiente de la sincronización de su copia en Drive.
            </p>
          )}
        </section>
      ))}
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
