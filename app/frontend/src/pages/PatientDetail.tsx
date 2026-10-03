import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PatientFormModal, type PatientFormValues } from '../components/PatientFormModal';
import { PatientIdentity } from '../components/PatientIdentity';
import { PatientWorkspace, type PatientWorkspaceDetailError } from '../components/PatientWorkspace';
import { ContextualAssistant } from '../components/clinical-assistant/ContextualAssistant';
import { PatientOverview } from '../components/patients/PatientOverview';
import { Button } from '../components/ui/Button';
import { buttonVariants } from '../components/ui/Button';
import { useContextualAssistant } from '../hooks/useContextualAssistant';
import { usePatientDirectory } from '../hooks/usePatientDirectory';
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
  const directory = usePatientDirectory();
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
  const contextual = useContextualAssistant({
    surface: evolutionId ? 'evolution_detail' : 'patient_detail',
    patientId,
    evolutionId: evolutionId || undefined,
  });

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

  const savePatient = async (values: PatientFormValues) => {
    if (!patient) throw new Error('Paciente no cargado');
    return updatePatient(patient.id, {
      first_name: values.first_name,
      last_name: values.last_name,
      birth_date: values.birth_date,
      phone: values.phone,
      email: values.email,
      ...(values.rut ? { rut: values.rut } : {}),
    });
  };

  return (
    <main className="min-h-full bg-[var(--bg)] p-6 text-[var(--text-primary)] md:p-8">
      <div className="mx-auto flex max-w-7xl gap-6">
        <div className="min-w-0 flex-1">
          <Link
            to={`/patients${directory.returnSearch}`}
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
                  <Link
                    to={`/patients/${patient.id}/evolutions/new`}
                    className={buttonVariants({ variant: 'primary' })}
                  >
                    + Nueva evolución
                  </Link>
                  <Button
                    variant="clinicalSecondary"
                    disabled={contextual.opening}
                    onClick={() => void contextual.open()}
                  >
                    {contextual.opening ? 'Abriendo…' : 'Asistente'}
                  </Button>
                </div>
              </header>
              {contextual.error && (
                <p role="alert" className="my-3 text-error">
                  {contextual.error}{' '}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => void contextual.open()}
                  >
                    Reintentar
                  </button>
                </p>
              )}
              {!evolutionId && (
                <PatientOverview
                  patientId={patient.id}
                  evolutions={evolutions}
                  onAssistant={(text) => void contextual.open(text)}
                />
              )}

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
        {contextual.panelThreadId && (
          <ContextualAssistant
            threadId={contextual.panelThreadId}
            width={contextual.width}
            onClose={contextual.close}
            onChanged={() => void load()}
          />
        )}
      </div>
      {contextual.conflict && (
        <ConfirmDialog
          title="Conservar el trabajo clínico"
          description={
            contextual.conflict.current.patient
              ? `Este hilo pertenece a ${contextual.conflict.current.patient.display_name} · ${contextual.conflict.current.patient.rut_masked}. Quieres trabajar con ${contextual.conflict.requested.patient.display_name}. El trabajo anterior no se modificará.`
              : 'Esta conversación contiene trabajo previo. Se conservará sin asociarlo a otro paciente.'
          }
          confirmLabel="Abrir nuevo hilo"
          cancelLabel="Continuar conversación"
          busy={contextual.opening}
          error={contextual.error}
          onConfirm={() => void contextual.createNew()}
          onCancel={contextual.continueCurrent}
        />
      )}
    </main>
  );
}
