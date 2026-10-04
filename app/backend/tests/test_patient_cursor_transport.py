"""Shared transport must preserve each resource's cursor trust boundary."""

import base64
import json
from datetime import UTC, datetime
from uuid import uuid4

import pytest

from backend.patients import activity, conditions, notes


@pytest.mark.parametrize("kind", ["notes", "conditions", "activity"])
@pytest.mark.parametrize("mutation", ["none", "patient", "version", "timezone", "base64"])
def test_cursor_round_trip_and_binding(kind: str, mutation: str) -> None:
    patient = uuid4()
    timestamp = datetime.now(UTC)
    domain = {"notes": notes, "conditions": conditions, "activity": activity}[kind]
    args = (patient, "all") if kind == "activity" else (patient,)
    if kind == "notes":
        cursor = notes.NotesCursor(
            v=1, patient_id=patient, filter="notes", updated_at=timestamp, id=uuid4()
        )
        date_key = "updated_at"
    elif kind == "conditions":
        cursor = conditions.ConditionsCursor(
            v=1,
            patient_id=patient,
            dentition=None,
            status="all",
            tooth_fdi=11,
            created_at=timestamp,
            id=uuid4(),
        )
        date_key = "created_at"
    else:
        cursor = activity.ActivityCursor(
            v=1,
            patient_id=patient,
            filter="all",
            occurred_at=timestamp,
            kind="notes",
            event_id=uuid4(),
        )
        date_key = "occurred_at"
    if mutation == "none":
        assert domain.decode_cursor(domain.encode_cursor(cursor), *args) == cursor
        return
    payload = cursor.model_dump(mode="json")
    if mutation == "patient":
        payload["patient_id"] = str(uuid4())
    elif mutation == "version":
        payload["v"] = True
    elif mutation == "timezone":
        payload[date_key] = timestamp.replace(tzinfo=None).isoformat()
    token = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    if mutation == "base64":
        token = "@@@"
    with pytest.raises(ValueError, match="Cursor inválido"):
        domain.decode_cursor(token, *args)
