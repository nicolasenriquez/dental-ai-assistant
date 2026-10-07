"""Strict observed-treatment commands. Scope expansion follows in Slice3."""

from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from backend.patients.conditions import SURFACES, Dentition, Surface, valid_tooth
from backend.patients.treatment_catalog import VARIANTS

Note = Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]
Reason = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]


class TreatmentConflict(ValueError):
    def __init__(self, code: str, latest: dict[str, Any] | None = None) -> None:
        super().__init__(code)
        self.detail: dict[str, Any] = {"code": code}
        if latest is not None:
            self.detail["latest"] = latest


class ToothMember(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tooth_fdi: Annotated[int, Field(strict=True)]
    role: Literal["tooth"] = "tooth"
    surfaces: list[Surface] = Field(default_factory=list)


class TreatmentInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID
    variant_id: str
    dentition: Dentition
    teeth: Annotated[list[ToothMember], Field(min_length=1, max_length=1)]
    note: Note | None = None

    @model_validator(mode="after")
    def anatomy(self) -> "TreatmentInput":
        variant = VARIANTS.get(self.variant_id)
        if variant is None or not variant["enabled"]:
            raise ValueError("Variante o ámbito no disponible")
        for member in self.teeth:
            if not valid_tooth(self.dentition, member.tooth_fdi):
                raise ValueError("Pieza inválida para esta dentición")
            member.surfaces = validate_surfaces(member.surfaces, self.variant_id)
        self.note = self.note or None
        return self


def validate_surfaces(surfaces: list[Surface], variant_id: str) -> list[Surface]:
    allowed = VARIANTS[variant_id]["surface_codes"]
    if len(set(surfaces)) != len(surfaces) or any(s not in allowed for s in surfaces):
        raise ValueError("Superficies inválidas o repetidas")
    return [s for s in SURFACES if s in surfaces]


class CreateTreatment(TreatmentInput):
    operation_id: UUID
    expected_revision: Annotated[int, Field(strict=True, ge=0, le=0)]


class EditTreatment(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation_id: UUID
    expected_revision: Annotated[int, Field(strict=True, ge=1)]
    note: Note | None = None
    surfaces: list[Surface] | None = None

    @model_validator(mode="after")
    def changes(self) -> "EditTreatment":
        if not {"note", "surfaces"}.intersection(self.model_fields_set):
            raise ValueError("No hay cambios")
        if "surfaces" in self.model_fields_set and self.surfaces is None:
            raise ValueError("Superficies inválidas")
        self.note = self.note or None
        return self


class CorrectTreatment(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation_id: UUID
    expected_revision: Annotated[int, Field(strict=True, ge=1)]
    reason: Reason
    replacement: TreatmentInput | None = None
