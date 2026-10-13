import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TransitionGuardProvider,
  useOptionalTransitionGuard,
} from '../../hooks/useTransitionGuard';
import type { ClinicalThread, ClinicalThreadSummary } from '../../lib/api';
import {
  acquireClinicalThread,
  deleteClinicalThread,
  getClinicalThreads,
  renameClinicalThread,
} from '../../lib/api';
import { ClinicalThreadList } from './ClinicalThreadList';

vi.mock('../../lib/api', () => ({
  getClinicalThreads: vi.fn(),
  acquireClinicalThread: vi.fn(),
  deleteClinicalThread: vi.fn(),
  renameClinicalThread: vi.fn(),
}));

afterEach(() => vi.clearAllMocks());

it('reveals creation recovery after a failure from the collapsed rail', async () => {
  vi.mocked(getClinicalThreads).mockResolvedValue([]);
  vi.mocked(acquireClinicalThread).mockRejectedValueOnce(new Error('offline'));
  const onRequestExpand = vi.fn();
  const view = render(
    <MemoryRouter>
      <ClinicalThreadList isCollapsed onRequestExpand={onRequestExpand} />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Nueva conversación' }));
  await waitFor(() => expect(onRequestExpand).toHaveBeenCalledOnce());
  view.rerender(
    <MemoryRouter>
      <ClinicalThreadList onRequestExpand={onRequestExpand} />
    </MemoryRouter>,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('No pudimos abrir la conversación.');
});

it('announces acquisition failure, preserves search, and serializes retry clicks', async () => {
  vi.mocked(getClinicalThreads).mockResolvedValue([summary('A')]);
  vi.mocked(acquireClinicalThread).mockRejectedValueOnce(new Error('offline'));
  render(
    <MemoryRouter>
      <ClinicalThreadList />
    </MemoryRouter>,
  );
  await screen.findByRole('button', { name: 'Evolución A' });
  fireEvent.click(screen.getByRole('button', { name: 'Buscar en conversaciones' }));
  const search = screen.getByRole('searchbox');
  fireEvent.change(search, { target: { value: 'Evolución' } });
  fireEvent.click(screen.getByRole('button', { name: 'Nueva conversación' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos abrir la conversación.');
  expect(search).toHaveValue('Evolución');
  let reject!: (reason: Error) => void;
  vi.mocked(acquireClinicalThread).mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  const retry = screen.getByRole('button', { name: 'Reintentar creación' });
  fireEvent.click(retry);
  fireEvent.click(retry);
  expect(acquireClinicalThread).toHaveBeenCalledTimes(2);
  await act(async () => reject(new Error('offline again')));
  expect(screen.getByRole('button', { name: 'Nueva conversación' })).toBeEnabled();
  expect(search).toHaveValue('Evolución');
});

it('uses the route for pending selection and switches back to conversations', async () => {
  vi.mocked(getClinicalThreads).mockResolvedValue([]);
  render(
    <MemoryRouter initialEntries={['/assistant?view=pending']}>
      <ClinicalThreadList />
    </MemoryRouter>,
  );
  expect(screen.getByRole('button', { name: 'Pendientes' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Conversaciones' }));
  expect(screen.getByRole('button', { name: 'Conversaciones' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Pendientes' }));
  expect(screen.getByRole('button', { name: 'Pendientes' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await waitFor(() => expect(getClinicalThreads).toHaveBeenCalled());
});

it('hides the direct pending-work entry while collapsed into the rail', async () => {
  vi.mocked(getClinicalThreads).mockResolvedValue([]);
  render(
    <MemoryRouter>
      <ClinicalThreadList isCollapsed />
    </MemoryRouter>,
  );
  await waitFor(() => expect(getClinicalThreads).toHaveBeenCalled());
  expect(screen.queryByRole('button', { name: 'Pendientes' })).not.toBeInTheDocument();
});

function summary(id: string, activeTurnId: string | null = null): ClinicalThreadSummary {
  return {
    id,
    title: `Evolución ${id}`,
    active_patient_id: null,
    active_turn_id: activeTurnId,
    updated_at: new Date().toISOString(),
    preview: null,
    approval_pending: false,
  };
}

it('shows activity on an unselected thread from the server summary', async () => {
  vi.mocked(getClinicalThreads).mockResolvedValue([
    {
      id: 'thread-a',
      title: 'Evolución A',
      active_patient_id: null,
      active_turn_id: 'turn-a',
      updated_at: new Date().toISOString(),
      preview: null,
      approval_pending: false,
    },
    {
      id: 'thread-b',
      title: 'Consulta B',
      active_patient_id: null,
      active_turn_id: null,
      updated_at: new Date().toISOString(),
      preview: null,
      approval_pending: false,
    },
  ] satisfies ClinicalThreadSummary[]);

  render(
    <MemoryRouter>
      <ClinicalThreadList activeThreadId="thread-b" />
    </MemoryRouter>,
  );

  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Evolución A' })).toHaveAttribute(
      'aria-busy',
      'true',
    ),
  );
  expect(screen.getByRole('button', { name: 'Consulta B' })).toHaveAttribute('aria-busy', 'false');
});

it('keeps a rapid A to B start visible until summaries confirm and then finish it', async () => {
  vi.useFakeTimers();
  try {
    let summaries = [summary('A'), summary('B')];
    let failNextRefresh = false;
    vi.mocked(getClinicalThreads).mockImplementation(async () => {
      if (failNextRefresh) {
        failNextRefresh = false;
        throw new Error('Transient polling failure');
      }
      return summaries;
    });
    const view = (activeThreadId: string, activeTurnRunning: boolean) => (
      <MemoryRouter>
        <ClinicalThreadList activeThreadId={activeThreadId} activeTurnRunning={activeTurnRunning} />
      </MemoryRouter>
    );
    const { rerender } = render(view('A', false));
    await act(async () => {});

    rerender(view('A', true));
    await act(async () => {});
    rerender(view('B', false));
    expect(screen.getByRole('button', { name: 'Evolución A' })).toHaveAttribute(
      'aria-busy',
      'true',
    );

    summaries = [summary('A', 'turn-a'), summary('B')];
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(screen.getByRole('button', { name: 'Evolución A' })).toHaveAttribute(
      'aria-busy',
      'true',
    );

    failNextRefresh = true;
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(screen.getByRole('button', { name: 'Evolución B' })).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTimeAsync(4000));
    expect(screen.getByRole('button', { name: 'Evolución A' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Evolución B' })).toBeInTheDocument();

    summaries = [summary('A'), summary('B')];
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(screen.getByRole('button', { name: 'Evolución A' })).toHaveAttribute(
      'aria-busy',
      'false',
    );
    const callsAtCompletion = vi.mocked(getClinicalThreads).mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(4000));
    expect(getClinicalThreads).toHaveBeenCalledTimes(callsAtCompletion);
  } finally {
    vi.useRealTimers();
  }
});

it('keeps polling while either of two threads is active', async () => {
  vi.useFakeTimers();
  try {
    let summaries = [summary('A', 'turn-a'), summary('B', 'turn-b')];
    vi.mocked(getClinicalThreads).mockImplementation(async () => summaries);
    render(
      <MemoryRouter>
        <ClinicalThreadList activeThreadId="B" />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(screen.getByRole('button', { name: 'Evolución A' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Evolución B' })).toHaveAttribute(
      'aria-busy',
      'true',
    );

    summaries = [summary('A'), summary('B', 'turn-b')];
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(screen.getByRole('button', { name: 'Evolución A' })).toHaveAttribute(
      'aria-busy',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Evolución B' })).toHaveAttribute(
      'aria-busy',
      'true',
    );

    summaries = [summary('A'), summary('B')];
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(screen.getByRole('button', { name: 'Evolución B' })).toHaveAttribute(
      'aria-busy',
      'false',
    );
  } finally {
    vi.useRealTimers();
  }
});

it('drops the temporary hint when a start fails on the selected thread', async () => {
  vi.useFakeTimers();
  try {
    vi.mocked(getClinicalThreads).mockResolvedValue([summary('A')]);
    const { rerender } = render(
      <MemoryRouter>
        <ClinicalThreadList activeThreadId="A" />
      </MemoryRouter>,
    );
    await act(async () => {});
    rerender(
      <MemoryRouter>
        <ClinicalThreadList activeThreadId="A" activeTurnRunning />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(screen.getByRole('button', { name: 'Evolución A' })).toHaveAttribute(
      'aria-busy',
      'true',
    );

    rerender(
      <MemoryRouter>
        <ClinicalThreadList activeThreadId="A" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Evolución A' })).toHaveAttribute(
      'aria-busy',
      'false',
    );
    const callsAfterFailure = vi.mocked(getClinicalThreads).mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(getClinicalThreads).toHaveBeenCalledTimes(callsAfterFailure);
  } finally {
    vi.useRealTimers();
  }
});

it('skips polling ticks while a summary request is in flight', async () => {
  vi.useFakeTimers();
  try {
    let finishRefresh!: (value: ClinicalThreadSummary[]) => void;
    vi.mocked(getClinicalThreads)
      .mockResolvedValueOnce([summary('A', 'turn-a')])
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            finishRefresh = resolve;
          }),
      );
    render(
      <MemoryRouter>
        <ClinicalThreadList activeThreadId="A" />
      </MemoryRouter>,
    );
    await act(async () => {});
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(getClinicalThreads).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTimeAsync(4000));
    expect(getClinicalThreads).toHaveBeenCalledTimes(2);
    await act(async () => finishRefresh([summary('A')]));
    expect(screen.getByRole('button', { name: 'Evolución A' })).toHaveAttribute(
      'aria-busy',
      'false',
    );
  } finally {
    vi.useRealTimers();
  }
});

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

describe('clinical conversation collisions', () => {
  const collisionTitle = 'Evolución dental';
  const tiedAt = '2026-10-10T12:00:10.000Z';
  const sameMinuteLater = '2026-10-10T12:00:50.000Z';
  const ordinal = (value: number) => `${collisionTitle} · Conversación ${value}`;

  function collidingSummary(
    id: string,
    overrides: Partial<ClinicalThreadSummary> = {},
  ): ClinicalThreadSummary {
    return {
      id,
      title: collisionTitle,
      active_patient_id: null,
      active_turn_id: null,
      updated_at: tiedAt,
      preview: null,
      approval_pending: false,
      ...overrides,
    };
  }

  function collisionLabels(): (string | null)[] {
    return screen
      .getAllByRole('button', { name: /^Evolución dental/ })
      .map((row) => row.getAttribute('aria-label'));
  }

  it('distinguishes rows whose title and displayed minute collide, including exact ties', async () => {
    vi.mocked(getClinicalThreads).mockResolvedValue([
      collidingSummary('thread-b', { active_turn_id: 'turn-b' }),
      collidingSummary('thread-a'),
      collidingSummary('thread-c', { updated_at: sameMinuteLater, approval_pending: true }),
    ]);

    render(
      <MemoryRouter>
        <ClinicalThreadList activeThreadId="thread-a" />
      </MemoryRouter>,
    );

    const rows = await screen.findAllByRole('button', { name: /^Evolución dental/ });
    expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual([
      ordinal(2),
      ordinal(1),
      ordinal(3),
    ]);
    expect(rows[0]).toHaveAttribute('aria-busy', 'true');
    expect(rows[1]).toHaveAttribute('aria-current', 'page');
    expect(rows[0]).toHaveTextContent('Conversación 2');
    expect(rows[1]).toHaveTextContent('Conversación 1');
    expect(rows[2]).toHaveTextContent('Conversación 3');
    expect(within(rows[2]).getByLabelText('Pendiente de aprobación')).toBeInTheDocument();
    expect(within(rows[0]).queryByLabelText('Pendiente de aprobación')).not.toBeInTheDocument();

    for (const value of [1, 2, 3]) {
      expect(screen.getByRole('button', { name: `Acciones para ${ordinal(value)}` })).toBeVisible();
    }
  });

  it('keeps collision ordinals across search, refresh and rail reflow', async () => {
    const page = [
      collidingSummary('thread-a'),
      collidingSummary('thread-b'),
      collidingSummary('thread-c'),
      collidingSummary('thread-z', { title: 'Consulta única' }),
    ];
    vi.mocked(getClinicalThreads).mockResolvedValue(page);

    const { rerender } = render(
      <MemoryRouter>
        <ClinicalThreadList />
      </MemoryRouter>,
    );

    await screen.findByRole('button', { name: 'Consulta única' });
    const initialLabels = collisionLabels();
    const initialReads = vi.mocked(getClinicalThreads).mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Buscar en conversaciones' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: collisionTitle } });
    expect(screen.queryByRole('button', { name: 'Consulta única' })).not.toBeInTheDocument();
    const filteredLabels = collisionLabels();

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Consulta única' })).toBeInTheDocument();
    const clearedLabels = collisionLabels();
    expect(vi.mocked(getClinicalThreads).mock.calls.length).toBe(initialReads);

    const readsBeforeRefresh = vi.mocked(getClinicalThreads).mock.calls.length;
    vi.mocked(getClinicalThreads).mockResolvedValue([...page]);
    rerender(
      <MemoryRouter>
        <ClinicalThreadList refreshKey={1} />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(vi.mocked(getClinicalThreads).mock.calls.length).toBe(readsBeforeRefresh + 1),
    );
    expect(screen.getByRole('button', { name: 'Consulta única' })).toBeInTheDocument();
    const refreshedLabels = collisionLabels();

    rerender(
      <MemoryRouter>
        <ClinicalThreadList refreshKey={1} isCollapsed />
      </MemoryRouter>,
    );
    expect(screen.queryAllByRole('button', { name: /^Evolución dental/ })).toHaveLength(0);
    rerender(
      <MemoryRouter>
        <ClinicalThreadList refreshKey={1} />
      </MemoryRouter>,
    );
    const reflowedLabels = collisionLabels();

    expect(filteredLabels).toEqual(initialLabels);
    expect(clearedLabels).toEqual(initialLabels);
    expect(refreshedLabels).toEqual(initialLabels);
    expect(reflowedLabels).toEqual(initialLabels);
    expect(initialLabels).toEqual([ordinal(1), ordinal(2), ordinal(3)]);
  });

  it('binds collision labels to exact thread IDs for navigation, rename and delete', async () => {
    vi.mocked(getClinicalThreads).mockResolvedValue([
      collidingSummary('thread-b'),
      collidingSummary('thread-a'),
      collidingSummary('thread-c'),
    ]);
    vi.mocked(renameClinicalThread).mockResolvedValue({} as ClinicalThread);
    vi.mocked(deleteClinicalThread).mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <ClinicalThreadList />
        <LocationProbe />
      </MemoryRouter>,
    );

    const rows = await screen.findAllByRole('button', { name: /^Evolución dental/ });
    const labelsBeforeActions = rows.map((row) => row.getAttribute('aria-label'));
    const menuTriggers = screen.getAllByRole('button', { name: /^Acciones para/ });

    fireEvent.click(rows[1]);
    expect(screen.getByTestId('location')).toHaveTextContent('/a/thread-a');

    fireEvent.click(menuTriggers[1]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Renombrar' }));
    const renameInput = screen.getByRole('textbox', { name: 'Renombrar conversación' });
    expect(renameInput).toHaveValue(collisionTitle);
    fireEvent.change(renameInput, { target: { value: 'Evolución dental renombrada' } });
    fireEvent.keyDown(renameInput, { key: 'Enter' });
    await waitFor(() =>
      expect(renameClinicalThread).toHaveBeenCalledWith('thread-a', 'Evolución dental renombrada'),
    );
    await waitFor(() => expect(screen.queryAllByRole('menu')).toHaveLength(0));

    fireEvent.click(menuTriggers[2]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Eliminar' }));
    const dialog = await screen.findByRole('dialog', { name: '¿Eliminar conversación clínica?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }));
    await waitFor(() => expect(deleteClinicalThread).toHaveBeenCalledWith('thread-c'));

    expect(labelsBeforeActions).toEqual([ordinal(2), ordinal(1), ordinal(3)]);
  });

  it('routes collision selection through the transition guard', async () => {
    vi.mocked(getClinicalThreads).mockResolvedValue([
      collidingSummary('thread-a'),
      collidingSummary('thread-b'),
    ]);
    let resume: (() => void) | null = null;

    function BlockingGuard() {
      const guard = useOptionalTransitionGuard();
      useEffect(() => {
        return guard?.registerBlocker((continuation) => {
          resume = continuation;
          return true;
        });
      }, [guard]);
      return null;
    }

    render(
      <MemoryRouter>
        <TransitionGuardProvider>
          <BlockingGuard />
          <ClinicalThreadList />
          <LocationProbe />
        </TransitionGuardProvider>
      </MemoryRouter>,
    );

    const rows = await screen.findAllByRole('button', { name: /^Evolución dental/ });
    fireEvent.click(rows[0]);
    fireEvent.click(rows[1]);
    expect(screen.getByTestId('location')).toHaveTextContent('/');
    await act(async () => resume?.());
    expect(screen.getByTestId('location')).toHaveTextContent('/a/thread-a');
  });

  it('keeps unique rows unchanged and never exposes previews or raw IDs', async () => {
    vi.mocked(getClinicalThreads).mockResolvedValue([
      collidingSummary('thread-a', { preview: 'Contenido clínico confidencial' }),
      collidingSummary('thread-b', { preview: 'Contenido clínico confidencial' }),
      collidingSummary('thread-unique', {
        title: 'Consulta única',
        preview: 'Nota reservada de la consulta',
      }),
    ]);

    render(
      <MemoryRouter>
        <ClinicalThreadList />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('button', { name: 'Consulta única' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Acciones para Consulta única' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /Consulta única · Conversación/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /thread-/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Contenido clínico confidencial')).not.toBeInTheDocument();
    expect(screen.queryByText('Nota reservada de la consulta')).not.toBeInTheDocument();
  });
});
