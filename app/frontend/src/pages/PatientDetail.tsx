import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { PatientFormModal, type PatientFormValues } from '../components/PatientFormModal';
import { PatientIdentity } from '../components/PatientIdentity';
import { PatientWorkspace, type PatientWorkspaceDetailError } from '../components/PatientWorkspace';
import { useToast } from '../hooks/useToast';
import {
  ApiError,
  type EvolutionDetail,
  type EvolutionSummary,
  type Patient,
  getEvolution,
  getPatient,
  getPatientEvolutions,
  updatePatient,
} from '../lib/api';

export function PatientDetail() {
  const { patientId = '', evolutionId = '' } = useParams<{
    patientId: string;
    evolutionId?: string;
  }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [evolutions, setEvolutions] = useState<EvolutionSummary[]>([]);
  const [selectedEvolution, setSelectedEvolution] = useState<EvolutionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<PatientWorkspaceDetailError>(null);
  const [editOpen, setEditOpen] = useState(false);
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
    const preserveHistory = location.state?.preserveHistory === true;
    if (
      !loading &&
      !error &&
      patient &&
      !preserveHistory &&
      !evolutionId &&
      evolutions.length > 0
    ) {
      // ponytail: API contract returns newest-first; avoid a second client-side sort.
      navigate(`/patients/${patientId}/evolutions/${evolutions[0].id}`, { replace: true });
    }
  }, [error, evolutionId, evolutions, loading, location.state, navigate, patient, patientId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const savePatient = async (values: PatientFormValues) => {
    if (!patient) throw new Error('Paciente no cargado');
    return updatePatient(patient.id, {
      first_name: values.first_name,
      last_name: values.last_name,
      birth_date: values.birth_date,
      ...(values.rut ? { rut: values.rut } : {}),
    });
  };

  return (
    <main className="min-h-full bg-[var(--bg)] p-6 text-[var(--text-primary)] md:p-8">
      <div className="mx-auto max-w-7xl">
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
                <PatientIdentity patient={patient} showName={false} />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setEditOpen(true)}
                  className="rounded border border-[var(--border)] px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  Editar paciente
                </button>
                <Link to={`/patients/${patient.id}/evolutions/new`} className="primary-button">
                  + Nueva evolución
                </Link>
              </div>
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
            <PatientFormModal
              open={editOpen}
              mode="edit"
              patient={patient}
              onClose={() => setEditOpen(false)}
              onSubmit={savePatient}
              onSuccess={(updatedPatient) => {
                setPatient(updatedPatient);
                setEditOpen(false);
                addToast('Paciente actualizado', 'success');
              }}
            />
          </>
        )}
      </div>
    </main>
  );
}
