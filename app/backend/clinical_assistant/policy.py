"""Clinical Assistant authorization and safe failure vocabulary."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID


class ClinicalPolicyError(RuntimeError):
    code = "CLINICAL_POLICY_ERROR"


class ClinicalExternalDisabled(ClinicalPolicyError):
    code = "CLINICAL_EXTERNAL_LLM_DISABLED"


class PatientSwitchRequired(ClinicalPolicyError):
    code = "PATIENT_SWITCH_REQUIRED"


class AmbiguousPatientReference(ClinicalPolicyError):
    code = "PATIENT_REFERENCE_AMBIGUOUS"


class TurnAlreadyRunning(ClinicalPolicyError):
    code = "TURN_ALREADY_RUNNING"


class TurnIdempotencyConflict(ClinicalPolicyError):
    code = "TURN_IDEMPOTENCY_CONFLICT"


@dataclass(frozen=True)
class ClinicalTurnContext:
    user_id: UUID
    thread_id: UUID
    turn_id: UUID
    patient_id: UUID | None
