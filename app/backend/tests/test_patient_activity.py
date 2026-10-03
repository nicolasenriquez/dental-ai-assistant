"""Activity is an authenticated bounded read, never an empty fallback."""

import base64
import json
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from backend.auth.dependencies import get_current_user
from backend.main import app
from backend.patients.activity import ActivityCursor, decode_cursor, encode_cursor


def test_activity_cursor_is_strict_and_bound() -> None:
    patient, event = uuid4(), uuid4()
    value = ActivityCursor(
        v=1,
        patient_id=patient,
        filter="notes",
        kind="notes",
        event_id=event,
        occurred_at=datetime.now(UTC),
    )
    assert decode_cursor(encode_cursor(value), patient, "notes") == value
    for changes in (
        {"v": True},
        {"v": 2},
        {"extra": "unknown"},
        {"patient_id": str(uuid4())},
        {"filter": "all"},
        {"kind": "diagnoses"},
        {"event_id": "bad"},
        {"occurred_at": "2026-10-03T12:00:00"},
        {"occurred_at": 1},
    ):
        payload = {**value.model_dump(mode="json"), **changes}
        encoded = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
        with pytest.raises(ValueError):
            decode_cursor(encoded, patient, "notes")


async def test_activity_auth_and_invalid_queries() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://testserver"
    ) as client:
        base = f"/api/patients/{uuid4()}/activity"
        assert (await client.get(base)).status_code == 401

        async def user(session=None):
            return {"id": str(uuid4())}

        app.dependency_overrides[get_current_user] = user
        try:
            for query in ("kind=unknown", "limit=0", "limit=51", "cursor=broken"):
                assert (await client.get(f"{base}?{query}")).status_code == 422
        finally:
            app.dependency_overrides.pop(get_current_user, None)
