import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { PatientWorkspace, type PatientWorkspaceDetailError } from '../components/PatientWorkspace';
import { getPatientAge } from '../lib/age';
import {
  ApiError,
  type EvolutionDetail,
  type EvolutionSummary,
  type Patient,
  getEvolution,
  getPatient,
  getPatientEvolutions,
} from '../lib/api';
import { formatClinicalDate } from '../lib/clinicalDate';

export function PatientDetail() {
  const { patientId = '', evolutionId = '' } = useParams<{
    patientId: string;
    evolutionId?: string;
  }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [evolutions, setEvolutions] = useState<EvolutionSummary[]>([]);
  const [selectedEvolution, setSelectedEvolution] = useState<EvolutionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<PatientWorkspaceDetailError>(null);
  const patientRequest = useRef(0);
  const detailRequest = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++patientRequest.current;
    setLoading(true);
    setError(false);

    try {
      const [loadedPatient, loadedEvolutions] = await Promise.all([
        getPatient(patientId),
        getPatientEvolutions(patientId),
      ]);
      if (requestId !== patientRequest.current) return;
      setPatient(loadedPatient);
      setEvolutions(loadedEvolutions);
    } catch {
      if (requestId === patientRequest.current) setError(true);
    } finally {
      if (requestId === patientRequest.current) setLoading(false);
    }
  }, [patientId]);

  const loadDetail = useCallback(async () => {
    const requestId = ++detailRequest.current;
    if (!evolutionId) {
      setSelectedEvolution(null);
      setDetailError(null);
      setDetailLoading(false);
      return;
    }

    setDetailLoading(true);
    setDetailError(null);

    try {
      const loadedEvolution = await getEvolution(evolutionId);
      if (requestId !== detailRequest.current) return;

      if (loadedEvolution.patient_id !== patientId) {
        setSelectedEvolution(null);
        navigate(`/patients/${loadedEvolution.patient_id}/evolutions/${loadedEvolution.id}`, {
          replace: true,
        });
        return;
      }

      setSelectedEvolution(loadedEvolution);
    } catch (caught) {
      if (requestId !== detailRequest.current) return;
      setSelectedEvolution(null);
      setDetailError(caught instanceof ApiError && caught.status === 404 ? 'not-found' : 'generic');
    } finally {
      if (requestId === detailRequest.current) setDetailLoading(false);
    }
  }, [evolutionId, navigate, patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const patientAge = patient ? getPatientAge(patient.birth_date) : null;

  return (
    <main className="min-h-full bg-[var(--bg)] p-6 text-[var(--text-primary)] md:p-8">
      <div className="mx-auto max-w-6xl">
        <Link
          to="/patients"
          className="text-sm text-[var(--accent)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          ‹ Pacientes
        </Link>

        {loading ? (
          <div aria-live="polite" aria-busy="true" className="mt-8 space-y-4">
            <span className="sr-only">Cargando paciente</span>
            <div className="skeleton h-8 w-2/3" />
            <div className="skeleton h-4 w-48" />
            <div className="skeleton h-32 w-full" />
          </div>
        ) : error || !patient ? (
          <div role="alert" className="mt-8 text-[var(--danger)]">
            <p>No pudimos cargar el paciente</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-3 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              Reintentar
            </button>
          </div>
        ) : (
          <>
            <header className="patient-page-header">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">
                  {patient.first_name} {patient.last_name}
                </h1>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  RUT {patient.rut_masked}
                  {patient.birth_date
                    ? ` · Nacimiento ${formatClinicalDate(`${patient.birth_date}T00:00:00`)}`
                    : ''}
                  {patientAge !== null ? ` · ${patientAge} años` : ''}
                </p>
              </div>
              <Link to={`/patients/${patient.id}/evolutions/new`} className="primary-button">
                + Nueva evolución
              </Link>
            </header>

            <div aria-live="polite" className="sr-only">
              {location.state?.announcement}
            </div>

            <PatientWorkspace
              patient={patient}
              evolutions={evolutions}
              selectedEvolution={selectedEvolution}
              selectedEvolutionId={evolutionId || null}
              detailLoading={detailLoading}
              detailError={detailError}
              onRetryDetail={() => void loadDetail()}
            />
          </>
        )}
      </div>
    </main>
  );
}
