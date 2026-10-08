/**
 * Characterization tests for the condition-correction protocol (ARCH-002).
 *
 * Pins the two policies the module owns: idempotent command freezing and the
 * failure taxonomy, so the view's retry/conflict handling cannot drift.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, correctPatientCondition } from './api';
import {
  classifyCorrectionFailure,
  freezeCorrection,
  submitCorrection,
} from './conditionCorrection';

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return {
    ...actual,
    correctPatientCondition: vi.fn(),
  };
});

const correctMock = vi.mocked(correctPatientCondition);

const draft: {
  id: string;
  dentition: 'permanent';
  tooth_fdi: number;
  condition_code: string;
  surfaces: import('./api').ToothSurface[];
  note: string;
  reason: string;
  replacement: boolean;
} = {
  id: 'replacement-id',
  dentition: 'permanent',
  tooth_fdi: 16,
  condition_code: 'caries',
  surfaces: ['O', 'V'],
  note: '  nota con espacios  ',
  reason: '  diagnóstico erróneo  ',
  replacement: true,
};

describe('freezeCorrection', () => {
  it('freezes an idempotent command with trimmed reason and replacement', () => {
    const command = freezeCorrection(7, draft, ['M', 'D', 'O', 'V', 'L']);

    expect(command.operation_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(command.expected_revision).toBe(7);
    expect(command.reason).toBe('diagnóstico erróneo');
    expect(command.replacement).toEqual({
      id: 'replacement-id',
      dentition: 'permanent',
      tooth_fdi: 16,
      condition_code: 'caries',
      surfaces: ['O', 'V'],
      note: 'nota con espacios',
    });
  });

  it('sends replacement null when the correction has no replacement', () => {
    const command = freezeCorrection(3, { ...draft, replacement: false }, ['M', 'O']);

    expect(command.replacement).toBeNull();
    expect(command.expected_revision).toBe(3);
  });

  it('orders replacement surfaces by the odontogram order, not the draft order', () => {
    const command = freezeCorrection(1, { ...draft, surfaces: ['V', 'O'] }, [
      'M',
      'D',
      'O',
      'V',
      'L',
    ]);

    expect(command.replacement?.surfaces).toEqual(['O', 'V']);
  });
});

describe('classifyCorrectionFailure', () => {
  it.each([
    ['revision_conflict', 'revision_conflict'],
    ['condition_entered_in_error', 'condition_entered_in_error'],
  ])('classifies 409 %s as a reviewable conflict', (code, kind) => {
    const failure = classifyCorrectionFailure(new ApiError(409, { detail: { code } }));

    expect(failure.kind).toBe(kind);
    expect(failure.message).toContain('La condición cambió');
  });

  it('classifies 409 idempotency_conflict separately', () => {
    const failure = classifyCorrectionFailure(
      new ApiError(409, { detail: { code: 'idempotency_conflict' } }),
    );

    expect(failure.kind).toBe('idempotency_conflict');
    expect(failure.message).toContain('Descarta el borrador');
  });

  it('classifies 404, 422 and other 409 codes distinctly', () => {
    expect(classifyCorrectionFailure(new ApiError(404, {})).kind).toBe('not_found');
    expect(classifyCorrectionFailure(new ApiError(422, {})).kind).toBe('invalid');
    expect(classifyCorrectionFailure(new ApiError(409, { detail: { code: 'other' } })).kind).toBe(
      'condition_active',
    );
  });

  it('classifies response loss as unknown with the retry contract', () => {
    const failure = classifyCorrectionFailure(new TypeError('response lost'));

    expect(failure.kind).toBe('unknown');
    expect(failure.message).toContain('Reintenta con el mismo contenido');
  });
});

describe('submitCorrection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the receipt on success', async () => {
    const receipt = {
      operation_id: 'op-1',
      condition_id: 'c1',
      correction_revision_id: 'r1',
      replacement_condition_id: null,
      replacement_revision_id: null,
    };
    correctMock.mockResolvedValue(receipt);

    const outcome = await submitCorrection('p1', 'c1', {
      operation_id: 'op-1',
      expected_revision: 1,
      reason: 'razón',
      replacement: null,
    });

    expect(outcome).toEqual({ ok: true, receipt });
    expect(correctMock).toHaveBeenCalledWith(
      'p1',
      'c1',
      expect.objectContaining({ operation_id: 'op-1' }),
    );
  });

  it('classifies a rejected correction without throwing', async () => {
    correctMock.mockRejectedValue(new ApiError(409, { detail: { code: 'revision_conflict' } }));

    const outcome = await submitCorrection('p1', 'c1', {
      operation_id: 'op-2',
      expected_revision: 2,
      reason: 'razón',
      replacement: null,
    });

    expect(outcome).toMatchObject({ ok: false, failure: { kind: 'revision_conflict' } });
  });
});
