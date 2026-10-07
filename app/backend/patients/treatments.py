"""Strict observed-treatment commands with catalog-driven anatomical scopes."""

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
    role: Literal["tooth", "pillar", "pontic"] = "tooth"
    surfaces: list[Surface] = Field(default_factory=list)


class TreatmentInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID
    variant_id: str
    dentition: Dentition
    teeth: Annotated[list[ToothMember], Field(max_length=32)]
    arch: Literal["upper", "lower"] | None = None
    note: Note | None = None

    @model_validator(mode="after")
    def anatomy(self) -> "TreatmentInput":
        variant = VARIANTS.get(self.variant_id)
        if variant is None or not variant["enabled"]:
            raise ValueError("Variante o ámbito no disponible")
        if self.dentition not in variant["allowed_dentitions"]:
            raise ValueError("Dentición no admitida")
        scope = variant["scope"]
        if scope == "global_arch":
            if self.arch is None or self.teeth:
                raise ValueError("Selecciona una arcada sin piezas individuales")
        elif self.arch is not None:
            raise ValueError("Este procedimiento no admite arcada global")
        if scope == "tooth" and len(self.teeth) != 1:
            raise ValueError("Selecciona una sola pieza")
        if scope == "multi_tooth" and len(self.teeth) < 2:
            raise ValueError("Selecciona al menos dos piezas")
        if len({m.tooth_fdi for m in self.teeth}) != len(self.teeth):
            raise ValueError("Piezas repetidas")
        for member in self.teeth:
            if not valid_tooth(self.dentition, member.tooth_fdi):
                raise ValueError("Pieza inválida para esta dentición")
            member.surfaces = validate_surfaces(member.surfaces, self.variant_id)
            bridge = variant["clinical_type"] == "bridge"
            if (bridge and member.role not in ("pillar", "pontic")) or (
                not bridge and member.role != "tooth"
            ):
                raise ValueError("Rol inválido para este procedimiento")
        if scope == "multi_tooth":
            if len({m.tooth_fdi // 10 in (1, 2, 5, 6) for m in self.teeth}) != 1:
                raise ValueError("Las piezas deben pertenecer a la misma arcada")
            if variant["clinical_type"] == "bridge" and not any(
                m.role == "pillar" for m in self.teeth
            ):
                raise ValueError("El puente requiere al menos un pilar")
        self.teeth.sort(key=lambda m: m.tooth_fdi)
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
    expected_plan_revision: Annotated[int, Field(strict=True, ge=1)] | None = None
    reason: Reason
    replacement: TreatmentInput | None = None
