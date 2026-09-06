import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../lib/api';
import { Patients } from './Patients';

describe('Patients birth-date dialog', () => {
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

    const birthDate = screen.getByLabelText('Fecha de nacimiento');

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
    fireEvent.change(screen.getByPlaceholderText('Buscar por nombre o RUT...'), {
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
    fireEvent.change(screen.getByLabelText('Fecha de nacimiento'), {
      target: { value: '02/01/1990' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear paciente' }));

    await waitFor(() =>
      expect(createPatient).toHaveBeenCalledWith({
        first_name: 'Ana',
        last_name: 'Perez',
        rut: '12.345.678-5',
        birth_date: '1990-01-02',
      }),
    );
  });

  it('shows derived age and masked RUT in patient rows', async () => {
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
    expect(row).toHaveTextContent('RUT 12.***.***-*');
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
    const search = screen.getByPlaceholderText('Buscar por nombre o RUT...');
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

    expect(await screen.findByText('Ingresa un RUT válido.')).toBeVisible();
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
    fireEvent.change(screen.getByLabelText('Fecha de nacimiento'), {
      target: { value: '31/02/1990' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear paciente' }));

    expect(await screen.findByText('Ingresa una fecha válida')).toBeVisible();
    expect(screen.getByLabelText('Fecha de nacimiento')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('RUT')).not.toHaveAttribute('aria-invalid');

    fireEvent.change(screen.getByLabelText('Fecha de nacimiento'), {
      target: { value: '10041990' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear paciente' }));

    expect(await screen.findByText('No pudimos crear el paciente.')).toBeVisible();
    expect(screen.getByLabelText('Nombres')).toHaveValue('Ana María');
    expect(screen.getByLabelText('Apellidos')).toHaveValue('Pérez');
    expect(screen.getByLabelText('Fecha de nacimiento')).toHaveValue('10/04/1990');
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
