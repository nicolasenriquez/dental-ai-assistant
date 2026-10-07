import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { TransitionGuardProvider } from '../../hooks/useTransitionGuard';
import { ApiError } from '../../lib/api';
import { normalizeConditionCatalog } from '../../lib/odontogramPresentation';
import { PatientConditionHistory } from './PatientConditionHistory';
import { PatientDiagnosis } from './PatientDiagnosis';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  catalog: vi.fn(),
  create: vi.fn(),
  edit: vi.fn(),
  exact: vi.fn(),
  revisions: vi.fn(),
  correct: vi.fn(),
  treatmentList: vi.fn(),
  treatmentCatalog: vi.fn(),
}));
vi.mock('../../lib/api', async () => ({
  ...(await vi.importActual('../../lib/api')),
  getPatientConditions: mocks.list,
  getConditionCatalog: mocks.catalog,
  createPatientCondition: mocks.create,
  updatePatientCondition: mocks.edit,
  getPatientCondition: mocks.exact,
  getPatientConditionRevisions: mocks.revisions,
  correctPatientCondition: mocks.correct,
  getPatientTreatments: mocks.treatmentList,
  getTreatmentCatalog: mocks.treatmentCatalog,
}));
const record = {
  id: '00000000-0000-4000-8000-000000000001',
  patient_id: 'p',
  dentition: 'permanent',
  tooth_fdi: 36,
  condition_code: 'caries',
  surfaces: ['M'],
  note: 'Guardada',
  status: 'active',
  revision: 1,
  created_by: { user_id: 'u', display_name: null },
  updated_by: { user_id: 'u', display_name: null },
  created_at: '2026-10-03T12:00:00Z',
  updated_at: '2026-10-03T12:00:00Z',
};
afterEach(() => vi.resetAllMocks());
it('starts with current reads and keeps owned evidence/history when catalog fails', async () => {
  mount([record], undefined, () => {
    mocks.catalog.mockRejectedValue(new TypeError('catalog unavailable'));
  });
  await screen.findByText(/No pudimos cargar el catálogo/);
  expect(mocks.list).toHaveBeenCalledWith('p', expect.objectContaining({ status: 'active' }));
  expect(
    await screen.findByRole('article', { name: /Condición no reconocida.*caries/ }),
  ).toBeVisible();
  expect(screen.getByLabelText('Estado')).toHaveValue('active');
  expect(screen.getByText('Usuario u')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Historial de condición' }));
  await waitFor(() => expect(mocks.revisions).toHaveBeenCalled());
  expect(screen.getByRole('button', { name: 'Editar condición' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Resolver condición' })).toBeEnabled();
  expect(mocks.edit).not.toHaveBeenCalled();
});
it('opens an exact error target in its historical filter and guards returning to current', async () => {
  mount([], record.id, () => {
    mocks.exact.mockResolvedValue({
      ...record,
      dentition: 'primary',
      tooth_fdi: 51,
      status: 'entered_in_error',
    });
  });
  await screen.findByRole('article', { name: /Pieza 51.*Registrada por error/ });
  expect(screen.getByLabelText('Estado')).toHaveValue('entered_in_error');
  expect(screen.getByRole('button', { name: 'Temporal' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'active' } });
  await screen.findByText('Sin registros actuales');
  expect(mocks.correct).not.toHaveBeenCalled();
});
function mount(items = [record], focusedConditionId?: string, configure?: () => void): void {
  mocks.treatmentList.mockResolvedValue({ items: [], total: 0, next_cursor: null });
  mocks.treatmentCatalog.mockResolvedValue({
    version: 'dental-clinical-v1',
    categories: [],
    variants: [],
    findings: [],
  });
  mocks.list.mockResolvedValue({ items, total: items.length, next_cursor: null });
  mocks.catalog.mockResolvedValue({
    version: 1,
    conditions: [
      { code: 'caries', label_es: 'Caries', surface_codes: ['M', 'D', 'O', 'V', 'L'] },
      { code: 'missing', label_es: 'Ausente', surface_codes: [] },
      { code: 'pulpitis', label_es: 'Pulpitis', surface_codes: [] },
    ],
  });
  mocks.exact.mockResolvedValue(record);
  mocks.revisions.mockResolvedValue({ items: [], total: 0, next_cursor: null });
  configure?.();
  render(
    <MemoryRouter>
      <TransitionGuardProvider>
        <PatientDiagnosis patientId="p" focusedConditionId={focusedConditionId} />
      </TransitionGuardProvider>
    </MemoryRouter>,
  );
}
it('tooth-first inspection opens anchored context without drafts, writes or lower-form focus', async () => {
  mount();
  await screen.findByRole('button', { name: 'Caries' });
  const tooth = screen.getByRole('button', { name: /^Pieza 36:/ });
  act(() => tooth.focus());
  fireEvent.click(tooth);
  const context = await screen.findByRole('dialog', { name: 'Pieza 36' });
  expect(context).toHaveTextContent('Caries');
  expect(screen.queryByLabelText('Nota de condición')).toBeNull();
  expect(screen.queryByText('Nueva condición')).toBeNull();
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.edit).not.toHaveBeenCalled();
  fireEvent.keyDown(context, { key: 'Escape' });
  expect(tooth).toHaveFocus();
});

it('whole-tooth activation applies once, clears tool and offers logical undo', async () => {
  mount([], undefined, () => {
    mocks.create.mockResolvedValue({
      ...record,
      condition_code: 'pulpitis',
      tooth_fdi: 16,
      surfaces: [],
    });
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Pulpitis' }));
  expect(screen.queryByLabelText('Nota de condición')).toBeNull();
  const tooth = screen.getByRole('button', { name: /^Pieza 16:/ });
  fireEvent.click(tooth);
  fireEvent.click(tooth);
  await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
  expect(mocks.create).toHaveBeenCalledWith(
    'p',
    expect.objectContaining({
      tooth_fdi: 16,
      condition_code: 'pulpitis',
      surfaces: [],
      note: null,
    }),
  );
  expect(await screen.findByRole('button', { name: 'Deshacer' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Pulpitis' })).toHaveAttribute('aria-pressed', 'false');
});

it('lateral surface selection confirms exactly once without extra save', async () => {
  mount([], undefined, () =>
    mocks.create.mockResolvedValue({ ...record, tooth_fdi: 16, surfaces: ['M', 'O'] }),
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Caries' }));
  fireEvent.click(screen.getByRole('button', { name: /^Pieza 16:/ }));
  const modal = await screen.findByRole('dialog', { name: 'Seleccionar superficies' });
  expect(mocks.create).not.toHaveBeenCalled();
  fireEvent.click(within(modal).getByRole('checkbox', { name: 'Mesial (M)' }));
  fireEvent.click(within(modal).getByRole('checkbox', { name: 'Oclusal (O)' }));
  fireEvent.click(within(modal).getByRole('button', { name: 'Confirmar' }));
  await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
  expect(mocks.create.mock.calls[0][1]).toMatchObject({ tooth_fdi: 16, surfaces: ['M', 'O'] });
  expect(screen.queryByRole('button', { name: 'Guardar condición' })).toBeNull();
});

it('occlusal surface activation applies exact surface without selector', async () => {
  mount([], undefined, () => mocks.create.mockResolvedValue({ ...record, tooth_fdi: 16 }));
  fireEvent.click(await screen.findByRole('button', { name: 'Caries' }));
  fireEvent.click(screen.getByRole('button', { name: 'Pieza 16 · Mesial (M)' }));
  await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
  expect(mocks.create.mock.calls[0][1]).toMatchObject({
    tooth_fdi: 16,
    surfaces: ['M'],
    note: null,
  });
  expect(screen.queryByRole('dialog', { name: 'Seleccionar superficies' })).toBeNull();
});

it('undo retains correction identity/reason across response loss and never resolves or deletes', async () => {
  mount([], undefined, () => {
    mocks.create.mockResolvedValue({ ...record, condition_code: 'pulpitis', surfaces: [] });
    mocks.correct
      .mockRejectedValueOnce(new TypeError('lost'))
      .mockResolvedValueOnce({ condition_id: record.id });
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Pulpitis' }));
  fireEvent.click(screen.getByRole('button', { name: /^Pieza 36:/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Deshacer' }));
  await screen.findByRole('button', { name: 'Reintentar operación' });
  const command = mocks.correct.mock.calls[0][2];
  expect(command).toEqual({
    operation_id: expect.any(String),
    expected_revision: 1,
    reason: 'Deshacer registro',
    replacement: null,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar operación' }));
  await waitFor(() => expect(mocks.correct).toHaveBeenCalledTimes(2));
  expect(mocks.correct.mock.calls[1][2]).toEqual(command);
  expect(mocks.edit).not.toHaveBeenCalled();
});

it('surface cancellation and tool Escape clear intent without writing', async () => {
  mount([]);
  fireEvent.click(await screen.findByRole('button', { name: 'Caries' }));
  fireEvent.click(screen.getByRole('button', { name: /^Pieza 16:/ }));
  const modal = screen.getByRole('dialog', { name: 'Seleccionar superficies' });
  fireEvent.keyDown(modal, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('button', { name: 'Caries' })).toHaveAttribute('aria-pressed', 'false');
  expect(mocks.create).not.toHaveBeenCalled();
});
it('uncertain direct application freezes UUID and blocks fresh activation until identical retry', async () => {
  mount([]);
  mocks.create
    .mockRejectedValueOnce(new TypeError('lost'))
    .mockResolvedValueOnce({ ...record, condition_code: 'missing', surfaces: [] });
  fireEvent.click(await screen.findByRole('button', { name: 'Ausente' }));
  fireEvent.click(screen.getByRole('button', { name: /^Pieza 36:/ }));
  await screen.findByRole('button', { name: 'Reintentar operación' });
  expect(screen.getByRole('button', { name: /^Pieza 16:/ })).toBeDisabled();
  const body = mocks.create.mock.calls[0][1];
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar operación' }));
  await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
  expect(mocks.create.mock.calls[1][1]).toEqual(body);
});
it('resolve is a draft until save, cancel preserves record and immutable fields cannot change', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Resolver condición' }));
  expect(mocks.edit).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Seleccionar pieza FDI')).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar condición' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Descartar condición' }));
  expect(mocks.edit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Resolver condición' }));
  mocks.edit.mockResolvedValue({ ...record, status: 'resolved', revision: 2 });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar condición' }));
  await waitFor(() =>
    expect(mocks.edit).toHaveBeenCalledWith(
      'p',
      record.id,
      expect.objectContaining({ expected_revision: 1, status: 'resolved' }),
    ),
  );
});
it('deep target outside page selects dentition; revision conflict compares fields without generic rebase', async () => {
  mount([], record.id);
  fireEvent.click(await screen.findByRole('button', { name: 'Editar condición' }));
  fireEvent.change(screen.getByLabelText('Nota de condición'), { target: { value: 'Local' } });
  mocks.edit
    .mockRejectedValueOnce(new ApiError(409, { detail: { code: 'revision_conflict' } }))
    .mockResolvedValueOnce({ ...record, note: 'Local', surfaces: ['M', 'O'], revision: 3 });
  mocks.exact.mockResolvedValue({ ...record, note: 'Guardada', surfaces: ['M', 'O'], revision: 2 });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar condición' }));
  await screen.findByText('Versión actual: 2');
  expect(screen.getByLabelText('Nota de condición')).toHaveValue('Local');
  expect(screen.queryByRole('button', { name: 'Rebasar mis cambios' })).toBeNull();
  expect(screen.getByText(/Superficies — Base: M · Tuyas: M · Actuales: M, O/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Guardar condición' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Mantener mi nota' }));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar condición' }));
  await waitFor(() =>
    expect(mocks.edit).toHaveBeenLastCalledWith(
      'p',
      record.id,
      expect.objectContaining({ expected_revision: 2, note: 'Local', surfaces: ['M', 'O'] }),
    ),
  );
});

it('disjoint-field conflict requires a local decision and adopts untouched current surfaces', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Editar condición' }));
  fireEvent.change(screen.getByLabelText('Nota de condición'), { target: { value: 'Local' } });
  mocks.edit
    .mockRejectedValueOnce(new ApiError(409, { detail: { code: 'revision_conflict' } }))
    .mockResolvedValueOnce({ ...record, note: 'Local', surfaces: ['M', 'O'], revision: 3 });
  mocks.exact.mockResolvedValue({ ...record, note: 'Guardada', surfaces: ['M', 'O'], revision: 2 });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar condición' }));
  await screen.findByText('Versión actual: 2');
  expect(screen.getByText(/Nota — Base: Guardada · Tuya: Local · Actual: Guardada/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Guardar condición' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Mantener mi nota' }));
  expect(screen.getByRole('button', { name: 'Guardar condición' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Guardar condición' }));
  await waitFor(() =>
    expect(mocks.edit).toHaveBeenLastCalledWith(
      'p',
      record.id,
      expect.objectContaining({ expected_revision: 2, note: 'Local', surfaces: ['M', 'O'] }),
    ),
  );
});

it('same-field conflict requires explicit field choices and never force-writes', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Editar condición' }));
  fireEvent.change(screen.getByLabelText('Nota de condición'), { target: { value: 'Local' } });
  mocks.edit
    .mockRejectedValueOnce(new ApiError(409, { detail: { code: 'revision_conflict' } }))
    .mockResolvedValueOnce({ ...record, note: 'Local', revision: 3 });
  mocks.exact.mockResolvedValue({ ...record, note: 'Remota', revision: 2 });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar condición' }));
  await screen.findByText('Versión actual: 2');
  expect(screen.getByRole('button', { name: 'Guardar condición' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Mantener mi nota' }));
  expect(screen.getByRole('button', { name: 'Guardar condición' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Guardar condición' }));
  await waitFor(() =>
    expect(mocks.edit).toHaveBeenLastCalledWith(
      'p',
      record.id,
      expect.objectContaining({ expected_revision: 2, note: 'Local' }),
    ),
  );
  expect(mocks.edit).toHaveBeenCalledTimes(2);
});

it('same-field surface conflict can adopt current surfaces explicitly', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Editar condición' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Distal (D)' }));
  mocks.edit
    .mockRejectedValueOnce(new ApiError(409, { detail: { code: 'revision_conflict' } }))
    .mockResolvedValueOnce({ ...record, surfaces: ['D'], revision: 3 });
  mocks.exact.mockResolvedValue({ ...record, surfaces: ['O'], revision: 2 });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar condición' }));
  await screen.findByText('Versión actual: 2');
  expect(screen.getByRole('button', { name: 'Guardar condición' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Usar superficies actuales' }));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar condición' }));
  await waitFor(() =>
    expect(mocks.edit).toHaveBeenLastCalledWith(
      'p',
      record.id,
      expect.objectContaining({ expected_revision: 2, surfaces: ['O'], note: 'Guardada' }),
    ),
  );
});

it('second 409 refreshes comparison and retains unsaved content without forcing a write', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Editar condición' }));
  fireEvent.change(screen.getByLabelText('Nota de condición'), { target: { value: 'Local' } });
  mocks.edit.mockRejectedValue(new ApiError(409, { detail: { code: 'revision_conflict' } }));
  mocks.exact
    .mockResolvedValueOnce({ ...record, note: 'Remota', revision: 2 })
    .mockResolvedValueOnce({ ...record, note: 'Remota 2', revision: 3 });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar condición' }));
  await screen.findByText('Versión actual: 2');
  fireEvent.click(screen.getByRole('button', { name: 'Mantener mi nota' }));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar condición' }));
  await screen.findByText('Versión actual: 3');
  expect(mocks.edit).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('button', { name: 'Guardar condición' })).toBeDisabled();
  expect(screen.getByLabelText('Nota de condición')).toHaveValue('Local');
});

it('failed current read blocks renewed edit and retains the draft', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Editar condición' }));
  fireEvent.change(screen.getByLabelText('Nota de condición'), { target: { value: 'Local' } });
  mocks.edit.mockRejectedValue(new ApiError(409, { detail: { code: 'revision_conflict' } }));
  mocks.exact.mockRejectedValue(new TypeError('failed'));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar condición' }));
  await screen.findByText(/No pudimos cargar la versión actual/);
  expect(screen.getByRole('button', { name: 'Guardar condición' })).toBeDisabled();
  expect(screen.getByLabelText('Nota de condición')).toHaveValue('Local');
  fireEvent.click(screen.getByRole('button', { name: 'Cargar versión actual' }));
  await waitFor(() => expect(mocks.exact).toHaveBeenCalledTimes(2));
  expect(screen.getByRole('button', { name: 'Guardar condición' })).toBeDisabled();
  expect(mocks.edit).toHaveBeenCalledTimes(1);
});

it('terminal current blocks edit/rebasing and offers read/discard only', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Editar condición' }));
  fireEvent.change(screen.getByLabelText('Nota de condición'), { target: { value: 'Local' } });
  mocks.edit.mockRejectedValue(new ApiError(409, { detail: { code: 'revision_conflict' } }));
  mocks.exact.mockResolvedValue({
    ...record,
    status: 'resolved',
    note: 'Resuelta en otra sesión',
    revision: 2,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar condición' }));
  await screen.findByText('Versión actual: 2');
  expect(screen.getByText(/No puede editarse/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Guardar condición' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Usar versión actual' })).toBeEnabled();
  expect(mocks.edit).toHaveBeenCalledTimes(1);
});

it('resolve requires renewed confirmation after conflict and uses latest revision', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Resolver condición' }));
  mocks.edit
    .mockRejectedValueOnce(new ApiError(409, { detail: { code: 'revision_conflict' } }))
    .mockResolvedValueOnce({ ...record, status: 'resolved', revision: 3 });
  mocks.exact.mockResolvedValue({ ...record, note: 'Remota', revision: 2 });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar condición' }));
  await screen.findByText('Versión actual: 2');
  expect(screen.getByRole('button', { name: 'Guardar condición' })).toBeDisabled();
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'Confirmar resolución sobre la versión actual' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Guardar condición' }));
  await waitFor(() =>
    expect(mocks.edit).toHaveBeenLastCalledWith(
      'p',
      record.id,
      expect.objectContaining({ expected_revision: 2, status: 'resolved', note: 'Remota' }),
    ),
  );
});

it('loads every page and flags incomplete reads and counts rather than displaying a false empty chart', async () => {
  mount([], undefined, () => {
    mocks.list
      .mockReset()
      .mockResolvedValueOnce({ items: [record], total: 2, next_cursor: 'page2' })
      .mockRejectedValueOnce(new TypeError('read failed'));
  });
  await screen.findByText(/Los datos mostrados pueden estar incompletos/);
  expect(mocks.list).toHaveBeenNthCalledWith(2, 'p', expect.objectContaining({ cursor: 'page2' }));
  expect(await screen.findByRole('article', { name: 'Pieza 36 · Caries · Activa' })).toBeVisible();
  expect(document.body.textContent).toContain(
    'Lectura incompleta · 1 registros en 1 piezas; no es un total completo',
  );
});

it('shows the persisted record actor with UUID fallback and accessible full identifier', async () => {
  const actor = { user_id: '12345678-0000-4000-8000-000000000000', display_name: null };
  mount([{ ...record, updated_by: actor }]);
  expect(await screen.findByText('Usuario 12345678')).toBeVisible();
  expect(screen.getByText(`Identificador de cuenta: ${actor.user_id}`)).toBeInTheDocument();
});

it('expands colliding actor abbreviations while keeping full UUID disclosure', async () => {
  const first = { user_id: '00000000-0000-4000-8000-000000000001', display_name: null };
  const second = { user_id: '00000000-0000-4000-8000-000000000002', display_name: null };
  mount([
    { ...record, id: 'a', updated_by: first },
    { ...record, id: 'b', updated_by: second },
  ]);
  const labels = await screen.findAllByText(/^Usuario /);
  expect(labels.map((node) => node.textContent)).toEqual([
    `Usuario ${first.user_id.replace(/-/g, '')}`,
    `Usuario ${second.user_id.replace(/-/g, '')}`,
  ]);
});

it('renders synthetic supported entries and unknown saved codes through the shared presentation', async () => {
  mount(
    [
      { ...record, id: 'syn', condition_code: 'synthetic' },
      { ...record, id: 'ghost', condition_code: 'ghost', tooth_fdi: 37 },
    ],
    undefined,
    () => {
      mocks.catalog.mockResolvedValue({
        version: 1,
        categories: [{ key: 'diagnosis', label_es: 'Diagnóstico' }],
        conditions: [
          {
            code: 'synthetic',
            label_es: 'Hallazgo de prueba',
            surface_codes: [],
            category_key: 'diagnosis',
            allowed_dentitions: ['permanent', 'primary'],
          },
        ],
      });
    },
  );
  const palette = within(screen.getByLabelText('Condiciones disponibles'));
  expect(await palette.findByRole('button', { name: /Hallazgo de prueba/ })).toBeEnabled();
  expect(screen.getByRole('article', { name: /Condición no reconocida · ghost/ })).toBeVisible();
  expect(screen.getAllByText('Símbolo no disponible').length).toBeGreaterThan(1);
  expect(screen.getByText('Leyenda de conceptos')).toBeInTheDocument();
  const edit = screen.getAllByRole('button', { name: 'Editar condición' });
  expect(edit[0]).toBeEnabled();
  expect(edit[1]).toBeDisabled();
});

it('keeps a saved-record edit on its dentition and clears only after guarded discard', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Editar condición' }));
  fireEvent.change(screen.getByLabelText('Nota de condición'), { target: { value: 'Local' } });
  fireEvent.click(screen.getByRole('button', { name: 'Permanente' }));
  expect(screen.queryByRole('dialog', { name: 'Condición sin guardar' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar condición' }));
  await screen.findByRole('dialog', { name: 'Condición sin guardar' });
  fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
  expect(screen.getByLabelText('Seleccionar pieza FDI')).toHaveValue('36');
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar condición' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Descartar condición' }));
  expect(screen.queryByLabelText('Nota de condición')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Temporal' }));
  expect(screen.getByRole('button', { name: 'Temporal' })).toHaveAttribute('aria-pressed', 'true');
  expect(mocks.create).not.toHaveBeenCalled();
});

it.each([false, true])(
  'shows one pending condition spinner, including continue guard=%s',
  async (guard) => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar condición' }));
    fireEvent.change(screen.getByLabelText('Nota de condición'), { target: { value: 'Local' } });
    let rejectSave!: (error: Error) => void;
    mocks.edit.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectSave = reject;
        }),
    );
    if (guard) fireEvent.click(screen.getByRole('button', { name: 'Cancelar condición' }));
    fireEvent.click(
      screen.getByRole('button', { name: guard ? 'Guardar y continuar' : 'Guardar condición' }),
    );
    const action = guard
      ? screen.getByRole('dialog').querySelector('[aria-busy="true"]')
      : screen.getByRole('button', { name: 'Guardando…' });
    expect(action).toBeDisabled();
    expect(action).toHaveTextContent('Guardando…');
    expect(document.querySelectorAll('.animate-spin')).toHaveLength(1);
    await act(async () => rejectSave(new TypeError('lost')));
    expect(document.querySelector('.animate-spin')).toBeNull();
    expect(screen.getByLabelText('Seleccionar pieza FDI')).toHaveValue('36');
  },
);

it('correction requires reason and reviewed confirmation; cancel never writes', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Corregir registro' }));
  expect(screen.getByRole('button', { name: 'Revisar corrección' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Motivo de corrección'), {
    target: { value: 'Error de registro' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Revisar corrección' }));
  expect(await screen.findByRole('dialog', { name: 'Revisar corrección' })).toHaveTextContent(
    'Pieza 36',
  );
  expect(mocks.correct).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Volver al borrador' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar condición' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Descartar condición' }));
  await waitFor(() => expect(screen.queryByText('Cargando condiciones…')).toBeNull());
  expect(mocks.correct).not.toHaveBeenCalled();
});

it.each([false, true])(
  'freezes reviewed correction and optional replacement=%s for identical uncertain retry',
  async (replacement) => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Corregir registro' }));
    fireEvent.change(screen.getByLabelText('Motivo de corrección'), {
      target: { value: '  Pieza equivocada  ' },
    });
    if (replacement) {
      fireEvent.click(screen.getByRole('checkbox', { name: 'Crear registro de reemplazo' }));
      fireEvent.change(screen.getByLabelText('Seleccionar pieza FDI'), { target: { value: '26' } });
    }
    mocks.correct.mockRejectedValueOnce(new TypeError('lost'));
    fireEvent.click(screen.getByRole('button', { name: 'Revisar corrección' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar corrección' }));
    await screen.findByRole('button', { name: 'Reintentar corrección' });
    expect(screen.getByLabelText('Motivo de corrección')).toBeDisabled();
    const body = mocks.correct.mock.calls[0][2];
    expect(body).toMatchObject({ reason: 'Pieza equivocada', expected_revision: 1 });
    expect(body.replacement).toEqual(
      replacement ? expect.objectContaining({ tooth_fdi: 26 }) : null,
    );
    mocks.correct.mockResolvedValue({
      operation_id: body.operation_id,
      condition_id: record.id,
      correction_revision_id: 'rev-corrected',
      replacement_condition_id: replacement ? body.replacement.id : null,
      replacement_revision_id: replacement ? 'rev-created' : null,
    });
    mocks.exact.mockImplementation(async (_patient, id) => ({
      ...record,
      id,
      status: id === record.id ? 'entered_in_error' : 'active',
      revision: id === record.id ? 2 : 1,
      tooth_fdi: id === record.id ? 36 : 26,
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar corrección' }));
    await screen.findByText('Corrección guardada.');
    expect(mocks.correct.mock.calls[1][2]).toEqual(body);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.edit).not.toHaveBeenCalled();
    expect(
      await screen.findByRole('button', { name: 'Ver revisión original corregida' }),
    ).toBeVisible();
    if (replacement)
      expect(screen.getByRole('button', { name: 'Ver revisión del reemplazo' })).toBeVisible();
  },
);

it('retains correction draft after 404 and requires renewed source review after conflict with resolution', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Corregir registro' }));
  fireEvent.change(screen.getByLabelText('Motivo de corrección'), {
    target: { value: 'Incorrecta' },
  });
  mocks.correct.mockRejectedValueOnce(new ApiError(404, {}));
  fireEvent.click(screen.getByRole('button', { name: 'Revisar corrección' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Guardar corrección' }));
  await screen.findByText(/La condición no está disponible/);
  expect(screen.getByLabelText('Motivo de corrección')).toHaveValue('Incorrecta');
  mocks.correct.mockRejectedValueOnce(new ApiError(409, { detail: { code: 'revision_conflict' } }));
  mocks.exact.mockResolvedValue({
    ...record,
    revision: 2,
    status: 'resolved',
    note: 'Resuelta en otra sesión',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Revisar corrección' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Guardar corrección' }));
  await screen.findByText('Versión actual: 2');
  const old = mocks.correct.mock.calls[1][2];
  fireEvent.click(screen.getByRole('button', { name: 'Revisar nueva corrección' }));
  expect(await screen.findByRole('dialog', { name: 'Revisar corrección' })).toHaveTextContent(
    'Resuelta',
  );
  expect(mocks.correct).toHaveBeenCalledTimes(2);
  mocks.correct.mockRejectedValueOnce(new TypeError('lost again'));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar corrección' }));
  await screen.findByRole('button', { name: 'Reintentar corrección' });
  expect(mocks.correct.mock.calls[2][2]).toMatchObject({
    expected_revision: 2,
    reason: 'Incorrecta',
  });
  expect(mocks.correct.mock.calls[2][2].operation_id).not.toBe(old.operation_id);
});

it('confirmed correction with failed GET retries reads only and retains exact receipt', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Corregir registro' }));
  fireEvent.change(screen.getByLabelText('Motivo de corrección'), {
    target: { value: 'Incorrecta' },
  });
  mocks.correct.mockResolvedValue({
    operation_id: 'op',
    condition_id: record.id,
    correction_revision_id: 'exact',
    replacement_condition_id: null,
    replacement_revision_id: null,
  });
  mocks.exact
    .mockRejectedValueOnce(new TypeError('read failed'))
    .mockResolvedValueOnce({ ...record, status: 'entered_in_error', revision: 2 });
  fireEvent.click(screen.getByRole('button', { name: 'Revisar corrección' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Guardar corrección' }));
  await screen.findByText(/Corrección guardada; no pudimos actualizar el resultado/);
  expect(screen.queryByLabelText('Motivo de corrección')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Ver revisión original corregida' }));
  await screen.findByRole('article', { name: 'Pieza 36 · Caries · Registrada por error' });
  expect(mocks.correct).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'Corregir registro' })).toBeNull();
});

it('exact revision paging preserves pages and retries failed cursor without writes, then focuses exact snapshot', async () => {
  const revision = {
    id: 'latest',
    condition_id: record.id,
    revision: 3,
    action: 'edited',
    before: null,
    after: { ...record, note: 'Latest' },
    actor: record.updated_by,
    changed_at: record.updated_at,
  };
  mocks.revisions
    .mockResolvedValueOnce({ items: [revision], total: 51, next_cursor: 'older' })
    .mockRejectedValueOnce(new TypeError('page lost'))
    .mockResolvedValueOnce({
      items: [
        {
          ...revision,
          id: 'target',
          revision: 1,
          action: 'created',
          after: { ...record, note: 'Exact saved snapshot' },
        },
      ],
      total: 51,
      next_cursor: null,
    });
  render(
    <PatientConditionHistory
      patientId="p"
      conditionId={record.id}
      labels={{ caries: 'Caries' }}
      targetRevisionId="target"
    />,
  );
  await screen.findByText('No pudimos cargar el historial.');
  expect(screen.getByText('Latest')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar historial' }));
  expect(
    await screen.findByRole('article', { name: 'Revisión exacta del resultado' }),
  ).toHaveFocus();
  expect(screen.getByText('Exact saved snapshot')).toBeVisible();
  expect(screen.getByText('Latest')).toBeVisible();
  expect(mocks.revisions).toHaveBeenNthCalledWith(3, 'p', record.id, 'older', 50);
  expect(mocks.correct).not.toHaveBeenCalled();
});

it('resolves history surfaces from the shared catalog and labels the revision actor', async () => {
  const actor = { user_id: '12345678-0000-4000-8000-000000000000', display_name: null };
  mocks.revisions.mockResolvedValue({
    items: [
      {
        id: 'rev',
        condition_id: record.id,
        revision: 1,
        action: 'created',
        before: null,
        after: { ...record, condition_code: 'missing', surfaces: [], status: 'resolved' },
        actor,
        changed_at: record.updated_at,
      },
    ],
    total: 1,
    next_cursor: null,
  });
  render(
    <PatientConditionHistory
      patientId="p"
      conditionId={record.id}
      labels={{}}
      catalog={normalizeConditionCatalog({
        version: 1,
        conditions: [{ code: 'missing', label_es: 'Ausente', surface_codes: [] }],
      })}
    />,
  );
  expect(
    await screen.findByText(/Pieza 36 · Ausente · Pieza completa, sin superficies · Resuelta/),
  ).toBeVisible();
  expect(screen.getByText('Usuario 12345678')).toBeVisible();
  expect(screen.getByText(`Identificador de cuenta: ${actor.user_id}`)).toBeInTheDocument();
});

it('missing exact revision is explicit and never labels latest as receipt snapshot', async () => {
  mocks.revisions.mockResolvedValue({ items: [], total: 0, next_cursor: null });
  render(
    <PatientConditionHistory
      patientId="p"
      conditionId={record.id}
      labels={{}}
      targetRevisionId="missing"
    />,
  );
  expect(await screen.findByText(/La revisión exacta no está disponible/)).toBeVisible();
  expect(screen.queryByRole('article', { name: 'Revisión exacta del resultado' })).toBeNull();
});

it('a persisted correction link retains exact target on failed owned read and retries GET only', async () => {
  const corrected = {
    ...record,
    status: 'entered_in_error',
    correction: {
      operation_id: 'op',
      condition_id: record.id,
      correction_revision_id: 'exact',
      reason: 'Incorrecta',
      replacement_condition_id: null,
      replacement_revision_id: null,
    },
  };
  mount([corrected]);
  fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'entered_in_error' } });
  mocks.exact.mockRejectedValueOnce(new TypeError('unavailable')).mockResolvedValueOnce(corrected);
  fireEvent.click(await screen.findByRole('button', { name: 'Ver corrección exacta' }));
  await screen.findByText(/No pudimos cargar el registro vinculado/);
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar registro vinculado' }));
  await screen.findByText(/La revisión exacta no está disponible/);
  expect(mocks.exact).toHaveBeenCalledTimes(2);
  expect(mocks.correct).not.toHaveBeenCalled();
});

it('late correction response cannot repaint another patient', async () => {
  mocks.treatmentList.mockResolvedValue({ items: [], total: 0, next_cursor: null });
  mocks.treatmentCatalog.mockResolvedValue({
    version: 'dental-clinical-v1',
    categories: [],
    variants: [],
    findings: [],
  });
  mocks.list.mockResolvedValue({ items: [record], total: 1, next_cursor: null });
  mocks.catalog.mockResolvedValue({
    version: 1,
    conditions: [{ code: 'caries', label_es: 'Caries', surface_codes: ['M'] }],
  });
  const view = render(
    <MemoryRouter>
      <PatientDiagnosis patientId="p" />
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Corregir registro' }));
  fireEvent.change(screen.getByLabelText('Motivo de corrección'), {
    target: { value: 'Incorrecta' },
  });
  let finish!: (value: unknown) => void;
  mocks.correct.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Revisar corrección' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Guardar corrección' }));
  mocks.list.mockResolvedValue({ items: [], total: 0, next_cursor: null });
  view.rerender(
    <MemoryRouter>
      <PatientDiagnosis patientId="other" />
    </MemoryRouter>,
  );
  await screen.findByText('Sin registros actuales');
  await act(async () =>
    finish({
      operation_id: 'op',
      condition_id: record.id,
      correction_revision_id: 'exact',
      replacement_condition_id: null,
      replacement_revision_id: null,
    }),
  );
  expect(screen.queryByText('Corrección guardada.')).toBeNull();
  expect(mocks.exact).not.toHaveBeenCalled();
});

it('failed current read blocks renewed correction, retains reason and terminal source blocks new attempt', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Corregir registro' }));
  fireEvent.change(screen.getByLabelText('Motivo de corrección'), {
    target: { value: 'Incorrecta' },
  });
  mocks.correct.mockRejectedValueOnce(new ApiError(409, { detail: { code: 'revision_conflict' } }));
  mocks.exact
    .mockRejectedValueOnce(new TypeError('failed'))
    .mockResolvedValueOnce({ ...record, status: 'entered_in_error', revision: 2 });
  fireEvent.click(screen.getByRole('button', { name: 'Revisar corrección' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Guardar corrección' }));
  await screen.findByText(/No pudimos cargar la versión actual/);
  expect(screen.getByRole('button', { name: 'Revisar nueva corrección' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Cargar versión actual' }));
  await screen.findByText(/El original ya está registrado por error/);
  expect(screen.getByRole('button', { name: 'Revisar nueva corrección' })).toBeDisabled();
  expect(screen.getByLabelText('Motivo de corrección')).toHaveValue('Incorrecta');
  expect(mocks.correct).toHaveBeenCalledTimes(1);
});

it('tool selection keeps chart context; surface selector cancels without writes', async () => {
  mount([]);
  fireEvent.click(await screen.findByRole('button', { name: 'Caries' }));
  expect(screen.queryByLabelText('Pieza FDI')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Elegir pieza' })).toBeNull();
  fireEvent.change(screen.getByLabelText('Seleccionar pieza FDI'), { target: { value: '36' } });
  expect(screen.queryByRole('button', { name: 'Cambiar pieza' })).toBeNull();
  expect(screen.getByText(/Pieza 36 · Caries/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar superficies' }));
  expect(screen.queryByRole('checkbox', { name: 'Mesial (M)' })).toBeNull();
  expect(screen.queryByRole('checkbox', { name: 'Oclusal (O)' })).toBeNull();
  expect(mocks.create).not.toHaveBeenCalled();
});

it('renders a plain diagnosis heading for one category and never renders empty family tabs', async () => {
  mount([]);
  await screen.findByRole('button', { name: 'Caries' });
  expect(screen.getByRole('heading', { name: 'Diagnóstico' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Restauradora' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Cirugía' })).toBeNull();
});

it('navigates populated categories without writing or discarding tool intent', async () => {
  mount([], undefined, () => {
    mocks.catalog.mockResolvedValue({
      version: 1,
      categories: [
        { key: 'diagnosis', label_es: 'Diagnóstico' },
        { key: 'restaurative', label_es: 'Restauradora' },
      ],
      conditions: [
        {
          code: 'caries',
          label_es: 'Caries',
          surface_codes: ['M', 'D', 'O', 'V', 'L'],
          category_key: 'diagnosis',
          allowed_dentitions: ['permanent', 'primary'],
        },
        {
          code: 'synthetic',
          label_es: 'Hallazgo de prueba',
          surface_codes: [],
          category_key: 'restaurative',
          allowed_dentitions: ['permanent', 'primary'],
        },
      ],
    });
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Caries' }));
  const categories = within(screen.getByRole('group', { name: 'Categorías' }));
  fireEvent.click(categories.getByRole('button', { name: 'Restauradora' }));
  expect(screen.getByRole('button', { name: /Hallazgo de prueba/ })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Caries' })).toBeNull();
  expect(screen.queryByLabelText('Nota de condición')).toBeNull();
  expect(mocks.create).not.toHaveBeenCalled();
  fireEvent.click(categories.getByRole('button', { name: 'Diagnóstico' }));
  expect(screen.getByRole('button', { name: 'Caries' })).toHaveAttribute('aria-pressed', 'true');
});

it('keeps chart context after create and focuses exact record after edit and resolve', async () => {
  mount([]);
  mocks.create.mockImplementation(async () => {
    const saved = { ...record, id: 'new', tooth_fdi: 16 };
    mocks.list.mockResolvedValue({ items: [saved], total: 1, next_cursor: null });
    return saved;
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Caries' }));
  fireEvent.change(screen.getByLabelText('Seleccionar pieza FDI'), { target: { value: '16' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Mesial (M)' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
  await screen.findByRole('article', { name: 'Pieza 16 · Caries · Activa' });
  expect(screen.queryByLabelText('Nota de condición')).toBeNull();
  mocks.edit.mockResolvedValue({
    ...record,
    id: 'new',
    tooth_fdi: 16,
    note: 'Editada',
    revision: 2,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Editar condición' }));
  fireEvent.change(screen.getByLabelText('Nota de condición'), { target: { value: 'Editada' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar condición' }));
  await waitFor(() =>
    expect(screen.getByRole('article', { name: 'Pieza 16 · Caries · Activa' })).toHaveFocus(),
  );
  mocks.edit.mockResolvedValue({
    ...record,
    id: 'new',
    tooth_fdi: 16,
    status: 'resolved',
    revision: 3,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Resolver condición' }));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar condición' }));
  await waitFor(() =>
    expect(screen.getByRole('article', { name: 'Pieza 16 · Caries · Resuelta' })).toHaveFocus(),
  );
  expect(screen.getByLabelText('Estado')).toHaveValue('resolved');
});

it('chart hover and focus never rebind a saved-record edit or write', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Editar condición' }));
  fireEvent.change(screen.getByLabelText('Nota de condición'), { target: { value: 'Nota de 36' } });
  const chartTooth = screen.getByRole('button', { name: /Pieza 11: sin condiciones guardadas/ });
  fireEvent.mouseEnter(chartTooth);
  fireEvent.focus(chartTooth);
  fireEvent.mouseLeave(chartTooth);
  fireEvent.blur(chartTooth);
  expect(screen.getByLabelText('Seleccionar pieza FDI')).toHaveValue('36');
  expect(screen.getByLabelText('Nota de condición')).toHaveValue('Nota de 36');
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.edit).not.toHaveBeenCalled();
  expect(mocks.correct).not.toHaveBeenCalled();
});
