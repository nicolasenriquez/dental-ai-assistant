import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '../lib/api';
import { PatientDetail } from './PatientDetail';

vi.mock('../hooks/useContextualAssistant', () => ({
  useContextualAssistant: () => ({ panelThreadId: 'thread', width: 400, close: vi.fn() }),
}));
vi.mock('../components/clinical-assistant/ContextualAssistant', () => ({
  ContextualAssistant: ({ onChanged }: { onChanged: () => void }) => (
    <button type="button" onClick={onChanged}>
      Refresh from assistant
    </button>
  ),
}));

const patient: api.Patient = {
  id: 'patient-1',
  first_name: 'Ana',
  last_name: 'Perez',
  rut_masked: '12.***.***-*',
  last_evolution_at: '2026-09-04T23:28:00',
  birth_date: '1990-01-02',
};

const evolutionSummary: api.EvolutionSummary = {
  id: 'evolution-1',
  patient_id: patient.id,
  evolution_at: '2026-09-04T23:28:00',
  preview: 'Control clínico sin complicaciones.',
  created_at: '2026-09-04T23:28:00',
};

const evolutionDetail: api.EvolutionDetail = {
  ...evolutionSummary,
  final_text: 'Motivo / contexto: Control clínico.\n\nHallazgos: Sin hallazgos relevantes.',
};

function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="location">
        {location.pathname}
        {location.search}
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

function renderPatient(path: string, state?: Record<string, unknown>) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: path, state }]}>
      <Routes>
        <Route path="/patients/:patientId" element={<PatientDetail />} />
        <Route path="/patients/:patientId/evolutions/:evolutionId" element={<PatientDetail />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe('PatientDetail evolution workspace', () => {
  it('keeps exact evolution detail inside the clinical ficha through tabs and history', async () => {
    mockPatientData();
    vi.spyOn(api, 'getPatientNotes').mockResolvedValue({ items: [], total: 0, next_cursor: null });
    vi.spyOn(api, 'getEvolution').mockResolvedValue(evolutionDetail);
    renderPatient('/patients/patient-1/evolutions/evolution-1');
    const detail = await screen.findByRole('heading', { name: 'Evolución dental' });
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    expect(screen.getByRole('tab', { name: 'Clínica' })).toHaveAttribute('aria-selected', 'true');
    expect(
      within(screen.getByRole('tabpanel', { name: 'Clínica' })).getByRole('heading', {
        name: 'Evolución dental',
      }),
    ).toBe(detail);
    expect(screen.getByRole('button', { name: 'Evoluciones' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Información' }));
    expect(await screen.findByRole('heading', { name: 'Información personal' })).toBeVisible();
    expect(screen.getByTestId('location')).toHaveTextContent('/patients/patient-1?tab=info');
    expect(screen.queryByRole('heading', { name: 'Evolución dental' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Atrás' }));
    expect(await screen.findByRole('heading', { name: 'Evolución dental' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Clínica' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Adelante' }));
    expect(await screen.findByRole('heading', { name: 'Información personal' })).toBeVisible();
  });

  it('uses one history with distinct times for same-day evolutions and retries detail errors', async () => {
    mockPatientData();
    const second = { ...evolutionSummary, id: 'evolution-2', evolution_at: '2026-09-04T10:00:00' };
    vi.mocked(api.getPatientEvolutions).mockResolvedValue([evolutionSummary, second]);
    const getEvolution = vi
      .spyOn(api, 'getEvolution')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ ...evolutionDetail, ...second });
    renderPatient('/patients/patient-1', { preserveHistory: true });
    const links = await screen.findAllByRole('link', { name: /Ver evolución del/ });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAccessibleName('Ver evolución del 04 sep 2026 a las 23:28');
    expect(links[1]).toHaveAccessibleName('Ver evolución del 04 sep 2026 a las 10:00');
    fireEvent.click(links[1]);
    expect(await screen.findByText('No pudimos cargar esta evolución')).toBeVisible();
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Evolución dental' })).toBeVisible();
    expect(getEvolution).toHaveBeenLastCalledWith('evolution-2');
    expect(screen.getByRole('link', { name: /10:00/ })).toHaveAttribute('aria-current', 'page');
  });

  it('preserves a dirty patient form through pending, failed and successful assistant refresh', async () => {
    mockPatientData();
    renderPatient('/patients/patient-1');
    fireEvent.click(await screen.findByRole('button', { name: 'Editar paciente' }));
    const names = screen.getByLabelText('Nombres');
    fireEvent.change(names, { target: { value: 'Borrador' } });
    let reject!: (error: Error) => void;
    vi.mocked(api.getPatient).mockImplementationOnce(
      () =>
        new Promise((_, rejectPromise) => {
          reject = rejectPromise;
        }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Refresh from assistant' }));
    expect(names).toBeInTheDocument();
    expect(names).toHaveValue('Borrador');
    await act(async () => reject(new Error('offline')));
    expect(await screen.findByText(/No pudimos actualizar el paciente/)).toBeVisible();
    expect(names).toBeInTheDocument();
    expect(names).toHaveValue('Borrador');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.queryByText(/No pudimos actualizar el paciente/)).toBeNull());
    expect(names).toBeInTheDocument();
    expect(names).toHaveValue('Borrador');
  });

  it('task 1.4: defaults to Resumen with four keyboard sections and no empty evolution pane', async () => {
    mockPatientData();
    renderPatient('/patients/patient-1');
    await screen.findByRole('heading', { name: 'Ana Perez' });
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Resumen',
      'Información',
      'Clínica',
      'Actividad',
    ]);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(
      screen.queryByRole('heading', { name: 'Selecciona una evolución' }),
    ).not.toBeInTheDocument();
    tabs[0].focus();
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
    expect(tabs[1]).toHaveFocus();
    fireEvent.keyDown(tabs[1], { key: 'End' });
    expect(tabs[3]).toHaveFocus();
    fireEvent.keyDown(tabs[3], { key: 'Home' });
    expect(tabs[0]).toHaveFocus();
  });

  it('keeps an unsaved note mounted while the assistant refreshes patient data', async () => {
    mockPatientData();
    vi.spyOn(api, 'getPatientNotes').mockResolvedValue({ items: [], total: 0, next_cursor: null });
    renderPatient('/patients/patient-1');
    await screen.findByRole('heading', { name: 'Ana Perez' });
    fireEvent.click(screen.getByRole('tab', { name: 'Información' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Nueva nota' }));
    const note = screen.getByRole('textbox', { name: 'Nota general' });
    fireEvent.change(note, { target: { value: 'No perder esta nota' } });
    let resolve!: (value: api.PatientDetail) => void;
    vi.mocked(api.getPatient).mockImplementationOnce(
      () =>
        new Promise((resolvePromise) => {
          resolve = resolvePromise;
        }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Refresh from assistant' }));
    expect(note).toBeInTheDocument();
    await act(async () => resolve({ ...patient, phone: null, email: null }));
    expect(note).toBeInTheDocument();
    expect(note).toHaveValue('No perder esta nota');
  });

  it('task 1.4: discloses contact by focus/tap and masked RUT with Escape dismissal', async () => {
    mockPatientData();
    vi.mocked(api.getPatient).mockResolvedValue({
      ...patient,
      phone: '+56 9 1234 5678',
      email: 'ana@example.com',
    });
    renderPatient('/patients/patient-1');
    await screen.findByRole('heading', { name: 'Ana Perez' });
    const phone = screen.getByRole('button', { name: /teléfono/i });
    fireEvent.focus(phone);
    expect(screen.getByText('+56 9 1234 5678')).toBeVisible();
    fireEvent.keyDown(phone, { key: 'Escape' });
    expect(screen.queryByText('+56 9 1234 5678')).not.toBeInTheDocument();
    fireEvent.click(phone);
    expect(screen.getByText('+56 9 1234 5678')).toBeVisible();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText('+56 9 1234 5678')).not.toBeInTheDocument();
    const mail = screen.getByRole('button', { name: /correo/i });
    fireEvent.mouseEnter(mail);
    expect(screen.getByText('ana@example.com')).toBeVisible();
    fireEvent.mouseLeave(mail);
    const rut = screen.getByRole('button', { name: /RUT/i });
    fireEvent.click(rut);
    expect(screen.getByText(/12\.\*\*\*\.\*\*\*-\*/)).toBeVisible();
    expect(screen.queryByText('12.345.678-5')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar paciente' })).toBeVisible();
    expect(screen.getByRole('link', { name: '+ Nueva evolución' })).toHaveAttribute(
      'href',
      '/patients/patient-1/evolutions/new',
    );
  });

  it('task 1.4: absent or cleared contact hides icons and Información says No registrado', async () => {
    mockPatientData();
    renderPatient('/patients/patient-1');
    await screen.findByRole('heading', { name: 'Ana Perez' });
    expect(screen.queryByRole('button', { name: /teléfono|correo/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Información' }));
    expect(screen.getAllByText('No registrado').length).toBeGreaterThanOrEqual(2);
  });

  it('task 1.4: saved contact clearing refreshes header and Información', async () => {
    mockPatientData();
    vi.mocked(api.getPatient).mockResolvedValue({
      ...patient,
      phone: '123',
      email: 'ana@example.com',
    });
    vi.spyOn(api, 'updatePatient').mockResolvedValue({ ...patient, phone: null, email: null });
    renderPatient('/patients/patient-1');
    await screen.findByRole('heading', { name: 'Ana Perez' });
    expect(screen.getByRole('button', { name: /teléfono/i })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Editar paciente' }));
    fireEvent.change(within(screen.getByRole('dialog')).getByLabelText(/Teléfono/), {
      target: { value: '' },
    });
    fireEvent.change(within(screen.getByRole('dialog')).getByLabelText(/Correo/), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Editar paciente' })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: /teléfono|correo/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Información' }));
    expect(screen.getAllByText('No registrado').length).toBeGreaterThanOrEqual(2);
  });

  it('task 1.4: summary links exact evolution and prioritizes older approval over newer Drive failure', async () => {
    mockPatientData();
    const identity = { id: 'patient-1', display_name: 'Ana Perez', rut_masked: patient.rut_masked };
    const records: api.PendingWorkItem[] = [
      {
        id: 'drive:export',
        kind: 'drive_export_failed',
        patient: identity,
        updated_at: '2026-10-03T12:00:00Z',
        action: { kind: 'retry_drive_export', evolution_id: 'evolution-1', thread_id: null },
      },
      {
        id: 'approval:approval',
        kind: 'approval_required',
        patient: identity,
        updated_at: '2026-10-02T12:00:00Z',
        action: { kind: 'review_approval', action_id: 'approval', thread_id: 'review-thread' },
      },
    ];
    vi.mocked(api.getClinicalPendingWork).mockImplementation((...args) => {
      const kind = ((args as readonly unknown[])[2] as { kind?: string })?.kind;
      return Promise.resolve({
        items: kind ? records.filter((item) => item.kind === kind) : records,
        total: kind === 'approval_required' ? 7 : kind === 'drive_export_failed' ? 9 : 16,
        next_cursor: null,
      });
    });
    renderPatient('/patients/patient-1');
    const summary = await screen.findByRole('region', { name: 'Resumen del paciente' });
    await waitFor(() =>
      expect(
        within(summary).getByRole('link', { name: /Continuar trabajo|Revisar/ }),
      ).toHaveAttribute('href', '/a/review-thread'),
    );
    expect(within(summary).getByRole('link', { name: /04 sep 2026/ })).toHaveAttribute(
      'href',
      '/patients/patient-1/evolutions/evolution-1',
    );
    expect(within(summary).getByRole('region', { name: 'Sincronización con Drive' })).toBeVisible();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockPatientData() {
    vi.spyOn(api, 'getClinicalPendingWork').mockResolvedValue({
      items: [],
      total: 0,
      next_cursor: null,
    });
    vi.spyOn(api, 'getPatient').mockResolvedValue({ ...patient, phone: null, email: null });
    vi.spyOn(api, 'getPatientEvolutions').mockResolvedValue([evolutionSummary]);
  }

  it('keeps overview visible on patient entry without redirecting to an evolution', async () => {
    mockPatientData();
    const getEvolution = vi.spyOn(api, 'getEvolution').mockResolvedValue(evolutionDetail);

    renderPatient('/patients/patient-1');

    expect(await screen.findByRole('region', { name: 'Resumen del paciente' })).toBeVisible();
    expect(screen.getByTestId('location')).toHaveTextContent('/patients/patient-1');
    expect(screen.getByRole('link', { name: /04 sep 2026/ })).toBeVisible();
    expect(screen.getByText(/Nacimiento 02\/01\/1990/)).toBeVisible();
    expect(getEvolution).not.toHaveBeenCalled();
    expect(screen.getByRole('region', { name: 'Resumen del paciente' })).toBeVisible();
  });

  it('keeps the history list when returning from the mobile detail view', async () => {
    mockPatientData();
    const getEvolution = vi.spyOn(api, 'getEvolution');

    renderPatient('/patients/patient-1', { preserveHistory: true });

    expect(await screen.findByRole('heading', { name: 'Historial de evoluciones' })).toBeVisible();
    expect(screen.getByTestId('location')).toHaveTextContent('/patients/patient-1');
    expect(getEvolution).not.toHaveBeenCalled();
  });

  it('keeps history visible when an evolution is selected', async () => {
    mockPatientData();
    vi.spyOn(api, 'getEvolution').mockResolvedValue(evolutionDetail);

    renderPatient('/patients/patient-1/evolutions/evolution-1');

    expect(await screen.findByRole('heading', { name: 'Evolución dental' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Historial de evoluciones' })).toBeVisible();
    expect(screen.getByRole('link', { name: /Ver evolución del/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByText('Motivo / contexto')).toBeVisible();
  });

  it('updates the URL when an evolution is selected from the history', async () => {
    mockPatientData();
    vi.spyOn(api, 'getEvolution').mockResolvedValue(evolutionDetail);

    renderPatient('/patients/patient-1', { preserveHistory: true });

    const evolutionLink = await screen.findByRole('link', { name: /Ver evolución del/ });
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/patients\/patient-1$/);
    fireEvent.click(evolutionLink);

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/patients/patient-1/evolutions/evolution-1',
      );
    });
    expect(await screen.findByText('Motivo / contexto')).toBeVisible();
  });

  it('shows a recoverable not-found state inside the detail panel', async () => {
    mockPatientData();
    vi.spyOn(api, 'getEvolution').mockRejectedValue(new api.ApiError(404, {}));

    renderPatient('/patients/patient-1/evolutions/missing');

    expect(await screen.findByText('No se encontró esta evolución')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Volver al historial' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Historial de evoluciones' })).toBeVisible();

    fireEvent.click(screen.getByRole('link', { name: 'Volver al historial' }));

    expect(await screen.findByRole('heading', { name: 'Historial de evoluciones' })).toBeVisible();
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/patients/patient-1?tab=clinical&clinical=evolutions',
    );
  });

  it('edits patient data without changing the selected history', async () => {
    mockPatientData();
    const updatePatient = vi.spyOn(api, 'updatePatient').mockResolvedValue({
      ...patient,
      first_name: 'Lucia',
      birth_date: '1991-03-04',
    });

    renderPatient('/patients/patient-1', { preserveHistory: true });

    expect(await screen.findByRole('button', { name: 'Editar paciente' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Editar paciente' }));

    expect(screen.getByRole('heading', { name: 'Editar paciente' })).toBeVisible();
    expect(screen.getByLabelText('Nombres')).toHaveValue('Ana');
    expect(screen.getByLabelText(/Fecha de nacimiento/)).toHaveValue('02/01/1990');
    expect(screen.getByText('12.***.***-*')).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'RUT' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Nombres'), { target: { value: 'Lucia' } });
    fireEvent.change(screen.getByLabelText(/Fecha de nacimiento/), {
      target: { value: '04/03/1991' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(updatePatient).toHaveBeenCalledWith('patient-1', {
        first_name: 'Lucia',
        last_name: 'Perez',
        birth_date: '1991-03-04',
        phone: null,
        email: null,
      }),
    );
    expect(await screen.findByRole('heading', { name: 'Lucia Perez' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Editar paciente' })).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/patients/patient-1');
  });

  it('keeps RUT masked and confirms dirty-form close', async () => {
    mockPatientData();

    renderPatient('/patients/patient-1', { preserveHistory: true });
    fireEvent.click(await screen.findByRole('button', { name: 'Editar paciente' }));
    fireEvent.change(screen.getByLabelText('Nombres'), { target: { value: 'Lucia' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.getByRole('dialog', { name: '¿Salir sin guardar?' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));
    expect(screen.getByRole('heading', { name: 'Editar paciente' })).toBeVisible();
    expect(screen.getByLabelText('Nombres')).toHaveValue('Lucia');
    expect(screen.queryByRole('dialog', { name: '¿Salir sin guardar?' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salir sin guardar' }));
    expect(screen.queryByRole('heading', { name: 'Editar paciente' })).not.toBeInTheDocument();
  });

  it('sends a replacement RUT only after explicit confirmation', async () => {
    mockPatientData();
    const updatePatient = vi.spyOn(api, 'updatePatient').mockResolvedValue({
      ...patient,
      rut_masked: '1.***.***-*',
    });

    renderPatient('/patients/patient-1', { preserveHistory: true });
    fireEvent.click(await screen.findByRole('button', { name: 'Editar paciente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar RUT' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'RUT' }), {
      target: { value: '123456785' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(updatePatient).toHaveBeenCalledWith('patient-1', {
        first_name: 'Ana',
        last_name: 'Perez',
        birth_date: '1990-01-02',
        rut: '12.345.678-5',
        phone: null,
        email: null,
      }),
    );
  });
});
