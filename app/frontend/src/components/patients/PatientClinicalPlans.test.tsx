import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../lib/api';
import { PatientClinicalPlans } from './PatientClinicalPlans';

vi.mock('../../lib/api', async (original) => ({
  ...(await original<typeof api>()),
  getClinicalPlans: vi.fn(),
  getTreatmentCatalog: vi.fn(),
  createClinicalPlan: vi.fn(),
  getClinicalPlan: vi.fn(),
  addClinicalPlanItem: vi.fn(),
  transitionClinicalPlan: vi.fn(),
  editClinicalPlan: vi.fn(),
  getClinicalPlanRevisions: vi.fn(),
}));

const fixture: api.ClinicalPlan = {
  id: 'plan',
  patient_id: 'patient',
  title: 'Plan guardado',
  diagnosis: null,
  internal_notes: null,
  state: 'draft',
  revision: 1,
  items: [],
  created_by: 'owner',
  updated_by: 'owner',
  created_at: '2026-10-06T12:00:00Z',
  updated_at: '2026-10-06T12:00:00Z',
  confirmed_at: null,
  confirmed_by: null,
  accepted_at: null,
  accepted_by: null,
  acceptance_note: null,
  closed_at: null,
  closed_by: null,
  closure_reason: null,
  closure_note: null,
};

describe('patient plan authoring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getClinicalPlans).mockResolvedValue({ items: [], total: 0, next_cursor: null });
    vi.mocked(api.getTreatmentCatalog).mockResolvedValue({
      version: 'test',
      categories: [],
      variants: [],
      findings: [],
    });
  });
  it('saves a dirty draft once before continuing to another saved plan', async () => {
    vi.mocked(api.getClinicalPlans).mockResolvedValue({
      items: [fixture],
      total: 1,
      next_cursor: null,
    });
    vi.mocked(api.getClinicalPlan).mockResolvedValue(fixture);
    vi.mocked(api.createClinicalPlan).mockResolvedValue({
      operation_id: 'op',
      resource_id: 'new-plan',
      revision: 1,
      changed_resources: [],
      committed: { ...fixture, id: 'new-plan', title: 'Nuevo borrador' },
    });
    render(<PatientClinicalPlans patientId="patient" />);
    await screen.findByRole('button', { name: 'Plan guardado · Borrador' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Título del plan' }), {
      target: { value: 'Nuevo borrador' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Plan guardado · Borrador' }));
    const dialog = screen.getByRole('dialog', { name: 'Cambios sin guardar' });
    expect(api.createClinicalPlan).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar y continuar' }));
    await screen.findByRole('heading', { name: 'Plan guardado' });
    expect(api.createClinicalPlan).toHaveBeenCalledTimes(1);
    expect(api.createClinicalPlan).toHaveBeenCalledWith(
      'patient',
      expect.objectContaining({ title: 'Nuevo borrador', expected_revision: 0 }),
    );
  });
  it('retains a planned procedure draft when conflict review reveals a closed plan', async () => {
    vi.mocked(api.getClinicalPlans).mockResolvedValue({
      items: [fixture],
      total: 1,
      next_cursor: null,
    });
    vi.mocked(api.getClinicalPlan).mockResolvedValue(fixture);
    vi.mocked(api.getTreatmentCatalog).mockResolvedValue({
      version: 'test',
      categories: [{ key: 'orthodontics', label_es: 'Ortodoncia' }],
      findings: [],
      variants: [
        {
          id: 'ORTO-BRACK',
          label_es: 'Bracket individual',
          category_key: 'orthodontics',
          clinical_type: 'bracket',
          scope: 'tooth',
          surface_codes: [],
          allowed_dentitions: ['permanent', 'primary'],
          visual_family: 'bracket',
          icon_key: 'bracket',
          palette_role: 'orthodontic',
          layer_role: 'orthodontic',
          enabled: true,
          disabled_reason: null,
        },
      ],
    });
    vi.mocked(api.addClinicalPlanItem).mockRejectedValue(
      new api.ApiError(409, {
        detail: {
          code: 'revision_conflict',
          latest: { ...fixture, state: 'closed', revision: 2, closure_reason: 'expired' },
        },
      }),
    );
    render(<PatientClinicalPlans patientId="patient" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Plan guardado · Borrador' }));
    fireEvent.change(await screen.findByRole('combobox', { name: 'Procedimiento' }), {
      target: { value: 'ORTO-BRACK' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Pieza 16:/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nota del procedimiento' }), {
      target: { value: 'Texto local pendiente' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Añadir procedimiento' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Revisar versión guardada' }));
    await screen.findByText('Cerrado · Revisión 2');
    expect(screen.getByRole('textbox', { name: 'Nota del procedimiento' })).toHaveValue(
      'Texto local pendiente',
    );
    expect(screen.getByRole('button', { name: 'Añadir procedimiento' })).toBeDisabled();
    expect(api.addClinicalPlanItem).toHaveBeenCalledTimes(1);
  });
  it('archives a completed plan without reopening or exposing editing controls', async () => {
    const completed: api.ClinicalPlan = {
      id: 'plan',
      patient_id: 'patient',
      title: 'Plan completado',
      diagnosis: null,
      internal_notes: null,
      state: 'completed',
      revision: 4,
      items: [],
      created_by: 'owner',
      updated_by: 'owner',
      created_at: '2026-10-06T12:00:00Z',
      updated_at: '2026-10-06T12:00:00Z',
      confirmed_at: null,
      confirmed_by: null,
      accepted_at: null,
      accepted_by: null,
      acceptance_note: null,
      closed_at: null,
      closed_by: null,
      closure_reason: null,
      closure_note: null,
    };
    vi.mocked(api.getClinicalPlans).mockResolvedValue({
      items: [completed],
      total: 1,
      next_cursor: null,
    });
    vi.mocked(api.getClinicalPlan).mockResolvedValue(completed);
    vi.mocked(api.transitionClinicalPlan).mockResolvedValue({
      operation_id: 'op',
      resource_id: 'plan',
      revision: 5,
      changed_resources: [],
      committed: { ...completed, state: 'archived', revision: 5 },
    });
    render(<PatientClinicalPlans patientId="patient" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Plan completado · Completado' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Archivar plan' }));
    expect(screen.queryByRole('button', { name: 'Reabrir plan' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar datos del plan' })).not.toBeInTheDocument();
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Archivar plan' })).getByRole('button', {
        name: 'Archivar plan',
      }),
    );
    await screen.findByText('Archivado · Revisión 5');
    expect(
      screen.queryByRole('form', { name: 'Procedimiento planificado' }),
    ).not.toBeInTheDocument();
    expect(api.transitionClinicalPlan).toHaveBeenCalledWith('patient', 'plan', {
      action: 'archive',
      body: { operation_id: expect.any(String), expected_revision: 4 },
    });
  });
  it('requires explicit clinical acceptance and preserves lost-response identity', async () => {
    const pending: api.ClinicalPlan = {
      id: 'plan',
      patient_id: 'patient',
      title: 'Aceptación manual',
      diagnosis: null,
      internal_notes: null,
      state: 'pending',
      revision: 2,
      items: [],
      created_by: 'owner',
      updated_by: 'owner',
      created_at: '2026-10-06T12:00:00Z',
      updated_at: '2026-10-06T12:00:00Z',
      confirmed_at: '2026-10-06T12:00:00Z',
      confirmed_by: 'owner',
      accepted_at: null,
      accepted_by: null,
      acceptance_note: null,
      closed_at: null,
      closed_by: null,
      closure_reason: null,
      closure_note: null,
    };
    vi.mocked(api.getClinicalPlans).mockResolvedValue({
      items: [pending],
      total: 1,
      next_cursor: null,
    });
    vi.mocked(api.getClinicalPlan).mockResolvedValue(pending);
    const active = {
      ...pending,
      state: 'active' as const,
      revision: 3,
      accepted_at: '2026-10-06T12:10:00Z',
      accepted_by: 'owner',
      acceptance_note: 'Explicado al paciente',
    };
    vi.mocked(api.transitionClinicalPlan)
      .mockRejectedValueOnce(new Error('Response lost'))
      .mockResolvedValueOnce({
        operation_id: 'op',
        resource_id: 'plan',
        revision: 3,
        changed_resources: [],
        committed: active,
      });
    render(<PatientClinicalPlans patientId="patient" />);
    fireEvent.click(await screen.findByRole('button', { name: /Aceptación manual · Pendiente/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar aceptación' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nota de aceptación (opcional)' }), {
      target: { value: 'Explicado al paciente' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Revisar acción' }));
    const dialog = screen.getByRole('dialog', { name: 'Registrar aceptación' });
    expect(within(dialog).getByText(/No representa una firma/)).toBeInTheDocument();
    expect(api.transitionClinicalPlan).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar aceptación' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar misma operación' }));
    await screen.findByText('En curso · Revisión 3');
    expect(api.transitionClinicalPlan).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.transitionClinicalPlan).mock.calls[0]).toEqual(
      vi.mocked(api.transitionClinicalPlan).mock.calls[1],
    );
    expect(screen.getByText(/Aceptación registrada/)).toHaveTextContent('Explicado al paciente');
    expect(screen.queryByRole('button', { name: 'Registrar aceptación' })).not.toBeInTheDocument();
  });
  it('keeps local metadata for explicit stale-revision recovery', async () => {
    const plan: api.ClinicalPlan = {
      id: 'plan',
      patient_id: 'patient',
      title: 'Guardado',
      diagnosis: null,
      internal_notes: null,
      state: 'draft',
      revision: 1,
      items: [],
      created_by: 'owner',
      updated_by: 'owner',
      created_at: '2026-10-06T12:00:00Z',
      updated_at: '2026-10-06T12:00:00Z',
      confirmed_at: null,
      confirmed_by: null,
      accepted_at: null,
      accepted_by: null,
      acceptance_note: null,
      closed_at: null,
      closed_by: null,
      closure_reason: null,
      closure_note: null,
    };
    vi.mocked(api.getClinicalPlans).mockResolvedValue({
      items: [plan],
      total: 1,
      next_cursor: null,
    });
    vi.mocked(api.getClinicalPlan).mockResolvedValue(plan);
    vi.mocked(api.editClinicalPlan).mockRejectedValueOnce(
      new api.ApiError(409, {
        detail: {
          code: 'revision_conflict',
          latest: { ...plan, title: 'Otra sesión', revision: 2 },
        },
      }),
    );
    render(<PatientClinicalPlans patientId="patient" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Guardado · Borrador' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Editar datos del plan' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Título del plan' }), {
      target: { value: 'Mi texto local' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar plan' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Revisar versión guardada' }));
    expect(screen.getByRole('textbox', { name: 'Título del plan' })).toHaveValue('Mi texto local');
    expect(screen.getByRole('heading', { name: 'Otra sesión' })).toBeInTheDocument();
    expect(api.editClinicalPlan).toHaveBeenCalledTimes(1);
  });
  it('creates one draft and resumes its committed detail without another create', async () => {
    const plan: api.ClinicalPlan = {
      id: 'plan',
      patient_id: 'patient',
      title: 'Plan de prueba',
      diagnosis: null,
      internal_notes: null,
      state: 'draft',
      revision: 1,
      items: [],
      created_by: 'owner',
      updated_by: 'owner',
      created_at: '2026-10-06T12:00:00Z',
      updated_at: '2026-10-06T12:00:00Z',
      confirmed_at: null,
      confirmed_by: null,
      accepted_at: null,
      accepted_by: null,
      acceptance_note: null,
      closed_at: null,
      closed_by: null,
      closure_reason: null,
      closure_note: null,
    };
    vi.mocked(api.createClinicalPlan).mockResolvedValue({
      operation_id: 'op',
      resource_id: 'plan',
      revision: 1,
      changed_resources: [],
      committed: plan,
    });
    vi.mocked(api.getClinicalPlan).mockResolvedValue(plan);
    render(<PatientClinicalPlans patientId="patient" />);
    await screen.findByText('No hay planes clínicos');
    fireEvent.change(screen.getByLabelText('Título del plan'), {
      target: { value: 'Plan de prueba' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear borrador' }));
    await screen.findByRole('heading', { name: 'Plan de prueba' });
    expect(api.createClinicalPlan).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Volver a planes' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Plan de prueba/ })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /Plan de prueba/ }));
    await screen.findByRole('heading', { name: 'Plan de prueba' });
    expect(api.createClinicalPlan).toHaveBeenCalledTimes(1);
  });
});
