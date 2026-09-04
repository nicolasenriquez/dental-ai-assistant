import { type ChangeEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Link, useBeforeUnload, useBlocker, useNavigate, useParams } from 'react-router-dom';
import { useToast } from '../hooks/useToast';
import {
  ApiError,
  type ClinicalDraft,
  type EvolutionSummary,
  type Patient,
  generateEvolution,
  getPatient,
  getPatientEvolutions,
  saveEvolution,
} from '../lib/api';
import { formatClinicalDateTime } from '../lib/clinicalDate';

const MAX_RAW_NOTE_LENGTH = 40000;
const SHOW_COUNT_AT = 35000;
const EMPTY_DRAFT: ClinicalDraft = {
  context: '',
  findings: '',
  assessment: '',
  treatment: '',
  follow_up: '',
  review_flags: [],
};

type ClinicalField = Exclude<keyof ClinicalDraft, 'review_flags'>;
type WorkspaceState = 'editing_raw' | 'generating' | 'reviewing';

const fields: Array<{ key: ClinicalField; label: string }> = [
  { key: 'context', label: 'Motivo / contexto' },
  { key: 'findings', label: 'Hallazgos' },
  { key: 'assessment', label: 'Diagnóstico / impresión clínica' },
  { key: 'treatment', label: 'Tratamiento / conducta' },
  { key: 'follow_up', label: 'Seguimiento' },
];

const workflowSteps = ['Nota clínica', 'Redacción asistida', 'Revisión y guardado'] as const;

function localInputParts(value: Date) {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  return { date: local.slice(0, 10), time: local.slice(11) };
}

function composeDraft(draft: ClinicalDraft) {
  return fields
    .map(({ key, label }) => ({ label, value: draft[key].trim() }))
    .filter(({ value }) => value)
    .map(({ label, value }) => `${label}: ${value}`)
    .join('\n\n');
}

function toOffsetISOString(value: Date) {
  const offsetMinutes = -value.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const pad = (part: number) => String(Math.abs(part)).padStart(2, '0');
  const local = localInputParts(value);
  return `${local.date}T${local.time}:00${sign}${pad(Math.trunc(offsetMinutes / 60))}:${pad(offsetMinutes % 60)}`;
}

export function NewEvolution() {
  const { patientId = '' } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [workspace, setWorkspace] = useState<WorkspaceState>('editing_raw');
  const [rawNote, setRawNote] = useState('');
  const [draft, setDraft] = useState<ClinicalDraft>(EMPTY_DRAFT);
  const [generatedDraft, setGeneratedDraft] = useState<ClinicalDraft | null>(null);
  const [generatedRawNote, setGeneratedRawNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRegeneration, setConfirmRegeneration] = useState(false);
  const [evolutionAt, setEvolutionAt] = useState(() => new Date());
  const [showDateTime, setShowDateTime] = useState(false);
  const [saveId] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [previousEvolution, setPreviousEvolution] = useState<EvolutionSummary | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [patientLoading, setPatientLoading] = useState(true);
  const [patientError, setPatientError] = useState(false);
  const [leavePromptOpen, setLeavePromptOpen] = useState(false);
  const patientRequestId = useRef(0);
  const historyRequestId = useRef(0);
  const initialEvolutionAt = useRef(evolutionAt);
  const regenerationDialogRef = useRef<HTMLDivElement>(null);
  const regenerationCancelRef = useRef<HTMLButtonElement>(null);
  const leaveDialogRef = useRef<HTMLDivElement>(null);
  const leaveCancelRef = useRef<HTMLButtonElement>(null);

  const sourceLength = rawNote.trim().length;
  const overLimit = sourceLength > MAX_RAW_NOTE_LENGTH;
  const isDraftStale = generatedDraft !== null && rawNote !== generatedRawNote;
  const hasClinicalContent = fields.some(({ key }) => draft[key].trim());
  const hasHumanEdits = generatedDraft
    ? fields.some(({ key }) => draft[key] !== generatedDraft[key])
    : false;
  const canGenerate =
    sourceLength > 0 &&
    !overLimit &&
    !patientLoading &&
    !patientError &&
    workspace !== 'generating';
  const canSave =
    Boolean(generatedDraft) &&
    hasClinicalContent &&
    !isDraftStale &&
    !saving &&
    workspace === 'reviewing';
  const dateTime = localInputParts(evolutionAt);
  const activeWorkflowStep = { editing_raw: 0, generating: 1, reviewing: 2 }[workspace];
  const isDirty =
    rawNote.trim().length > 0 ||
    generatedDraft !== null ||
    hasHumanEdits ||
    evolutionAt.getTime() !== initialEvolutionAt.current.getTime();
  const blocker = useBlocker(isDirty && !saving);

  useBeforeUnload((event) => {
    if (isDirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  const loadPatient = async () => {
    const currentRequest = ++patientRequestId.current;
    setPatientLoading(true);
    setPatientError(false);
    try {
      const loadedPatient = await getPatient(patientId);
      if (currentRequest === patientRequestId.current) setPatient(loadedPatient);
    } catch {
      if (currentRequest === patientRequestId.current) setPatientError(true);
    } finally {
      if (currentRequest === patientRequestId.current) setPatientLoading(false);
    }
  };

  useEffect(() => {
    void loadPatient();
    return () => {
      patientRequestId.current += 1;
    };
  }, [patientId]);

  const loadPreviousEvolution = async () => {
    const currentRequest = ++historyRequestId.current;
    setHistoryLoading(true);
    try {
      const history = await getPatientEvolutions(patientId);
      if (currentRequest === historyRequestId.current) setPreviousEvolution(history[0] ?? null);
    } catch {
      if (currentRequest === historyRequestId.current) setPreviousEvolution(null);
    } finally {
      if (currentRequest === historyRequestId.current) setHistoryLoading(false);
    }
  };

  useEffect(() => {
    void loadPreviousEvolution();
    return () => {
      historyRequestId.current += 1;
    };
  }, [patientId]);

  useEffect(() => {
    if (blocker.state === 'blocked') setLeavePromptOpen(true);
  }, [blocker.state]);

  useEffect(() => {
    if (!leavePromptOpen) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    leaveCancelRef.current?.focus();
    return () => {
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [leavePromptOpen]);

  useEffect(() => {
    if (!confirmRegeneration) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    regenerationCancelRef.current?.focus();
    return () => {
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [confirmRegeneration]);

  const handleLeaveDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setLeavePromptOpen(false);
      blocker.reset?.();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = leaveDialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const runGeneration = async () => {
    setConfirmRegeneration(false);
    setError(null);
    setWorkspace('generating');
    try {
      const result = await generateEvolution(patientId, rawNote);
      setDraft(result);
      setGeneratedDraft(result);
      setGeneratedRawNote(rawNote);
      setWorkspace('reviewing');
    } catch (caught) {
      const detail =
        caught instanceof ApiError && typeof caught.body === 'object' && caught.body !== null
          ? (caught.body as { detail?: unknown }).detail
          : null;
      const code =
        detail && typeof detail === 'object' && 'code' in detail && typeof detail.code === 'string'
          ? detail.code
          : null;

      setError(
        code === 'clinical_generation_disabled'
          ? 'La redacción asistida no está disponible en este entorno. Conservamos tu nota.'
          : code === 'clinical_generation_provider_unavailable'
            ? 'La redacción asistida no está disponible temporalmente. Conservamos tu nota.'
            : 'No pudimos redactar la evolución. Puedes reintentar.',
      );
      setWorkspace(generatedDraft ? 'reviewing' : 'editing_raw');
    }
  };

  const requestGeneration = () => {
    if (!canGenerate) return;
    if (generatedDraft && hasHumanEdits) {
      setConfirmRegeneration(true);
      return;
    }
    void runGeneration();
  };

  const changeRawNote = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setRawNote(event.target.value);
  };

  const handleRegenerationDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setConfirmRegeneration(false);
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = regenerationDialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const changeClinicalField = (key: ClinicalField, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const changeDateTime = (date: string, time: string) => {
    if (!date || !time) return;
    setEvolutionAt(new Date(`${date}T${time}`));
  };

  const handleShortcut = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      requestGeneration();
    }
  };

  const save = async () => {
    if (!canSave || !generatedDraft) return;
    setSaving(true);
    setError(null);
    try {
      const savedEvolution = await saveEvolution(patientId, {
        id: saveId,
        evolution_at: toOffsetISOString(evolutionAt),
        raw_note: rawNote,
        generated_text: composeDraft(generatedDraft),
        final_text: composeDraft(draft),
      });
      addToast('Evolución guardada', 'success');
      navigate(
        savedEvolution.id
          ? `/patients/${patientId}/evolutions/${savedEvolution.id}`
          : `/patients/${patientId}`,
        {
          state: { announcement: 'Evolución guardada' },
        },
      );
    } catch {
      setError('No pudimos guardar la evolución. Puedes reintentar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-full bg-[var(--bg)] p-6 text-[var(--text-primary)] md:p-8">
      <div className="mx-auto max-w-5xl">
        <Link
          to={`/patients/${patientId}`}
          className="text-sm text-[var(--accent)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          ‹ Volver a {patient ? `${patient.first_name} ${patient.last_name}` : 'paciente'}
        </Link>
        <header className="mt-4">
          <h1 className="text-2xl font-semibold">Nueva evolución dental</h1>
          {patientLoading ? (
            <div className="skeleton mt-3 h-10 w-64" aria-label="Cargando paciente" />
          ) : patientError || !patient ? (
            <div role="alert" className="mt-3 text-sm text-[var(--danger)]">
              <p>No pudimos cargar el paciente. La generación permanece bloqueada.</p>
              <button
                type="button"
                disabled={patientLoading}
                onClick={() => void loadPatient()}
                className="mt-2 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                Reintentar
              </button>
            </div>
          ) : (
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Paciente: {patient.first_name} {patient.last_name} · RUT {patient.rut_masked}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-[var(--text-secondary)]">
            <span>{formatClinicalDateTime(evolutionAt)}</span>
            <button
              type="button"
              onClick={() => setShowDateTime((shown) => !shown)}
              aria-expanded={showDateTime}
              aria-controls="evolution-datetime-controls"
              className="text-[var(--accent)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              Cambiar fecha y hora
            </button>
          </div>
          {showDateTime && (
            <div id="evolution-datetime-controls" className="mt-3 flex flex-wrap gap-3">
              <input
                aria-label="Fecha de evolución"
                lang="es-CL"
                type="date"
                value={dateTime.date}
                onChange={(event) => changeDateTime(event.target.value, dateTime.time)}
                className="rounded border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
              />
              <input
                aria-label="Hora de evolución"
                lang="es-CL"
                type="time"
                value={dateTime.time}
                onChange={(event) => changeDateTime(dateTime.date, event.target.value)}
                className="rounded border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
              />
            </div>
          )}
        </header>

        <ol
          aria-label="Progreso de la evolución"
          className="mt-6 grid gap-2 text-xs text-[var(--text-secondary)] sm:grid-cols-3"
        >
          {workflowSteps.map((step, index) => (
            <li
              key={step}
              aria-current={index === activeWorkflowStep ? 'step' : undefined}
              className={[
                index < activeWorkflowStep && 'is-complete text-[var(--success)]',
                index === activeWorkflowStep && 'is-current font-semibold text-[var(--accent)]',
                index > activeWorkflowStep && 'is-pending text-[var(--text-tertiary)]',
              ]
                .filter(Boolean)
                .join(' ')}
              data-state={
                index < activeWorkflowStep
                  ? 'complete'
                  : index === activeWorkflowStep
                    ? 'current'
                    : 'pending'
              }
            >
              {index + 1}. {step}
            </li>
          ))}
        </ol>

        {isDirty && (
          <p role="status" className="mt-3 text-sm text-[var(--text-secondary)]">
            Borrador local · cambios sin guardar
          </p>
        )}

        {!historyLoading && previousEvolution && (
          <aside
            aria-label="Referencia de la última evolución"
            className="mt-5 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xs font-semibold tracking-wider text-[var(--text-secondary)]">
                REFERENCIA DE LA ÚLTIMA EVOLUCIÓN
              </h2>
              <time
                dateTime={previousEvolution.evolution_at}
                className="text-sm text-[var(--text-secondary)]"
              >
                {formatClinicalDateTime(previousEvolution.evolution_at)}
              </time>
            </div>
            <p className="mt-2 line-clamp-3 text-sm text-[var(--text-secondary)]">
              {previousEvolution.preview}
            </p>
          </aside>
        )}

        <section className="mt-8">
          <h2 className="text-xs font-semibold tracking-wider text-[var(--text-secondary)]">
            {generatedDraft ? 'NOTA CLÍNICA ORIGINAL' : 'REGISTRO CLÍNICO INICIAL'}
          </h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Escribe la nota. La IA crea un borrador para revisar.
          </p>
          <textarea
            autoFocus
            aria-label="Nota clínica"
            value={rawNote}
            onChange={changeRawNote}
            onKeyDown={handleShortcut}
            readOnly={workspace === 'generating' || workspace === 'reviewing'}
            rows={10}
            className="mt-3 w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4 outline-none focus:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-60"
          />
          {sourceLength >= SHOW_COUNT_AT && !overLimit && (
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {sourceLength.toLocaleString('es-CL')} / 40.000 caracteres
            </p>
          )}
          {overLimit && (
            <p role="alert" className="mt-1 text-sm text-[var(--danger)]">
              La nota supera el límite de 40.000 caracteres. Reduce el contenido antes de continuar.
            </p>
          )}
          {workspace === 'reviewing' ? (
            <button
              type="button"
              onClick={() => setWorkspace('editing_raw')}
              className="mt-3 text-sm text-[var(--accent)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              Corregir nota y regenerar
            </button>
          ) : (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                disabled={!canGenerate}
                onClick={requestGeneration}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-50"
              >
                {workspace === 'generating'
                  ? 'Redactando...'
                  : generatedDraft
                    ? 'Regenerar borrador'
                    : 'Redactar con IA'}
              </button>
            </div>
          )}
        </section>

        {workspace === 'generating' && !generatedDraft && (
          <section
            role="status"
            aria-label="Redactando borrador"
            className="mt-8 border-t border-[var(--border)] pt-8"
          >
            <div className="skeleton h-4 w-44" />
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {[0, 1, 2, 3, 4].map((item) => (
                <div key={item} className={item < 3 ? 'lg:col-span-2' : ''}>
                  <div className="skeleton h-4 w-32" />
                  <div className="skeleton mt-2 h-24 w-full" />
                </div>
              ))}
            </div>
          </section>
        )}

        {generatedDraft && (
          <section className="mt-8 border-t border-[var(--border)] pt-8">
            <h2 className="text-xs font-semibold tracking-wider text-[var(--text-secondary)]">
              BORRADOR PARA REVISAR
            </h2>
            {draft.review_flags.length > 0 && (
              <section
                className="mt-4 rounded-lg border border-[var(--warning-border)] bg-[var(--warning-bg)] p-4"
                aria-labelledby="review-flags-title"
              >
                <h3 id="review-flags-title" className="text-sm font-semibold text-[var(--warning)]">
                  Revisa estos puntos
                </h3>
                <ul className="mt-2 space-y-2 text-sm text-[var(--text-primary)]">
                  {draft.review_flags.map((flag) => (
                    <li key={`${flag.source_text}-${flag.reason}`}>
                      <q>{flag.source_text}</q> · {flag.reason}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {fields.map(({ key, label }) => (
                <label
                  key={key}
                  className={
                    key === 'context' || key === 'findings' || key === 'assessment'
                      ? 'lg:col-span-2'
                      : ''
                  }
                >
                  <span className="text-sm text-[var(--text-secondary)]">{label}</span>
                  <textarea
                    value={draft[key]}
                    onChange={(event) => changeClinicalField(key, event.target.value)}
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3 outline-none focus:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  />
                </label>
              ))}
            </div>
            {!hasClinicalContent && (
              <p className="mt-5 text-sm text-[var(--warning)]">
                No hay contenido clínico para guardar. Corrige la nota y vuelve a redactar, o
                completa manualmente al menos un campo.
              </p>
            )}
            {isDraftStale && (
              <p
                id="stale-draft-message"
                role="status"
                className="mt-5 text-sm text-[var(--warning)]"
              >
                El borrador quedó desactualizado porque cambiaste la nota original. Regenera antes
                de guardar.
              </p>
            )}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
              {patient && (
                <p className="text-sm text-[var(--text-secondary)]">
                  Guardar para {patient.first_name} {patient.last_name} · RUT {patient.rut_masked}
                </p>
              )}
              <button
                type="button"
                disabled={!canSave}
                onClick={() => void save()}
                aria-describedby={isDraftStale ? 'stale-draft-message' : undefined}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-50"
              >
                {saving ? 'Guardando evolución...' : 'Guardar evolución'}
              </button>
            </div>
          </section>
        )}

        <div aria-live="polite" className="mt-4 text-sm text-[var(--text-secondary)]">
          {workspace === 'generating' ? 'Redactando...' : saving ? 'Guardando evolución...' : error}
          {error && (
            <button
              type="button"
              onClick={error.includes('guardar') ? () => void save() : requestGeneration}
              className="ml-3 text-[var(--accent)] underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              Reintentar
            </button>
          )}
        </div>
      </div>

      {leavePromptOpen && blocker.state === 'blocked' && (
        <div
          ref={leaveDialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="leave-evolution-title"
          aria-describedby="leave-evolution-description"
          onKeyDown={handleLeaveDialogKeyDown}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setLeavePromptOpen(false);
              blocker.reset?.();
            }
          }}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4"
        >
          <div className="my-auto w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-6 shadow-2xl">
            <h2 id="leave-evolution-title" className="text-lg font-semibold">
              ¿Salir sin guardar?
            </h2>
            <p
              id="leave-evolution-description"
              className="mt-3 text-sm text-[var(--text-secondary)]"
            >
              La nota y los cambios de esta evolución se perderán.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                ref={leaveCancelRef}
                type="button"
                onClick={() => {
                  setLeavePromptOpen(false);
                  blocker.reset?.();
                }}
                className="rounded border border-[var(--border)] px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                Continuar editando
              </button>
              <button
                type="button"
                onClick={() => {
                  setLeavePromptOpen(false);
                  blocker.proceed?.();
                }}
                className="rounded bg-[var(--accent)] px-3 py-2 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                Salir sin guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmRegeneration && (
        <div
          ref={regenerationDialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="regenerate-title"
          aria-describedby="regenerate-description"
          onKeyDown={handleRegenerationDialogKeyDown}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setConfirmRegeneration(false);
          }}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4"
        >
          <div className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-6 shadow-2xl">
            <h2 id="regenerate-title" className="text-lg font-semibold">
              Regenerar evolución
            </h2>
            <p id="regenerate-description" className="mt-3 text-sm text-[var(--text-secondary)]">
              Realizaste cambios en la evolución redactada. Al regenerar, esos cambios serán
              reemplazados por un nuevo borrador.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                ref={regenerationCancelRef}
                type="button"
                onClick={() => setConfirmRegeneration(false)}
                className="rounded border border-[var(--border)] px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void runGeneration()}
                className="rounded bg-[var(--accent)] px-3 py-2 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                Regenerar
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
