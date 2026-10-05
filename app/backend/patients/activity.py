"""Strict, patient/filter-bound Activity cursor."""

import binascii
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from .cursors import decode_cursor_payload, encode_cursor_payload

ActivityKind = Literal["evolutions", "notes", "diagnoses"]
ActivityFilter = Literal["all", "evolutions", "notes", "diagnoses"]


class ActivityCursor(BaseModel):
    model_config = ConfigDict(extra="forbid")
    v: Literal[1]
    patient_id: UUID
    filter: ActivityFilter
    occurred_at: datetime
    kind: ActivityKind
    event_id: UUID


def decode_cursor(value: str | None, patient: UUID, kind: ActivityFilter) -> ActivityCursor | None:
    if value is None:
        return None
    try:
        payload = decode_cursor_payload(value)
        if (
            not isinstance(payload, dict)
            or type(payload.get("v")) is not int
            or not isinstance(payload.get("occurred_at"), str)
        ):
            raise ValueError
        cursor = ActivityCursor.model_validate(payload)
        if (
            cursor.patient_id != patient
            or cursor.filter != kind
            or cursor.occurred_at.utcoffset() is None
            or (kind != "all" and cursor.kind != kind)
        ):
            raise ValueError
        return cursor
    except (ValueError, TypeError, binascii.Error):
        raise ValueError("Cursor inválido para este registro") from None


def encode_cursor(cursor: ActivityCursor) -> str:
    return encode_cursor_payload(cursor)
