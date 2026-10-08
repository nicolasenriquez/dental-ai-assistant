/**
 * Deep policy for condition-correction attempts (ARCH-002).
 *
 * Owns the two decisions that previously lived inside the view:
 * 1. Freezing the idempotent correction command (operation_id +
 *    expected_revision + optional replacement) so an uncertain retry
 *    re-sends the exact same command.
 * 2. Classifying every failure the corrections endpoint can produce into a
 *    stable taxonomy, with the incumbent user-facing copy.
 *
 * Views keep focus management, announcements, and navigation; this module is
 * the pure seam for the retry/conflict characterization tests.
 */

import {
  ApiError,
  type ConditionCorrectionReceipt,
  type CorrectPatientCondition,
  type Dentition,
  type ToothSurface,
  correctPatientCondition,
} from './api';

export type CorrectionFailureKind =
  | 'revision_conflict'
  | 'condition_entered_in_error'
  | 'idempotency_conflict'
  | 'not_found'
  | 'invalid'
  | 'condition_active'
  | 'unknown';

export interface CorrectionFailure {
  kind: CorrectionFailureKind;
  message: string;
}

export type CorrectionOutcome =
  | { ok: true; receipt: ConditionCorrectionReceipt }
  | { ok: false; failure: CorrectionFailure };

export interface CorrectionDraftInput {
  id: string;
  dentition: Dentition;
  tooth_fdi: number;
  condition_code: string;
  surfaces: ToothSurface[];
  note: string | null;
  reason: string;
  replacement: boolean;
}

export function freezeCorrection(
  sourceRevision: number,
  draft: CorrectionDraftInput,
  orderedSurfaceCodes: ToothSurface[],
): CorrectPatientCondition {
  return {
    operation_id: crypto.randomUUID(),
    expected_revision: sourceRevision,
    reason: draft.reason.trim(),
    replacement: draft.replacement
      ? {
          id: draft.id,
          dentition: draft.dentition,
          tooth_fdi: draft.tooth_fdi,
          condition_code: draft.condition_code,
          surfaces: orderedSurfaceCodes.filter((code) => draft.surfaces.includes(code)),
          note: draft.note?.trim() || null,
        }
      : null,
  };
}

export async function submitCorrection(
  patientId: string,
  sourceId: string,
  command: CorrectPatientCondition,
): Promise<CorrectionOutcome> {
  try {
    const receipt = await correctPatientCondition(patientId, sourceId, command);
    return { ok: true, receipt };
  } catch (error) {
    return { ok: false, failure: classifyCorrectionFailure(error) };
  }
}

export function classifyCorrectionFailure(error: unknown): CorrectionFailure {
  if (error instanceof ApiError && [404, 409, 422].includes(error.status)) {
    const detail = (error.body as { detail?: { code?: string } })?.detail;
    const code = detail?.code ?? '';
    if (error.status === 409 && code === 'idempotency_conflict') {
      return {
        kind: 'idempotency_conflict',
        message:
          'Este intento tiene otro contenido guardado. Descarta el borrador y consulta el historial.',
      };
    }
    if (
      error.status === 409 &&
      ['revision_conflict', 'condition_entered_in_error'].includes(code)
    ) {
      return {
        kind: code as CorrectionFailureKind,
        message:
          'La condición cambió. Revisa el original actual antes de confirmar una nueva corrección.',
      };
    }
    if (error.status === 404) {
      return {
        kind: 'not_found',
        message: 'La condición no está disponible. Conservamos tu borrador.',
      };
    }
    if (error.status === 422) {
      return {
        kind: 'invalid',
        message: 'Revisa el motivo y los datos del reemplazo (máximo 1000 caracteres).',
      };
    }
    return {
      kind: 'condition_active',
      message:
        'Ya existe esta condición activa. Conservamos el motivo y el reemplazo; revisa sus datos.',
    };
  }
  // Network loss or an unexpected transport failure: NOT a server rejection.
  // Callers must retain the frozen attempt so an identical retry is possible.
  return {
    kind: 'unknown',
    message:
      'No confirmamos la corrección. Reintenta con el mismo contenido. Descartar no deshace una corrección que pudo guardarse.',
  };
}
