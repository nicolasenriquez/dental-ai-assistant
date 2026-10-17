"""Fail-first HTTP contracts for the owned dental-history reads (task 1.1).

Pins the query and error shape from
``openspec/changes/replicate-diagnosis-history/history-read-contract.md`` before
``routes/patient_dental_history.py`` exists:

- both endpoints require a session and reject invalid dentitions, malformed,
  nonexistent or future dates, endpoint-mismatched parameters, extra query
  names and out-of-range limits with 422 ``invalid_history_query``;
- undecodable, malformed or oversized cursors answer 422 ``invalid_cursor``;
- unknown and foreign patients answer a typed 404 without events, counts,
  coverage or epoch data;
- the read paths accept GET only.

Task 2.1 implements these routes. ``test_patient_dental_history_live.py``
proves real-Postgres as-of ranking, day pages, counts, epochs and read-only
behavior; stubbed cases here cannot prove storage semantics.
"""

from __future__ import annotations

import base64
import json
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from backend.auth.dependencies import get_current_user
from backend.main import app

OWNER_ID = UUID("11111111-1111-1111-1111-111111111111")
OTHER_ID = UUID("22222222-2222-2222-2222-222222222222")
PATIENT_ID = UUID("33333333-3333-3333-3333-333333333333")
FOREIGN_PATIENT_ID = UUID("44444444-4444-4444-4444-444444444444")

EVENTS = f"/api/patients/{PATIENT_ID}/dental-history"
SNAPSHOT = f"{EVENTS}/snapshot"


def _encoded(payload: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")


def _encoded_raw(value: str) -> str:
    return base64.urlsafe_b64encode(value.encode()).decode().rstrip("=")


EVENT_QUERIES = [
    pytest.param(None, id="missing-dentition"),
    pytest.param({"dentition": "both"}, id="unknown-dentition"),
    pytest.param({"dentition": "permanent", "day": "2026-2-3"}, id="malformed-day"),
    pytest.param({"dentition": "permanent", "day": "2026-02-30"}, id="nonexistent-day"),
    pytest.param({"dentition": "permanent", "day": "2099-01-01"}, id="future-day"),
    pytest.param({"dentition": "permanent", "limit": "0"}, id="zero-limit"),
    pytest.param({"dentition": "permanent", "limit": "101"}, id="over-limit"),
    pytest.param({"dentition": "permanent", "limit": "abc"}, id="non-numeric-limit"),
    pytest.param({"dentition": "permanent", "at": "2026-01-01"}, id="snapshot-param"),
    pytest.param(
        {"dentition": "permanent", "day": "2026-01-01", "at": "2026-01-01"}, id="mixed-params"
    ),
    pytest.param({"dentition": "permanent", "status": "all"}, id="extra-query-name"),
]

SNAPSHOT_QUERIES = [
    pytest.param(None, id="missing-dentition"),
    pytest.param({"dentition": "primary", "at": "2026-13-01"}, id="malformed-at"),
    pytest.param({"dentition": "primary", "at": "2026-02-30"}, id="nonexistent-at"),
    pytest.param({"dentition": "primary", "at": "2099-01-01"}, id="future-at"),
    pytest.param({"dentition": "primary", "day": "2026-01-01"}, id="events-param"),
    pytest.param({"dentition": "primary", "limit": "101"}, id="over-limit"),
    pytest.param({"dentition": "primary", "scope": "tooth"}, id="extra-query-name"),
]

MALFORMED_CURSORS = [
    pytest.param("!!!", id="not-base64"),
    pytest.param(_encoded_raw("{"), id="invalid-json"),
    pytest.param(_encoded({}), id="missing-schema"),
    pytest.param("a" * 2049, id="over-2048"),
    pytest.param(_encoded({"v": 1, "reader": "events", "pad": "x" * 2100}), id="over-2048-json"),
]

ENDPOINTS = [pytest.param(EVENTS, id="events"), pytest.param(SNAPSHOT, id="snapshot")]


def _authenticated(user_id: UUID = OWNER_ID):
    async def user(session=None):
        return {"id": str(user_id)}

    return user


def _client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="https://testserver")


async def test_history_endpoints_require_authentication() -> None:
    async with _client() as client:
        for url in (EVENTS, SNAPSHOT):
            response = await client.get(url, params={"dentition": "permanent"})
            assert response.status_code == 401, (url, response.text)


@pytest.mark.parametrize("params", EVENT_QUERIES)
async def test_event_query_validation(params: dict | None) -> None:
    app.dependency_overrides[get_current_user] = _authenticated()
    try:
        async with _client() as client:
            response = await client.get(EVENTS, params=params)
        assert response.status_code == 422, response.text
        assert response.json()["detail"]["code"] == "invalid_history_query"
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.parametrize("params", SNAPSHOT_QUERIES)
async def test_snapshot_query_validation(params: dict | None) -> None:
    app.dependency_overrides[get_current_user] = _authenticated()
    try:
        async with _client() as client:
            response = await client.get(SNAPSHOT, params=params)
        assert response.status_code == 422, response.text
        assert response.json()["detail"]["code"] == "invalid_history_query"
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.parametrize("url", ENDPOINTS)
@pytest.mark.parametrize("cursor", MALFORMED_CURSORS)
async def test_history_rejects_malformed_cursors(url: str, cursor: str) -> None:
    app.dependency_overrides[get_current_user] = _authenticated()
    try:
        async with _client() as client:
            response = await client.get(url, params={"dentition": "permanent", "cursor": cursor})
        assert response.status_code == 422, response.text
        assert response.json()["detail"]["code"] == "invalid_cursor"
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.parametrize("url", ENDPOINTS)
async def test_history_hides_unknown_and_foreign_patients(url: str) -> None:
    unknown = url.replace(str(PATIENT_ID), str(uuid4()))
    foreign = url.replace(str(PATIENT_ID), str(FOREIGN_PATIENT_ID))
    app.dependency_overrides[get_current_user] = _authenticated()
    try:
        async with _client() as client:
            for path in (unknown, foreign):
                response = await client.get(path, params={"dentition": "permanent"})
                assert response.status_code == 404, response.text
                assert response.json()["detail"]["code"] == "not_found"
                for leaked in ("epoch", "counts", "coverage", "items", "selection"):
                    assert leaked not in response.text
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.parametrize("url", ENDPOINTS)
async def test_history_paths_are_read_only(url: str) -> None:
    app.dependency_overrides[get_current_user] = _authenticated()
    try:
        async with _client() as client:
            for method in ("post", "put", "patch", "delete"):
                response = await getattr(client, method)(url, params={"dentition": "permanent"})
                assert response.status_code == 405, (method, response.text)
    finally:
        app.dependency_overrides.pop(get_current_user, None)
