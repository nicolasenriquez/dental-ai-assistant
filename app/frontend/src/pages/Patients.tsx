import { ArrowDown, ArrowUp, Plus, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PatientFormModal } from '../components/PatientFormModal';
import { PatientDirectoryResults } from '../components/patients/PatientDirectoryResults';
import { Button } from '../components/ui/Button';
import { usePatientDirectory } from '../hooks/usePatientDirectory';
import { type Patient, createPatient, getPatients, searchPatients } from '../lib/api';

const SORTS = [
  'last_name_asc',
  'last_name_desc',
  'first_name_asc',
  'first_name_desc',
  'last_evolution_asc',
  'last_evolution_desc',
];
const control =
  'min-h-11 min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';

export function Patients() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { query, setQuery, setReturnSearch } = usePatientDirectory();
  const sort = SORTS.includes(params.get('sort') ?? '')
    ? (params.get('sort') as string)
    : 'last_name_asc';
  const filter = ['all', 'with', 'without'].includes(params.get('evolutions') ?? '')
    ? (params.get('evolutions') as string)
    : 'all';
  const field = sort.slice(0, sort.lastIndexOf('_'));
  const direction = sort.endsWith('_desc') ? 'desc' : 'asc';
  const safeSearch = `?sort=${sort}&evolutions=${filter}`;
  useEffect(() => setReturnSearch(safeSearch), [safeSearch, setReturnSearch]);

  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const requestId = useRef(0);
  const loadedOnce = useRef(false);
  const load = async (search = query): Promise<void> => {
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
    // Invalidate immediately, including during debounce and unmount.
    ++requestId.current;
    const timer = window.setTimeout(() => void load(query), 250);
    return () => {
      window.clearTimeout(timer);
      ++requestId.current;
    };
  }, [query]);

  const visible = patients
    .filter(
      (patient) => filter === 'all' || (filter === 'with') === Boolean(patient.last_evolution_at),
    )
    .sort((a, b) => {
      let order = 0;
      if (field === 'last_evolution') {
        if (!a.last_evolution_at && b.last_evolution_at) return 1;
        if (a.last_evolution_at && !b.last_evolution_at) return -1;
        order =
          (a.last_evolution_at ? Date.parse(a.last_evolution_at) : 0) -
          (b.last_evolution_at ? Date.parse(b.last_evolution_at) : 0);
      } else
        order = a[field as 'first_name' | 'last_name'].localeCompare(
          b[field as 'first_name' | 'last_name'],
          'es',
        );
      return (direction === 'desc' ? -order : order) || a.id.localeCompare(b.id);
    });
  const changeControls = (nextSort = sort, nextFilter = filter): void =>
    setParams({ sort: nextSort, evolutions: nextFilter });

  return (
    <main className="min-h-full bg-background p-6 text-foreground md:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Pacientes</h1>
            <p className="mt-1 text-sm text-muted">
              Gestiona pacientes y sus evoluciones dentales.
            </p>
          </div>
          <Button
            variant="primary"
            aria-label="+ Nuevo paciente"
            onClick={() => setModalOpen(true)}
          >
            <Plus aria-hidden="true" size={18} /> <span>Nuevo paciente</span>
          </Button>
        </header>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="w-full min-w-0 md:max-w-[480px] md:flex-1 md:basis-80">
            <label htmlFor="patient-search" className="mb-1 block text-sm text-muted">
              Buscar por nombre, teléfono o RUT
            </label>
            <div className="relative">
              <Search
                aria-hidden="true"
                size={18}
                className="pointer-events-none absolute left-3 top-3 text-muted"
              />
              <input
                id="patient-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                maxLength={200}
                placeholder="Buscar por nombre, teléfono o RUT..."
                aria-describedby="patient-search-help"
                className={`${control} w-full pl-10 pr-11`}
              />
              {query && (
                <button
                  type="button"
                  aria-label="Limpiar búsqueda"
                  title="Limpiar búsqueda"
                  onClick={() => setQuery('')}
                  className="absolute right-0 top-0 flex size-11 items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <X aria-hidden="true" size={18} />
                </button>
              )}
            </div>
          </div>
          <label className="flex min-w-0 flex-col gap-1 text-sm text-muted">
            Evoluciones
            <select
              value={filter}
              onChange={(event) => changeControls(sort, event.target.value)}
              className={control}
            >
              <option value="all">Todas</option>
              <option value="with">Con evoluciones</option>
              <option value="without">Sin evoluciones</option>
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-sm text-muted">
            Ordenar por
            <select
              value={field}
              onChange={(event) => changeControls(`${event.target.value}_${direction}`)}
              className={control}
            >
              <option value="last_name">Apellidos</option>
              <option value="first_name">Nombres</option>
              <option value="last_evolution">Última evolución</option>
            </select>
          </label>
          <button
            type="button"
            aria-label={direction === 'asc' ? 'Orden descendente' : 'Orden ascendente'}
            title={direction === 'asc' ? 'Orden descendente' : 'Orden ascendente'}
            className={`${control} flex size-11 items-center justify-center`}
            onClick={() => changeControls(`${field}_${direction === 'asc' ? 'desc' : 'asc'}`)}
          >
            {direction === 'asc' ? (
              <ArrowUp aria-hidden="true" size={18} />
            ) : (
              <ArrowDown aria-hidden="true" size={18} />
            )}
          </button>
        </div>
        <p id="patient-search-help" className="mb-3 text-xs text-muted">
          Nombre, teléfono o RUT. Para un RUT completo, incluye guion y DV.
        </p>
        <p role="status" className="mb-3 text-sm text-muted">
          {loading
            ? 'Buscando pacientes…'
            : refreshing
              ? 'Actualizando pacientes…'
              : `${visible.length} ${visible.length === 1 ? 'paciente' : 'pacientes'}`}
          {error && patients.length > 0 ? ' · Resultados anteriores' : ''}
        </p>
        {error && patients.length > 0 && (
          <div role="alert" className="mb-3 rounded-lg border border-border bg-surface p-3 text-sm">
            <p className="font-medium">No pudimos actualizar la lista</p>
            <p className="mt-1 text-muted">Mostramos los resultados anteriores.</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-2 min-h-11 text-primary underline"
            >
              Reintentar
            </button>
          </div>
        )}
        <section
          className="overflow-hidden rounded-lg border border-border bg-surface"
          aria-live="polite"
          aria-busy={loading || refreshing}
        >
          {loading ? (
            <div role="status" aria-label="Cargando pacientes" className="space-y-px">
              {[0, 1, 2, 3].map((row) => (
                <div key={row} className="flex gap-6 border-b border-border p-4">
                  <div className="skeleton h-4 flex-1" />
                  <div className="skeleton h-4 w-24" />
                </div>
              ))}
            </div>
          ) : error && patients.length === 0 ? (
            <div role="alert" className="p-8 text-center text-danger">
              <p>No pudimos buscar pacientes</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-3 min-h-11 text-primary underline"
              >
                Reintentar
              </button>
            </div>
          ) : visible.length === 0 ? (
            <div className="p-8 text-center text-muted">
              {query.trim() || filter !== 'all' ? (
                <>
                  <p className="font-medium">
                    {query.trim()
                      ? `No encontramos pacientes para «${query.trim()}»`
                      : 'No hay pacientes con este filtro'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      changeControls(sort, 'all');
                    }}
                    className="mt-3 min-h-11 text-primary underline"
                  >
                    Mostrar todos
                  </button>
                </>
              ) : (
                <>
                  <p className="font-medium">Aún no hay pacientes</p>
                  <p className="mt-2 text-sm">
                    Crea una ficha para comenzar a registrar evoluciones.
                  </p>
                </>
              )}
            </div>
          ) : (
            <PatientDirectoryResults patients={visible} />
          )}
        </section>
      </div>
      <PatientFormModal
        open={modalOpen}
        mode="create"
        onClose={() => setModalOpen(false)}
        onSubmit={(values) => createPatient({ ...values, rut: values.rut ?? '' })}
        onSuccess={(patient) => navigate(`/patients/${patient.id}`)}
      />
    </main>
  );
}
