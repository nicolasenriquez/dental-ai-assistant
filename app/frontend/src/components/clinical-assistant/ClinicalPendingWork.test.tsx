import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import * as api from '../../lib/api';
import { PatientOverview } from '../patients/PatientOverview';
import { ClinicalPendingWork } from './ClinicalPendingWork';
import { ClinicalReadResult } from './ClinicalReadResult';

afterEach(() => vi.restoreAllMocks());

const patient = (name: string) => ({ id: 'p', display_name: name, rut_masked: '•••' });

function draft(id: string, name: string): api.PendingWorkItem {
  return {
    id,
    kind: 'recoverable_draft',
    patient: patient(name),
    updated_at: '2026-10-01T12:00:00Z',
    action: { kind: 'continue_draft', artifact_id: id, thread_id: 't' },
    summary: `Borrador ${id}`,
  };
}

function drive(id: string, evolutionId: string, name: string): api.PendingWorkItem {
  return {
    id,
    kind: 'drive_export_failed',
    patient: patient(name),
    updated_at: '2026-10-01T12:00:00Z',
    action: { kind: 'retry_drive_export', evolution_id: evolutionId, thread_id: null },
    summary: `Evolución ${id}`,
  };
}

const pageOf = (
  items: api.PendingWorkItem[],
  total: number,
  next_cursor: string | null,
): api.PendingWorkPage => ({ items, total, next_cursor });

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

async function loadLaterPage(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'Ver más pendientes' }));
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Ver más pendientes' })).not.toBeInTheDocument(),
  );
}

it('groups clinical work separately from Drive failures and identifies exact saved evolutions', async () => {
  vi.spyOn(api, 'getClinicalPendingWork').mockResolvedValue({
    items: [
      {
        id: 'draft:a',
        kind: 'recoverable_draft',
        patient: { id: 'p', display_name: 'Camila Soto', rut_masked: '•••' },
        updated_at: '2026-10-01T12:00:00Z',
        action: { kind: 'continue_draft', artifact_id: 'a', thread_id: 't' },
        summary: 'Control preventivo',
      },
      {
        id: 'drive:e',
        kind: 'drive_export_failed',
        patient: { id: 'p', display_name: 'Camila Soto', rut_masked: '•••' },
        updated_at: '2026-10-01T13:30:00Z',
        action: { kind: 'retry_drive_export', evolution_id: 'e', thread_id: null },
      },
    ],
    total: 2,
    next_cursor: null,
  });
  render(
    <MemoryRouter>
      <ClinicalPendingWork />
    </MemoryRouter>,
  );
  const clinical = await screen.findByRole('region', { name: 'Borradores y revisión' });
  const drive = screen.getByRole('region', { name: 'Sincronización de Drive' });
  expect(within(clinical).getByRole('link', { name: 'Continuar' })).toHaveAttribute(
    'href',
    '/a/t#artifact=a',
  );
  expect(within(clinical).getByText('Control preventivo')).toBeVisible();
  expect(within(clinical).queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  expect(within(drive).getByRole('link', { name: 'Ver evolución' })).toHaveAttribute(
    'href',
    '/patients/p/evolutions/e',
  );
  expect(drive.querySelector('time')).toHaveTextContent(/\d{2}:\d{2}/);
});

it('distinguishes pending query failure from empty and supports explicit recovery', async () => {
  const query = vi
    .spyOn(api, 'getClinicalPendingWork')
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({ items: [], total: 0, next_cursor: null });
  render(
    <MemoryRouter>
      <ClinicalPendingWork />
    </MemoryRouter>,
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar tus pendientes');
  expect(screen.queryByText('No hay trabajo pendiente')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(await screen.findByText('No hay trabajo pendiente')).toBeVisible();
  expect(query).toHaveBeenCalledTimes(2);
});

it.each(['t', null])(
  'retries failed Drive copy with thread %s without saving again',
  async (threadId) => {
    vi.spyOn(api, 'getClinicalPendingWork')
      .mockResolvedValueOnce({
        items: [
          {
            id: 'drive:e',
            kind: 'drive_export_failed',
            patient: { id: 'p', display_name: 'Camila Soto', rut_masked: '•••' },
            updated_at: '2026-10-01T12:00:00Z',
            action: { kind: 'retry_drive_export', evolution_id: 'e', thread_id: threadId },
          },
        ],
        total: 1,
        next_cursor: null,
      })
      .mockResolvedValue({ items: [], total: 0, next_cursor: null });
    const retry = vi
      .spyOn(api, 'retryClinicalDriveExport')
      .mockResolvedValue({ drive_export: { status: 'pending' } });
    const save = vi.spyOn(api, 'resolveClinicalAction');
    render(
      <MemoryRouter>
        <ClinicalPendingWork />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(retry).toHaveBeenCalledWith('e'));
    expect(save).not.toHaveBeenCalled();
    expect(await screen.findByText('No hay trabajo pendiente')).toBeVisible();
  },
);

it('opens the saved evolution for a failed manual export', async () => {
  vi.spyOn(api, 'getClinicalPendingWork').mockResolvedValue({
    items: [
      {
        id: 'drive:e',
        kind: 'drive_export_failed',
        patient: { id: 'p', display_name: 'Camila Soto', rut_masked: '•••' },
        updated_at: '2026-10-01T12:00:00Z',
        action: { kind: 'retry_drive_export', evolution_id: 'e', thread_id: null },
      },
    ],
    total: 1,
    next_cursor: null,
  });
  render(
    <MemoryRouter>
      <PatientOverview patientId="p" evolutions={[]} onAssistant={vi.fn()} />
    </MemoryRouter>,
  );
  expect(await screen.findByRole('link', { name: 'Recuperar sincronización' })).toHaveAttribute(
    'href',
    '/patients/p/evolutions/e',
  );
});

it('dispatches by stable result kind and hides unknown payload behind fallback', () => {
  render(
    <MemoryRouter>
      <ClinicalReadResult
        result={{
          result_kind: 'evolution_list',
          payload: {
            patient_id: 'p',
            evolutions: [{ id: 'e', evolution_at: '2026-10-01T12:00:00Z' }],
          },
        }}
        fallback="Resultado"
      />
      <ClinicalReadResult
        result={{ result_kind: 'unknown', payload: { secret: 'internal identifier' } }}
        fallback="Consulta completada"
      />
    </MemoryRouter>,
  );
  expect(screen.getByRole('link', { name: /Ver evolución del/ })).toHaveAttribute(
    'href',
    '/patients/p/evolutions/e',
  );
  expect(screen.getByText('Consulta completada')).toBeVisible();
  expect(screen.queryByText('internal identifier')).not.toBeInTheDocument();
});

it('keeps opened depth, surviving rows and exact links after a successful export retry', async () => {
  const query = vi
    .spyOn(api, 'getClinicalPendingWork')
    .mockResolvedValueOnce(
      pageOf([drive('drive:e', 'e', 'Camila Soto'), draft('draft:a', 'Ana Pérez')], 3, 'c1'),
    )
    .mockResolvedValueOnce(pageOf([draft('draft:b', 'Bruno Ríos')], 3, null))
    .mockResolvedValueOnce(pageOf([draft('draft:a', 'Ana Pérez')], 2, 'fresh'))
    .mockResolvedValueOnce(pageOf([draft('draft:b', 'Bruno Ríos')], 2, null));
  vi.spyOn(api, 'retryClinicalDriveExport').mockResolvedValue({
    drive_export: { status: 'synced' },
  });
  render(
    <MemoryRouter>
      <ClinicalPendingWork />
    </MemoryRouter>,
  );
  expect(await screen.findByRole('link', { name: 'Ver evolución' })).toHaveAttribute(
    'href',
    '/patients/p/evolutions/e',
  );
  await loadLaterPage();
  const survivor = screen.getByRole('heading', { name: 'Bruno Ríos' }).closest('article');
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await waitFor(() => expect(screen.queryByText('Camila Soto')).not.toBeInTheDocument());
  expect(query).toHaveBeenCalledTimes(4);
  expect(query).toHaveBeenLastCalledWith(undefined, 'fresh', undefined);
  expect(screen.getByRole('heading', { name: 'Bruno Ríos' }).closest('article')).toBe(survivor);
  const ana = screen.getByRole('heading', { name: 'Ana Pérez' }).closest('article') as HTMLElement;
  expect(within(ana).getByRole('link', { name: 'Continuar' })).toHaveAttribute(
    'href',
    '/a/t#artifact=draft%3Aa',
  );
  const bruno = screen
    .getByRole('heading', { name: 'Bruno Ríos' })
    .closest('article') as HTMLElement;
  expect(within(bruno).getByRole('link', { name: 'Continuar' })).toHaveAttribute(
    'href',
    '/a/t#artifact=draft%3Ab',
  );
});

it('moves focus to a usable surviving action after an explicit retry removes the focused row', async () => {
  vi.spyOn(api, 'getClinicalPendingWork')
    .mockResolvedValueOnce(
      pageOf([drive('drive:e', 'e', 'Camila Soto'), drive('drive:f', 'f', 'Diego Díaz')], 2, null),
    )
    .mockResolvedValueOnce(pageOf([drive('drive:f', 'f', 'Diego Díaz')], 1, null));
  vi.spyOn(api, 'retryClinicalDriveExport').mockResolvedValue({
    drive_export: { status: 'synced' },
  });
  render(
    <MemoryRouter>
      <ClinicalPendingWork />
    </MemoryRouter>,
  );
  const buttons = await screen.findAllByRole('button', { name: 'Reintentar' });
  buttons[0].focus();
  expect(document.activeElement).toBe(buttons[0]);
  fireEvent.click(buttons[0]);
  await waitFor(() => expect(screen.queryByText('Evolución drive:e')).not.toBeInTheDocument());
  const focused = document.activeElement as HTMLElement;
  const surviving = screen
    .getByRole('heading', { name: 'Diego Díaz' })
    .closest('article') as HTMLElement;
  expect(focused).not.toBe(document.body);
  expect(surviving.contains(focused)).toBe(true);
  expect(focused.matches('a, button')).toBe(true);
});

it('announces an explicit-retry removal without claiming unsaved work', async () => {
  vi.spyOn(api, 'getClinicalPendingWork')
    .mockResolvedValueOnce(
      pageOf([drive('drive:e', 'e', 'Camila Soto'), drive('drive:f', 'f', 'Diego Díaz')], 2, null),
    )
    .mockResolvedValueOnce(pageOf([drive('drive:f', 'f', 'Diego Díaz')], 1, null));
  vi.spyOn(api, 'retryClinicalDriveExport').mockResolvedValue({
    drive_export: { status: 'synced' },
  });
  render(
    <MemoryRouter>
      <ClinicalPendingWork />
    </MemoryRouter>,
  );
  const buttons = await screen.findAllByRole('button', { name: 'Reintentar' });
  fireEvent.click(buttons[0]);
  await waitFor(() => expect(screen.queryByText('Evolución drive:e')).not.toBeInTheDocument());
  const announcement = await screen.findByRole('status');
  await waitFor(() => expect(announcement).toHaveTextContent(/(actualiz|pendiente|sincroniz)/i));
  expect(announcement).not.toHaveTextContent(/sin guardar/i);
});

it('keeps focus and the list container on passive window refocus', async () => {
  const query = vi
    .spyOn(api, 'getClinicalPendingWork')
    .mockResolvedValueOnce(
      pageOf([draft('draft:a', 'Ana Pérez'), draft('draft:b', 'Bruno Ríos')], 2, null),
    )
    .mockResolvedValueOnce(
      pageOf([draft('draft:b', 'Bruno Ríos'), draft('draft:a', 'Ana Pérez')], 2, null),
    );
  render(
    <MemoryRouter>
      <ClinicalPendingWork />
    </MemoryRouter>,
  );
  const ana = (await screen.findByRole('heading', { name: 'Ana Pérez' })).closest(
    'article',
  ) as HTMLElement;
  const link = within(ana).getByRole('link', { name: 'Continuar' });
  link.focus();
  const region = screen.getByRole('region', { name: 'Trabajo pendiente' });
  act(() => {
    window.dispatchEvent(new Event('focus'));
  });
  await waitFor(() => expect(query).toHaveBeenCalledTimes(2));
  expect(document.activeElement).toBe(link);
  expect(screen.getByRole('region', { name: 'Trabajo pendiente' })).toBe(region);
  expect(screen.getByRole('heading', { name: 'Bruno Ríos' })).toBeVisible();
});

it('restores the reading anchor offset when an explicit retry shifts a surviving row', async () => {
  const query = vi
    .spyOn(api, 'getClinicalPendingWork')
    .mockResolvedValueOnce(pageOf([drive('drive:e', 'e', 'Camila Soto')], 2, null))
    .mockResolvedValueOnce(
      pageOf([draft('draft:a', 'Ana Pérez'), drive('drive:e', 'e', 'Camila Soto')], 2, null),
    );
  vi.spyOn(api, 'retryClinicalDriveExport').mockResolvedValue({
    drive_export: { status: 'pending' },
  });
  render(
    <MemoryRouter>
      <ClinicalPendingWork />
    </MemoryRouter>,
  );
  const row = (await screen.findByRole('heading', { name: 'Camila Soto' })).closest(
    'article',
  ) as HTMLElement;
  const scroller = screen.getByRole('region', { name: 'Trabajo pendiente' });
  Object.defineProperty(scroller, 'scrollHeight', { value: 500, configurable: true });
  Object.defineProperty(scroller, 'clientHeight', { value: 200, configurable: true });
  const rect = (top: number): DOMRect => ({ top, bottom: top + 10 }) as DOMRect;
  vi.spyOn(row, 'getBoundingClientRect').mockReturnValueOnce(rect(40)).mockReturnValue(rect(100));
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await waitFor(() => expect(query).toHaveBeenCalledTimes(2));
  expect(scroller.scrollTop).toBe(60);
});

it('keeps the last complete window and separates a read failure from export retry failure', async () => {
  const query = vi
    .spyOn(api, 'getClinicalPendingWork')
    .mockResolvedValueOnce(
      pageOf([drive('drive:e', 'e', 'Camila Soto'), draft('draft:a', 'Ana Pérez')], 2, 'c1'),
    )
    .mockResolvedValueOnce(pageOf([draft('draft:b', 'Bruno Ríos')], 2, null))
    .mockResolvedValueOnce(pageOf([drive('drive:e', 'e', 'Camila Soto')], 2, 'fresh'))
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(pageOf([draft('draft:a', 'Ana Pérez')], 2, 'fresh-2'))
    .mockResolvedValueOnce(pageOf([draft('draft:b', 'Bruno Ríos')], 2, null));
  vi.spyOn(api, 'retryClinicalDriveExport').mockResolvedValue({
    drive_export: { status: 'pending' },
  });
  render(
    <MemoryRouter>
      <ClinicalPendingWork />
    </MemoryRouter>,
  );
  await screen.findByRole('link', { name: 'Ver evolución' });
  await loadLaterPage();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('No pudimos cargar tus pendientes.');
  expect(screen.getByText('Evolución drive:e')).toBeVisible();
  expect(screen.getByText('Borrador draft:a')).toBeVisible();
  expect(screen.getByText('Borrador draft:b')).toBeVisible();
  expect(
    screen.queryByText(
      'No pudimos reintentar la sincronización. La evolución sigue guardada en ficha.',
    ),
  ).not.toBeInTheDocument();
  fireEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  expect(screen.queryByText('Evolución drive:e')).not.toBeInTheDocument();
  expect(screen.getByText('Borrador draft:a')).toBeVisible();
  expect(screen.getByText('Borrador draft:b')).toBeVisible();
  expect(query).toHaveBeenCalledTimes(6);
});

it('keeps the row and refreshes the window when the export retry request fails', async () => {
  const query = vi
    .spyOn(api, 'getClinicalPendingWork')
    .mockResolvedValueOnce(pageOf([drive('drive:e', 'e', 'Camila Soto')], 2, 'c1'))
    .mockResolvedValueOnce(pageOf([draft('draft:a', 'Ana Pérez')], 2, null))
    .mockResolvedValueOnce(pageOf([drive('drive:e', 'e', 'Camila Soto')], 2, 'fresh'))
    .mockResolvedValueOnce(pageOf([draft('draft:a', 'Ana Pérez')], 2, null));
  vi.spyOn(api, 'retryClinicalDriveExport').mockRejectedValue(new api.ApiError(502, {}));
  render(
    <MemoryRouter>
      <ClinicalPendingWork />
    </MemoryRouter>,
  );
  await screen.findByRole('link', { name: 'Ver evolución' });
  await loadLaterPage();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(
    await screen.findByText(
      'No pudimos reintentar la sincronización. La evolución sigue guardada en ficha.',
    ),
  ).toBeVisible();
  expect(screen.getByText('Evolución drive:e')).toBeVisible();
  expect(screen.getByText('Borrador draft:a')).toBeVisible();
  expect(query).toHaveBeenCalledTimes(4);
});

it('keeps the row when the export retry reports a pending copy', async () => {
  const query = vi
    .spyOn(api, 'getClinicalPendingWork')
    .mockResolvedValueOnce(pageOf([drive('drive:e', 'e', 'Camila Soto')], 1, null))
    .mockResolvedValueOnce(pageOf([drive('drive:e', 'e', 'Camila Soto')], 1, null));
  vi.spyOn(api, 'retryClinicalDriveExport').mockResolvedValue({
    drive_export: { status: 'pending' },
  });
  render(
    <MemoryRouter>
      <ClinicalPendingWork />
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
  await waitFor(() => expect(query).toHaveBeenCalledTimes(2));
  expect(screen.getByText('Evolución drive:e')).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('restores focus to the surviving retry control when the browser drops it while busy', async () => {
  const refresh = deferred<api.PendingWorkPage>();
  const query = vi
    .spyOn(api, 'getClinicalPendingWork')
    .mockResolvedValueOnce(pageOf([drive('drive:e', 'e', 'Camila Soto')], 1, null))
    .mockReturnValueOnce(refresh.promise);
  vi.spyOn(api, 'retryClinicalDriveExport').mockResolvedValue({
    drive_export: { status: 'synced' },
  });
  render(
    <MemoryRouter>
      <ClinicalPendingWork />
    </MemoryRouter>,
  );
  const retryButton = await screen.findByRole('button', { name: 'Reintentar' });
  retryButton.focus();
  fireEvent.click(retryButton);
  // Chromium drops focus when the control becomes disabled during the retry; jsdom
  // keeps it, so simulate the resulting body focus by removing a temporary focus owner.
  const elsewhere = document.createElement('button');
  document.body.append(elsewhere);
  elsewhere.focus();
  elsewhere.remove();
  expect(document.activeElement).toBe(document.body);
  await act(async () => {
    refresh.resolve(pageOf([drive('drive:e', 'e', 'Camila Soto')], 1, null));
  });
  await waitFor(() => expect(query).toHaveBeenCalledTimes(2));
  expect(retryButton).toHaveFocus();
});
