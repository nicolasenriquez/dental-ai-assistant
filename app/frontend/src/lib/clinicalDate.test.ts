import { describe, expect, it } from 'vitest';
import {
  formatClinicalDate,
  formatClinicalDateLong,
  formatClinicalDateShort,
  formatClinicalDateTime,
  formatClinicalTime,
  normalizeClinicalDateInput,
  parseClinicalDateInput,
  parseClinicalDateTimeInput,
} from './clinicalDate';

describe('clinical date formatting', () => {
  it('uses Chilean date order and omits seconds from clinical timestamps', () => {
    expect(formatClinicalDate('1990-01-02T00:00:00')).toBe('02/01/1990');
    expect(formatClinicalDateTime('2026-09-04T10:30:00')).toContain('04 sep 2026 · 10:30');
    expect(formatClinicalDateTime('2026-09-04T10:30:00')).toContain('10:30');
    expect(formatClinicalDateTime('2026-09-04T10:30:00')).not.toContain(':00');
  });

  it('normalizes tolerant inputs and parses without accepting impossible dates', () => {
    for (const value of ['10041990', '10-04-1990', '10.04.1990', '10/04/1990', '1990-04-10']) {
      expect(normalizeClinicalDateInput(value)).toBe('10/04/1990');
      expect(parseClinicalDateInput(value)).toBe('1990-04-10');
    }
    expect(parseClinicalDateInput('31/02/1990')).toBeNull();
    expect(parseClinicalDateInput('06/09/2026', new Date(2026, 8, 5))).toBeNull();
    expect(parseClinicalDateInput('')).toBeNull();
  });

  it('provides separate short date, long date, and time labels for the workspace', () => {
    const value = '2026-09-04T23:28:00';

    expect(formatClinicalDateShort(value)).toContain('04');
    expect(formatClinicalDateLong(value)).toContain('septiembre');
    expect(formatClinicalTime(value)).toContain('28');
    expect(formatClinicalTime(value)).not.toContain(':00');
  });

  it('validates a complete local date and 24-hour time before producing an instant', () => {
    expect(parseClinicalDateTimeInput('29/02/2024', '15:30')).toBeInstanceOf(Date);
    expect(parseClinicalDateTimeInput('31/02/2024', '15:30')).toBeNull();
    expect(parseClinicalDateTimeInput('29/02/2024', '25:30')).toBeNull();
  });

  it.skipIf(Intl.DateTimeFormat().resolvedOptions().timeZone !== 'America/Santiago')(
    'rejects a nonexistent local time at the Chilean daylight-saving transition',
    () => {
      expect(parseClinicalDateTimeInput('06/09/2026', '00:30')).toBeNull();
      expect(parseClinicalDateTimeInput('06/09/2026', '01:30')).toBeInstanceOf(Date);
    },
  );
});
