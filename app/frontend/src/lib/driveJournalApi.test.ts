import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDriveJournalDetail } from './api';

describe('journal detail API wrapper', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it('GETs the exact encoded period and part with session credentials', async () => {
    const response = {
      journal: {
        period_type: 'weekly',
        period_key: '2026-W37',
        journal_part: 2,
        display_name: 'Evoluciones — 2026-W37 — 2.txt',
        updated_at: '2026-09-13T12:00:00Z',
        entries: [
          {
            evolution_id: 'evolution-1',
            occurred_at: '2026-09-13T10:00:00Z',
            patient_display_name: 'Ana Pérez',
            patient_rut_masked: '12.345.•••-6',
            content: 'Texto remoto',
          },
        ],
      },
    };
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => response,
    });

    await expect(getDriveJournalDetail('weekly', '2026-W37', 2)).resolves.toEqual(response);
    expect(fetch).toHaveBeenCalledWith(
      '/api/google-drive/evolution-journals/weekly/2026-W37/parts/2',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it.each([
    ['monthly', '2026-09-14', 1],
    ['weekly', '2026-37', 1],
    ['daily', '2026-02-30', 1],
    ['weekly', '2026-W37', 0],
  ] as const)('rejects invalid journal path values before fetch: %s/%s/%s', (type, key, part) => {
    expect(() => getDriveJournalDetail(type as never, key, part)).toThrow(TypeError);
    expect(fetch).not.toHaveBeenCalled();
  });
});
