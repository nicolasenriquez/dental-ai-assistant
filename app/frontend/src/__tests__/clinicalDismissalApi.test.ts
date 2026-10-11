import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '../lib/api';

const json = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

afterEach(() => vi.unstubAllGlobals());

describe('clinical dismissal typed clients', () => {
  it('requests the explicit read-only thread projection only when asked', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json({}));
    vi.stubGlobal('fetch', fetchMock);

    await api.getClinicalThread('t-1', { readOnly: true });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/clinical-threads/t-1?read_only=true',
      expect.objectContaining({ credentials: 'include' }),
    );

    await api.getClinicalThread('t-1');
    expect(fetchMock).toHaveBeenLastCalledWith('/api/clinical-threads/t-1', expect.anything());
  });

  it('sends the complete expected identity with decline and omits it for legacy callers', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json({}));
    vi.stubGlobal('fetch', fetchMock);

    await api.resolveClinicalAction('a-1', 'decline', 'h'.repeat(64), {
      expected_patient_id: 'p',
      expected_thread_id: 't',
      expected_artifact_id: 'art',
      expected_artifact_updated_at: '2026-09-10T12:00:00.123456Z',
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      decision: 'decline',
      proposal_hash: 'h'.repeat(64),
      expected_patient_id: 'p',
      expected_thread_id: 't',
      expected_artifact_id: 'art',
      expected_artifact_updated_at: '2026-09-10T12:00:00.123456Z',
    });

    await api.resolveClinicalAction('a-1', 'approve', 'h'.repeat(64));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      decision: 'approve',
      proposal_hash: 'h'.repeat(64),
    });
  });

  it('posts the discard receipt request to the nested artifact command', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json({}));
    vi.stubGlobal('fetch', fetchMock);

    await api.discardClinicalArtifact('t', 'art', {
      operation_id: 'op',
      expected_patient_id: 'p',
      expected_artifact_updated_at: '2026-09-10T12:00:00.123456Z',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/clinical-threads/t/artifacts/art/discard',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      operation_id: 'op',
      expected_patient_id: 'p',
      expected_artifact_updated_at: '2026-09-10T12:00:00.123456Z',
    });
  });
});
