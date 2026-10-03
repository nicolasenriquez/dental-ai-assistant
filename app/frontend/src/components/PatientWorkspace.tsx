import { Link } from 'react-router-dom';
import type { EvolutionDetail, EvolutionSummary, Patient } from '../lib/api';
import { formatClinicalDateShort, formatClinicalTime } from '../lib/clinicalDate';
import { EvolutionDetailContent } from './EvolutionDetailContent';

export type PatientWorkspaceDetailError = 'not-found' | 'generic' | null;

interface PatientWorkspaceProps {
  patient: Patient;
  evolutions: EvolutionSummary[];
  selectedEvolution: EvolutionDetail | null;
  selectedEvolutionId: string | null;
  detailLoading: boolean;
  detailError: PatientWorkspaceDetailError;
  onRetryDetail: () => void;
}

function EmptyHistory({ patientId }: { patientId: string }) {
  return (
    <div className="patient-workspace__empty">
      <p>No hay evoluciones registradas</p>
      <span>Este paciente todavía no tiene evoluciones clínicas.</span>
      <Link to={`/patients/${patientId}/evolutions/new`}>+ Nueva evolución</Link>
    </div>
  );
}

function EvolutionSelectionEmpty() {
  return (
    <div className="patient-workspace__empty patient-workspace__empty--detail">
      <h2 id="evolution-detail-title">Selecciona una evolución</h2>
      <p>Elige una evolución del historial para revisar su detalle clínico.</p>
    </div>
  );
}

function EvolutionDetailSkeleton() {
  return (
    <div aria-live="polite" aria-busy="true" className="patient-detail-skeleton">
      <span className="sr-only">Cargando evolución</span>
      <div className="skeleton h-7 w-2/3" />
      <div className="skeleton h-4 w-48" />
      <div className="skeleton h-24 w-full" />
      <div className="skeleton h-24 w-full" />
    </div>
  );
}

function EvolutionDetailError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="patient-workspace__empty patient-workspace__empty--detail">
      <h2 id="evolution-detail-title">No pudimos cargar esta evolución</h2>
      <p>Conservamos el historial para que puedas intentarlo nuevamente.</p>
      <button type="button" onClick={onRetry}>
        Reintentar
      </button>
    </div>
  );
}

function EvolutionNotFound({ patientId }: { patientId: string }) {
  return (
    <div role="alert" className="patient-workspace__empty patient-workspace__empty--detail">
      <h2 id="evolution-detail-title">No se encontró esta evolución</h2>
      <p>La evolución solicitada no está disponible para este paciente.</p>
      <Link to={`/patients/${patientId}`} state={{ preserveHistory: true }}>
        Volver al historial
      </Link>
    </div>
  );
}

export function PatientWorkspace({
  patient,
  evolutions,
  selectedEvolution,
  selectedEvolutionId,
  detailLoading,
  detailError,
  onRetryDetail,
}: PatientWorkspaceProps) {
  return (
    <section className={`patient-workspace${selectedEvolutionId ? ' has-selection' : ''}`}>
      <div className="patient-workspace__columns">
        <section className="patient-workspace__history" aria-labelledby="history-title">
          <div className="patient-workspace__history-heading">
            <div>
              <h2 id="history-title">Historial de evoluciones</h2>
              <p>Registro cronológico de las atenciones clínicas.</p>
            </div>
            <span aria-label={`${evolutions.length} evoluciones`}>{evolutions.length}</span>
          </div>

          {evolutions.length === 0 ? (
            <EmptyHistory patientId={patient.id} />
          ) : (
            <ol className="patient-history-list">
              {evolutions.map((evolution) => {
                const selected = selectedEvolutionId === evolution.id;

                return (
                  <li key={evolution.id} className="patient-history-entry">
                    <Link
                      to={`/patients/${patient.id}/evolutions/${evolution.id}`}
                      aria-current={selected ? 'page' : undefined}
                      className={`patient-history-link${selected ? ' is-selected' : ''}`}
                      aria-label={`Ver evolución del ${formatClinicalDateShort(evolution.evolution_at)} a las ${formatClinicalTime(evolution.evolution_at)}`}
                    >
                      <span className="patient-history-link__marker" aria-hidden="true" />
                      <span className="patient-history-link__copy">
                        <span className="patient-history-link__meta">
                          <time dateTime={evolution.evolution_at}>
                            {formatClinicalDateShort(evolution.evolution_at)}
                          </time>
                          <time dateTime={evolution.evolution_at}>
                            {formatClinicalTime(evolution.evolution_at)}
                          </time>
                        </span>
                        <span className="patient-history-link__preview">{evolution.preview}</span>
                      </span>
                      <span className="patient-history-link__arrow" aria-hidden="true">
                        →
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <aside
          className="patient-workspace__detail"
          aria-label="Detalle de la evolución"
          aria-busy={detailLoading}
        >
          {detailLoading && <EvolutionDetailSkeleton />}
          {!detailLoading && detailError === 'not-found' && (
            <EvolutionNotFound patientId={patient.id} />
          )}
          {!detailLoading && detailError === 'generic' && (
            <EvolutionDetailError onRetry={onRetryDetail} />
          )}
          {!detailLoading && !detailError && selectedEvolution && (
            <>
              <div className="patient-detail-mobile-back">
                <Link to={`/patients/${patient.id}`} state={{ preserveHistory: true }}>
                  ‹ Volver a {patient.first_name} {patient.last_name}
                </Link>
              </div>
              <div key={selectedEvolution.id} className="patient-workspace__detail-transition">
                <EvolutionDetailContent evolution={selectedEvolution} />
              </div>
            </>
          )}
          {!detailLoading && !detailError && !selectedEvolution && <EvolutionSelectionEmpty />}
        </aside>
      </div>
    </section>
  );
}
