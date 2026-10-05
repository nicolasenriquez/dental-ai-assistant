"""Explicit, owner-scoped manual diagnosis saves and revision history."""

import json
from collections.abc import Awaitable
from datetime import datetime
from typing import Annotated, Any, Literal, TypeVar
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator, model_validator

from backend.auth.dependencies import get_current_user
from backend.db import patient_conditions_repo as repo
from backend.patients.conditions import (
    CATALOG,
    SURFACE_CODES,
    SURFACES,
    ConditionConflict,
    ConditionNote,
    ConditionRevisionsCursor,
    ConditionsCursor,
    Dentition,
    Surface,
    canonical_surfaces,
    decode_cursor,
    encode_cursor,
    valid_tooth,
)
from backend.patients.schemas import Actor

router = APIRouter(prefix="/patients", tags=["patient-conditions"])
User = Annotated[dict[str, Any], Depends(get_current_user)]
Limit = Annotated[int, Query(ge=1, le=50)]
Cursor = Annotated[str | None, Query(max_length=1024)]
Status = Literal["all", "active", "resolved"]
T = TypeVar("T")


class ConditionSnapshot(BaseModel):
    dentition: Dentition
    tooth_fdi: int
    condition_code: str
    surfaces: list[Surface]
    note: str | None
    status: Literal["active", "resolved"]


class ConditionResponse(ConditionSnapshot):
    id: UUID
    patient_id: UUID
    revision: int
    created_by: Actor
    updated_by: Actor
    created_at: datetime
    updated_at: datetime


class ConditionRevision(BaseModel):
    id: UUID
    condition_id: UUID
    revision: int
    action: Literal["created", "edited", "resolved"]
    before: ConditionSnapshot | None
    after: ConditionSnapshot
    actor: Actor
    changed_at: datetime


class ConditionsPage(BaseModel):
    items: list[ConditionResponse]
    next_cursor: str | None
    total: int


class RevisionsPage(BaseModel):
    items: list[ConditionRevision]
    next_cursor: str | None
    total: int


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
        result: list[str] = canonical_surfaces(value, info.data.get("condition_code", ""))
        return result

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
        result: list[str] = canonical_surfaces(value, "caries")
        return result

    @model_validator(mode="after")
    def mutable_required(self) -> "UpdateCondition":
        if not (self.model_fields_set & {"surfaces", "note", "status"}):
            raise ValueError("Incluye al menos un campo editable")
        return self


def _condition(row: dict[str, Any]) -> ConditionResponse:
    return ConditionResponse(
        **row,
        created_by=Actor(user_id=row["created_by_user_id"]),
        updated_by=Actor(user_id=row["updated_by_user_id"]),
    )


async def _owned(operation: Awaitable[T]) -> T:
    try:
        return await operation
    except LookupError:
        raise HTTPException(
            404, detail={"code": "not_found", "message": "Registro no encontrado"}
        ) from None
    except ConditionConflict as error:
        detail = error.detail
        if error.existing:
            detail["existing"] = _condition(error.existing).model_dump(mode="json")
        raise HTTPException(409, detail=detail) from None
    except ValueError as error:
        raise HTTPException(
            422, detail=[{"loc": ["body", "surfaces"], "msg": str(error), "type": "value_error"}]
        ) from None


def _cursor(
    value: str | None,
    patient: UUID,
    dentition: Dentition | None = None,
    status: str = "all",
    resource: UUID | None = None,
) -> ConditionsCursor | ConditionRevisionsCursor | None:
    try:
        return decode_cursor(value, patient, dentition, status, resource)
    except ValueError:
        raise HTTPException(
            422,
            detail=[
                {
                    "loc": ["query", "cursor"],
                    "msg": "Cursor inválido para este registro",
                    "type": "value_error",
                }
            ],
        ) from None


@router.get("/condition-catalog")
async def catalog(user: User) -> dict[str, Any]:
    return {
        "version": 1,
        "conditions": [
            {
                "code": code,
                "label_es": label,
                "surface_codes": list(SURFACES) if code in SURFACE_CODES else [],
            }
            for code, label in CATALOG.items()
        ],
    }


@router.get("/{patient_id}/conditions", response_model=ConditionsPage)
async def conditions(
    patient_id: UUID,
    user: User,
    dentition: Dentition | None = None,
    status: Status = "all",
    limit: Limit = 20,
    cursor: Cursor = None,
) -> ConditionsPage:
    before = _cursor(cursor, patient_id, dentition, status)
    assert before is None or isinstance(before, ConditionsCursor)
    rows, total = await _owned(
        repo.list_conditions(UUID(str(user["id"])), patient_id, dentition, status, limit, before)
    )
    items = [_condition(row) for row in rows[:limit]]
    next_cursor = None
    if len(rows) > limit:
        last = items[-1]
        next_cursor = encode_cursor(
            ConditionsCursor(
                v=1,
                patient_id=patient_id,
                dentition=dentition,
                status=status,
                tooth_fdi=last.tooth_fdi,
                created_at=last.created_at,
                id=last.id,
            )
        )
    return ConditionsPage(items=items, total=total, next_cursor=next_cursor)


@router.post("/{patient_id}/conditions", response_model=ConditionResponse, status_code=201)
async def create_condition(
    patient_id: UUID, body: CreateCondition, user: User, response: Response
) -> ConditionResponse:
    row, created = await _owned(
        repo.create_condition(
            UUID(str(user["id"])), patient_id, body.id, body.model_dump(exclude={"id"})
        )
    )
    response.status_code = 201 if created else 200
    return _condition(row)


@router.get("/{patient_id}/conditions/{condition_id}", response_model=ConditionResponse)
async def condition(patient_id: UUID, condition_id: UUID, user: User) -> ConditionResponse:
    return _condition(
        await _owned(repo.get_condition(UUID(str(user["id"])), patient_id, condition_id))
    )


@router.patch("/{patient_id}/conditions/{condition_id}", response_model=ConditionResponse)
async def update_condition(
    patient_id: UUID, condition_id: UUID, body: UpdateCondition, user: User
) -> ConditionResponse:
    return _condition(
        await _owned(
            repo.update_condition(
                UUID(str(user["id"])),
                patient_id,
                condition_id,
                body.expected_revision,
                body.model_dump(exclude={"expected_revision"}, exclude_unset=True),
            )
        )
    )


@router.get("/{patient_id}/conditions/{condition_id}/revisions", response_model=RevisionsPage)
async def revisions(
    patient_id: UUID, condition_id: UUID, user: User, limit: Limit = 20, cursor: Cursor = None
) -> RevisionsPage:
    before = _cursor(cursor, patient_id, resource=condition_id)
    assert before is None or isinstance(before, ConditionRevisionsCursor)
    rows, total = await _owned(
        repo.list_revisions(UUID(str(user["id"])), patient_id, condition_id, limit, before)
    )
    items = [
        ConditionRevision(
            **row,
            before=json.loads(row["before_snapshot"]) if row["before_snapshot"] else None,
            after=json.loads(row["after_snapshot"]),
            actor=Actor(user_id=row["actor_user_id"]),
        )
        for row in rows[:limit]
    ]
    next_cursor = None
    if len(rows) > limit:
        last = items[-1]
        next_cursor = encode_cursor(
            ConditionRevisionsCursor(
                v=1,
                patient_id=patient_id,
                filter="condition_revisions",
                resource_id=condition_id,
                revision=last.revision,
                id=last.id,
            )
        )
    return RevisionsPage(items=items, total=total, next_cursor=next_cursor)
