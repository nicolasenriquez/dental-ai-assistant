import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { PatientActivity } from './PatientActivity';

const list = vi.hoisted(() => vi.fn());
vi.mock('../../lib/api', async () => ({
  ...(await vi.importActual('../../lib/api')),
  getPatientActivity: list,
}));
afterEach(() => vi.resetAllMocks());
const event = (id: string, kind = 'notes', resource = 'n') => ({
  event_id: id,
  resource_id: resource,
  kind,
  action: 'edited',
  occurred_at: '2026-10-03T12:00:00Z',
  actor: null,
  title: 'Nota editada',
  tooth_fdi: null,
  href: `/patients/p?tab=info&note=${resource}`,
});
const mount = () =>
  render(
    <MemoryRouter>
      <PatientActivity patientId="p" />
    </MemoryRouter>,
  );

it('keeps revision events distinct, deduplicates page overlap and uses exact resource links', async () => {
  list
    .mockResolvedValueOnce({ items: [event('r2'), event('r1')], total: 3, next_cursor: 'next' })
    .mockResolvedValueOnce({ items: [event('r1'), event('r0')], total: 3, next_cursor: null });
  mount();
  await waitFor(() =>
    expect(screen.getAllByRole('link', { name: /Nota editada/ })).toHaveLength(2),
  );
  expect(screen.getAllByRole('link')[0]).toHaveAttribute('href', '/patients/p?tab=info&note=n');
  fireEvent.click(screen.getByRole('button', { name: 'Cargar más actividad' }));
  await waitFor(() =>
    expect(screen.getAllByRole('link', { name: /Nota editada/ })).toHaveLength(3),
  );
  expect(screen.getByText('Fin de la actividad')).toBeInTheDocument();
  expect(screen.getAllByText('Autor no disponible')).toHaveLength(3);
});

it('preserves events on page failure and retries the same cursor; initial failure is never empty', async () => {
  list
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ items: [event('r1')], total: 2, next_cursor: 'next' })
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ items: [event('r0')], total: 2, next_cursor: null });
  mount();
  await screen.findByRole('alert');
  expect(screen.queryByText(/Sin eventos/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar actividad' }));
  await screen.findByRole('link', { name: /Nota editada/ });
  fireEvent.click(screen.getByRole('button', { name: 'Cargar más actividad' }));
  await screen.findByRole('alert');
  expect(screen.getAllByRole('link')).toHaveLength(1);
  expect(screen.queryByText('Fin de la actividad')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar actividad' }));
  await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(2));
  expect(list.mock.calls[2]).toEqual(list.mock.calls[3]);
});

it('labels persisted actors with distinguishable UUID abbreviations and full disclosure', async () => {
  const first = { user_id: '00000000-0000-4000-8000-000000000001', display_name: null };
  const second = { user_id: '00000000-0000-4000-8000-000000000002', display_name: null };
  list.mockResolvedValueOnce({
    items: [
      { ...event('r1'), actor: first },
      { ...event('r2'), actor: second },
    ],
    total: 2,
    next_cursor: null,
  });
  mount();
  const labels = await screen.findAllByText(/^Usuario /);
  expect(labels.map((node) => node.textContent)).toEqual([
    `Usuario ${first.user_id.replace(/-/g, '')}`,
    `Usuario ${second.user_id.replace(/-/g, '')}`,
  ]);
  expect(screen.getByText(`Identificador de cuenta: ${first.user_id}`)).toBeInTheDocument();
  expect(screen.queryByText('Autor no disponible')).toBeNull();
});

it('labels a supplied actor display name instead of the UUID fallback', async () => {
  list.mockResolvedValueOnce({
    items: [
      {
        ...event('r1'),
        actor: { user_id: '00000000-0000-4000-8000-0000000000a1', display_name: 'Dra. Rojas' },
      },
    ],
    total: 1,
    next_cursor: null,
  });
  mount();
  expect(await screen.findByText('Dra. Rojas')).toBeVisible();
  expect(screen.queryByText(/^Usuario /)).toBeNull();
  expect(screen.queryByText('Autor no disponible')).toBeNull();
});

it('labels legacy plan evidence as read-only history instead of a daily filter', async () => {
  list.mockResolvedValueOnce({ items: [], total: 0, next_cursor: null });
  mount();
  await screen.findByText('Sin actividad guardada');
  expect(screen.queryByRole('button', { name: 'Planes' })).not.toBeInTheDocument();
  expect(screen.getByText(/hist[óo]ri.*planes/i)).toBeInTheDocument();
});

it('resets filter/cursor and rejects late responses from the previous category', async () => {
  let finish: (value: unknown) => void = () => {};
  list
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue({ items: [], total: 0, next_cursor: null });
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Diagnósticos' }));
  await screen.findByText('Sin eventos en esta categoría');
  await act(async () => finish({ items: [event('late')], total: 1, next_cursor: null }));
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(list).toHaveBeenLastCalledWith('p', 'diagnoses', undefined);
  fireEvent.click(screen.getByRole('button', { name: 'Mostrar todo' }));
  await waitFor(() => expect(list).toHaveBeenLastCalledWith('p', 'all', undefined));
});
