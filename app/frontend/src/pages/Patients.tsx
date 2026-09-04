import { type FormEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ApiError,
  type CreatePatientBody,
  type Patient,
  createPatient,
  getPatients,
  searchPatients,
} from '../lib/api';
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
  const [error, setError] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const requestId = useRef(0);

  const load = async (search = query) => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(false);
    try {
      const result = search.trim() ? await searchPatients(search) : await getPatients();
      if (currentRequest === requestId.current) setPatients(result);
    } catch {
      if (currentRequest === requestId.current) setError(true);
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
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

        <h2 className="text-xs font-semibold tracking-wider text-[var(--text-secondary)] mb-2">
          PACIENTES
        </h2>
        <section
          className="bg-[var(--surface-1)] border border-[var(--border)] rounded-lg overflow-hidden"
          aria-live="polite"
        >
          {loading ? (
            <div className="p-8 text-center text-[var(--text-secondary)]">
              Cargando pacientes...
            </div>
          ) : error ? (
            <div role="alert" className="p-8 text-center text-[var(--danger)]">
              <p>No pudimos buscar pacientes</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-3 text-[var(--accent)] underline"
              >
                Reintentar
              </button>
            </div>
          ) : patients.length === 0 ? (
            <div className="p-8 text-center text-[var(--text-secondary)]">
              <p>{query.trim() ? 'No encontramos pacientes' : 'Aun no hay pacientes'}</p>
              {!query.trim() && (
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  className="mt-3 text-[var(--accent)] underline"
                >
                  + Nuevo paciente
                </button>
              )}
            </div>
          ) : (
            patients.map((patient) => (
              <Link
                key={patient.id}
                to={`/patients/${patient.id}`}
                className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 border-b last:border-b-0 border-[var(--border)] hover:bg-[var(--surface-2)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] focus-visible:outline-none"
              >
                <strong className="min-w-48 flex-1">
                  {patient.first_name} {patient.last_name}
                </strong>
                <span className="text-sm text-[var(--text-secondary)]">{patient.rut_masked}</span>
                <span className="text-sm text-[var(--text-secondary)]">
                  {patient.last_evolution_at
                    ? new Date(patient.last_evolution_at).toLocaleString('es-CL')
                    : 'Sin evoluciones'}
                </span>
                <span aria-hidden="true">›</span>
              </Link>
            ))
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
      setForm({ first_name: '', last_name: '', rut: '', birth_date: null });
      rutSelection.current = null;
      setError(null);
      setDuplicate(null);
      firstInput.current?.focus();
    }
  }, [open]);

  useLayoutEffect(() => {
    const selection = rutSelection.current;
    const input = rutInput.current;
    if (!selection || !input) return;

    input.setSelectionRange(selection.start, selection.end);
    rutSelection.current = null;
  });

  if (!open) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      onCreated(await createPatient(form));
    } catch (caught) {
      const existing = duplicatePatient(caught);
      if (existing) setDuplicate(existing);
      else
        setError(
          caught instanceof ApiError && caught.status === 422
            ? 'Formato o DV invalido'
            : 'No pudimos crear el paciente',
        );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="patient-dialog-title"
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
    >
      <form
        onSubmit={submit}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-xl bg-[var(--surface-1)] border border-[var(--border)] rounded-xl p-6 shadow-2xl"
      >
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
                className="px-3 py-2 rounded border border-[var(--border)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => onCreated(duplicate)}
                className="px-3 py-2 rounded bg-[var(--accent)] text-white"
              >
                Abrir paciente
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Crea la ficha basica. Podras agregar una evolucion despues.
            </p>
            <div className="grid md:grid-cols-2 gap-4 mt-5">
              {(
                [
                  ['first_name', 'Nombre', 'text'],
                  ['last_name', 'Apellido', 'text'],
                  ['rut', 'RUT', 'text'],
                  ['birth_date', 'Fecha de nacimiento', 'date'],
                ] as const
              ).map(([name, label, type], index) => (
                <label key={name} className="text-sm">
                  <span className="text-[var(--text-secondary)]">{label}</span>
                  <input
                    ref={
                      name === 'rut' ? rutInput : index === 0 ? firstInput : undefined
                    }
                    required={name !== 'birth_date'}
                    type={type}
                    value={form[name] ?? ''}
                    maxLength={name === 'rut' ? 12 : undefined}
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
                        ? (event) =>
                            setForm((current) => ({
                              ...current,
                              rut: formatRutInput(event.currentTarget.value, true),
                            }))
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
                className="px-3 py-2 rounded border border-[var(--border)]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-3 py-2 rounded bg-[var(--accent)] text-white disabled:opacity-50"
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
