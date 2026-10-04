import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../lib/api';
import { useAdminVideos } from './useAdminVideos';

describe('useAdminVideos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears the previous error after a successful retry', async () => {
    vi.spyOn(api, 'listAdminVideos')
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce({ videos: [] });
    const { result } = renderHook(() => useAdminVideos());
    await waitFor(() => expect(result.current.error).toBe('Offline'));
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('ignores a pending response when disabled', async () => {
    let resolve: (value: api.AdminVideosResponse) => void = () => {};
    vi.spyOn(api, 'listAdminVideos').mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { result, rerender } = renderHook(({ enabled }) => useAdminVideos(undefined, enabled), {
      initialProps: { enabled: true },
    });
    rerender({ enabled: false });
    await act(async () => {
      resolve({
        videos: [
          { id: 'stale', title: 'Stale', url: '', description: '', created_at: '', chunk_count: 1 },
        ],
      });
    });
    expect(result.current.videos).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('does not fetch when enabled=false', async () => {
    const spy = vi.spyOn(api, 'listAdminVideos').mockResolvedValue({ videos: [] });
    renderHook(() => useAdminVideos(undefined, false));

    await new Promise((r) => setTimeout(r, 0));

    expect(spy).not.toHaveBeenCalled();
  });

  it('returns loading=false immediately when enabled=false', () => {
    vi.spyOn(api, 'listAdminVideos').mockResolvedValue({ videos: [] });
    const { result } = renderHook(() => useAdminVideos(undefined, false));

    expect(result.current.loading).toBe(false);
  });

  it('fetches when enabled=true (default)', async () => {
    const spy = vi.spyOn(api, 'listAdminVideos').mockResolvedValue({ videos: [] });
    const { result } = renderHook(() => useAdminVideos());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(spy).toHaveBeenCalledOnce();
    expect(result.current.videos).toEqual([]);
  });

  it('re-fetches when enabled flips from false to true', async () => {
    const spy = vi.spyOn(api, 'listAdminVideos').mockResolvedValue({ videos: [] });
    let enabled = false;
    const { result, rerender } = renderHook(() => useAdminVideos(undefined, enabled));

    await new Promise((r) => setTimeout(r, 0));
    expect(spy).not.toHaveBeenCalled();

    enabled = true;
    rerender();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(spy).toHaveBeenCalledOnce();
  });
});
