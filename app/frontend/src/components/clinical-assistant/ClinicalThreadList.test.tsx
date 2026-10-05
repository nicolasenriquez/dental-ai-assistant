import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import type { ClinicalThreadSummary } from '../../lib/api';
import { acquireClinicalThread, getClinicalThreads } from '../../lib/api';
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
