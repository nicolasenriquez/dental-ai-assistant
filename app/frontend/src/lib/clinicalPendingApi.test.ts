import { afterEach, expect, it, vi } from 'vitest';
import { type PendingWorkItem, type PendingWorkPage, getClinicalPendingWork } from './api';

afterEach(() => vi.unstubAllGlobals());

it('task 1.4: sends exact kind and bounded limit without changing omitted-kind calls', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ items: [], total: 0, next_cursor: null }), { status: 200 }),
    );
  vi.stubGlobal('fetch', fetch);
  // The third argument is the planned additive client contract for task2.5.
  const read = getClinicalPendingWork as (
    patientId?: string,
    cursor?: string,
    options?: { kind?: PendingWorkItem['kind']; limit?: number },
  ) => Promise<PendingWorkPage>;
  await read('patient-1', undefined, { kind: 'recoverable_draft', limit: 1 });
  const filtered = new URL(fetch.mock.calls[0][0], 'http://test');
  expect(filtered.searchParams.get('kind')).toBe('recoverable_draft');
  expect(filtered.searchParams.get('limit')).toBe('1');
  expect(filtered.searchParams.get('patient_id')).toBe('patient-1');
  await read('patient-1');
  expect(new URL(fetch.mock.calls[1][0], 'http://test').searchParams.has('kind')).toBe(false);
});
