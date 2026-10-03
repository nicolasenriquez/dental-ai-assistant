"""Explicit manual note saves and bounded revision history."""

from collections.abc import Awaitable
from datetime import datetime
from typing import Annotated, Any, Literal, TypeVar
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, Field

from backend.auth.dependencies import get_current_user
from backend.db import patient_notes_repo as repo
from backend.patients.notes import (
    NoteBody,
    NoteConflict,
    NotesCursor,
    RevisionsCursor,
    decode_cursor,
    encode_cursor,
)

router = APIRouter(prefix="/patients/{patient_id}/notes", tags=["patient-notes"])
User = Annotated[dict[str, Any], Depends(get_current_user)]
Limit = Annotated[int, Query(ge=1, le=50)]
Cursor = Annotated[str | None, Query(max_length=1024)]
T = TypeVar("T")


class Actor(BaseModel):
    user_id: UUID
    display_name: str | None = None


class NoteResponse(BaseModel):
    id: UUID
    patient_id: UUID
    body: str
    revision: int
    created_by: Actor
    updated_by: Actor
    created_at: datetime
    updated_at: datetime


class NoteRevision(BaseModel):
    id: UUID
    note_id: UUID
    revision: int
    action: Literal["created", "edited"]
    previous_body: str | None
    new_body: str
    actor: Actor
    changed_at: datetime


class NotesPage(BaseModel):
    items: list[NoteResponse]
    next_cursor: str | None
    total: int


class RevisionsPage(BaseModel):
    items: list[NoteRevision]
    next_cursor: str | None
    total: int


class CreateNote(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID
    body: NoteBody


class UpdateNote(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: Annotated[int, Field(strict=True, ge=1)]
    body: NoteBody


async def _owned(operation: Awaitable[T]) -> T:
    try:
        return await operation
    except LookupError:
        raise HTTPException(
            404, detail={"code": "not_found", "message": "Registro no encontrado"}
        ) from None
    except NoteConflict as error:
        raise HTTPException(409, detail=error.detail) from None


def _cursor(
    value: str | None, patient: UUID, note: UUID | None = None
) -> NotesCursor | RevisionsCursor | None:
    try:
        return decode_cursor(value, patient, note)
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


def _note(row: dict[str, Any]) -> NoteResponse:
    # No authorized user display name is stored today; never fall back to email.
    return NoteResponse(
        **row,
        created_by=Actor(user_id=row["created_by_user_id"]),
        updated_by=Actor(user_id=row["updated_by_user_id"]),
    )


@router.get("", response_model=NotesPage)
async def notes(
    patient_id: UUID, user: User, limit: Limit = 20, cursor: Cursor = None
) -> NotesPage:
    before = _cursor(cursor, patient_id)
    assert before is None or isinstance(before, NotesCursor)
    rows, total = await _owned(repo.list_notes(UUID(str(user["id"])), patient_id, limit, before))
    items = [_note(row) for row in rows[:limit]]
    next_cursor = None
    if len(rows) > limit:
        last = items[-1]
        next_cursor = encode_cursor(
            NotesCursor(
                v=1, patient_id=patient_id, filter="notes", updated_at=last.updated_at, id=last.id
            )
        )
    return NotesPage(items=items, total=total, next_cursor=next_cursor)


@router.post("", response_model=NoteResponse, status_code=201)
async def create_note(
    patient_id: UUID, body: CreateNote, user: User, response: Response
) -> NoteResponse:
    row, created = await _owned(
        repo.create_note(UUID(str(user["id"])), patient_id, body.id, body.body)
    )
    response.status_code = 201 if created else 200
    return _note(row)


@router.get("/{note_id}", response_model=NoteResponse)
async def note(patient_id: UUID, note_id: UUID, user: User) -> NoteResponse:
    return _note(await _owned(repo.get_note(UUID(str(user["id"])), patient_id, note_id)))


@router.patch("/{note_id}", response_model=NoteResponse)
async def update_note(
    patient_id: UUID, note_id: UUID, body: UpdateNote, user: User
) -> NoteResponse:
    return _note(
        await _owned(
            repo.update_note(
                UUID(str(user["id"])), patient_id, note_id, body.expected_revision, body.body
            )
        )
    )


@router.get("/{note_id}/revisions", response_model=RevisionsPage)
async def revisions(
    patient_id: UUID, note_id: UUID, user: User, limit: Limit = 20, cursor: Cursor = None
) -> RevisionsPage:
    before = _cursor(cursor, patient_id, note_id)
    assert before is None or isinstance(before, RevisionsCursor)
    rows, total = await _owned(
        repo.list_revisions(UUID(str(user["id"])), patient_id, note_id, limit, before)
    )
    items = [NoteRevision(**row, actor=Actor(user_id=row["actor_user_id"])) for row in rows[:limit]]
    next_cursor = None
    if len(rows) > limit:
        last = items[-1]
        next_cursor = encode_cursor(
            RevisionsCursor(
                v=1,
                patient_id=patient_id,
                filter="note_revisions",
                resource_id=note_id,
                revision=last.revision,
                id=last.id,
            )
        )
    return RevisionsPage(items=items, total=total, next_cursor=next_cursor)
