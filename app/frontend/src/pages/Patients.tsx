import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getPatientAge } from '../lib/age';
import {
  ApiError,
  type CreatePatientBody,
  type Patient,
  createPatient,
  getPatients,
  searchPatients,
} from '../lib/api';
import { formatClinicalDateTime, parseClinicalDateInput } from '../lib/clinicalDate';
import { formatRutInput, formatRutInputWithSelection } from '../lib/rut';

function duplicatePatient(error: unknown): Patient | null {
  if (
    !(error instanceof ApiError) ||
    error.status !== 409 ||
    typeof error.body !== 'object' ||
    !error.body
  ) {
    return null;
  }
  const detail = (error.body as { detail?: { patient?: Patient } }).detail;
  return detail?.patient ?? null;
}

export function Patients() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const requestId = useRef(0);
  const loadedOnce = useRef(false);

  const load = async (search = query) => {
    const currentRequest = ++requestId.current;
    if (loadedOnce.current) setRefreshing(true);
    else setLoading(true);
    setError(false);
    try {
      const result = search.trim() ? await searchPatients(search) : await getPatients();
      if (currentRequest === requestId.current) setPatients(result);
    } catch {
      if (currentRequest === requestId.current) setError(true);
    } finally {
      if (currentRequest === requestId.current) {
        loadedOnce.current = true;
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void load(query), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  return (
    <main className="min-h-full bg-[var(--bg)] text-[var(--text-primary)] p-6 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Pacientes</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Gestiona pacientes y sus evoluciones dentales.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white font-medium focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
          >
            + Nuevo paciente
          </button>
        </header>

        <label className="block mb-5">
          <span className="sr-only">Buscar por nombre o RUT</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre o RUT..."
            className="w-full px-4 py-3 rounded-lg bg-[var(--surface-1)] border border-[var(--border)] outline-none focus:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          />
        </label>

        <div role="status" className="mb-2 min-h-5 text-sm text-[var(--text-secondary)]">
          {refreshing ? 'Actualizando pacientes…' : ''}
        </div>

        {error && patients.length > 0 && (
          <div
            role="alert"
            className="mb-3 rounded-lg border border-[var(--warning-border)] bg-[var(--warning-bg)] p-3 text-sm"
          >
            <p className="font-medium">No pudimos actualizar la lista</p>
            <p className="mt-1 text-[var(--text-secondary)]">
              Mostramos los resultados anteriores.
            </p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-2 text-[var(--accent)] underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              Reintentar
            </button>
          </div>
        )}

        <h2 className="mb-2 text-xs font-semibold tracking-wider text-[var(--text-secondary)]">
          PACIENTES
        </h2>
        <section
          className="bg-[var(--surface-1)] border border-[var(--border)] rounded-lg overflow-hidden"
          aria-live="polite"
          aria-busy={loading || refreshing}
        >
          {loading ? (
            <div role="status" aria-label="Cargando pacientes" className="space-y-px">
              {[0, 1, 2, 3].map((row) => (
                <div
                  key={row}
                  className="flex items-center gap-6 border-b border-[var(--border)] p-4 last:border-b-0"
                >
                  <div className="skeleton h-4 flex-1" />
                  <div className="skeleton h-4 w-24" />
                  <div className="skeleton h-4 w-36" />
                </div>
              ))}
            </div>
          ) : error && patients.length === 0 ? (
            <div role="alert" className="p-8 text-center text-[var(--danger)]">
              <p>No pudimos buscar pacientes</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-3 text-[var(--accent)] underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                Reintentar
              </button>
            </div>
          ) : patients.length === 0 ? (
            <div className="p-8 text-center text-[var(--text-secondary)]">
              <p className="font-medium">
                {query.trim() ? 'No encontramos pacientes' : 'Aún no hay pacientes'}
              </p>
              <p className="mt-2 text-sm">
                {query.trim()
                  ? 'Prueba con otro nombre o RUT.'
                  : 'Crea una ficha para comenzar a registrar evoluciones.'}
              </p>
            </div>
          ) : (
            patients.map((patient) => {
              const age = getPatientAge(patient.birth_date);

              return (
                <Link
                  key={patient.id}
                  to={`/patients/${patient.id}`}
                  className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 border-b last:border-b-0 border-[var(--border)] hover:bg-[var(--surface-2)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] focus-visible:outline-none"
                >
                  <div className="min-w-48 flex-1">
                    <strong className="block">
                      {patient.first_name} {patient.last_name}
                    </strong>
                    {age !== null && (
                      <span className="mt-1 block text-sm text-[var(--text-secondary)]">
                        {age} años
                      </span>
                    )}
                  </div>
                  <div className="min-w-48 text-sm text-[var(--text-secondary)]">
                    <span className="block text-xs font-semibold uppercase tracking-wider">
                      Última evolución
                    </span>
                    {patient.last_evolution_at ? (
                      <time dateTime={patient.last_evolution_at}>
                        {formatClinicalDateTime(patient.last_evolution_at)}
                      </time>
                    ) : (
                      <span>Sin evoluciones</span>
                    )}
                  </div>
                  <span aria-hidden="true">›</span>
                </Link>
              );
            })
          )}
        </section>
      </div>
      <PatientDialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(patient) => navigate(`/patients/${patient.id}`)}
      />
    </main>
  );
}

function PatientDialog({
  open,
  onClose,
  onCreated,
}: { open: boolean; onClose: () => void; onCreated: (patient: Patient) => void }) {
  const firstInput = useRef<HTMLInputElement>(null);
  const rutInput = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const rutSelection = useRef<{ start: number; end: number } | null>(null);
  const [form, setForm] = useState<CreatePatientBody>({
    first_name: '',
    last_name: '',
    rut: '',
    birth_date: null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<Patient | null>(null);

  useEffect(() => {
    if (open) {
      restoreFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setForm({ first_name: '', last_name: '', rut: '', birth_date: null });
      rutSelection.current = null;
      setError(null);
      setDuplicate(null);
      firstInput.current?.focus();
    } else if (restoreFocus.current?.isConnected) {
      restoreFocus.current.focus();
      restoreFocus.current = null;
    }
  }, [open]);

  useLayoutEffect(() => {
    const selection = rutSelection.current;
    const input = rutInput.current;
    if (!selection || !input) return;

    input.setSelectionRange(selection.start, selection.end);
    rutSelection.current = null;
  });

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!submitting) onClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
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

  if (!open) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const birthDate = form.birth_date ?? '';
    const parsedBirthDate = parseClinicalDateInput(birthDate);
    if (!form.first_name.trim() || !form.last_name.trim() || !form.rut.trim()) {
      setError('Completa nombre, apellido y RUT.');
      return;
    }
    if (birthDate.trim() && !parsedBirthDate) {
      setError('Ingresa la fecha como dd/mm/aaaa.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      onCreated(
        await createPatient({
          ...form,
          rut: formatRutInput(form.rut, true),
          birth_date: parsedBirthDate,
        }),
      );
    } catch (caught) {
      const existing = duplicatePatient(caught);
      if (existing) setDuplicate(existing);
      else
        setError(
          caught instanceof ApiError && caught.status === 422
            ? 'Formato o DV inválido'
            : 'No pudimos crear el paciente',
        );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="patient-dialog-title"
      onKeyDown={handleDialogKeyDown}
      onClick={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4"
    >
      <form
        onSubmit={submit}
        noValidate
        className="relative my-auto max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-6 shadow-2xl"
      >
        <button
          type="button"
          aria-label="Cerrar"
          disabled={submitting}
          onClick={onClose}
          className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-lg text-xl text-[var(--text-secondary)] hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-50"
        >
          ×
        </button>
        <h2 id="patient-dialog-title" className="text-lg font-semibold">
          Nuevo paciente
        </h2>
        {duplicate ? (
          <div className="mt-4">
            <p className="font-medium">Este paciente ya existe</p>
            <p className="mt-2 text-[var(--text-secondary)]">
              {duplicate.first_name} {duplicate.last_name} · {duplicate.rut_masked}
            </p>
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 rounded border border-[var(--border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => onCreated(duplicate)}
                className="px-3 py-2 rounded bg-[var(--accent)] text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                Abrir paciente
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Crea la ficha básica. Podrás agregar una evolución después.
            </p>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {(
                [
                  ['first_name', 'Nombre', 'text'],
                  ['last_name', 'Apellido', 'text'],
                  ['rut', 'RUT', 'text'],
                  ['birth_date', 'Fecha de nacimiento', 'text'],
                ] as const
              ).map(([name, label, type], index) => (
                <label key={name} className="text-sm">
                  <span className="text-[var(--text-secondary)]">
                    {label}
                    {name === 'birth_date' ? ' (opcional)' : ''}
                  </span>
                  <input
                    ref={name === 'rut' ? rutInput : index === 0 ? firstInput : undefined}
                    aria-label={name === 'birth_date' ? label : undefined}
                    required={name !== 'birth_date'}
                    type={type}
                    inputMode={name === 'birth_date' ? 'numeric' : undefined}
                    maxLength={name === 'birth_date' ? 10 : undefined}
                    placeholder={name === 'birth_date' ? 'dd/mm/aaaa' : undefined}
                    value={form[name] ?? ''}
                    onChange={(event) => {
                      if (name === 'rut') {
                        const input = event.currentTarget;
                        const selectionStart = input.selectionStart ?? input.value.length;
                        const selectionEnd = input.selectionEnd ?? selectionStart;
                        const formatted = formatRutInputWithSelection(
                          input.value,
                          selectionStart,
                          selectionEnd,
                        );
                        rutSelection.current = {
                          start: formatted.selectionStart,
                          end: formatted.selectionEnd,
                        };
                        setForm((current) => ({ ...current, rut: formatted.value }));
                        return;
                      }

                      const value = event.currentTarget.value;

                      setForm((current) => {
                        if (name === 'birth_date') {
                          return { ...current, birth_date: value || null };
                        }
                        if (name === 'first_name') {
                          return { ...current, first_name: value };
                        }
                        return { ...current, last_name: value };
                      });
                    }}
                    onBlur={
                      name === 'rut'
                        ? (event) => {
                            const value = event.currentTarget.value;
                            setForm((current) => ({
                              ...current,
                              rut: formatRutInput(value, true),
                            }));
                          }
                        : undefined
                    }
                    disabled={submitting}
                    className="mt-1 w-full px-3 py-2 rounded bg-[var(--surface-2)] border border-[var(--border)] outline-none focus:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  />
                </label>
              ))}
            </div>
            {error && (
              <p role="alert" className="mt-4 text-sm text-[var(--danger)]">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-3 py-2 rounded border border-[var(--border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-3 py-2 rounded bg-[var(--accent)] text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-50"
              >
                {submitting ? 'Creando...' : 'Crear paciente'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
