import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PatientFormModal } from '../components/PatientFormModal';
import { getPatientAge } from '../lib/age';
import { type Patient, createPatient, getPatients, searchPatients } from '../lib/api';
import { formatClinicalDateTime } from '../lib/clinicalDate';

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
    <main className="min-h-full bg-[var(--bg)] p-6 text-[var(--text-primary)] md:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Pacientes</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Gestiona pacientes y sus evoluciones dentales.
            </p>
          </div>
          {(loading || patients.length > 0 || query.trim() || error) && (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              + Nuevo paciente
            </button>
          )}
        </header>

        <label className="mb-5 block">
          <span className="sr-only">Buscar por nombre o RUT</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre o RUT..."
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 outline-none focus:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
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
          className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-1)]"
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
              {query.trim() ? (
                <>
                  <p className="font-medium">No encontramos pacientes para «{query.trim()}»</p>
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="mt-3 text-[var(--accent)] underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  >
                    Limpiar búsqueda
                  </button>
                </>
              ) : (
                <>
                  <p className="font-medium">Aún no hay pacientes</p>
                  <p className="mt-2 text-sm">
                    Crea una ficha para comenzar a registrar evoluciones.
                  </p>
                  <button
                    type="button"
                    onClick={() => setModalOpen(true)}
                    className="primary-button mt-4"
                  >
                    + Nuevo paciente
                  </button>
                </>
              )}
            </div>
          ) : (
            patients.map((patient) => {
              const age = getPatientAge(patient.birth_date);

              return (
                <Link
                  key={patient.id}
                  to={`/patients/${patient.id}`}
                  className="patient-list-link border-b border-[var(--border)] px-4 py-3 hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] last:border-b-0"
                >
                  <div>
                    <strong className="block">
                      {patient.first_name} {patient.last_name}
                    </strong>
                    <span className="mt-1 block text-sm text-[var(--text-secondary)]">
                      {age === null ? 'Edad no registrada' : `${age} años`}
                    </span>
                    <span className="mt-1 block text-sm text-[var(--text-secondary)]">
                      RUT {patient.rut_masked}
                    </span>
                  </div>
                  <div className="text-sm text-[var(--text-secondary)]">
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
      <PatientFormModal
        open={modalOpen}
        mode="create"
        onClose={() => setModalOpen(false)}
        onSubmit={(values) =>
          createPatient({
            first_name: values.first_name,
            last_name: values.last_name,
            rut: values.rut ?? '',
            birth_date: values.birth_date,
          })
        }
        onSuccess={(patient) => navigate(`/patients/${patient.id}`)}
      />
    </main>
  );
}
