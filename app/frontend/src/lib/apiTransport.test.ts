import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, deleteClinicalThread, deleteConversation, deleteVideo, getHealth } from './api';

const deletes = [
  ['conversation', deleteConversation, '/api/conversations/id'],
  ['clinical thread', deleteClinicalThread, '/api/clinical-threads/id'],
  ['video', deleteVideo, '/api/admin/videos/id'],
] as const;

describe('shared API response handling', () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each(deletes)('deletes %s without parsing a 204 body', async (_label, remove, path) => {
    const response = new Response(null, { status: 204 });
    const json = vi.spyOn(response, 'json');
    fetchMock.mockResolvedValueOnce(response);
    await expect(remove('id')).resolves.toBeUndefined();
    expect(json).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      path,
      expect.objectContaining({ method: 'DELETE', credentials: 'include' }),
    );
  });

  it.each(deletes)('preserves structured failure for %s', async (_label, remove) => {
    fetchMock.mockResolvedValueOnce(new Response('{"detail":"Missing"}', { status: 404 }));
    await expect(remove('id')).rejects.toMatchObject({
      status: 404,
      body: { detail: 'Missing' },
    });
  });

  it('keeps a non-JSON failure body', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Unavailable', { status: 503 }));
    await expect(deleteVideo('id')).rejects.toBeInstanceOf(ApiError);
    fetchMock.mockResolvedValueOnce(new Response('Unavailable', { status: 503 }));
    await expect(deleteVideo('id')).rejects.toMatchObject({ body: 'Unavailable', status: 503 });
  });

  it.each(deletes)('preserves return path when %s session expires', async (_label, remove) => {
    const assign = vi.fn();
    vi.stubGlobal('window', {
      location: { pathname: '/patients/id', search: '?tab=info', assign },
    });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    await expect(remove('id')).rejects.toThrow('Not authenticated');
    expect(assign).toHaveBeenCalledWith('/login?from=%2Fpatients%2Fid%3Ftab%3Dinfo');
  });

  it('exposes the PostgreSQL health contract', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ status: 'ok', video_count: 1, chunk_count: 2, db_type: 'postgres' }),
    );
    expect((await getHealth()).db_type).toBe('postgres');
  });
});
