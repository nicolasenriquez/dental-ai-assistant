import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { TransitionGuardProvider } from '../../hooks/useTransitionGuard';
import { ApiError } from '../../lib/api';
import { PatientDiagnosis } from './PatientDiagnosis';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  catalog: vi.fn(),
  create: vi.fn(),
  edit: vi.fn(),
  exact: vi.fn(),
  revisions: vi.fn(),
}));
vi.mock('../../lib/api', async () => ({
  ...(await vi.importActual('../../lib/api')),
  getPatientConditions: mocks.list,
  getConditionCatalog: mocks.catalog,
  createPatientCondition: mocks.create,
  updatePatientCondition: mocks.edit,
  getPatientCondition: mocks.exact,
  getPatientConditionRevisions: mocks.revisions,
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
