import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { TransitionGuardProvider } from '../../hooks/useTransitionGuard';
import { ApiError, type PatientTreatment, type TreatmentVariant } from '../../lib/api';
import { PatientDiagnosis } from './PatientDiagnosis';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  catalog: vi.fn(),
  create: vi.fn(),
  edit: vi.fn(),
  correct: vi.fn(),
  history: vi.fn(),
}));
vi.mock('../../lib/api', async () => ({
  ...(await vi.importActual('../../lib/api')),
  getConditionCatalog: vi.fn().mockResolvedValue({
    version: 1,
    conditions: [{ code: 'caries', label_es: 'Caries', surface_codes: ['M', 'D', 'O', 'V', 'L'] }],
  }),
  getPatientConditions: vi.fn().mockResolvedValue({ items: [], total: 0, next_cursor: null }),
  getTreatmentCatalog: mocks.catalog,
  getPatientTreatments: mocks.list,
  createPatientTreatment: mocks.create,
  updatePatientTreatment: mocks.edit,
  correctPatientTreatment: mocks.correct,
  getPatientTreatmentRevisions: mocks.history,
}));

const variants: TreatmentVariant[] = [
  ['ORTO-BRACK', 'Bracket individual (reposición)', 'orthodontics', 'bracket'],
  ['REST-CROWN-MC', 'Corona metal-cerámica', 'restorative', 'crown'],
  ['REST-CROWN-ZIR', 'Corona zirconio', 'restorative', 'crown'],
  ['REST-COMP', 'Obturación composite', 'restorative', 'filling_composite'],
  ['REST-BRIDGE-MC', 'Puente metal-cerámica', 'restorative', 'bridge'],
  ['REST-SPLINT-OCC', 'Férula de descarga', 'restorative', 'splint'],
].map(([id, label_es, category_key, clinical_type]) => ({
  id,
  label_es,
  category_key,
  clinical_type,
  scope:
    clinical_type === 'bridge'
      ? 'multi_tooth'
      : clinical_type === 'splint'
        ? 'global_arch'
        : 'tooth',
  enabled: true,
  disabled_reason: null,
  surface_codes: clinical_type === 'filling_composite' ? ['M', 'D', 'O', 'V', 'L'] : [],
  allowed_dentitions: ['permanent', 'primary'],
  visual_family: 'lateral',
  icon_key: clinical_type,
  palette_role: 'orthodontics',
  layer_role: 'orthodontics',
}));
const saved: PatientTreatment = {
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
beforeEach(() => {
  vi.clearAllMocks();
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.catalog.mockResolvedValue({
    version: 'dental-clinical-v1',
    variants,
    findings: [],
    categories: [
      { key: 'diagnosis', label_es: 'Diagnóstico' },
      { key: 'restorative', label_es: 'Restauradora' },
      { key: 'orthodontics', label_es: 'Ortodoncia' },
    ],
  });
  mocks.list.mockResolvedValue({ items: [], total: 0, next_cursor: null });
  mocks.history.mockResolvedValue({ items: [], total: 0, next_cursor: null });
});
function mount(): void {
  render(
    <MemoryRouter>
      <TransitionGuardProvider>
        <PatientDiagnosis patientId="p" />
      </TransitionGuardProvider>
    </MemoryRouter>,
  );
}

it('applies existing bracket once, retains exact uncertain command and logically undoes', async () => {
  mocks.create
    .mockRejectedValueOnce(new TypeError('Response lost'))
    .mockImplementationOnce(async () => {
      mocks.list.mockResolvedValue({ items: [saved], total: 1, next_cursor: null });
      return { committed: saved };
    });
  mocks.correct.mockResolvedValue({
    committed: { ...saved, revision: 2, state: 'entered_in_error' },
  });
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Ortodoncia' }));
  const tool = screen.getByRole('button', { name: saved.label_es });
  fireEvent.click(tool);
  expect(tool).toHaveAttribute('aria-pressed', 'true');
  expect(mocks.create).not.toHaveBeenCalled();
  const tooth = screen.getByRole('button', { name: /^Pieza 16:/ });
  fireEvent.click(tooth);
  fireEvent.click(await screen.findByRole('button', { name: 'Reintentar operación' }));
  await screen.findByText(/Guardada en ficha: pieza 16/);
  expect(mocks.create.mock.calls[0][1]).toEqual(mocks.create.mock.calls[1][1]);
  expect(mocks.create.mock.calls[0][1]).toMatchObject({
    variant_id: 'ORTO-BRACK',
    expected_revision: 0,
    teeth: [{ tooth_fdi: 16, role: 'tooth', surfaces: [] }],
  });
  expect(tool).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }));
  await waitFor(() =>
    expect(mocks.correct).toHaveBeenCalledWith(
      'p',
      saved.id,
      expect.objectContaining({
        expected_revision: 1,
        reason: 'Deshacer registro',
        replacement: null,
      }),
    ),
  );
});

it('distinguishes crown variants and enables anatomical scopes', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Restauradora' }));
  const metal = screen.getByRole('button', { name: 'Corona metal-cerámica' });
  const zirconia = screen.getByRole('button', { name: 'Corona zirconio' });
  fireEvent.click(metal);
  expect(metal).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(zirconia);
  expect(zirconia).toHaveAttribute('aria-pressed', 'true');
  expect(metal).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('button', { name: 'Puente metal-cerámica' })).toBeEnabled();
  expect(mocks.create).not.toHaveBeenCalled();
});

it('selects a chart range, confirms bridge roles once and preserves shared record identity', async () => {
  const bridge: PatientTreatment = {
    ...saved,
    variant_id: 'REST-BRIDGE-MC',
    label_es: 'Puente metal-cerámica',
    clinical_type: 'bridge',
    scope: 'multi_tooth',
    teeth: [
      { tooth_fdi: 14, role: 'pillar', surfaces: [] },
      { tooth_fdi: 15, role: 'pontic', surfaces: [] },
      { tooth_fdi: 16, role: 'pillar', surfaces: [] },
    ],
  };
  mocks.create.mockImplementation(async () => {
    mocks.list.mockResolvedValue({ items: [bridge], total: 1, next_cursor: null });
    return { committed: bridge };
  });
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Restauradora' }));
  fireEvent.click(screen.getByRole('button', { name: 'Puente metal-cerámica' }));
  fireEvent.click(screen.getByRole('button', { name: /^Pieza 16:/ }));
  fireEvent.click(screen.getByRole('button', { name: /^Pieza 14:/ }));
  expect(mocks.create).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Revisar selección' }));
  const modal = await screen.findByRole('dialog', {
    name: 'Confirmar procedimiento en varias piezas',
  });
  expect(within(modal).getByLabelText('Rol de pieza 15')).toHaveValue('pontic');
  fireEvent.click(within(modal).getByRole('button', { name: 'Confirmar' }));
  await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
  expect(mocks.create.mock.calls[0][1]).toMatchObject({
    variant_id: bridge.variant_id,
    teeth: bridge.teeth,
  });
  expect(await screen.findByText('1 registros en 3 piezas')).toBeVisible();
  for (const tooth of [14, 15, 16]) {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Pieza ${tooth}:`) }));
    const inspector = await screen.findByRole('dialog', { name: `Pieza ${tooth}` });
    expect(inspector).toHaveTextContent(bridge.label_es);
    fireEvent.keyDown(inspector, { key: 'Escape' });
  }
});

it('whole-arch picker writes no FDI, retries exact command and renders separate arch context', async () => {
  const arch: PatientTreatment = {
    ...saved,
    variant_id: 'REST-SPLINT-OCC',
    label_es: 'Férula de descarga',
    clinical_type: 'splint',
    scope: 'global_arch',
    arch: 'upper',
    teeth: [],
  };
  mocks.create
    .mockRejectedValueOnce(new TypeError('Response lost'))
    .mockImplementationOnce(async () => {
      mocks.list.mockResolvedValue({ items: [arch], total: 1, next_cursor: null });
      return { committed: arch };
    });
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Restauradora' }));
  fireEvent.click(screen.getByRole('button', { name: 'Férula de descarga' }));
  const picker = await screen.findByRole('dialog', { name: 'Seleccionar arcada' });
  expect(mocks.create).not.toHaveBeenCalled();
  fireEvent.click(within(picker).getByRole('button', { name: 'Arcada superior' }));
  fireEvent.click(await within(picker).findByRole('button', { name: 'Reintentar operación' }));
  await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
  expect(mocks.create.mock.calls[0][1]).toEqual(mocks.create.mock.calls[1][1]);
  expect(mocks.create.mock.calls[0][1]).toMatchObject({ teeth: [], arch: 'upper' });
  expect(await screen.findByRole('article', { name: /Arcada superior.*Férula/ })).toBeVisible();
  expect(screen.getByText(/1 registros en 0 piezas/)).toHaveTextContent('1 arcadas');
  fireEvent.click(screen.getByRole('button', { name: 'Editar / Historial de procedimiento' }));
  expect(await screen.findByRole('dialog', { name: 'Editar procedimiento' })).toHaveTextContent(
    'Arcada superior',
  );
});

it('free selection rejects mixed arches, guards dentition change and cancels without writes', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Restauradora' }));
  fireEvent.click(screen.getByRole('button', { name: 'Puente metal-cerámica' }));
  fireEvent.click(screen.getByRole('button', { name: 'Selección libre' }));
  fireEvent.click(screen.getByRole('button', { name: /^Pieza 11:/ }));
  fireEvent.click(screen.getByRole('button', { name: /^Pieza 21:/ }));
  fireEvent.click(screen.getByRole('button', { name: /^Pieza 41:/ }));
  expect(screen.getByText('Selecciona piezas de la misma arcada.')).toBeVisible();
  expect(screen.getByRole('button', { name: /^Pieza 41:/ })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Temporal' }));
  const guard = await screen.findByRole('dialog', { name: 'Condición sin guardar' });
  fireEvent.click(within(guard).getByRole('button', { name: 'Seguir editando' }));
  fireEvent.click(screen.getByRole('button', { name: 'Revisar selección' }));
  const modal = await screen.findByRole('dialog', {
    name: 'Confirmar procedimiento en varias piezas',
  });
  fireEvent.change(within(modal).getByLabelText('Rol de pieza 11'), {
    target: { value: 'pontic' },
  });
  fireEvent.change(within(modal).getByLabelText('Rol de pieza 21'), {
    target: { value: 'pontic' },
  });
  expect(within(modal).getByRole('button', { name: 'Confirmar' })).toBeDisabled();
  fireEvent.keyDown(modal, { key: 'Escape' });
  fireEvent.click(await screen.findByRole('button', { name: 'Descartar condición' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(mocks.create).not.toHaveBeenCalled();
});

it('inspection exposes saved procedure; edit preserves local draft on conflict and requires explicit reconciliation', async () => {
  mocks.list.mockResolvedValue({ items: [saved], total: 1, next_cursor: null });
  const latest = { ...saved, revision: 2, note: 'Remote evidence' };
  mocks.edit
    .mockRejectedValueOnce(new ApiError(409, { detail: { code: 'revision_conflict', latest } }))
    .mockResolvedValueOnce({ committed: { ...latest, revision: 3, note: 'Local evidence' } });
  mount();
  await screen.findByRole('button', { name: 'Editar / Historial de procedimiento' });
  fireEvent.click(screen.getByRole('button', { name: /^Pieza 16:/ }));
  const inspector = await screen.findByRole('dialog', { name: 'Pieza 16' });
  expect(inspector).toHaveTextContent(saved.label_es);
  expect(mocks.create).not.toHaveBeenCalled();
  fireEvent.click(within(inspector).getByRole('button', { name: 'Editar / Historial' }));
  const edit = await screen.findByRole('dialog', { name: 'Editar procedimiento' });
  fireEvent.change(within(edit).getByLabelText('Nota de procedimiento'), {
    target: { value: 'Local evidence' },
  });
  fireEvent.click(within(edit).getByRole('button', { name: 'Guardar procedimiento' }));
  await within(edit).findByText(/Versión actual 2/);
  expect(within(edit).getByLabelText('Nota de procedimiento')).toHaveValue('Local evidence');
  expect(within(edit).getByRole('button', { name: 'Guardar procedimiento' })).toBeDisabled();
  fireEvent.click(
    within(edit).getByRole('button', { name: 'Conservar mi borrador sobre versión actual' }),
  );
  fireEvent.click(within(edit).getByRole('button', { name: 'Guardar procedimiento' }));
  await waitFor(() =>
    expect(mocks.edit).toHaveBeenLastCalledWith(
      'p',
      saved.id,
      expect.objectContaining({ expected_revision: 2, note: 'Local evidence' }),
    ),
  );
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Editar procedimiento' })).toBeNull(),
  );
});

it('surface procedure confirms selected codes without creating a finding', async () => {
  mocks.create.mockResolvedValue({
    committed: {
      ...saved,
      variant_id: 'REST-COMP',
      label_es: 'Obturación composite',
      teeth: [{ tooth_fdi: 16, role: 'tooth', surfaces: ['M', 'O'] }],
    },
  });
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Restauradora' }));
  fireEvent.click(screen.getByRole('button', { name: 'Obturación composite' }));
  fireEvent.click(screen.getByRole('button', { name: /^Pieza 16:/ }));
  const modal = await screen.findByRole('dialog', { name: 'Seleccionar superficies' });
  expect(mocks.create).not.toHaveBeenCalled();
  fireEvent.click(within(modal).getByRole('checkbox', { name: 'Mesial (M)' }));
  fireEvent.click(within(modal).getByRole('checkbox', { name: 'Oclusal (O)' }));
  fireEvent.click(within(modal).getByRole('button', { name: 'Confirmar' }));
  await waitFor(() =>
    expect(mocks.create).toHaveBeenCalledWith(
      'p',
      expect.objectContaining({
        variant_id: 'REST-COMP',
        teeth: [{ tooth_fdi: 16, role: 'tooth', surfaces: ['M', 'O'] }],
      }),
    ),
  );
});

it('dirty treatment editor guards close and discards only after explicit choice', async () => {
  mocks.list.mockResolvedValue({ items: [saved], total: 1, next_cursor: null });
  mount();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Editar / Historial de procedimiento' }),
  );
  fireEvent.change(screen.getByLabelText('Nota de procedimiento'), {
    target: { value: 'Unsaved' },
  });
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar procedimiento' })),
  );
  expect(await screen.findByRole('dialog', { name: 'Condición sin guardar' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
  expect(screen.getByLabelText('Nota de procedimiento')).toHaveValue('Unsaved');
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar procedimiento' }));
  fireEvent.click(screen.getByRole('button', { name: 'Descartar condición' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Editar procedimiento' })).toBeNull(),
  );
  expect(mocks.edit).not.toHaveBeenCalled();
});

it('later-page failure keeps procedure evidence and labels counts incomplete until read retry', async () => {
  mocks.list
    .mockResolvedValueOnce({ items: [saved], total: 2, next_cursor: 'next' })
    .mockRejectedValueOnce(new TypeError('Page unavailable'));
  mount();
  await screen.findByText(/Lectura de procedimientos incompleta/);
  expect(screen.getByRole('article', { name: /Pieza 16.*Bracket/ })).toBeVisible();
  expect(screen.getByText(/Lectura incompleta · 1 registros/)).toHaveTextContent(
    'no es un total completo',
  );
  mocks.list.mockResolvedValue({ items: [saved], total: 1, next_cursor: null });
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar procedimientos' }));
  await waitFor(() =>
    expect(screen.queryByText(/Lectura de procedimientos incompleta/)).toBeNull(),
  );
  expect(mocks.create).not.toHaveBeenCalled();
});

it('navigation cannot save an unreviewed correction as a normal edit', async () => {
  mocks.list.mockResolvedValue({ items: [saved], total: 1, next_cursor: null });
  mount();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Editar / Historial de procedimiento' }),
  );
  fireEvent.click(screen.getByText('Corregir registro', { exact: true }));
  fireEvent.change(screen.getByLabelText('Motivo de corrección'), { target: { value: 'Error' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar procedimiento' }));
  const guard = await screen.findByRole('dialog', { name: 'Condición sin guardar' });
  expect(within(guard).getByRole('button', { name: 'Guardar y continuar' })).toBeDisabled();
  expect(mocks.edit).not.toHaveBeenCalled();
  expect(mocks.correct).not.toHaveBeenCalled();
});
