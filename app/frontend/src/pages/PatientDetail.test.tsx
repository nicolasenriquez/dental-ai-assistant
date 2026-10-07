import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TransitionGuardProvider } from '../hooks/useTransitionGuard';
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

describe('PatientDetail URL continuity (S6)', () => {
  const conditionRecord: api.PatientCondition = {
    id: '00000000-0000-4000-8000-000000000036',
    patient_id: 'patient-1',
    dentition: 'permanent',
    tooth_fdi: 36,
    condition_code: 'caries',
    surfaces: ['M'],
    note: 'Nota clínica privada',
    status: 'active',
    revision: 1,
    created_by: { user_id: 'u', display_name: null },
    updated_by: { user_id: 'u', display_name: null },
    created_at: '2026-10-03T12:00:00Z',
    updated_at: '2026-10-03T12:00:00Z',
  };

  function mockClinical() {
    vi.spyOn(api, 'getPatientConditions').mockResolvedValue({
      items: [],
      total: 0,
      next_cursor: null,
    });
    vi.spyOn(api, 'getConditionCatalog').mockResolvedValue({
      version: 1,
      conditions: [
        { code: 'caries', label_es: 'Caries', surface_codes: ['M', 'D', 'O', 'V', 'L'] },
      ],
    });
  }

  function mockPatientDataS6() {
    vi.spyOn(api, 'getClinicalPendingWork').mockResolvedValue({
      items: [],
      total: 0,
      next_cursor: null,
    });
    vi.spyOn(api, 'getPatient').mockResolvedValue({ ...patient, phone: null, email: null });
    vi.spyOn(api, 'getPatientEvolutions').mockResolvedValue([evolutionSummary]);
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderS6(path: string) {
    return render(
      <TransitionGuardProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/patients/:patientId" element={<PatientDetail />} />
            <Route
              path="/patients/:patientId/evolutions/:evolutionId"
              element={<PatientDetail />}
            />
          </Routes>
          <LocationProbe />
        </MemoryRouter>
      </TransitionGuardProvider>,
    );
  }

  beforeEach(() => {
    mockPatientDataS6();
    mockClinical();
    vi.spyOn(api, 'getPatientCondition').mockResolvedValue(conditionRecord);
  });

  it('writes canonical tab/clinical URL from a bare ficha and restores diagnosis on reload', async () => {
    renderS6('/patients/patient-1');
    await screen.findByRole('heading', { name: 'Ana Perez' });
    expect(screen.getByTestId('location')).toHaveTextContent('/patients/patient-1');
    fireEvent.click(screen.getByRole('tab', { name: 'Clínica' }));
    expect(await screen.findByRole('heading', { name: 'Diagnóstico manual' })).toBeVisible();
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/patients/patient-1?tab=clinical&clinical=diagnosis',
    );
    expect(screen.getByRole('button', { name: 'Diagnóstico' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('restores diagnosis from the canonical URL on a fresh load', async () => {
    renderS6('/patients/patient-1?tab=clinical&clinical=diagnosis');
    expect(await screen.findByRole('heading', { name: 'Diagnóstico manual' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Clínica' })).toHaveAttribute('aria-selected', 'true');
  });

  it('restores Evoluciones from an existing clinical=evolutions link', async () => {
    renderS6('/patients/patient-1?tab=clinical&clinical=evolutions');
    expect(await screen.findByRole('heading', { name: 'Historial de evoluciones' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Evoluciones' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('detail path takes precedence over query state', async () => {
    vi.spyOn(api, 'getEvolution').mockResolvedValue(evolutionDetail);
    renderS6('/patients/patient-1/evolutions/evolution-1?tab=info');
    expect(await screen.findByRole('heading', { name: 'Evolución dental' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Clínica' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Evoluciones' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('applies deterministic defaults for unknown enums and never fetches a malformed condition UUID', async () => {
    const exact = vi.mocked(api.getPatientCondition);
    renderS6('/patients/patient-1?tab=clinical&clinical=weird&condition=not-a-uuid');
    expect(await screen.findByRole('heading', { name: 'Diagnóstico manual' })).toBeVisible();
    expect(await screen.findByText('No se encontró esta condición')).toBeVisible();
    expect(exact).not.toHaveBeenCalled();
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/patients/patient-1?tab=clinical&clinical=weird&condition=not-a-uuid',
    );
  });

  it('defaults an unknown tab to Resumen without clinical content', async () => {
    renderS6('/patients/patient-1?tab=weird');
    expect(await screen.findByRole('region', { name: 'Resumen del paciente' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Diagnóstico manual' })).not.toBeInTheDocument();
  });

  it('fetches the focused historical condition UUID only inside diagnosis', async () => {
    const exact = vi.mocked(api.getPatientCondition);
    renderS6(`/patients/patient-1?tab=clinical&clinical=diagnosis&condition=${conditionRecord.id}`);
    expect(await screen.findByRole('heading', { name: 'Diagnóstico manual' })).toBeVisible();
    expect(exact).toHaveBeenCalledWith('patient-1', conditionRecord.id);
    expect(
      await screen.findByRole('article', { name: 'Pieza 36 · Caries · Activa' }),
    ).toBeVisible();
  });

  it('publishes a UI history UUID, restores its historical filter/history on reload and clears it on close', async () => {
    const historical = { ...conditionRecord, status: 'entered_in_error' as const };
    vi.mocked(api.getPatientConditions).mockResolvedValue({
      items: [historical],
      total: 1,
      next_cursor: null,
    });
    vi.mocked(api.getPatientCondition).mockResolvedValue(historical);
    const revisions = vi
      .spyOn(api, 'getPatientConditionRevisions')
      .mockResolvedValue({ items: [], total: 0, next_cursor: null });
    const view = renderS6('/patients/patient-1?tab=clinical&clinical=diagnosis&safe=kept');
    await screen.findByRole('heading', { name: 'Diagnóstico manual' });
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'entered_in_error' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Historial de condición' }));
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(`condition=${historical.id}`),
    );
    const url = screen.getByTestId('location').textContent ?? '';
    expect(url).toContain('safe=kept');
    expect(url).not.toContain(historical.note);
    view.unmount();
    revisions.mockClear();
    renderS6(url);
    expect(await screen.findByRole('article', { name: /Registrada por error/ })).toBeVisible();
    expect(screen.getByLabelText('Estado')).toHaveValue('entered_in_error');
    await waitFor(() =>
      expect(revisions).toHaveBeenCalledWith('patient-1', historical.id, undefined, 50),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Historial de condición' }));
    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).not.toContain('condition='),
    );
  });

  it('guards a UI history transition and keeps both URL and draft when canceled', async () => {
    vi.mocked(api.getPatientConditions).mockResolvedValue({
      items: [conditionRecord],
      total: 1,
      next_cursor: null,
    });
    const write = vi.spyOn(api, 'updatePatientCondition');
    renderS6('/patients/patient-1?tab=clinical&clinical=diagnosis');
    fireEvent.click(await screen.findByRole('button', { name: 'Editar condición' }));
    fireEvent.change(screen.getByLabelText('Nota de condición'), {
      target: { value: 'Pendiente' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Historial de condición' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Seguir editando' }));
    expect(screen.getByLabelText('Nota de condición')).toHaveValue('Pendiente');
    expect(screen.getByTestId('location').textContent).not.toContain('condition=');
    expect(write).not.toHaveBeenCalled();
  });

  it('switching sections drops clinical params while preserving unrelated safe parameters', async () => {
    renderS6('/patients/patient-1?tab=info&note=n');
    await screen.findByRole('heading', { name: 'Ana Perez' });
    fireEvent.click(screen.getByRole('tab', { name: 'Clínica' }));
    expect(await screen.findByRole('heading', { name: 'Diagnóstico manual' })).toBeVisible();
    const clinicalUrl = screen.getByTestId('location').textContent ?? '';
    expect(clinicalUrl).toContain('/patients/patient-1');
    expect(clinicalUrl).toContain('tab=clinical');
    expect(clinicalUrl).toContain('clinical=diagnosis');
    expect(clinicalUrl).toContain('note=n');
    fireEvent.click(screen.getByRole('tab', { name: 'Información' }));
    await screen.findByRole('heading', { name: 'Información personal' });
    expect(screen.getByTestId('location')).toHaveTextContent('/patients/patient-1?tab=info&note=n');
  });

  it('subview switches write the canonical URL and Evoluciones drops the condition focus', async () => {
    renderS6(`/patients/patient-1?tab=clinical&clinical=diagnosis&condition=${conditionRecord.id}`);
    await screen.findByRole('heading', { name: 'Diagnóstico manual' });
    fireEvent.click(screen.getByRole('button', { name: 'Evoluciones' }));
    await screen.findByRole('heading', { name: 'Historial de evoluciones' });
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/patients/patient-1?tab=clinical&clinical=evolutions',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Diagnóstico' }));
    await screen.findByRole('heading', { name: 'Diagnóstico manual' });
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/patients/patient-1?tab=clinical&clinical=diagnosis',
    );
    expect(vi.mocked(api.getPatientCondition)).toHaveBeenCalledTimes(1);
  });

  it('canceled dirty navigation restores the prior URL and accepted discard navigates without writing', async () => {
    const create = vi.spyOn(api, 'createPatientCondition');
    renderS6('/patients/patient-1');
    await screen.findByRole('heading', { name: 'Ana Perez' });
    fireEvent.click(screen.getByRole('tab', { name: 'Clínica' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Caries' }));
    fireEvent.change(screen.getByLabelText('Seleccionar pieza FDI'), { target: { value: '36' } });
    fireEvent.change(screen.getByLabelText('Nota de condición'), { target: { value: 'Borrador' } });
    fireEvent.click(screen.getByRole('button', { name: 'Evoluciones' }));
    expect(await screen.findByRole('dialog', { name: 'Condición sin guardar' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/patients/patient-1?tab=clinical&clinical=diagnosis',
    );
    expect(screen.getByLabelText('Nota de condición')).toHaveValue('Borrador');
    fireEvent.click(screen.getByRole('button', { name: 'Evoluciones' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Descartar condición' }));
    await screen.findByRole('heading', { name: 'Historial de evoluciones' });
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/patients/patient-1?tab=clinical&clinical=evolutions',
    );
    expect(create).not.toHaveBeenCalled();
  });
});
