"""Authenticated fixed catalog and observed-treatment API."""

import binascii
from collections.abc import Awaitable
from datetime import datetime
from typing import Annotated, Any, TypeVar
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import RootModel

from backend.auth.dependencies import get_current_user
from backend.db import patient_treatments_repo as repo
from backend.patients import treatment_service
from backend.patients.conditions import Dentition
from backend.patients.cursors import decode_cursor_payload, encode_cursor_payload
from backend.patients.treatment_catalog import catalog
from backend.patients.treatments import (
    CorrectTreatment,
    CreateTreatment,
    EditTreatment,
    TreatmentConflict,
)

router = APIRouter(prefix="/patients", tags=["patient-treatments"])
User = Annotated[dict[str, Any], Depends(get_current_user)]
Limit = Annotated[int, Query(ge=1, le=100)]
Cursor = Annotated[str | None, Query(max_length=1024)]
T = TypeVar("T")


async def _owned(operation: Awaitable[T]) -> T:
    try:
        return await operation
    except LookupError:
        raise HTTPException(404, detail={"code": "not_found"}) from None
    except TreatmentConflict as error:
        raise HTTPException(409, detail=error.detail) from None
    except ValueError as error:
        raise HTTPException(
            422, detail={"code": "invalid_treatment", "message": str(error)}
        ) from None


def _before(cursor: str | None, binding: dict[str, Any]) -> tuple[datetime, UUID] | None:
    if cursor is None:
        return None
    try:
        data = decode_cursor_payload(cursor)
        if (
            not isinstance(data, dict)
            or set(data) != {*binding, "at", "id"}
            or any(data.get(k) != v for k, v in binding.items())
            or not isinstance(data.get("at"), str)
            or not isinstance(data.get("id"), str)
        ):
            raise ValueError
        at = datetime.fromisoformat(data["at"])
        if at.utcoffset() is None:
            raise ValueError
        return at, UUID(data["id"])
    except (ValueError, TypeError, KeyError, binascii.Error):
        raise HTTPException(422, detail={"code": "invalid_cursor"}) from None


def _page(
    rows: list[dict[str, Any]], total: int, limit: int, binding: dict[str, Any], time_key: str
) -> dict[str, Any]:
    items = rows[:limit]
    cursor = None
    if len(rows) > limit:
        cursor = encode_cursor_payload(
            RootModel({**binding, "at": items[-1][time_key], "id": items[-1]["id"]})
        )
    return {"items": items, "total": total, "next_cursor": cursor}


@router.get("/treatment-catalog")
async def treatment_catalog(user: User) -> dict[str, Any]:
    return dict(catalog())


@router.get("/{patient_id}/dental-treatments")
async def treatments(
    patient_id: UUID,
    user: User,
    limit: Limit = 20,
    cursor: Cursor = None,
    dentition: Dentition | None = None,
) -> dict[str, Any]:
    owner = UUID(str(user["id"]))
    binding = {
        "owner": str(owner),
        "patient": str(patient_id),
        "dentition": dentition,
        "kind": "treatments",
    }
    rows, total = await _owned(
        repo.list_treatments(owner, patient_id, limit, _before(cursor, binding), dentition)
    )
    return _page(rows, total, limit, binding, "created_at")


@router.post("/{patient_id}/dental-treatments", status_code=201)
async def create(
    patient_id: UUID, body: CreateTreatment, user: User, response: Response
) -> dict[str, Any]:
    receipt, created = await _owned(
        treatment_service.execute(UUID(str(user["id"])), patient_id, body.id, body)
    )
    response.status_code = 201 if created else 200
    return dict(receipt)


@router.get("/{patient_id}/dental-treatments/{treatment_id}")
async def treatment(patient_id: UUID, treatment_id: UUID, user: User) -> dict[str, Any]:
    return await _owned(repo.get_treatment(UUID(str(user["id"])), patient_id, treatment_id))


@router.patch("/{patient_id}/dental-treatments/{treatment_id}")
async def edit(
    patient_id: UUID, treatment_id: UUID, body: EditTreatment, user: User
) -> dict[str, Any]:
    receipt, _ = await _owned(
        treatment_service.execute(UUID(str(user["id"])), patient_id, treatment_id, body)
    )
    return dict(receipt)


@router.post("/{patient_id}/dental-treatments/{treatment_id}/corrections", status_code=201)
async def correct(
    patient_id: UUID, treatment_id: UUID, body: CorrectTreatment, user: User, response: Response
) -> dict[str, Any]:
    receipt, created = await _owned(
        treatment_service.execute(UUID(str(user["id"])), patient_id, treatment_id, body)
    )
    response.status_code = 201 if created else 200
    return dict(receipt)


@router.get("/{patient_id}/dental-treatments/{treatment_id}/revisions")
async def revisions(
    patient_id: UUID, treatment_id: UUID, user: User, limit: Limit = 20, cursor: Cursor = None
) -> dict[str, Any]:
    owner = UUID(str(user["id"]))
    binding = {
        "owner": str(owner),
        "patient": str(patient_id),
        "resource": str(treatment_id),
        "kind": "treatment_revisions",
    }
    rows, total = await _owned(
        repo.list_revisions(owner, patient_id, treatment_id, limit, _before(cursor, binding))
    )
    return _page(rows, total, limit, binding, "changed_at")
