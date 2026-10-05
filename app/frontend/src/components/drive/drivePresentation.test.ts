import { describe, expect, it } from 'vitest';
import { driveTypeLabel, formatDriveDate, newestFirst } from './drivePresentation';

describe('drive presentation helpers', () => {
  it('uses stable type labels and absolute es-CL dates', () => {
    expect(driveTypeLabel('application/octet-stream', 'nota.md')).toBe('Markdown');
    expect(driveTypeLabel('application/pdf', 'nota.bin')).toBe('PDF');
    expect(formatDriveDate('not-a-date')).toBe('Fecha desconocida');
    expect(formatDriveDate('2026-09-16T14:30:00Z')).toMatch(/16 sept 2026/i);
  });

  it('sorts newest first without mutating source data', () => {
    const files = [
      { id: 'old', modifiedTime: '2026-09-01T00:00:00Z' },
      { id: 'new', modifiedTime: '2026-09-16T00:00:00Z' },
    ];

    expect(newestFirst(files).map((file) => file.id)).toEqual(['new', 'old']);
    expect(files.map((file) => file.id)).toEqual(['old', 'new']);
  });
});
