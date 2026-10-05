import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PatientDirectoryProvider, usePatientDirectory } from '../hooks/usePatientDirectory';
import * as api from '../lib/api';
import { Patients } from './Patients';

describe('Patients birth-date dialog', () => {
  it.each([
    ['last_name_asc', ['a', 'b', 'c']],
    ['last_name_desc', ['c', 'a', 'b']],
    ['first_name_asc', ['a', 'b', 'c']],
    ['first_name_desc', ['c', 'a', 'b']],
    ['last_evolution_asc', ['a', 'c', 'b']],
    ['last_evolution_desc', ['c', 'a', 'b']],
    ['unknown', ['a', 'b', 'c']],
  ])('sorts %s with ascending ID ties and missing evolution last', async (sort, expected) => {
    vi.spyOn(api, 'getPatients').mockResolvedValue([
      {
        id: 'c',
        first_name: 'Zulu',
        last_name: 'Zulu',
        rut_masked: 'masked',
        last_evolution_at: '2026-02-01T00:00:00Z',
      },
      {
        id: 'b',
        first_name: 'Ana',
        last_name: 'Alba',
        rut_masked: 'masked',
        last_evolution_at: null,
      },
      {
        id: 'a',
        first_name: 'Ana',
        last_name: 'Alba',
        rut_masked: 'masked',
        last_evolution_at: '2026-01-01T00:00:00Z',
      },
    ]);
    render(
      <MemoryRouter initialEntries={[`/patients?sort=${sort}&evolutions=unknown`]}>
        <Patients />
      </MemoryRouter>,
    );
    await screen.findByText('3 pacientes');
    expect(
      screen.getAllByRole('link').map((link) => link.getAttribute('href')?.split('/').pop()),
    ).toEqual(expected);
    expect(screen.getByLabelText('Evoluciones')).toHaveValue('all');
  });

  it('ignores a stale response during debounce and clears query at session unmount', async () => {
    vi.spyOn(api, 'getPatients').mockResolvedValue([]);
    let resolveOld!: (patients: api.Patient[]) => void;
    vi.spyOn(api, 'searchPatients').mockImplementation((query) =>
      query === 'old'
        ? new Promise((resolve) => {
            resolveOld = resolve;
          })
        : Promise.resolve([]),
    );
    const view = render(
      <MemoryRouter>
        <PatientDirectoryProvider>
          <Patients />
        </PatientDirectoryProvider>
      </MemoryRouter>,
    );
    await screen.findByText('Aún no hay pacientes');
    fireEvent.change(screen.getByLabelText('Buscar por nombre, teléfono o RUT'), {
      target: { value: 'old' },
    });
    await waitFor(() => expect(api.searchPatients).toHaveBeenCalledWith('old'));
    fireEvent.change(screen.getByLabelText('Buscar por nombre, teléfono o RUT'), {
      target: { value: 'new' },
    });
    await act(async () =>
      resolveOld([
        {
          id: 'old',
          first_name: 'Old',
          last_name: 'Result',
          rut_masked: 'masked',
          last_evolution_at: null,
        },
      ]),
    );
    expect(screen.queryByRole('link', { name: /Old Result/ })).not.toBeInTheDocument();
    view.unmount();
    render(
      <MemoryRouter>
        <PatientDirectoryProvider>
          <Patients />
        </PatientDirectoryProvider>
      </MemoryRouter>,
    );
    expect(screen.getByLabelText('Buscar por nombre, teléfono o RUT')).toHaveValue('');
  });
  it('restores private query on return, refetches, and follows safe back/forward state', async () => {
    const rows: api.Patient[] = [
      {
        id: 'patient-1',
        first_name: 'Ana',
        last_name: 'Pérez',
        rut_masked: '••.•••.678-5',
        last_evolution_at: null,
      },
    ];
    vi.spyOn(api, 'getPatients').mockResolvedValue(rows);
    vi.spyOn(api, 'searchPatients').mockResolvedValue(rows);
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    function Detail() {
      const directory = usePatientDirectory();
      return <Link to={`/patients${directory.returnSearch}`}>Volver</Link>;
    }
    function History() {
      const navigate = useNavigate();
      const location = useLocation();
      return (
        <>
          <output data-testid="url">
            {location.pathname + location.search + JSON.stringify(location.state)}
          </output>
          <button type="button" onClick={() => navigate(-1)}>
            Atrás
          </button>
          <button type="button" onClick={() => navigate(1)}>
            Adelante
          </button>
        </>
      );
    }
    render(
      <MemoryRouter initialEntries={['/patients']}>
        <PatientDirectoryProvider>
          <Routes>
            <Route path="/patients" element={<Patients />} />
            <Route path="/patients/:id" element={<Detail />} />
          </Routes>
          <History />
        </PatientDirectoryProvider>
      </MemoryRouter>,
    );
    await screen.findByRole('link', { name: /Ana Pérez/ });
    fireEvent.change(screen.getByLabelText('Buscar por nombre, teléfono o RUT'), {
      target: { value: '123' },
    });
    await waitFor(() => expect(api.searchPatients).toHaveBeenCalledWith('123'));
    fireEvent.change(screen.getByLabelText('Ordenar por'), { target: { value: 'first_name' } });
    fireEvent.change(screen.getByLabelText('Evoluciones'), { target: { value: 'without' } });
    fireEvent.click(screen.getByRole('link', { name: /Ana Pérez/ }));
    fireEvent.click(screen.getByRole('link', { name: 'Volver' }));
    expect(screen.getByLabelText('Buscar por nombre, teléfono o RUT')).toHaveValue('123');
    await waitFor(() => expect(api.searchPatients).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('Evoluciones')).toHaveValue('without');
    fireEvent.click(screen.getByRole('button', { name: 'Orden descendente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Atrás' }));
    expect(screen.getByRole('button', { name: 'Orden descendente' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Adelante' }));
    expect(screen.getByRole('button', { name: 'Orden ascendente' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));
    expect(screen.getByLabelText('Evoluciones')).toHaveValue('without');
    expect(screen.getByTestId('url').textContent).not.toContain('123');
    expect(storage).not.toHaveBeenCalled();
  });

  it('keeps stale links usable on failure and retries without losing query', async () => {
    vi.spyOn(api, 'getPatients').mockResolvedValue([
      {
        id: 'patient-1',
        first_name: 'Ana',
        last_name: 'Pérez',
        rut_masked: 'masked',
        last_evolution_at: null,
      },
    ]);
    const search = vi
      .spyOn(api, 'searchPatients')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue([]);
    render(
      <MemoryRouter>
        <Patients />
      </MemoryRouter>,
    );
    await screen.findByRole('link', { name: /Ana Pérez/ });
    fireEvent.change(screen.getByLabelText('Buscar por nombre, teléfono o RUT'), {
      target: { value: '123' },
    });
    await screen.findByText('No pudimos actualizar la lista');
    expect(screen.getByRole('link', { name: /Ana Pérez/ })).toHaveAttribute(
      'href',
      '/patients/patient-1',
    );
    expect(screen.getByText(/Resultados anteriores/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByText('No encontramos pacientes para «123»');
    expect(search).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('Buscar por nombre, teléfono o RUT')).toHaveValue('123');
  });
  it('filters and sorts complete results with safe URL state and no visible RUT', async () => {
    vi.spyOn(api, 'getPatients').mockResolvedValue([
      {
        id: 'b',
        first_name: 'Ana',
        last_name: 'Zulu',
        rut_masked: '••.•••.678-5',
        last_evolution_at: null,
      },
      {
        id: 'a',
        first_name: 'Bea',
        last_name: 'Alba',
        rut_masked: '••.•••.679-3',
        last_evolution_at: '2026-01-01T00:00:00Z',
      },
    ]);
    function Location() {
      return <output data-testid="url">{useLocation().search}</output>;
    }
    render(
      <MemoryRouter initialEntries={['/patients?sort=first_name_desc&evolutions=with']}>
        <Patients />
        <Location />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('link', { name: /Bea Alba/ })).toBeVisible();
    expect(screen.queryByRole('link', { name: /Ana Zulu/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/••\.•••/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Evoluciones'), { target: { value: 'all' } });
    expect(screen.getByText('2 pacientes')).toBeVisible();
    expect(screen.getByTestId('url')).toHaveTextContent('evolutions=all');
    fireEvent.change(screen.getByLabelText('Ordenar por'), { target: { value: 'last_name' } });
    expect(screen.getByTestId('url')).toHaveTextContent('sort=last_name_desc');
  });
  beforeEach(() => {
    vi.spyOn(api, 'getPatients').mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps dialog open while editing a birth date', () => {
    render(
      <MemoryRouter>
        <Patients />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: '+ Nuevo paciente' }));

    const birthDate = screen.getByLabelText(/Fecha de nacimiento/);

    fireEvent.change(birthDate, { target: { value: '02/01/1990' } });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(birthDate).toHaveValue('02/01/1990');
  });

  it('preserves dialog values while a list refresh is pending', async () => {
    let resolveSearch!: (patients: api.Patient[]) => void;
    const pendingSearch = new Promise<api.Patient[]>((resolve) => {
      resolveSearch = resolve;
    });
    vi.spyOn(api, 'searchPatients').mockReturnValue(pendingSearch);

    render(
      <MemoryRouter>
        <Patients />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.queryByRole('status', { name: 'Cargando pacientes' })).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: '+ Nuevo paciente' }));
    fireEvent.change(screen.getByLabelText('Nombres'), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText('Buscar por nombre, teléfono o RUT'), {
      target: { value: 'ana' },
    });

    await waitFor(() => expect(api.searchPatients).toHaveBeenCalledWith('ana'));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombres')).toHaveValue('Ana');
    expect(screen.getByRole('heading', { name: 'Pacientes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Nuevo paciente' })).toBeInTheDocument();
    expect(screen.getByText('Actualizando pacientes…')).toBeInTheDocument();

    await act(async () => {
      resolveSearch([]);
    });
  });

  it('keeps keyboard focus inside dialog and restores it on close', () => {
    render(
      <MemoryRouter>
        <Patients />
      </MemoryRouter>,
    );

    const trigger = screen.getByRole('button', { name: '+ Nuevo paciente' });
    trigger.focus();
    fireEvent.click(trigger);

    const initial = screen.getByLabelText('Nombres');
    const first = screen.getByRole('button', { name: 'Cerrar' });
    const last = screen.getByRole('button', { name: 'Crear paciente' });

    expect(initial).toHaveFocus();

    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(first).toHaveFocus();

    first.focus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(trigger).toHaveFocus();
  });

  it('closes with Escape and a direct backdrop click', () => {
    render(
      <MemoryRouter>
        <Patients />
      </MemoryRouter>,
    );

    const trigger = screen.getByRole('button', { name: '+ Nuevo paciente' });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('dialog'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('submits normalized RUT', async () => {
    const createPatient = vi.spyOn(api, 'createPatient').mockResolvedValue({
      id: 'patient-1',
      first_name: 'Ana',
      last_name: 'Perez',
      rut_masked: '1.***.***-*',
      last_evolution_at: null,
    });

    render(
      <MemoryRouter>
        <Patients />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: '+ Nuevo paciente' }));
    fireEvent.change(screen.getByLabelText('Nombres'), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText('Apellidos'), { target: { value: 'Perez' } });
    fireEvent.change(screen.getByLabelText('RUT'), { target: { value: '123456785' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear paciente' }));

    await waitFor(() =>
      expect(createPatient).toHaveBeenCalledWith({
        first_name: 'Ana',
        last_name: 'Perez',
        rut: '12.345.678-5',
        birth_date: null,
        phone: null,
        email: null,
      }),
    );
  });

  it('converts the displayed birth date to the API date format', async () => {
    const createPatient = vi.spyOn(api, 'createPatient').mockResolvedValue({
      id: 'patient-1',
      first_name: 'Ana',
      last_name: 'Perez',
      rut_masked: '1.***.***-*',
      last_evolution_at: null,
    });

    render(
      <MemoryRouter>
        <Patients />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: '+ Nuevo paciente' }));
    fireEvent.change(screen.getByLabelText('Nombres'), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText('Apellidos'), { target: { value: 'Perez' } });
    fireEvent.change(screen.getByLabelText('RUT'), { target: { value: '123456785' } });
    fireEvent.change(screen.getByLabelText(/Fecha de nacimiento/), {
      target: { value: '02/01/1990' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear paciente' }));

    await waitFor(() =>
      expect(createPatient).toHaveBeenCalledWith({
        first_name: 'Ana',
        last_name: 'Perez',
        rut: '12.345.678-5',
        birth_date: '1990-01-02',
        phone: null,
        email: null,
      }),
    );
  });

  it('shows derived age without RUT in patient rows', async () => {
    vi.mocked(api.getPatients).mockResolvedValue([
      {
        id: 'patient-1',
        first_name: 'Ana',
        last_name: 'Perez',
        rut_masked: '12.***.***-*',
        last_evolution_at: null,
        birth_date: '1990-01-02',
      },
    ]);

    render(
      <MemoryRouter>
        <Patients />
      </MemoryRouter>,
    );

    const row = await screen.findByRole('link', { name: /Ana Perez/ });
    expect(row).toHaveTextContent(/\d+ años/);
    expect(row).not.toHaveTextContent('RUT');
  });

  it('distinguishes a search with no results and can clear it', async () => {
    vi.mocked(api.getPatients).mockResolvedValue([
      {
        id: 'patient-1',
        first_name: 'Ana',
        last_name: 'Perez',
        rut_masked: '12.***.***-*',
        last_evolution_at: null,
        birth_date: null,
      },
    ]);
    vi.spyOn(api, 'searchPatients').mockResolvedValue([]);

    render(
      <MemoryRouter>
        <Patients />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('link', { name: /Ana Perez/ })).toBeVisible();
    const search = screen.getByLabelText('Buscar por nombre, teléfono o RUT');
    fireEvent.change(search, { target: { value: 'inexistente' } });

    expect(await screen.findByText('No encontramos pacientes para «inexistente»')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));
    expect(search).toHaveValue('');
  });

  it('shows an inline RUT error without submitting an invalid check digit', async () => {
    const createPatient = vi.spyOn(api, 'createPatient');

    render(
      <MemoryRouter>
        <Patients />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: '+ Nuevo paciente' }));
    fireEvent.change(screen.getByLabelText('Nombres'), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText('Apellidos'), { target: { value: 'Perez' } });
    fireEvent.change(screen.getByLabelText('RUT'), { target: { value: '12.345.678-9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear paciente' }));

    expect(
      await screen.findByText('El dígito verificador no coincide. Revisa el RUT.'),
    ).toBeVisible();
    expect(screen.getByLabelText('RUT')).toHaveAttribute('aria-invalid', 'true');
    expect(createPatient).not.toHaveBeenCalled();
  });

  it('places a date error under the date field and preserves normalized values on failure', async () => {
    vi.spyOn(api, 'createPatient').mockRejectedValue(new api.ApiError(500, {}));

    render(
      <MemoryRouter>
        <Patients />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: '+ Nuevo paciente' }));
    fireEvent.change(screen.getByLabelText('Nombres'), { target: { value: ' Ana   María ' } });
    fireEvent.change(screen.getByLabelText('Apellidos'), { target: { value: ' Pérez ' } });
    fireEvent.change(screen.getByLabelText('RUT'), { target: { value: '123456785' } });
    fireEvent.change(screen.getByLabelText(/Fecha de nacimiento/), {
      target: { value: '31/02/1990' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear paciente' }));

    expect(await screen.findByText(/Ingresa una fecha válida/)).toBeVisible();
    expect(screen.getByLabelText(/Fecha de nacimiento/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('RUT')).not.toHaveAttribute('aria-invalid');

    fireEvent.change(screen.getByLabelText(/Fecha de nacimiento/), {
      target: { value: '10041990' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear paciente' }));

    expect(await screen.findByText('No pudimos crear el paciente.')).toBeVisible();
    expect(screen.getByLabelText('Nombres')).toHaveValue('Ana María');
    expect(screen.getByLabelText('Apellidos')).toHaveValue('Pérez');
    expect(screen.getByLabelText(/Fecha de nacimiento/)).toHaveValue('10/04/1990');
  });

  it('blocks duplicate submits while the create request is pending', async () => {
    let resolveCreate!: (patient: api.Patient) => void;
    const createPatient = vi.spyOn(api, 'createPatient').mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );

    render(
      <MemoryRouter>
        <Patients />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: '+ Nuevo paciente' }));
    fireEvent.change(screen.getByLabelText('Nombres'), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText('Apellidos'), { target: { value: 'Perez' } });
    fireEvent.change(screen.getByLabelText('RUT'), { target: { value: '123456785' } });
    const submit = screen.getByRole('button', { name: 'Crear paciente' });
    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => expect(createPatient).toHaveBeenCalledOnce());
    expect(submit).toBeDisabled();
    resolveCreate({
      id: 'patient-1',
      first_name: 'Ana',
      last_name: 'Perez',
      rut_masked: '12.***.***-*',
      last_evolution_at: null,
    });
  });
});
