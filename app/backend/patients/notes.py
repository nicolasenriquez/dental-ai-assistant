"""Validation and cursor contract for manual notes, never model context."""

import base64
import binascii
import json
from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

NoteBody = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]


class NoteConflict(ValueError):
    def __init__(self, code: str, resource_id: UUID, revision: int | None = None) -> None:
        super().__init__(code)
        self.detail: dict[str, Any] = {"code": code, "resource_id": str(resource_id)}
        if revision is not None:
            self.detail["current_revision"] = revision


class NotesCursor(BaseModel):
    model_config = ConfigDict(extra="forbid")
    v: Literal[1]
    patient_id: UUID
    filter: Literal["notes"]
    updated_at: datetime
    id: UUID


class RevisionsCursor(BaseModel):
    model_config = ConfigDict(extra="forbid")
    v: Literal[1]
    patient_id: UUID
    filter: Literal["note_revisions"]
    resource_id: UUID
    revision: Annotated[int, Field(strict=True, ge=1)]
    id: UUID


def decode_cursor(
    cursor: str | None, patient: UUID, note: UUID | None = None
) -> NotesCursor | RevisionsCursor | None:
    if cursor is None:
        return None
    try:
        value = json.loads(
            base64.b64decode(cursor + "=" * (-len(cursor) % 4), altchars=b"-_", validate=True)
        )
        if not isinstance(value, dict) or type(value.get("v")) is not int:
            raise ValueError
        if note is None:
            if not isinstance(value.get("updated_at"), str):
                raise ValueError
            decoded = NotesCursor.model_validate(value)
            if decoded.updated_at.utcoffset() is None:
                raise ValueError
        else:
            revision_cursor = RevisionsCursor.model_validate(value)
            if revision_cursor.resource_id != note or revision_cursor.patient_id != patient:
                raise ValueError
            return revision_cursor
        if decoded.patient_id != patient:
            raise ValueError
        return decoded
    except (ValueError, TypeError, binascii.Error):
        raise ValueError("Cursor inválido para este registro") from None


def encode_cursor(cursor: NotesCursor | RevisionsCursor) -> str:
    return base64.urlsafe_b64encode(cursor.model_dump_json().encode()).decode().rstrip("=")
