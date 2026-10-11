import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { type PendingWorkItem, getClinicalPendingWork } from '../lib/api';
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
  await act(async () => {
    await result.current.refresh();
  });
  expect(result.current.error).toBe(false);
  expect(result.current.page?.items.map((entry) => entry.id)).toEqual(['b']);
  await act(async () => {
    await result.current.loadMore();
  });
  expect(getClinicalPendingWork).toHaveBeenCalledTimes(5);
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
