import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { TransitionGuardProvider } from '../../hooks/useTransitionGuard';
import { ApiError } from '../../lib/api';
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
function mount(items = [record], focusedConditionId?: string): void {
  mocks.list.mockResolvedValue({ items, total: items.length, next_cursor: null });
  mocks.catalog.mockResolvedValue({
    version: 1,
    conditions: [
      { code: 'caries', label_es: 'Caries', surface_codes: ['M', 'D', 'O', 'V', 'L'] },
      { code: 'missing', label_es: 'Ausente', surface_codes: [] },
    ],
  });
  mocks.exact.mockResolvedValue(record);
  mocks.revisions.mockResolvedValue({ items: [], total: 0, next_cursor: null });
  render(
    <MemoryRouter>
      <TransitionGuardProvider>
        <PatientDiagnosis patientId="p" focusedConditionId={focusedConditionId} />
      </TransitionGuardProvider>
    </MemoryRouter>,
  );
}
it('selection is a draft, tool change preserves tooth/note and incompatible surfaces clear; uncertain retry freezes UUID', async () => {
  mount([]);
  fireEvent.click(await screen.findByRole('button', { name: 'Caries' }));
  expect(screen.getByText('Borrador sin guardar')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Pieza FDI'), { target: { value: '36' } });
  fireEvent.change(screen.getByLabelText('Nota de condición'), { target: { value: 'Nueva' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Mesial (M)' }));
  fireEvent.click(screen.getByRole('button', { name: 'Ausente' }));
  expect(screen.getByLabelText('Pieza FDI')).toHaveValue('36');
  expect(screen.getByLabelText('Nota de condición')).toHaveValue('Nueva');
  expect(mocks.create).not.toHaveBeenCalled();
  mocks.create
    .mockRejectedValueOnce(new TypeError('lost'))
    .mockResolvedValueOnce({ ...record, condition_code: 'missing', surfaces: [] });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar condición' }));
  await screen.findByRole('button', { name: 'Reintentar guardado' });
  expect(screen.queryByText('Borrador sin guardar')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Nota de condición')).toBeDisabled();
  const body = mocks.create.mock.calls[0][1];
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar guardado' }));
  await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
  expect(mocks.create.mock.calls[1][1]).toEqual(body);
});
it('resolve is a draft until save, cancel preserves record and immutable fields cannot change', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Resolver condición' }));
  expect(mocks.edit).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Pieza FDI')).toBeDisabled();
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
it('deep target outside page selects dentition; revision conflict retains draft with explicit rebase', async () => {
  mount([], record.id);
  fireEvent.click(await screen.findByRole('button', { name: 'Editar condición' }));
  fireEvent.change(screen.getByLabelText('Nota de condición'), { target: { value: 'Local' } });
  mocks.edit
    .mockRejectedValueOnce(new ApiError(409, { detail: { code: 'revision_conflict' } }))
    .mockResolvedValueOnce({ ...record, note: 'Local', revision: 3 });
  mocks.exact.mockResolvedValue({ ...record, note: 'Remota', revision: 2 });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar condición' }));
  await screen.findByText('Versión actual: 2');
  expect(screen.getByLabelText('Nota de condición')).toHaveValue('Local');
  fireEvent.click(screen.getByRole('button', { name: 'Rebasar mis cambios' }));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar condición' }));
  await waitFor(() =>
    expect(mocks.edit).toHaveBeenLastCalledWith(
      'p',
      record.id,
      expect.objectContaining({ expected_revision: 2, note: 'Local' }),
    ),
  );
});

it('loads every page and flags incomplete reads rather than displaying a false empty chart', async () => {
  mount([]);
  mocks.list
    .mockResolvedValueOnce({ items: [record], total: 2, next_cursor: 'page2' })
    .mockRejectedValueOnce(new TypeError('read failed'));
  await screen.findByText(/Los datos mostrados pueden estar incompletos/);
  expect(mocks.list).toHaveBeenNthCalledWith(2, 'p', expect.objectContaining({ cursor: 'page2' }));
  expect(await screen.findByRole('article', { name: 'Pieza 36 · Caries · Activa' })).toBeVisible();
});

it('keeps a draft on the selected dentition, confirms a change and clears only after discard', async () => {
  mount([]);
  fireEvent.click(await screen.findByRole('button', { name: 'Caries' }));
  fireEvent.change(screen.getByLabelText('Seleccionar pieza FDI'), { target: { value: '36' } });
  fireEvent.click(screen.getByRole('button', { name: 'Permanente' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Temporal' }));
  await screen.findByRole('dialog', { name: 'Condición sin guardar' });
  fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
  expect(screen.getByLabelText('Pieza FDI')).toHaveValue('36');
  fireEvent.click(screen.getByRole('button', { name: 'Temporal' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Descartar condición' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Temporal' })).toHaveAttribute(
      'aria-pressed',
      'true',
    ),
  );
  expect(screen.queryByLabelText('Nota de condición')).toBeNull();
  expect(mocks.create).not.toHaveBeenCalled();
});

it.each([false, true])(
  'shows one pending condition spinner, including continue guard=%s',
  async (guard) => {
    mount([]);
    fireEvent.click(await screen.findByRole('button', { name: 'Caries' }));
    fireEvent.change(screen.getByLabelText('Pieza FDI'), { target: { value: '36' } });
    let rejectSave!: (error: Error) => void;
    mocks.create.mockImplementation(
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
    expect(screen.getByLabelText('Pieza FDI')).toHaveValue('36');
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
      fireEvent.change(screen.getByLabelText('Pieza FDI'), { target: { value: '26' } });
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
  mocks.exact.mockRejectedValueOnce(new TypeError('unavailable')).mockResolvedValueOnce(corrected);
  fireEvent.click(await screen.findByRole('button', { name: 'Ver corrección exacta' }));
  await screen.findByText(/No pudimos cargar el registro vinculado/);
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar registro vinculado' }));
  await screen.findByText(/La revisión exacta no está disponible/);
  expect(mocks.exact).toHaveBeenCalledTimes(2);
  expect(mocks.correct).not.toHaveBeenCalled();
});

it('late correction response cannot repaint another patient', async () => {
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
  await screen.findByText('Sin condiciones en esta dentición y estado.');
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
