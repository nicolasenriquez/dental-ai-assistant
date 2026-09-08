"""Public and validated contracts for the Clinical Assistant."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from backend.services.clinical_evolutions import ClinicalDraft

ClinicalText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40_000)
]


class ClinicalThreadCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)
    ] = "Asistente clínico"


class ActivePatientUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    patient_id: UUID | None


class ClinicalTurnRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    turn_id: UUID
    content: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40_000)
    ]


class PrepareSaveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    raw_note: ClinicalText
    draft: ClinicalDraft
    generated_draft: ClinicalDraft | None = None
    evolution_at: datetime
    final_text: ClinicalText | None = None

    @field_validator("evolution_at")
    @classmethod
    def validate_evolution_at(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("evolution_at debe incluir zona horaria")
        return value


class RegenerateDraftRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    raw_note: ClinicalText


class ActionResolutionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    decision: Literal["approve", "decline"]
    proposal_hash: Annotated[str, StringConstraints(pattern=r"^[a-f0-9]{64}$")]


class SafePatient(BaseModel):
    id: UUID
    first_name: str
    last_name: str
    rut_masked: str


class ClinicalPendingAction(BaseModel):
    id: UUID
    thread_id: UUID
    turn_id: UUID
    patient_id: UUID
    action_type: str
    proposal_payload: dict[str, object] | None = None
    proposal_hash: str
    status: str
    expires_at: datetime
    created_at: datetime
    resolved_at: datetime | None = None
    result_resource_id: UUID | None = None


class ClinicalThreadResponse(BaseModel):
    id: UUID
    owner_user_id: UUID
    title: str = "Asistente clínico"
    active_patient: SafePatient | None = None
    pending_action_patient: SafePatient | None = None
    active_turn_id: UUID | None = None
    created_at: datetime
    updated_at: datetime
    messages: list[dict[str, object]] = Field(default_factory=list)
    pending_action: ClinicalPendingAction | None = None
