import {
  ArrowLeft,
  History,
  LayoutDashboard,
  Pencil,
  Plus,
  Stethoscope,
  UserRound,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PatientFormModal, type PatientFormValues } from '../components/PatientFormModal';
import { PatientWorkspace, type PatientWorkspaceDetailError } from '../components/PatientWorkspace';
import { ContextualAssistant } from '../components/clinical-assistant/ContextualAssistant';
import { PatientActivity } from '../components/patients/PatientActivity';
import { PatientDiagnosis } from '../components/patients/PatientDiagnosis';
import { PatientHeaderDisclosure } from '../components/patients/PatientHeaderDisclosure';
import { PatientInformation } from '../components/patients/PatientInformation';
import { PatientNotes } from '../components/patients/PatientNotes';
import { PatientOverview } from '../components/patients/PatientOverview';
import { Button } from '../components/ui/Button';
import { buttonVariants } from '../components/ui/Button';
import { useContextualAssistant } from '../hooks/useContextualAssistant';
import { usePatientDirectory } from '../hooks/usePatientDirectory';
import { useToast } from '../hooks/useToast';
import { useOptionalTransitionGuard } from '../hooks/useTransitionGuard';
import { getPatientAge } from '../lib/age';
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
import { formatClinicalDate } from '../lib/clinicalDate';

const sections = [
  { id: 'summary', label: 'Resumen', icon: LayoutDashboard },
  { id: 'info', label: 'Información', icon: UserRound },
  { id: 'clinical', label: 'Clínica', icon: Stethoscope },
  { id: 'activity', label: 'Actividad', icon: History },
] as const;

export function PatientDetail() {
  const { patientId = '', evolutionId = '' } = useParams<{
    patientId: string;
    evolutionId?: string;
  }>();
  const location = useLocation();
  const navigate = useNavigate();
  const directory = usePatientDirectory();
  const { addToast } = useToast();
  const guard = useOptionalTransitionGuard();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [evolutions, setEvolutions] = useState<EvolutionSummary[]>([]);
  const [selectedEvolution, setSelectedEvolution] = useState<EvolutionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<PatientWorkspaceDetailError>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [section, setSection] = useState<string>('summary');
  const [clinicalSection, setClinicalSection] = useState('diagnosis');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
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

  useEffect(() => {
    const tab = new URLSearchParams(location.search).get('tab');
    setSection(
      evolutionId || location.state?.preserveHistory
        ? 'clinical'
        : sections.some((item) => item.id === tab)
          ? (tab ?? 'summary')
          : 'summary',
    );
    setClinicalSection(
      evolutionId ||
        location.state?.preserveHistory ||
        new URLSearchParams(location.search).get('clinical') === 'evolutions'
        ? 'evolutions'
        : 'diagnosis',
    );
  }, [patientId, evolutionId, location.search, location.state]);

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

  const hasCurrentPatient = patient?.id === patientId;

  return (
    <main className="min-h-full bg-[var(--bg)] p-6 text-[var(--text-primary)] md:p-8">
      <div className="mx-auto flex max-w-7xl gap-6">
        <div className="min-w-0 flex-1 [container-type:inline-size]">
          <Link
            to={`/patients${directory.returnSearch}`}
            className="text-sm text-[var(--accent)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <ArrowLeft size={18} aria-hidden="true" className="mr-2 inline" />
            Pacientes
          </Link>

          {loading && !hasCurrentPatient ? (
            <div aria-live="polite" aria-busy="true" className="mt-8 space-y-4">
              <span className="sr-only">Cargando paciente</span>
              <div className="skeleton h-8 w-2/3" />
              <div className="skeleton h-4 w-48" />
              <div className="skeleton h-32 w-full" />
            </div>
          ) : !patient || !hasCurrentPatient ? (
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
              {error && (
                <div role="alert" className="mt-4 text-danger">
                  <p>No pudimos actualizar el paciente. Tu trabajo local se conserva.</p>
                  <button
                    type="button"
                    onClick={() => void load()}
                    disabled={loading}
                    className="underline"
                  >
                    Reintentar
                  </button>
                </div>
              )}
              <header className="patient-page-header">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full bg-surface text-primary"
                    aria-hidden="true"
                  >
                    {patient.first_name[0]}
                    {patient.last_name[0]}
                  </span>
                  <div className="min-w-0">
                    <h1 className="text-3xl font-semibold tracking-tight">
                      {patient.first_name} {patient.last_name}
                    </h1>
                    <p className="mt-2 text-sm text-muted">
                      {getPatientAge(patient.birth_date) === null
                        ? 'Sin fecha de nacimiento'
                        : `${getPatientAge(patient.birth_date)} años`}
                      {patient.birth_date &&
                        ` · Nacimiento ${formatClinicalDate(`${patient.birth_date}T00:00:00`)}`}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {patient.phone && (
                        <PatientHeaderDisclosure kind="Teléfono" value={patient.phone} />
                      )}
                      {patient.email && (
                        <PatientHeaderDisclosure kind="Correo" value={patient.email} />
                      )}
                      <PatientHeaderDisclosure kind="RUT" value={patient.rut_masked} />
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setEditOpen(true)}
                    className="rounded border border-[var(--border)] px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  >
                    <Pencil size={16} aria-hidden="true" className="mr-2 inline" />
                    Editar paciente
                  </button>
                  <Link
                    to={`/patients/${patient.id}/evolutions/new`}
                    className={buttonVariants({ variant: 'primary' })}
                  >
                    <Plus size={16} aria-hidden="true" />
                    <span className="sr-only">+</span> Nueva evolución
                  </Link>
                  <Button
                    variant="clinicalSecondary"
                    className="inline-flex items-center gap-2"
                    disabled={contextual.opening}
                    onClick={() => void contextual.open()}
                  >
                    <Stethoscope size={16} aria-hidden="true" />
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
              <div
                role="tablist"
                aria-label="Secciones del paciente"
                className="mt-6 flex flex-wrap gap-2 border-b border-border pb-3"
              >
                {sections.map((item, index) => (
                  <button
                    key={item.id}
                    ref={(node) => {
                      tabRefs.current[index] = node;
                    }}
                    type="button"
                    role="tab"
                    id={`patient-tab-${item.id}`}
                    aria-controls={`patient-panel-${item.id}`}
                    aria-selected={section === item.id}
                    tabIndex={section === item.id ? 0 : -1}
                    className={`flex min-h-[44px] items-center gap-2 rounded px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-primary ${section === item.id ? 'bg-surface text-foreground' : 'text-muted'}`}
                    onClick={() => {
                      const change = (): void => {
                        setSection(item.id);
                        if (evolutionId && item.id !== 'clinical')
                          navigate(`/patients/${patientId}?tab=${item.id}`);
                        else if (location.search && !evolutionId)
                          navigate(`${location.pathname}?tab=${item.id}`, { replace: true });
                      };
                      if (guard) guard.guardTransition(change);
                      else change();
                    }}
                    onKeyDown={(event) => {
                      const next =
                        event.key === 'Home'
                          ? 0
                          : event.key === 'End'
                            ? 3
                            : event.key === 'ArrowRight'
                              ? (index + 1) % 4
                              : event.key === 'ArrowLeft'
                                ? (index + 3) % 4
                                : null;
                      if (next !== null) {
                        event.preventDefault();
                        tabRefs.current[next]?.focus();
                      }
                    }}
                  >
                    <item.icon size={18} aria-hidden="true" />
                    {item.label}
                  </button>
                ))}
              </div>
              <div
                role="tabpanel"
                id={`patient-panel-${section}`}
                aria-labelledby={`patient-tab-${section}`}
                className="mt-5"
              >
                {section === 'summary' && (
                  <PatientOverview
                    patientId={patient.id}
                    evolutions={evolutions}
                    onAssistant={(text) => void contextual.open(text)}
                  />
                )}
                {section === 'info' && (
                  <>
                    <PatientInformation patient={patient} />
                    <PatientNotes
                      key={patient.id}
                      patientId={patient.id}
                      focusedNoteId={new URLSearchParams(location.search).get('note') ?? undefined}
                    />
                  </>
                )}
                {section === 'clinical' && (
                  <section className="space-y-4">
                    <div className="flex flex-wrap gap-2" aria-label="Contenido clínico">
                      <Button
                        variant="clinicalSecondary"
                        aria-pressed={clinicalSection === 'diagnosis'}
                        className="aria-pressed:border-primary aria-pressed:bg-surface aria-pressed:font-semibold aria-pressed:text-foreground"
                        onClick={() => {
                          const change = (): void => {
                            setClinicalSection('diagnosis');
                            if (evolutionId) navigate(`/patients/${patientId}?tab=clinical`);
                          };
                          if (guard) guard.guardTransition(change);
                          else change();
                        }}
                      >
                        Diagnóstico
                      </Button>
                      <Button
                        variant="clinicalSecondary"
                        aria-pressed={clinicalSection === 'evolutions'}
                        className="aria-pressed:border-primary aria-pressed:bg-surface aria-pressed:font-semibold aria-pressed:text-foreground"
                        onClick={() => {
                          const change = (): void => setClinicalSection('evolutions');
                          if (guard) guard.guardTransition(change);
                          else change();
                        }}
                      >
                        Evoluciones
                      </Button>
                    </div>
                    {clinicalSection === 'diagnosis' ? (
                      <PatientDiagnosis
                        key={patient.id}
                        patientId={patient.id}
                        focusedConditionId={
                          new URLSearchParams(location.search).get('condition') ?? undefined
                        }
                      />
                    ) : (
                      <PatientWorkspace
                        patient={patient}
                        evolutions={evolutions}
                        selectedEvolution={selectedEvolution}
                        selectedEvolutionId={evolutionId || null}
                        detailLoading={detailLoading}
                        detailError={detailError}
                        onRetryDetail={() => void loadDetail()}
                      />
                    )}
                  </section>
                )}
                {section === 'activity' && (
                  <PatientActivity key={patient.id} patientId={patient.id} />
                )}
              </div>

              <div aria-live="polite" className="sr-only">
                {location.state?.announcement}
              </div>

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
