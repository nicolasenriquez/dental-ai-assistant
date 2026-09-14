import { describe, expect, it } from 'vitest';
import type { DriveJournalDetail, DriveJournalSummary } from './api';
import { filterDriveJournalEntries, groupDriveJournals } from './driveJournals';

const summary = (overrides: Partial<DriveJournalSummary> = {}): DriveJournalSummary => ({
  period_type: 'weekly',
  period_key: '2026-W37',
  journal_part: 1,
  display_name: 'Evoluciones — 2026-W37.txt',
  updated_at: '2026-09-12T12:00:00Z',
  ...overrides,
});

const detail: DriveJournalDetail = {
  ...summary(),
  entries: [
    {
      evolution_id: 'evolution-1',
      occurred_at: '2026-09-12T10:00:00Z',
      patient_display_name: 'Ana Pérez',
      patient_rut_masked: '12.345.•••-6',
      content: 'Control periodontal estable',
    },
    {
      evolution_id: 'evolution-2',
      occurred_at: '2026-09-11T10:00:00Z',
      patient_display_name: 'Bruno Gómez',
      patient_rut_masked: '9.876.•••-1',
      content: 'Ajuste de restauración',
    },
  ],
};

describe('Drive journal view helpers', () => {
  it('groups rollover parts by period and sorts parts without using filenames as keys', () => {
    const groups = groupDriveJournals([
      summary({ journal_part: 2, display_name: 'parte-2.txt' }),
      summary({ journal_part: 1 }),
      summary({ period_type: 'daily', period_key: '2026-09-14', display_name: 'diario.txt' }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      period_type: 'weekly',
      period_key: '2026-W37',
      label: 'Semana 37 de 2026',
    });
    expect(groups[0]?.parts.map((part) => part.journal_part)).toEqual([1, 2]);
    expect(groups[1]?.label).toBe('14 de septiembre de 2026');
  });

  it('filters only fields from currently loaded detail and restores all entries when cleared', () => {
    expect(filterDriveJournalEntries(detail, 'bruno')).toEqual([detail.entries[1]]);
    expect(filterDriveJournalEntries(detail, '2026-09-12')).toEqual([detail.entries[0]]);
    expect(filterDriveJournalEntries(detail, '')).toBe(detail.entries);
  });
});
