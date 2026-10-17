"""Fail-first HTTP contracts for explicit dental deletion (task 1.5).

Pins the write contract from
``openspec/changes/replicate-diagnosis-history/deletion-design.md`` before the
routes exist:

- ``POST /api/patients/{patient_id}/conditions/{condition_id}/delete`` and
  ``POST /api/patients/{patient_id}/dental-treatments/{treatment_id}/delete``
  accept exactly ``{operation_id, expected_revision}``; the session and path
  carry authority.
- Authentication 401, malformed path UUIDs 422 and missing/foreign resources
  404 all precede command evaluation.
- Both legacy correction POST endpoints become authenticated retirement stubs:
  after ownership they return 410 ``correction_workflow_retired`` without
  parsing a correction body, replaying a receipt or writing.
- Revision reads are untouched by retirement.

Tasks 2.7/2.8/2.5 implement these route and guard contracts. The live
Postgres suite in ``test_patient_dental_deletion_live.py`` proves atomicity,
replay, races and the 410-after-ownership path.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from backend.auth.dependencies import get_current_user
from backend.main import app

OWNER_ID = UUID("11111111-1111-1111-1111-111111111111")
PATIENT_ID = UUID("22222222-2222-2222-2222-222222222222")
FOREIGN_PATIENT_ID = UUID("33333333-3333-3333-3333-333333333333")
CONDITION_ID = UUID("44444444-4444-4444-4444-444444444444")
TREATMENT_ID = UUID("55555555-5555-5555-5555-555555555555")
OPERATION_ID = UUID("66666666-6666-6666-6666-666666666666")

CONDITION_DELETE = f"/api/patients/{PATIENT_ID}/conditions/{CONDITION_ID}/delete"
TREATMENT_DELETE = f"/api/patients/{PATIENT_ID}/dental-treatments/{TREATMENT_ID}/delete"
CONDITION_CORRECTIONS = f"/api/patients/{PATIENT_ID}/conditions/{CONDITION_ID}/corrections"
TREATMENT_CORRECTIONS = f"/api/patients/{PATIENT_ID}/dental-treatments/{TREATMENT_ID}/corrections"

DELETE_ENDPOINTS = [
    pytest.param(CONDITION_DELETE, id="condition"),
    pytest.param(TREATMENT_DELETE, id="procedure"),
]
CORRECTION_ENDPOINTS = [
    pytest.param(CONDITION_CORRECTIONS, id="condition"),
    pytest.param(TREATMENT_CORRECTIONS, id="procedure"),
]
MALFORMED_PATHS = [
    pytest.param(f"/api/patients/not-a-uuid/conditions/{CONDITION_ID}/delete", id="patient"),
    pytest.param(f"/api/patients/{PATIENT_ID}/conditions/not-a-uuid/delete", id="condition"),
    pytest.param(
        f"/api/patients/not-a-uuid/dental-treatments/{TREATMENT_ID}/delete", id="procedure-patient"
    ),
    pytest.param(f"/api/patients/{PATIENT_ID}/dental-treatments/not-a-uuid/delete", id="procedure"),
]


def _delete_body(**changes: Any) -> dict[str, Any]:
    body: dict[str, Any] = {"operation_id": str(OPERATION_ID), "expected_revision": 1}
    body.update(changes)
    return body


def _legacy_correction_body() -> dict[str, Any]:
    """A plausible retired payload; stubs must ignore its contents entirely."""
    return {
        "operation_id": str(uuid4()),
        "expected_revision": 1,
        "reason": "Registro por error",
        "replacement": None,
    }


def _authenticated(user_id: UUID = OWNER_ID):
    async def user(session=None):
        return {"id": str(user_id)}

    return user


def _client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="https://testserver")


@pytest.mark.parametrize("url", DELETE_ENDPOINTS)
async def test_delete_endpoint_requires_authentication(url: str) -> None:
    async with _client() as client:
        response = await client.post(url, json=_delete_body())
    assert response.status_code == 401


@pytest.mark.parametrize("url", MALFORMED_PATHS)
async def test_delete_endpoint_rejects_malformed_path_identifiers(url: str) -> None:
    app.dependency_overrides[get_current_user] = _authenticated()
    try:
        async with _client() as client:
            response = await client.post(url, json=_delete_body())
        assert response.status_code == 422
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.parametrize("url", DELETE_ENDPOINTS)
@pytest.mark.parametrize(
    "body",
    [
        pytest.param({}, id="missing-both"),
        pytest.param({"expected_revision": 1}, id="missing-operation"),
        pytest.param({"operation_id": "not-a-uuid", "expected_revision": 1}, id="bad-operation"),
        pytest.param({"operation_id": str(OPERATION_ID)}, id="missing-revision"),
        pytest.param({"operation_id": str(OPERATION_ID), "expected_revision": 0}, id="zero"),
        pytest.param({"operation_id": str(OPERATION_ID), "expected_revision": "1"}, id="string"),
        pytest.param({**_delete_body(), "reason": "por error"}, id="extra-field"),
        pytest.param({**_delete_body(), "actor_user_id": str(uuid4())}, id="client-authority"),
    ],
)
async def test_delete_endpoint_requires_exact_command_identity(url: str, body: dict) -> None:
    app.dependency_overrides[get_current_user] = _authenticated()
    try:
        async with _client() as client:
            response = await client.post(url, json=body)
        assert response.status_code == 422
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.parametrize("url", DELETE_ENDPOINTS)
async def test_delete_endpoint_hides_missing_or_foreign_resources(url: str) -> None:
    app.dependency_overrides[get_current_user] = _authenticated()
    try:
        async with _client() as client:
            missing = await client.post(url, json=_delete_body())
            foreign = await client.post(
                url.replace(str(PATIENT_ID), str(FOREIGN_PATIENT_ID)), json=_delete_body()
            )
        assert missing.status_code == 404
        assert missing.json()["detail"]["code"] == "not_found"
        assert foreign.status_code == 404
        assert foreign.json()["detail"]["code"] == "not_found"
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.parametrize("url", CORRECTION_ENDPOINTS)
async def test_correction_retirement_requires_authentication(url: str) -> None:
    async with _client() as client:
        response = await client.post(url, json=_legacy_correction_body())
    assert response.status_code == 401


@pytest.mark.parametrize(
    "url",
    [
        pytest.param(f"/api/patients/not-a-uuid/conditions/{CONDITION_ID}/corrections", id="p"),
        pytest.param(f"/api/patients/{PATIENT_ID}/conditions/not-a-uuid/corrections", id="c"),
        pytest.param(
            f"/api/patients/{PATIENT_ID}/dental-treatments/not-a-uuid/corrections", id="t"
        ),
    ],
)
async def test_correction_retirement_rejects_malformed_path_identifiers(url: str) -> None:
    app.dependency_overrides[get_current_user] = _authenticated()
    try:
        async with _client() as client:
            response = await client.post(url, json=_legacy_correction_body())
        assert response.status_code == 422
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.parametrize("url", CORRECTION_ENDPOINTS)
async def test_correction_retirement_hides_resources_before_body_handling(url: str) -> None:
    """Ownership precedes the stub outcome; an unparsable body must not change that."""
    app.dependency_overrides[get_current_user] = _authenticated()
    try:
        foreign = url.replace(str(PATIENT_ID), str(FOREIGN_PATIENT_ID))
        async with _client() as client:
            response = await client.post(
                foreign,
                content=b"{",
                headers={"content-type": "application/json"},
            )
        assert response.status_code == 404
        assert response.json()["detail"]["code"] == "not_found"
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.parametrize("url", CORRECTION_ENDPOINTS)
async def test_correction_retirement_leaves_revision_reads_unchanged(url: str) -> None:
    revisions = f"{url.removesuffix('/corrections')}/revisions"
    app.dependency_overrides[get_current_user] = _authenticated()
    try:
        async with _client() as client:
            response = await client.get(revisions)
        assert response.status_code == 404
        assert response.status_code != 410
    finally:
        app.dependency_overrides.pop(get_current_user, None)
