"""Projection DTO and stable keyset pagination, without new task persistence."""

import base64
import binascii
import json
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

from backend.db import clinical_pending_work_repo, patients_repo
from backend.patients.rut import mask_rut


class PendingWorkPatient(BaseModel):
    id: UUID
    display_name: str
    rut_masked: str


class ReviewApproval(BaseModel):
    kind: Literal["review_approval"] = "review_approval"
    action_id: UUID
    thread_id: UUID


class ContinueDraft(BaseModel):
    kind: Literal["continue_draft"] = "continue_draft"
    artifact_id: UUID
    thread_id: UUID


class RetryExport(BaseModel):
    kind: Literal["retry_drive_export"] = "retry_drive_export"
    evolution_id: UUID
    thread_id: UUID | None = None


class PendingWorkItem(BaseModel):
    id: str
    kind: Literal["approval_required", "recoverable_draft", "drive_export_failed"]
    patient: PendingWorkPatient
    updated_at: datetime
    action: ReviewApproval | ContinueDraft | RetryExport


class PendingWorkPage(BaseModel):
    items: list[PendingWorkItem]
    next_cursor: str | None
    total: int


def decode_cursor(cursor: str | None) -> tuple[datetime, str] | None:
    if cursor is None:
        return None
    try:
        value = json.loads(base64.b64decode(cursor, altchars=b"-_", validate=True))
        timestamp = datetime.fromisoformat(value[0])
        item_id = value[1]
        if timestamp.utcoffset() is None or not isinstance(item_id, str):
            raise ValueError
        prefix, resource = item_id.split(":", 1)
        if prefix not in {"approval", "draft", "drive"}:
            raise ValueError
        UUID(resource)
        return timestamp, item_id
    except (ValueError, TypeError, IndexError, KeyError, binascii.Error):
        raise ValueError("Invalid pending cursor") from None


async def list_pending_work(
    owner: UUID,
    patient_id: UUID | None,
    limit: int,
    cursor: str | None,
    kind: Literal["approval_required", "recoverable_draft", "drive_export_failed"] | None = None,
) -> PendingWorkPage:
    before = decode_cursor(cursor)
    if patient_id is not None and await patients_repo.get_patient(owner, patient_id) is None:
        raise LookupError("Patient not found")
    rows = await clinical_pending_work_repo.list_pending_work(
        owner, patient_id, limit, before, kind=kind
    )
    total = int(rows[0]["total"]) if rows else 0
    rows = [row for row in rows if row["id"] is not None]
    items = []
    for row in rows[:limit]:
        resource = row["resource_id"]
        thread = row["thread_id"]
        action: ReviewApproval | ContinueDraft | RetryExport
        if row["kind"] == "approval_required":
            action = ReviewApproval(action_id=resource, thread_id=thread)
        elif row["kind"] == "recoverable_draft":
            action = ContinueDraft(artifact_id=resource, thread_id=thread)
        else:
            action = RetryExport(evolution_id=resource, thread_id=thread)
        items.append(
            PendingWorkItem(
                id=row["id"],
                kind=row["kind"],
                updated_at=row["updated_at"],
                action=action,
                patient=PendingWorkPatient(
                    id=row["patient_id"],
                    display_name=f"{row['first_name']} {row['last_name']}",
                    rut_masked=mask_rut(row["rut_number"], row["rut_dv"]),
                ),
            )
        )
    next_cursor = None
    if len(rows) > limit:
        last = items[-1]
        next_cursor = base64.urlsafe_b64encode(
            json.dumps([last.updated_at.isoformat(), last.id]).encode()
        ).decode()
    return PendingWorkPage(items=items, next_cursor=next_cursor, total=total)
