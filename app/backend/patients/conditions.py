"""Fixed clinician-entered condition vocabulary and strict FDI/cursor validation."""

import binascii
from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    ValidationInfo,
    field_validator,
    model_validator,
)

from .cursors import decode_cursor_payload, encode_cursor_payload

Dentition = Literal["permanent", "primary"]
Surface = Literal["M", "D", "O", "V", "L"]
SURFACES = ("M", "D", "O", "V", "L")
CATALOG = {
    "pulpitis": "Pulpitis",
    "caries": "Caries",
    "incipient_caries": "Caries incipiente",
    "pigmentation": "Pigmentación",
    "fracture": "Fractura",
    "missing": "Ausente",
    "periapical_lt_2mm": "Lesión periapical <2 mm",
    "periapical_2_4mm": "Lesión periapical 2–4 mm",  # noqa: RUF001 - fixed catalog label
    "periapical_gt_4mm": "Lesión periapical >4 mm",
    "rotated": "Rotado",
    "displaced": "Desplazado",
    "unerupted": "No erupcionado",
}
SURFACE_CODES = {"caries", "incipient_caries", "pigmentation", "fracture"}
ConditionNote = Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]
ConditionStatus = Literal["active", "resolved", "entered_in_error"]
ConditionFilter = Literal["all", "active", "resolved", "entered_in_error"]


def valid_tooth(dentition: str, tooth: int) -> bool:
    quadrant, position = divmod(tooth, 10)
    return (dentition == "permanent" and quadrant in (1, 2, 3, 4) and 1 <= position <= 8) or (
        dentition == "primary" and quadrant in (5, 6, 7, 8) and 1 <= position <= 5
    )


def canonical_surfaces(value: list[str], code: str) -> list[str]:
    if len(value) != len(set(value)) or any(surface not in SURFACES for surface in value):
        raise ValueError("Superficies inválidas o repetidas")
    if value and code not in SURFACE_CODES:
        raise ValueError("Esta condición no admite superficies")
    return [surface for surface in SURFACES if surface in value]


class ConditionConflict(ValueError):
    def __init__(
        self,
        code: str,
        resource: UUID,
        revision: int | None = None,
        existing: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(code)
        self.detail: dict[str, Any] = {"code": code, "resource_id": str(resource)}
        if revision is not None:
            self.detail["current_revision"] = revision
        self.existing = existing


class ConditionsCursor(BaseModel):
    model_config = ConfigDict(extra="forbid")
    v: Literal[1]
    patient_id: UUID
    dentition: Dentition | None
    status: ConditionFilter
    tooth_fdi: Annotated[int, Field(strict=True)]
    created_at: datetime
    id: UUID

    @field_validator("tooth_fdi")
    @classmethod
    def tooth(cls, value: int) -> int:
        if not (valid_tooth("permanent", value) or valid_tooth("primary", value)):
            raise ValueError("Pieza inválida")
        return value


class ConditionRevisionsCursor(BaseModel):
    model_config = ConfigDict(extra="forbid")
    v: Literal[1]
    patient_id: UUID
    filter: Literal["condition_revisions"]
    resource_id: UUID
    revision: Annotated[int, Field(strict=True, ge=1)]
    id: UUID


def decode_cursor(
    value: str | None,
    patient: UUID,
    dentition: Dentition | None = None,
    status: str = "all",
    resource: UUID | None = None,
) -> ConditionsCursor | ConditionRevisionsCursor | None:
    if value is None:
        return None
    try:
        data = decode_cursor_payload(value)
        if not isinstance(data, dict) or type(data.get("v")) is not int:
            raise ValueError
        if resource is not None:
            revision = ConditionRevisionsCursor.model_validate(data)
            if revision.patient_id != patient or revision.resource_id != resource:
                raise ValueError
            return revision
        if not isinstance(data.get("created_at"), str):
            raise ValueError
        cursor = ConditionsCursor.model_validate(data)
        if (
            cursor.patient_id != patient
            or cursor.dentition != dentition
            or cursor.status != status
            or cursor.created_at.utcoffset() is None
        ):
            raise ValueError
        if dentition and not valid_tooth(dentition, cursor.tooth_fdi):
            raise ValueError
        return cursor
    except (ValueError, TypeError, binascii.Error):
        raise ValueError("Cursor inválido para este registro") from None


def encode_cursor(cursor: ConditionsCursor | ConditionRevisionsCursor) -> str:
    return encode_cursor_payload(cursor)


class CreateCondition(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID
    dentition: Dentition
    tooth_fdi: Annotated[int, Field(strict=True)]
    condition_code: str
    surfaces: list[Surface] = Field(default_factory=list)
    note: ConditionNote | None = None

    @field_validator("tooth_fdi")
    @classmethod
    def tooth(cls, value: int, info: ValidationInfo) -> int:
        if not valid_tooth(info.data.get("dentition", ""), value):
            raise ValueError("Pieza incompatible con la dentición")
        return value

    @field_validator("condition_code")
    @classmethod
    def code(cls, value: str) -> str:
        if value not in CATALOG:
            raise ValueError("Condición no admitida")
        return value

    @field_validator("surfaces")
    @classmethod
    def surfaces_value(cls, value: list[str], info: ValidationInfo) -> list[str]:
        return canonical_surfaces(value, info.data.get("condition_code", ""))

    @field_validator("note")
    @classmethod
    def blank_note(cls, value: str | None) -> str | None:
        return value or None


class UpdateCondition(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: Annotated[int, Field(strict=True, ge=1)]
    surfaces: list[Surface] = Field(default_factory=list)
    note: ConditionNote | None = None
    status: Literal["resolved"] = "resolved"

    @field_validator("note")
    @classmethod
    def blank_note(cls, value: str | None) -> str | None:
        return value or None

    @field_validator("surfaces")
    @classmethod
    def unique_surfaces(cls, value: list[str]) -> list[str]:
        return canonical_surfaces(value, "caries")

    @model_validator(mode="after")
    def mutable_required(self) -> "UpdateCondition":
        if not (self.model_fields_set & {"surfaces", "note", "status"}):
            raise ValueError("Incluye al menos un campo editable")
        return self


class CorrectCondition(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation_id: UUID
    expected_revision: Annotated[int, Field(strict=True, ge=1)]
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]
    replacement: CreateCondition | None = None


class CorrectionReceipt(BaseModel):
    operation_id: UUID
    condition_id: UUID
    correction_revision_id: UUID
    replacement_condition_id: UUID | None
    replacement_revision_id: UUID | None


class CorrectionMetadata(CorrectionReceipt):
    reason: str
