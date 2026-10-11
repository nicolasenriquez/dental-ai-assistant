import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ApiError, type PendingWorkItem, getClinicalPendingWork } from '../lib/api';
import { useClinicalPendingWork } from './useClinicalPendingWork';

vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
  getClinicalPendingWork: vi.fn(),
}));

afterEach(() => vi.resetAllMocks());

function item(id: string): PendingWorkItem {
  return {
    id,
    kind: 'recoverable_draft',
    patient: { id: 'p', display_name: 'Ana Pérez', rut_masked: '•••' },
    updated_at: '2026-10-01T12:00:00Z',
    action: { kind: 'continue_draft', artifact_id: id, thread_id: 't' },
  };
}

function page(ids: string[], total: number, next_cursor: string | null) {
  return { items: ids.map(item), total, next_cursor };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const invalidCursor = () => new ApiError(422, { detail: { code: 'INVALID_PENDING_CURSOR' } });

type PendingPage = Awaited<ReturnType<typeof getClinicalPendingWork>>;

it.each(['explicit', 'focus'])(
  'refreshes the loaded window using fresh cursors (%s)',
  async (trigger) => {
    vi.mocked(getClinicalPendingWork)
      .mockResolvedValueOnce({ items: [item('a')], total: 3, next_cursor: 'old-tail' })
      .mockResolvedValueOnce({ items: [item('b')], total: 3, next_cursor: 'old-next' })
      .mockResolvedValueOnce({ items: [item('new')], total: 2, next_cursor: 'fresh-tail' })
      .mockResolvedValueOnce({ items: [item('b')], total: 2, next_cursor: null });
    const { result } = renderHook(() => useClinicalPendingWork('p'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.loadMore();
    });
    expect(result.current.page?.items.map((entry) => entry.id)).toEqual(['a', 'b']);
    await act(async () => {
      if (trigger === 'explicit') await result.current.refresh();
      else window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(getClinicalPendingWork).toHaveBeenLastCalledWith('p', 'fresh-tail', undefined);
    expect(result.current.page?.items.map((entry) => entry.id)).toEqual(['new', 'b']);
    expect(result.current.page?.next_cursor).toBeNull();
  },
);

it('keeps the previous window if a later refresh page fails and retries the whole window', async () => {
  vi.mocked(getClinicalPendingWork)
    .mockResolvedValueOnce({ items: [item('a')], total: 2, next_cursor: 'tail' })
    .mockResolvedValueOnce({ items: [item('b')], total: 2, next_cursor: null })
    .mockResolvedValueOnce({ items: [item('new')], total: 2, next_cursor: 'fresh-tail' })
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ items: [item('b')], total: 1, next_cursor: null });
  const { result } = renderHook(() => useClinicalPendingWork());
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => {
    await result.current.loadMore();
  });
  const previous = result.current.page;
  await act(async () => {
    await result.current.refresh();
  });
  expect(result.current.error).toBe(true);
  expect(result.current.page).toBe(previous);
  expect(result.current.page?.total).toBe(2);
  expect(result.current.page?.items.map((entry) => entry.id)).toEqual(['a', 'b']);
  await act(async () => {
    await result.current.refresh();
  });
  expect(result.current.error).toBe(false);
  expect(result.current.page?.items.map((entry) => entry.id)).toEqual(['b']);
  expect(result.current.page?.total).toBe(1);
  await act(async () => {
    await result.current.loadMore();
  });
  expect(getClinicalPendingWork).toHaveBeenCalledTimes(5);
});

it('restarts a rejected refresh cursor chain from page one once', async () => {
  vi.mocked(getClinicalPendingWork)
    .mockResolvedValueOnce(page(['a'], 3, 'c1'))
    .mockResolvedValueOnce(page(['b'], 3, 'c2'))
    .mockResolvedValueOnce(page(['n1'], 2, 'fresh'))
    .mockRejectedValueOnce(invalidCursor())
    .mockResolvedValueOnce(page(['n1'], 2, 'fresh-2'))
    .mockResolvedValueOnce(page(['n2'], 2, null));
  const { result } = renderHook(() => useClinicalPendingWork('p'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => {
    await result.current.loadMore();
  });
  await act(async () => {
    await result.current.refresh();
  });
  expect(result.current.error).toBe(false);
  expect(result.current.page?.items.map((entry) => entry.id)).toEqual(['n1', 'n2']);
  expect(result.current.page?.total).toBe(2);
  expect(result.current.page?.next_cursor).toBeNull();
  expect(getClinicalPendingWork).toHaveBeenCalledTimes(6);
});

it('stops after one cursor-chain restart and keeps the last complete window', async () => {
  vi.mocked(getClinicalPendingWork)
    .mockResolvedValueOnce(page(['a'], 2, 'c1'))
    .mockResolvedValueOnce(page(['b'], 2, null))
    .mockResolvedValueOnce(page(['n1'], 2, 'bad'))
    .mockRejectedValueOnce(invalidCursor())
    .mockResolvedValueOnce(page(['n1'], 2, 'bad-2'))
    .mockRejectedValueOnce(invalidCursor());
  const { result } = renderHook(() => useClinicalPendingWork('p'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => {
    await result.current.loadMore();
  });
  const previous = result.current.page;
  await act(async () => {
    await result.current.refresh();
  });
  expect(result.current.error).toBe(true);
  expect(result.current.page).toBe(previous);
  expect(result.current.page?.total).toBe(2);
  expect(getClinicalPendingWork).toHaveBeenCalledTimes(6);
});

it('restarts from fresh page one when load-more is rejected as an invalid cursor', async () => {
  vi.mocked(getClinicalPendingWork)
    .mockResolvedValueOnce(page(['a'], 2, 'stale'))
    .mockRejectedValueOnce(invalidCursor())
    .mockResolvedValueOnce(page(['a'], 2, 'fresh'))
    .mockResolvedValueOnce(page(['b'], 2, null));
  const { result } = renderHook(() => useClinicalPendingWork('p'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => {
    await result.current.loadMore();
  });
  expect(result.current.error).toBe(false);
  expect(result.current.page?.items.map((entry) => entry.id)).toEqual(['a']);
  expect(result.current.page?.next_cursor).toBe('fresh');
  await act(async () => {
    await result.current.loadMore();
  });
  expect(result.current.page?.items.map((entry) => entry.id)).toEqual(['a', 'b']);
  expect(result.current.page?.total).toBe(2);
  expect(getClinicalPendingWork).toHaveBeenCalledTimes(4);
});

it('coalesces repeated window-focus refreshes into one bounded read', async () => {
  const held = deferred<PendingPage>();
  vi.mocked(getClinicalPendingWork)
    .mockResolvedValueOnce(page(['a'], 2, 'c1'))
    .mockResolvedValueOnce(page(['b'], 2, null))
    .mockReturnValueOnce(held.promise)
    .mockResolvedValueOnce(page(['b2'], 2, null));
  const { result } = renderHook(() => useClinicalPendingWork('p'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => {
    await result.current.loadMore();
  });
  act(() => {
    window.dispatchEvent(new Event('focus'));
  });
  act(() => {
    window.dispatchEvent(new Event('focus'));
  });
  await waitFor(() => expect(getClinicalPendingWork).toHaveBeenCalledTimes(3));
  await act(async () => {
    held.resolve(page(['a2'], 2, 'c1-fresh'));
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(getClinicalPendingWork).toHaveBeenCalledTimes(4);
  expect(getClinicalPendingWork).toHaveBeenLastCalledWith('p', 'c1-fresh', undefined);
  expect(result.current.page?.items.map((entry) => entry.id)).toEqual(['a2', 'b2']);
});

it.each([
  ['kind', { kind: 'approval_required' as const }, { kind: 'recoverable_draft' as const }],
  ['limit', { limit: 1 }, { limit: 2 }],
])(
  'invalidates a refreshing window when the %s filter changes',
  async (
    _name,
    initial: { kind?: PendingWorkItem['kind']; limit?: number },
    next: { kind?: PendingWorkItem['kind']; limit?: number },
  ) => {
    const held = deferred<PendingPage>();
    vi.mocked(getClinicalPendingWork)
      .mockResolvedValueOnce(page(['a'], 1, null))
      .mockReturnValueOnce(held.promise)
      .mockResolvedValueOnce(page(['b'], 1, null));
    const { result, rerender } = renderHook(
      (props: { kind?: PendingWorkItem['kind']; limit?: number }) =>
        useClinicalPendingWork('p', props.kind, props.limit),
      { initialProps: initial },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    let refresh!: Promise<void>;
    act(() => {
      refresh = result.current.refresh();
    });
    rerender(next);
    await waitFor(() => expect(result.current.page?.items[0].id).toBe('b'));
    await act(async () => {
      held.resolve(page(['stale'], 1, 'stale-tail'));
      await refresh;
    });
    expect(result.current.page?.items.map((entry) => entry.id)).toEqual(['b']);
    expect(result.current.page?.next_cursor).toBeNull();
  },
);

it('publishes reordered, inserted and removed rows with server totals and the fresh final cursor', async () => {
  vi.mocked(getClinicalPendingWork)
    .mockResolvedValueOnce(page(['a', 'b'], 3, 'c1'))
    .mockResolvedValueOnce(page(['c'], 3, 'c2'))
    .mockResolvedValueOnce(page(['c', 'a'], 4, 'fresh-1'))
    .mockResolvedValueOnce(page(['d'], 4, 'fresh-2'))
    .mockResolvedValueOnce(page(['e'], 5, null));
  const { result } = renderHook(() => useClinicalPendingWork('p'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => {
    await result.current.loadMore();
  });
  await act(async () => {
    await result.current.refresh();
  });
  expect(result.current.page?.items.map((entry) => entry.id)).toEqual(['c', 'a', 'd']);
  expect(result.current.page?.total).toBe(4);
  expect(result.current.page?.next_cursor).toBe('fresh-2');
  await act(async () => {
    await result.current.loadMore();
  });
  expect(getClinicalPendingWork).toHaveBeenLastCalledWith('p', 'fresh-2', undefined);
  expect(result.current.page?.items.map((entry) => entry.id)).toEqual(['c', 'a', 'd', 'e']);
  expect(result.current.page?.total).toBe(5);
  expect(result.current.page?.items.map((entry) => entry.action)).toEqual([
    item('c').action,
    item('a').action,
    item('d').action,
    item('e').action,
  ]);
});

it('invalidates a refreshing window when the patient filter changes', async () => {
  let finish!: (value: Awaited<ReturnType<typeof getClinicalPendingWork>>) => void;
  vi.mocked(getClinicalPendingWork)
    .mockResolvedValueOnce({ items: [item('a')], total: 1, next_cursor: null })
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    )
    .mockResolvedValueOnce({ items: [item('b')], total: 1, next_cursor: null });
  const { result, rerender } = renderHook(({ patientId }) => useClinicalPendingWork(patientId), {
    initialProps: { patientId: 'a' },
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  let refresh!: Promise<void>;
  act(() => {
    refresh = result.current.refresh();
  });
  rerender({ patientId: 'b' });
  await waitFor(() => expect(result.current.page?.items[0].id).toBe('b'));
  await act(async () => {
    finish({ items: [item('stale')], total: 1, next_cursor: 'stale-tail' });
    await refresh;
  });
  expect(result.current.page?.items.map((entry) => entry.id)).toEqual(['b']);
  expect(result.current.page?.next_cursor).toBeNull();
});
