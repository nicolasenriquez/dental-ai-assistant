"""Strict aggregate commands for clinical plan authoring."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from backend.patients.treatments import TreatmentInput

Title = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]
Text = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]
Label = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
StageNote = Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]
PlanState = Literal["draft", "pending", "active", "completed", "closed", "archived"]
ClosureReason = Literal[
    "rejected_by_patient", "expired", "cancelled_by_clinic", "patient_abandoned", "other"
]


class PlanCommand(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation_id: UUID
    expected_revision: Annotated[int, Field(strict=True, ge=1)]


class CreatePlan(PlanCommand):
    expected_revision: Annotated[int, Field(strict=True, ge=0, le=0)]
    id: UUID
    title: Title | None = None
    diagnosis: Text | None = None
    internal_notes: Text | None = None


class EditPlan(PlanCommand):
    title: Title | None = None
    diagnosis: Text | None = None
    internal_notes: Text | None = None

    @model_validator(mode="after")
    def changes(self) -> "EditPlan":
        if not {"title", "diagnosis", "internal_notes"}.intersection(self.model_fields_set):
            raise ValueError("No hay cambios")
        return self


class StageInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    label: Label = "Sesión 1"
    note: StageNote | None = None


class AddItem(PlanCommand):
    id: UUID
    treatment: TreatmentInput
    stages: Annotated[list[StageInput], Field(min_length=1, max_length=100)] = Field(
        default_factory=lambda: [StageInput()]
    )


class EditItem(PlanCommand):
    note: StageNote | None


class AddStage(PlanCommand, StageInput):
    id: UUID


class EditStage(PlanCommand):
    label: Label | None = None
    note: StageNote | None = None

    @model_validator(mode="after")
    def changes(self) -> "EditStage":
        if not {"label", "note"}.intersection(self.model_fields_set) or (
            "label" in self.model_fields_set and self.label is None
        ):
            raise ValueError("Sesión inválida")
        return self


class ReorderItems(PlanCommand):
    item_ids: Annotated[list[UUID], Field(min_length=1, max_length=1000)]

    @model_validator(mode="after")
    def unique(self) -> "ReorderItems":
        if len(set(self.item_ids)) != len(self.item_ids):
            raise ValueError("Elementos repetidos")
        return self


class AcceptPlan(PlanCommand):
    note: Text | None = None


class ClosePlan(PlanCommand):
    reason: ClosureReason
    note: Text | None = None
