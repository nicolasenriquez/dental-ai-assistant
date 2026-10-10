import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { TransitionGuardProvider } from '../../hooks/useTransitionGuard';
import type { PatientCondition, PatientTreatment, TreatmentVariant } from '../../lib/api';
import { PatientDiagnosis } from './PatientDiagnosis';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  catalog: vi.fn(),
  exact: vi.fn(),
  revisions: vi.fn(),
  create: vi.fn(),
  edit: vi.fn(),
  correct: vi.fn(),
  treatmentList: vi.fn(),
  treatmentCatalog: vi.fn(),
  treatmentRead: vi.fn(),
  treatmentHistory: vi.fn(),
  treatmentCreate: vi.fn(),
  treatmentEdit: vi.fn(),
  treatmentCorrect: vi.fn(),
}));
vi.mock('../../lib/api', async () => ({
  ...(await vi.importActual('../../lib/api')),
  getPatientConditions: mocks.list,
  getConditionCatalog: mocks.catalog,
  getPatientCondition: mocks.exact,
  getPatientConditionRevisions: mocks.revisions,
  createPatientCondition: mocks.create,
  updatePatientCondition: mocks.edit,
  correctPatientCondition: mocks.correct,
  getPatientTreatments: mocks.treatmentList,
  getTreatmentCatalog: mocks.treatmentCatalog,
  getPatientTreatment: mocks.treatmentRead,
  getPatientTreatmentRevisions: mocks.treatmentHistory,
  createPatientTreatment: mocks.treatmentCreate,
  updatePatientTreatment: mocks.treatmentEdit,
  correctPatientTreatment: mocks.treatmentCorrect,
}));

const condition: PatientCondition = {
  id: '00000000-0000-4000-8000-000000000036',
  patient_id: 'p',
  dentition: 'permanent',
  tooth_fdi: 36,
  condition_code: 'caries',
  surfaces: ['M'],
  note: null,
  status: 'active',
  revision: 1,
  created_by: { user_id: 'u', display_name: null },
  updated_by: { user_id: 'u', display_name: null },
  created_at: '2026-10-03T12:00:00Z',
  updated_at: '2026-10-03T12:00:00Z',
};
const treatment: PatientTreatment = {
  id: '00000000-0000-4000-8000-000000000016',
  patient_id: 'p',
  variant_id: 'ORTO-BRACK',
  label_es: 'Bracket individual (reposición)',
  catalog_version: 'dental-clinical-v1',
  clinical_type: 'bracket',
  category_key: 'orthodontics',
  scope: 'tooth',
  arch: null,
  dentition: 'permanent',
  teeth: [{ tooth_fdi: 16, role: 'tooth', surfaces: [] }],
  note: null,
  state: 'existing',
  provenance: 'observed_existing',
  revision: 1,
  supersedes_id: null,
  replacement_id: null,
  created_by: { user_id: 'u', display_name: null },
  updated_by: { user_id: 'u', display_name: null },
  created_at: '2026-10-06T12:00:00Z',
  updated_at: '2026-10-06T12:00:00Z',
};
const variants: TreatmentVariant[] = [
  ['ORTO-BRACK', 'Bracket individual (reposición)', 'orthodontics', 'bracket'],
  ['REST-BRIDGE-MC', 'Puente metal-cerámica', 'restorative', 'bridge'],
].map(([id, label_es, category_key, clinical_type]) => ({
  id,
  label_es,
  category_key,
  clinical_type,
  scope: clinical_type === 'bridge' ? 'multi_tooth' : 'tooth',
  enabled: true,
  disabled_reason: null,
  surface_codes: [],
  allowed_dentitions: ['permanent', 'primary'],
  visual_family: 'lateral',
  icon_key: clinical_type,
  palette_role: 'restorative',
  layer_role: 'restorative',
}));

beforeEach(() => {
  vi.clearAllMocks();
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.catalog.mockResolvedValue({
    version: 1,
    conditions: [{ code: 'caries', label_es: 'Caries', surface_codes: ['M', 'D', 'O', 'V', 'L'] }],
  });
  mocks.list.mockResolvedValue({ items: [condition], total: 1, next_cursor: null });
  mocks.exact.mockResolvedValue(condition);
  mocks.revisions.mockResolvedValue({ items: [], total: 0, next_cursor: null });
  mocks.treatmentCatalog.mockResolvedValue({
    version: 'dental-clinical-v1',
    variants,
    findings: [],
    categories: [
      { key: 'diagnosis', label_es: 'Diagnóstico' },
      { key: 'restorative', label_es: 'Restauradora' },
    ],
  });
  mocks.treatmentList.mockResolvedValue({ items: [], total: 0, next_cursor: null });
  mocks.treatmentRead.mockResolvedValue(treatment);
  mocks.treatmentHistory.mockResolvedValue({ items: [], total: 0, next_cursor: null });
  mocks.treatmentEdit.mockResolvedValue({ committed: treatment });
  mocks.treatmentCreate.mockResolvedValue({ committed: treatment });
});

function mount(props: { focusedConditionId?: string; focusedTreatmentId?: string } = {}): void {
  render(
    <MemoryRouter>
      <TransitionGuardProvider>
        <PatientDiagnosis patientId="p" {...props} />
      </TransitionGuardProvider>
    </MemoryRouter>,
  );
}

function pressedTeeth(): HTMLElement[] {
  return screen
    .getAllByRole('button')
    .filter(
      (button) =>
        /^Pieza \d+:/.test(button.getAttribute('aria-label') ?? '') &&
        button.getAttribute('aria-pressed') === 'true',
    );
}

function backdropOf(dialog: HTMLElement): HTMLElement {
  return dialog.parentElement as HTMLElement;
}

function clickOutsideAndBlur(dialog: HTMLElement): void {
  fireEvent.pointerDown(backdropOf(dialog));
  (document.activeElement as HTMLElement | null)?.blur();
}

it('keeps an Activity-linked record as a reference without an operative pressed tooth', async () => {
  mount({ focusedConditionId: condition.id });
  const linked = await screen.findByRole('article', { name: 'Pieza 36 · Caries · Activa' });

  expect(screen.getByRole('button', { name: /^Pieza 36:/ })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  expect(document.querySelector('[data-linked-highlight="36"]')).not.toBeNull();

  act(() => screen.getByRole('button', { name: /^Pieza 11:/ }).focus());
  fireEvent.click(screen.getByRole('button', { name: /^Pieza 11:/ }));
  const inspection = await screen.findByRole('dialog', { name: 'Pieza 11' });
  expect(screen.getByRole('button', { name: /^Pieza 11:/ })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  fireEvent.click(within(inspection).getByRole('button', { name: 'Cerrar pieza' }));

  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Pieza 11' })).toBeNull());
  expect(document.querySelector('[data-linked-highlight="36"]')).not.toBeNull();
  expect(linked).toBeVisible();
  expect(pressedTeeth()).toHaveLength(0);
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.edit).not.toHaveBeenCalled();
  expect(mocks.correct).not.toHaveBeenCalled();
});

it('opens and closes ordinary inspection without pressure, writes or a focus trap', async () => {
  mount();
  await screen.findByRole('button', { name: 'Caries' });
  const tooth = screen.getByRole('button', { name: /^Pieza 36:/ });
  act(() => tooth.focus());
  fireEvent.click(tooth);
  const inspection = await screen.findByRole('dialog', { name: 'Pieza 36' });

  expect(inspection).not.toHaveAttribute('aria-modal');
  expect(tooth).toHaveAttribute('aria-pressed', 'false');
  fireEvent.keyDown(inspection, { key: 'Escape' });

  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Pieza 36' })).toBeNull());
  expect(tooth).toHaveFocus();
  expect(mocks.create).not.toHaveBeenCalled();
});

it('closes a surface modal with Escape after an outside click leaves focus on the body', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Caries' }));
  const tooth = screen.getByRole('button', { name: /^Pieza 16:/ });
  act(() => tooth.focus());
  fireEvent.click(tooth);
  const modal = await screen.findByRole('dialog', { name: 'Seleccionar superficies' });

  clickOutsideAndBlur(modal);
  expect(document.activeElement).toBe(document.body);
  fireEvent.keyDown(document.body, { key: 'Escape' });

  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Seleccionar superficies' })).toBeNull(),
  );
  expect(screen.getByRole('button', { name: 'Caries' })).toHaveAttribute('aria-pressed', 'false');
  await waitFor(() => expect(tooth).toHaveFocus());
  expect(mocks.create).not.toHaveBeenCalled();
});

it('keeps Tab and Shift+Tab inside a modal whose focus moved to the body', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Caries' }));
  fireEvent.click(screen.getByRole('button', { name: /^Pieza 16:/ }));
  const modal = await screen.findByRole('dialog', { name: 'Seleccionar superficies' });

  clickOutsideAndBlur(modal);
  fireEvent.keyDown(document.body, { key: 'Tab' });
  await waitFor(() => expect(modal.contains(document.activeElement)).toBe(true));

  const tabbables = Array.from(
    modal.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
    ),
  );
  expect(tabbables.length).toBeGreaterThan(1);
  expect(document.activeElement).toBe(tabbables[0]);
  fireEvent.keyDown(tabbables[0], { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(tabbables[tabbables.length - 1]);
  fireEvent.keyDown(tabbables[tabbables.length - 1], { key: 'Tab' });
  expect(document.activeElement).toBe(tabbables[0]);
  expect(mocks.create).not.toHaveBeenCalled();
});

it('protects a dirty saved-record draft when Escape arrives from the document body', async () => {
  mount({ focusedTreatmentId: treatment.id });
  const modal = await screen.findByRole('dialog', { name: 'Editar procedimiento' });
  fireEvent.change(screen.getByLabelText('Nota de procedimiento'), {
    target: { value: 'Nota sin guardar' },
  });

  clickOutsideAndBlur(modal);
  fireEvent.keyDown(document.body, { key: 'Escape' });

  expect(await screen.findByRole('dialog', { name: 'Condición sin guardar' })).toBeVisible();
  expect(screen.getByLabelText('Nota de procedimiento')).toHaveValue('Nota sin guardar');
  expect(mocks.treatmentEdit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));

  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Condición sin guardar' })).toBeNull(),
  );
  expect(screen.getByLabelText('Nota de procedimiento')).toHaveValue('Nota sin guardar');
  expect(mocks.treatmentEdit).not.toHaveBeenCalled();
});

it('preserves a frozen uncertain command when the close decision is canceled', async () => {
  mount({ focusedTreatmentId: treatment.id });
  const modal = await screen.findByRole('dialog', { name: 'Editar procedimiento' });
  mocks.treatmentEdit.mockRejectedValueOnce(new TypeError('Response lost'));
  fireEvent.change(screen.getByLabelText('Nota de procedimiento'), {
    target: { value: 'Nota incierta' },
  });
  fireEvent.click(within(modal).getByRole('button', { name: 'Guardar procedimiento' }));
  await waitFor(() => expect(mocks.treatmentEdit).toHaveBeenCalledTimes(1));
  const frozen = mocks.treatmentEdit.mock.calls[0][2];

  clickOutsideAndBlur(modal);
  fireEvent.keyDown(document.body, { key: 'Escape' });

  expect(await screen.findByRole('dialog', { name: 'Condición sin guardar' })).toBeVisible();
  expect(screen.getByText(/La operación pudo guardarse/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
  fireEvent.click(within(modal).getByRole('button', { name: 'Reintentar operación' }));

  await waitFor(() => expect(mocks.treatmentEdit).toHaveBeenCalledTimes(2));
  expect(mocks.treatmentEdit.mock.calls[1][2]).toEqual(frozen);
  expect(mocks.correct).not.toHaveBeenCalled();
});

it('runs the scope cancel decision from the body without losing members or an in-flight command', async () => {
  mount();
  mocks.treatmentCreate.mockReturnValue(new Promise(() => {}));
  fireEvent.click(await screen.findByRole('button', { name: 'Restauradora' }));
  fireEvent.click(screen.getByRole('button', { name: 'Puente metal-cerámica' }));
  fireEvent.click(screen.getByRole('button', { name: /^Pieza 15:/ }));
  fireEvent.click(screen.getByRole('button', { name: /^Pieza 17:/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Revisar selección' }));
  const scope = await screen.findByRole('dialog', {
    name: 'Confirmar procedimiento en varias piezas',
  });
  fireEvent.click(within(scope).getByRole('button', { name: 'Confirmar' }));
  await waitFor(() => expect(mocks.treatmentCreate).toHaveBeenCalledTimes(1));

  clickOutsideAndBlur(scope);
  fireEvent.keyDown(document.body, { key: 'Escape' });

  expect(await screen.findByRole('dialog', { name: 'Condición sin guardar' })).toBeVisible();
  expect(screen.getByText(/Seleccionadas: 15, 16, 17/)).toBeVisible();
  expect(scope).toBeVisible();
  expect(screen.getByRole('button', { name: 'Seguir editando' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Descartar condición' })).toBeDisabled();
  expect(mocks.treatmentCreate).toHaveBeenCalledTimes(1);
});

it('clears multi-piece members and the range anchor without disarming the tool or writing', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Restauradora' }));
  const bridge = screen.getByRole('button', { name: 'Puente metal-cerámica' });
  fireEvent.click(bridge);
  expect(screen.queryByRole('button', { name: 'Limpiar selección' })).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: /^Pieza 15:/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Limpiar selección' }));
  expect(screen.getByText(/Seleccionadas: ninguna/)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Limpiar selección' })).toBeNull();
  expect(bridge).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Selección por rango' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  fireEvent.click(screen.getByRole('button', { name: /^Pieza 17:/ }));
  fireEvent.click(screen.getByRole('button', { name: /^Pieza 18:/ }));
  expect(screen.getByText(/Seleccionadas: 17, 18/)).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: 'Limpiar selección' }));
  fireEvent.click(screen.getByRole('button', { name: 'Selección libre' }));
  fireEvent.click(screen.getByRole('button', { name: /^Pieza 14:/ }));
  fireEvent.click(screen.getByRole('button', { name: /^Pieza 16:/ }));
  expect(screen.getByText(/Seleccionadas: 14, 16/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Limpiar selección' }));
  expect(screen.getByText(/Seleccionadas: ninguna/)).toBeVisible();
  expect(bridge).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Selección libre' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  fireEvent.click(screen.getByRole('button', { name: /^Pieza 16:/ }));
  expect(screen.getByText(/Seleccionadas: 16/)).toBeVisible();
  expect(mocks.treatmentCreate).not.toHaveBeenCalled();
});
