"""Owned Activity projection over approved saves and manual revisions."""

from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from backend.auth.dependencies import get_current_user
from backend.db import patient_activity_repo as repo
from backend.patients.activity import (
    ActivityCursor,
    ActivityFilter,
    ActivityKind,
    decode_cursor,
    encode_cursor,
)
from backend.patients.schemas import Actor

router = APIRouter(prefix="/patients/{patient_id}/activity", tags=["patient-activity"])


class ActivityItem(BaseModel):
    event_id: UUID
    resource_id: UUID
    kind: ActivityKind
    action: Literal["created", "edited", "resolved"]
    occurred_at: datetime
    actor: Actor | None
    title: str
    tooth_fdi: int | None
    href: str


class ActivityPage(BaseModel):
    items: list[ActivityItem]
    next_cursor: str | None
    total: int


def _item(row: dict[str, Any], patient: UUID) -> ActivityItem:
    kind, action, resource = row["kind"], row["action"], row["resource_id"]
    if kind == "evolutions":
        title, href = "Evolución guardada en ficha", f"/patients/{patient}/evolutions/{resource}"
    elif kind == "notes":
        title = "Nota creada" if action == "created" else "Nota editada"
        href = f"/patients/{patient}?tab=info&note={resource}"
    else:
        title = {
            "created": "Condición registrada",
            "edited": "Condición editada",
            "resolved": "Condición resuelta",
        }[action]
        href = f"/patients/{patient}?tab=clinical&condition={resource}"
    actor = Actor(user_id=row["actor_user_id"]) if row["actor_user_id"] else None
    return ActivityItem(**row, title=title, href=href, actor=actor)


@router.get("", response_model=ActivityPage)
async def activity(
    patient_id: UUID,
    user: Annotated[dict[str, Any], Depends(get_current_user)],
    kind: ActivityFilter = "all",
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    cursor: Annotated[str | None, Query(max_length=1024)] = None,
) -> ActivityPage:
    try:
        before = decode_cursor(cursor, patient_id, kind)
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
    try:
        rows, total = await repo.list_activity(
            UUID(str(user["id"])), patient_id, kind, limit, before
        )
    except LookupError:
        raise HTTPException(
            404, detail={"code": "not_found", "message": "Registro no encontrado"}
        ) from None
    items = [_item(row, patient_id) for row in rows[:limit]]
    next_cursor = None
    if len(rows) > limit:
        last = items[-1]
        next_cursor = encode_cursor(
            ActivityCursor(
                v=1,
                patient_id=patient_id,
                filter=kind,
                occurred_at=last.occurred_at,
                kind=last.kind,
                event_id=last.event_id,
            )
        )
    return ActivityPage(items=items, total=total, next_cursor=next_cursor)
