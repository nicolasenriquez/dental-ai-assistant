import { describe, expect, it } from 'vitest';
import { getPatientAge } from './age';

describe('getPatientAge', () => {
  const today = new Date(2026, 8, 4);

  it('calculates age before and after the birthday', () => {
    expect(getPatientAge('1990-09-05', today)).toBe(35);
    expect(getPatientAge('1990-09-04', today)).toBe(36);
  });

  it('returns null for missing, malformed, impossible, or future dates', () => {
    expect(getPatientAge(null, today)).toBeNull();
    expect(getPatientAge('1990-9-4', today)).toBeNull();
    expect(getPatientAge('1990-02-30', today)).toBeNull();
    expect(getPatientAge('2027-01-01', today)).toBeNull();
  });
});
