import { describe, expect, it } from 'vitest';
import {
  formatClinicalDate,
  formatClinicalDateLong,
  formatClinicalDateShort,
  formatClinicalDateTime,
  formatClinicalTime,
  parseClinicalDateInput,
} from './clinicalDate';

describe('clinical date formatting', () => {
  it('uses Chilean date order and omits seconds from clinical timestamps', () => {
    expect(formatClinicalDate('1990-01-02T00:00:00')).toBe('02-01-1990');
    expect(formatClinicalDateTime('2026-09-04T10:30:00')).toContain('04-09-2026');
    expect(formatClinicalDateTime('2026-09-04T10:30:00')).toContain('10:30');
    expect(formatClinicalDateTime('2026-09-04T10:30:00')).not.toContain(':00');
  });

  it('parses the clinical date format without accepting impossible dates', () => {
    expect(parseClinicalDateInput('02/01/1990')).toBe('1990-01-02');
    expect(parseClinicalDateInput('31/02/1990')).toBeNull();
    expect(parseClinicalDateInput('1990-01-02')).toBeNull();
    expect(parseClinicalDateInput('')).toBeNull();
  });

  it('provides separate short date, long date, and time labels for the workspace', () => {
    const value = '2026-09-04T23:28:00';

    expect(formatClinicalDateShort(value)).toContain('04');
    expect(formatClinicalDateLong(value)).toContain('septiembre');
    expect(formatClinicalTime(value)).toContain('28');
    expect(formatClinicalTime(value)).not.toContain(':00');
  });
});
