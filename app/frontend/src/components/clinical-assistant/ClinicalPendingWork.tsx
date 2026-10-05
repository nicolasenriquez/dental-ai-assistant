import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useClinicalPendingWork } from '../../hooks/useClinicalPendingWork';
import { retryClinicalDriveExport } from '../../lib/api';
import { formatClinicalDateShort, formatClinicalTime } from '../../lib/clinicalDate';
import { Button } from '../ui/Button';

export function ClinicalPendingWork({ patientId }: { patientId?: string }): JSX.Element {
  const { page, loading, error, refresh, loadMore } = useClinicalPendingWork(patientId);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [retryError, setRetryError] = useState(false);
  const retry = async (id: string): Promise<void> => {
    setRetrying(id);
    setRetryError(false);
    try {
      await retryClinicalDriveExport(id);
      await refresh();
    } catch {
      setRetryError(true);
    } finally {
      setRetrying(null);
    }
  };
  return (
    <section aria-label="Trabajo pendiente" className="space-y-4 p-3">
      {loading && !page && (
        <div role="status">
          <span className="sr-only">Cargando pendientes</span>
          <div className="skeleton h-20 w-full" />
        </div>
      )}
      {error && (
        <div role="alert">
          <p>No pudimos cargar tus pendientes.</p>
          <Button variant="clinicalSecondary" onClick={() => void refresh()}>
            Reintentar
          </Button>
        </div>
      )}
      {retryError && (
        <p role="alert" className="text-error">
          No pudimos reintentar la sincronización. La evolución sigue guardada en ficha.
        </p>
      )}
      {!loading && !error && page?.items.length === 0 && (
        <p className="text-sm text-muted">No hay trabajo pendiente</p>
      )}
      {(['clinical', 'drive'] as const).map((group) => {
        const items = page?.items.filter((item) =>
          group === 'drive'
            ? item.kind === 'drive_export_failed'
            : item.kind !== 'drive_export_failed',
        );
        if (!items?.length) return null;
        return (
          <section
            key={group}
            aria-label={group === 'drive' ? 'Sincronización de Drive' : 'Borradores y revisión'}
          >
            <h2 className="text-sm font-semibold text-foreground">
              {group === 'drive' ? 'Sincronización de Drive' : 'Borradores y revisión'}
            </h2>
            {items.map((item) => (
              <article key={item.id} className="space-y-2 border-b border-border py-3 text-sm">
                <h3 className="font-medium">{item.patient.display_name}</h3>
                <p className="text-muted">{item.patient.rut_masked}</p>
                <p>
                  {item.kind === 'approval_required'
                    ? 'Evolución lista para revisión'
                    : item.kind === 'recoverable_draft'
                      ? 'Borrador por continuar'
                      : 'Guardada en ficha · No se pudo sincronizar con Drive'}
                </p>
                <time className="block text-xs text-muted" dateTime={item.updated_at}>
                  {formatClinicalDateShort(item.updated_at)} · {formatClinicalTime(item.updated_at)}
                </time>
                {item.action.kind === 'retry_drive_export' ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <Link
                      className="inline-block py-2 text-primary hover:underline"
                      to={`/patients/${item.patient.id}/evolutions/${item.action.evolution_id}`}
                    >
                      Ver evolución
                    </Link>
                    <Button
                      variant="clinicalSecondary"
                      disabled={retrying !== null}
                      onClick={() =>
                        item.action.kind === 'retry_drive_export' &&
                        void retry(item.action.evolution_id)
                      }
                    >
                      {retrying === item.action.evolution_id ? 'Reintentando…' : 'Reintentar'}
                    </Button>
                  </div>
                ) : (
                  <Link
                    className="inline-block py-2 text-primary hover:underline"
                    to={`/a/${item.action.thread_id}`}
                  >
                    {item.kind === 'approval_required' ? 'Revisar' : 'Continuar'}
                  </Link>
                )}
              </article>
            ))}
          </section>
        );
      })}
      {page?.next_cursor && (
        <Button variant="clinicalSecondary" disabled={loading} onClick={() => void loadMore()}>
          {loading ? 'Cargando…' : 'Ver más pendientes'}
        </Button>
      )}
    </section>
  );
}
