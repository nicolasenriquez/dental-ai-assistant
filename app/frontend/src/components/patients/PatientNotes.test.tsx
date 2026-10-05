import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { TransitionGuardProvider } from '../../hooks/useTransitionGuard';
import { ApiError } from '../../lib/api';
import { PatientNotes } from './PatientNotes';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  exact: vi.fn(),
  create: vi.fn(),
  edit: vi.fn(),
  revisions: vi.fn(),
}));
vi.mock('../../lib/api', async () => ({
  ...(await vi.importActual('../../lib/api')),
  getPatientNotes: mocks.list,
  getPatientNote: mocks.exact,
  createPatientNote: mocks.create,
  updatePatientNote: mocks.edit,
  getPatientNoteRevisions: mocks.revisions,
}));
const record = {
  id: '00000000-0000-4000-8000-000000000001',
  patient_id: 'p',
  body: 'Guardada',
  revision: 1,
  created_by: { user_id: 'u', display_name: null },
  updated_by: { user_id: 'u', display_name: null },
  created_at: '2026-10-03T12:00:00Z',
  updated_at: '2026-10-03T12:00:00Z',
};
afterEach(() => vi.resetAllMocks());

it('blocks browser history and cancels or resumes only explicitly', async () => {
  mocks.list.mockResolvedValue({ items: [], total: 0, next_cursor: null });
  const router = createMemoryRouter(
    [
      { path: '/patients', element: <h1>Directorio</h1> },
      {
        path: '/p',
        element: (
          <TransitionGuardProvider>
            <PatientNotes patientId="p" />
          </TransitionGuardProvider>
        ),
      },
    ],
    { initialEntries: ['/patients', '/p'], initialIndex: 1 },
  );
  render(<RouterProvider router={router} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Nueva nota' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Nota general' }), {
    target: { value: 'No perder' },
  });
  await act(async () => {
    await router.navigate(-1);
  });
  await screen.findByRole('dialog', { name: 'Nota sin guardar' });
  fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
  expect(router.state.location.pathname).toBe('/p');
  expect(screen.getByRole('textbox', { name: 'Nota general' })).toHaveValue('No perder');
  await act(async () => {
    await router.navigate(-1);
  });
  await screen.findByRole('dialog', { name: 'Nota sin guardar' });
  fireEvent.click(screen.getByRole('button', { name: 'Descartar nota' }));
  await screen.findByRole('heading', { name: 'Directorio' });
  expect(mocks.create).not.toHaveBeenCalled();
});
function mount(focusedNoteId?: string): void {
  mocks.list.mockResolvedValue({ items: [], total: 0, next_cursor: null });
  mocks.exact.mockResolvedValue(record);
  mocks.revisions.mockResolvedValue({ items: [], total: 0, next_cursor: null });
  render(
    <MemoryRouter>
      <TransitionGuardProvider>
        <PatientNotes patientId="p" focusedNoteId={focusedNoteId} />
      </TransitionGuardProvider>
    </MemoryRouter>,
  );
}
it('keeps UUID/frozen body after response loss and writes only through Guardar', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Nueva nota' }));
  const input = screen.getByRole('textbox', { name: 'Nota general' });
  fireEvent.change(input, { target: { value: 'Nueva' } });
  expect(mocks.create).not.toHaveBeenCalled();
  mocks.create
    .mockRejectedValueOnce(new TypeError('response lost'))
    .mockResolvedValue({ ...record, body: 'Nueva' });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar nota' }));
  await screen.findByRole('button', { name: 'Reintentar guardado' });
  expect(input).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar guardado' }));
  await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
  expect(mocks.create.mock.calls[0]).toEqual(mocks.create.mock.calls[1]);
  expect(mocks.create.mock.calls[0][1].id).toMatch(/^[0-9a-f-]{36}$/);
});
it('loads exact deep-link outside page1, retains draft on conflict and rebases only explicitly', async () => {
  mount(record.id);
  await screen.findByText('Guardada');
  expect(mocks.exact).toHaveBeenCalledWith('p', record.id);
  fireEvent.click(screen.getByRole('button', { name: 'Editar nota' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Nota general' }), {
    target: { value: 'Local' },
  });
  mocks.edit.mockRejectedValueOnce(
    new ApiError(409, {
      detail: { code: 'revision_conflict', current_revision: 3, resource_id: record.id },
    }),
  );
  mocks.exact.mockResolvedValue({ ...record, body: 'Remota', revision: 3 });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar nota' }));
  await screen.findByRole('button', { name: 'Rebasar mis cambios' });
  expect(screen.getByRole('textbox', { name: 'Nota general' })).toHaveValue('Local');
  fireEvent.click(screen.getByRole('button', { name: 'Rebasar mis cambios' }));
  mocks.edit.mockResolvedValue({ ...record, body: 'Local', revision: 4 });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar nota' }));
  await waitFor(() =>
    expect(mocks.edit).toHaveBeenLastCalledWith('p', record.id, {
      expected_revision: 3,
      body: 'Local',
    }),
  );
});
it('dirty cancel offers save/discard/remain and warns before reload', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Nueva nota' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Nota general' }), {
    target: { value: 'Sin guardar' },
  });
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar nota' }));
  expect(screen.getByRole('button', { name: 'Seguir editando' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
  expect(screen.getByRole('textbox', { name: 'Nota general' })).toHaveValue('Sin guardar');
  expect(mocks.create).not.toHaveBeenCalled();
});

it('keeps failed save-and-continue visible and does not complete navigation', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Nueva nota' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Nota general' }), {
    target: { value: 'Draft' },
  });
  mocks.create.mockRejectedValue(new ApiError(422, {}));
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar nota' }));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar y continuar' }));
  const dialog = screen.getByRole('dialog', { name: 'Nota sin guardar' });
  await waitFor(() => expect(dialog).toHaveTextContent('Revisa la nota'));
  fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
  expect(screen.getByRole('textbox', { name: 'Nota general' })).toHaveValue('Draft');
});

it.each([false, true])(
  'shows one pending-save spinner, including continue guard=%s',
  async (guard) => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Nueva nota' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nota general' }), {
      target: { value: 'Draft' },
    });
    let rejectSave!: (error: Error) => void;
    mocks.create.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectSave = reject;
        }),
    );
    if (guard) fireEvent.click(screen.getByRole('button', { name: 'Cancelar nota' }));
    fireEvent.click(
      screen.getByRole('button', { name: guard ? 'Guardar y continuar' : 'Guardar nota' }),
    );
    const action = guard
      ? screen.getByRole('dialog').querySelector('[aria-busy="true"]')
      : screen.getByRole('button', { name: 'Guardando…' });
    expect(action).toBeDisabled();
    expect(action).toHaveTextContent('Guardando…');
    expect(document.querySelectorAll('.animate-spin')).toHaveLength(1);
    await act(async () => rejectSave(new TypeError('lost')));
    expect(document.querySelector('.animate-spin')).toBeNull();
    if (guard) fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(screen.getByRole('textbox', { name: 'Nota general' })).toHaveValue('Draft');
  },
);
