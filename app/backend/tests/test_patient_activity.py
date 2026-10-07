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
from backend.tests.test_patient_clinical_plans import active_plan, command, plan_db  # noqa: F401


@pytest.mark.parametrize(
    ("kind", "action", "query"),
    [
        ("treatments", "corrected", "treatment"),
        ("plans", "complete_stage", "plan"),
        ("clinical_notes", "deleted", "dental_note"),
    ],
)
async def test_clinical_activity_safe_exact_resource_links(
    monkeypatch, kind, action, query
) -> None:
    from backend.routes import patient_activity

    owner, patient, resource = uuid4(), uuid4(), uuid4()

    async def events(*args):
        assert args[:3] == (owner, patient, kind)
        return [
            {
                "event_id": uuid4(),
                "resource_id": resource,
                "kind": kind,
                "action": action,
                "occurred_at": datetime.now(UTC),
                "actor_user_id": owner,
                "tooth_fdi": None,
            }
        ], 1

    monkeypatch.setattr(patient_activity.repo, "list_activity", events)
    app.dependency_overrides[get_current_user] = lambda: {"id": str(owner)}
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="https://testserver"
        ) as client:
            response = await client.get(f"/api/patients/{patient}/activity?kind={kind}")
            assert response.status_code == 200, response.text
            item = response.json()["items"][0]
            assert f"{query}={resource}" in item["href"]
            assert "body" not in item and "note" not in item
            assert item["actor"]["user_id"] == str(owner)
    finally:
        app.dependency_overrides.pop(get_current_user, None)


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


async def test_activity_storage_paging_privacy_owner(plan_db, monkeypatch) -> None:  # noqa: F811
    from backend.db import patient_activity_repo

    pool, _, foreign, patient = plan_db
    monkeypatch.setattr(patient_activity_repo, "get_pg_pool", lambda: pool)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://testserver"
    ) as client:
        path, plan = await active_plan(client, patient)
        item = plan["items"][0]
        response = await client.post(
            f"{path}/items/{item['id']}/stages/{item['stages'][0]['id']}/complete",
            json=command(4, clinical_note_body="PRIVATE_CLINICAL_BODY"),
        )
        assert response.status_code == 200, response.text
        base = f"/api/patients/{patient}/activity"
        events = []
        cursor = None
        while True:
            page = await client.get(
                base, params={"limit": 2, **({"cursor": cursor} if cursor else {})}
            )
            assert page.status_code == 200, page.text
            assert "PRIVATE_CLINICAL_BODY" not in page.text
            data = page.json()
            assert data["total"] == 8
            events.extend(data["items"])
            cursor = data["next_cursor"]
            if not cursor:
                break
            assert (
                await client.get(base, params={"kind": "plans", "cursor": cursor})
            ).status_code == 422
        assert len({event["event_id"] for event in events}) == 8
        assert {event["kind"] for event in events} == {"plans", "treatments", "clinical_notes"}
        assert all(
            f"plan={plan['id']}" in event["href"]
            for event in events
            if event["kind"] == "treatments"
        )
        assert [event["occurred_at"] for event in events] == sorted(
            (event["occurred_at"] for event in events), reverse=True
        )
        for kind, total in (("plans", 5), ("treatments", 2), ("clinical_notes", 1)):
            result = await client.get(base, params={"kind": kind})
            assert result.json()["total"] == total
            assert all(event["kind"] == kind for event in result.json()["items"])
        app.dependency_overrides[get_current_user] = lambda: {"id": str(foreign)}
        denied = await client.get(base)
        assert denied.status_code == 404 and "PRIVATE_CLINICAL_BODY" not in denied.text
