"""Authenticated typed dental-note endpoints."""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Response

from backend.db import patient_clinical_notes_repo as repo
from backend.patients.clinical_notes import (
    TEMPLATES,
    CreateClinicalNote,
    EditClinicalNote,
    NoteCommand,
    execute,
)
from backend.routes.patient_treatments import Cursor, Limit, User, _before, _owned, _page

router = APIRouter(prefix="/patients", tags=["patient-clinical-notes"])


@router.get("/clinical-note-templates")
async def templates(user: User, category: str = "diagnosis") -> dict[str, Any]:
    return {"items": [t for t in TEMPLATES if t["category"] == category]}


@router.get("/{patient_id}/clinical-notes")
async def notes(
    patient_id: UUID, user: User, limit: Limit = 20, cursor: Cursor = None
) -> dict[str, Any]:
    owner = UUID(str(user["id"]))
    binding = {"owner": str(owner), "patient": str(patient_id), "kind": "clinical_notes"}
    rows, total = await _owned(repo.list_notes(owner, patient_id, limit, _before(cursor, binding)))
    return dict(_page(rows, total, limit, binding, "created_at"))


@router.post("/{patient_id}/clinical-notes", status_code=201)
async def create(
    patient_id: UUID, body: CreateClinicalNote, user: User, response: Response
) -> dict[str, Any]:
    result, created = await _owned(
        execute(UUID(str(user["id"])), patient_id, body.id, body, adapter=repo.command)
    )
    response.status_code = 201 if created else 200
    return dict(result)


@router.get("/{patient_id}/clinical-notes/{note_id}")
async def note(patient_id: UUID, note_id: UUID, user: User) -> dict[str, Any]:
    return dict(await _owned(repo.get_note(UUID(str(user["id"])), patient_id, note_id)))


@router.patch("/{patient_id}/clinical-notes/{note_id}")
async def edit(
    patient_id: UUID, note_id: UUID, body: EditClinicalNote, user: User
) -> dict[str, Any]:
    result, _ = await _owned(
        execute(UUID(str(user["id"])), patient_id, note_id, body, adapter=repo.command)
    )
    return dict(result)


@router.post("/{patient_id}/clinical-notes/{note_id}/delete")
async def delete(patient_id: UUID, note_id: UUID, body: NoteCommand, user: User) -> dict[str, Any]:
    result, _ = await _owned(
        execute(UUID(str(user["id"])), patient_id, note_id, body, adapter=repo.command)
    )
    return dict(result)


@router.get("/{patient_id}/clinical-notes/{note_id}/revisions")
async def revisions(
    patient_id: UUID, note_id: UUID, user: User, limit: Limit = 20, cursor: Cursor = None
) -> dict[str, Any]:
    owner = UUID(str(user["id"]))
    binding = {
        "owner": str(owner),
        "patient": str(patient_id),
        "resource": str(note_id),
        "kind": "clinical_note_revisions",
    }
    rows, total = await _owned(
        repo.list_revisions(owner, patient_id, note_id, limit, _before(cursor, binding))
    )
    return dict(_page(rows, total, limit, binding, "changed_at"))
