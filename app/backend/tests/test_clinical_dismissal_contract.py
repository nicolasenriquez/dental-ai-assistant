"""Fail-first contracts for PENDING-001 patient-scoped dismissal (task 4.5).

These pin the selected design before the routes, DTOs and repository operations
exist:

- ``POST /api/clinical-threads/{thread_id}/artifacts/{artifact_id}/discard``
  accepts exactly ``operation_id``, ``expected_patient_id`` and a tz-aware
  ``expected_artifact_updated_at``; the actor comes from the session and the
  response is the stored receipt, never a new timestamp.
- ``POST /api/clinical-actions/{action_id}/resolve`` accepts an optional
  expected-identity bundle that is complete as a whole, never partial, while
  legacy 4-field decline callers stay valid.
- ``GET /api/clinical-threads/{thread_id}?read_only=true`` passes the explicit
  mode through and projects the stored receipt/actor fields.

Red until task 4.6 implements the route, service validation and transactional
repository operations. Existing approval/recovery behavior is retained here so
dismissal cannot silently relax it.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import pytest
from httpx import ASGITransport, AsyncClient

from backend import config
from backend.auth.dependencies import get_current_user
from backend.clinical_assistant import service
from backend.main import app

OWNER_ID = UUID("22222222-2222-2222-2222-222222222222")
PATIENT_ID = UUID("33333333-3333-3333-3333-333333333333")
OTHER_PATIENT_ID = UUID("34343434-3434-3434-3434-343434343434")
THREAD_ID = UUID("44444444-4444-4444-4444-444444444444")
OTHER_THREAD_ID = UUID("45454545-4545-4545-4545-454545454545")
ARTIFACT_ID = UUID("55555555-5555-5555-5555-555555555555")
OTHER_ARTIFACT_ID = UUID("56565656-5656-5656-5656-565656565656")
ACTION_ID = UUID("66666666-6666-6666-6666-666666666666")
TURN_ID = UUID("77777777-7777-7777-7777-777777777777")
OPERATION_ID = UUID("88888888-8888-8888-8888-888888888888")
HASH = "a" * 64
UPDATED_AT = datetime(2026, 9, 10, 12, 0, 0, 123456, tzinfo=UTC)
DISCARD_URL = f"/api/clinical-threads/{THREAD_ID}/artifacts/{ARTIFACT_ID}/discard"
RESOLVE_URL = f"/api/clinical-actions/{ACTION_ID}/resolve"
THREAD_URL = f"/api/clinical-threads/{THREAD_ID}"
SAME_ORIGIN = {"Origin": "https://testserver", "Sec-Fetch-Site": "same-origin"}


def _discard_payload(**changes: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "operation_id": str(OPERATION_ID),
        "expected_patient_id": str(PATIENT_ID),
        "expected_artifact_updated_at": UPDATED_AT.isoformat(),
    }
    body.update(changes)
    return body


def _discard_request():
    from backend.clinical_assistant.schemas import DiscardArtifactRequest

    return DiscardArtifactRequest.model_validate(_discard_payload())


def _resolve_payload(**changes: Any) -> dict[str, Any]:
    body: dict[str, Any] = {"decision": "decline", "proposal_hash": HASH}
    body.update(changes)
    return body


def _expected_identity() -> dict[str, Any]:
    return {
        "expected_patient_id": str(PATIENT_ID),
        "expected_thread_id": str(THREAD_ID),
        "expected_artifact_id": str(ARTIFACT_ID),
        "expected_artifact_updated_at": UPDATED_AT.isoformat(),
    }


def _receipt() -> dict[str, Any]:
    return {
        "outcome": "discarded",
        "thread_id": THREAD_ID,
        "patient_id": PATIENT_ID,
        "artifact_id": ARTIFACT_ID,
        "artifact_status": "discarded",
        "operation_id": OPERATION_ID,
        "discarded_by": OWNER_ID,
        "resolved_at": UPDATED_AT,
        "expected_artifact_updated_at": UPDATED_AT,
        "updated_at": UPDATED_AT,
    }


def _client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="https://testserver")


def _draft():
    from backend.services.clinical_evolutions import ClinicalDraft

    return ClinicalDraft(
        context="Control",
        findings="",
        assessment="",
        treatment="",
        follow_up="",
        review_flags=[],
    )


# --------------------------------------------------------------------------- #
# DTO: discard request is strict, tz-aware and free of client authority
# --------------------------------------------------------------------------- #


def test_discard_request_accepts_operation_and_expected_identity() -> None:
    request = _discard_request()
    assert request.operation_id == OPERATION_ID
    assert request.expected_patient_id == PATIENT_ID
    assert request.expected_artifact_updated_at == UPDATED_AT


@pytest.mark.parametrize(
    "field",
    [
        "status",
        "artifact_status",
        "owner_user_id",
        "discarded_by",
        "patient_id",
        "thread_id",
        "artifact_id",
        "payload",
        "draft",
        "proposal_hash",
    ],
)
def test_discard_request_forbids_client_authority_fields(field: str) -> None:
    from pydantic import ValidationError

    from backend.clinical_assistant.schemas import DiscardArtifactRequest

    value: Any = str(UUID(int=9)) if field.endswith("_id") else "x"
    with pytest.raises(ValidationError):
        DiscardArtifactRequest.model_validate(_discard_payload(**{field: value}))


@pytest.mark.parametrize("operation_id", ["", "abc", "123", "not-a-uuid", None, 42])
def test_discard_request_requires_canonical_operation_uuid(operation_id: Any) -> None:
    from pydantic import ValidationError

    from backend.clinical_assistant.schemas import DiscardArtifactRequest

    with pytest.raises(ValidationError):
        DiscardArtifactRequest.model_validate(_discard_payload(operation_id=operation_id))


@pytest.mark.parametrize(
    "timestamp",
    ["2026-09-10T12:00:00", "2026-09-10", "not-a-date"],
)
def test_discard_request_requires_timezone_aware_expected_timestamp(timestamp: str) -> None:
    from pydantic import ValidationError

    from backend.clinical_assistant.schemas import DiscardArtifactRequest

    with pytest.raises(ValidationError):
        DiscardArtifactRequest.model_validate(
            _discard_payload(expected_artifact_updated_at=timestamp)
        )


# --------------------------------------------------------------------------- #
# DTO: resolve identity bundle is complete as a whole, never partial
# --------------------------------------------------------------------------- #


def test_resolve_request_accepts_complete_expected_identity_bundle() -> None:
    from backend.clinical_assistant.schemas import ActionResolutionRequest

    request = ActionResolutionRequest.model_validate(_resolve_payload(**_expected_identity()))
    assert request.expected_patient_id == PATIENT_ID
    assert request.expected_thread_id == THREAD_ID
    assert request.expected_artifact_id == ARTIFACT_ID
    assert request.expected_artifact_updated_at == UPDATED_AT


def test_resolve_request_keeps_legacy_bundle_absent_contract() -> None:
    from backend.clinical_assistant.schemas import ActionResolutionRequest

    request = ActionResolutionRequest.model_validate(_resolve_payload())
    assert request.expected_patient_id is None
    assert request.expected_thread_id is None
    assert request.expected_artifact_id is None
    assert request.expected_artifact_updated_at is None


_BUNDLE_KEYS = (
    "expected_patient_id",
    "expected_thread_id",
    "expected_artifact_id",
    "expected_artifact_updated_at",
)


@pytest.mark.parametrize("present", _BUNDLE_KEYS)
def test_resolve_request_rejects_single_field_bundle(present: str) -> None:
    from pydantic import ValidationError

    from backend.clinical_assistant.schemas import ActionResolutionRequest

    with pytest.raises(ValidationError):
        ActionResolutionRequest.model_validate(
            _resolve_payload(**{present: _expected_identity()[present]})
        )


@pytest.mark.parametrize("missing", _BUNDLE_KEYS)
def test_resolve_request_rejects_incomplete_bundle(missing: str) -> None:
    from pydantic import ValidationError

    from backend.clinical_assistant.schemas import ActionResolutionRequest

    bundle = _expected_identity()
    bundle.pop(missing)
    with pytest.raises(ValidationError):
        ActionResolutionRequest.model_validate(_resolve_payload(**bundle))


# --------------------------------------------------------------------------- #
# HTTP: discard delegates the exact resource and expectation, maps stable codes
# --------------------------------------------------------------------------- #


async def test_discard_route_delegates_exact_owner_resource_and_expectation(monkeypatch) -> None:
    monkeypatch.setattr(config, "APP_ORIGINS", ["https://testserver"])
    calls: list[tuple[Any, ...]] = []

    async def discard(owner: UUID, thread: UUID, artifact: UUID, request: Any):
        calls.append((owner, thread, artifact, request))
        return _receipt()

    monkeypatch.setattr(service, "discard_artifact", discard)
    app.dependency_overrides[get_current_user] = lambda: {"id": OWNER_ID}
    try:
        async with _client() as client:
            response = await client.post(DISCARD_URL, json=_discard_payload(), headers=SAME_ORIGIN)
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 200
    body = response.json()
    assert body["outcome"] == "discarded"
    assert body["thread_id"] == str(THREAD_ID)
    assert body["patient_id"] == str(PATIENT_ID)
    assert body["artifact_id"] == str(ARTIFACT_ID)
    assert body["artifact_status"] == "discarded"
    assert body["operation_id"] == str(OPERATION_ID)
    assert body["discarded_by"] == str(OWNER_ID)
    assert datetime.fromisoformat(body["resolved_at"]) == UPDATED_AT
    assert datetime.fromisoformat(body["expected_artifact_updated_at"]) == UPDATED_AT
    assert datetime.fromisoformat(body["updated_at"]) == UPDATED_AT

    assert len(calls) == 1
    owner, thread, artifact, request = calls[0]
    assert owner == OWNER_ID
    assert thread == THREAD_ID
    assert artifact == ARTIFACT_ID
    assert request.operation_id == OPERATION_ID
    assert request.expected_patient_id == PATIENT_ID
    assert request.expected_artifact_updated_at == UPDATED_AT


@pytest.mark.parametrize(
    ("error_name", "code"),
    [
        ("DiscardStaleError", "CLINICAL_DISCARD_STALE"),
        ("DiscardIneligibleError", "CLINICAL_DISCARD_INELIGIBLE"),
        ("DiscardIdempotencyConflictError", "CLINICAL_DISCARD_IDEMPOTENCY_CONFLICT"),
        ("DismissalBusyError", "CLINICAL_DISMISSAL_BUSY"),
    ],
)
async def test_discard_route_maps_rejections_to_stable_codes(
    monkeypatch, error_name: str, code: str
) -> None:
    monkeypatch.setattr(config, "APP_ORIGINS", ["https://testserver"])
    error_cls = getattr(service, error_name)

    async def discard(*_args: Any):
        raise error_cls

    monkeypatch.setattr(service, "discard_artifact", discard)
    app.dependency_overrides[get_current_user] = lambda: {"id": OWNER_ID}
    try:
        async with _client() as client:
            response = await client.post(DISCARD_URL, json=_discard_payload(), headers=SAME_ORIGIN)
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 409
    assert response.json() == {"detail": {"code": code}}


async def test_discard_route_hides_missing_or_foreign_resources(monkeypatch) -> None:
    monkeypatch.setattr(config, "APP_ORIGINS", ["https://testserver"])

    async def discard(*_args: Any):
        raise LookupError("Artifact not found")

    monkeypatch.setattr(service, "discard_artifact", discard)
    app.dependency_overrides[get_current_user] = lambda: {"id": OWNER_ID}
    try:
        async with _client() as client:
            response = await client.post(DISCARD_URL, json=_discard_payload(), headers=SAME_ORIGIN)
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 404
    assert str(THREAD_ID) not in response.text
    assert str(ARTIFACT_ID) not in response.text


async def test_discard_route_requires_authentication() -> None:
    async with _client() as client:
        response = await client.post(DISCARD_URL, json=_discard_payload(), headers=SAME_ORIGIN)
    assert response.status_code == 401


async def test_discard_route_requires_same_origin(monkeypatch) -> None:
    monkeypatch.setattr(config, "APP_ORIGINS", ["https://testserver"])
    calls: list[Any] = []

    async def discard(*args: Any):
        calls.append(args)
        return _receipt()

    monkeypatch.setattr(service, "discard_artifact", discard)
    app.dependency_overrides[get_current_user] = lambda: {"id": OWNER_ID}
    try:
        async with _client() as client:
            allowed = await client.post(DISCARD_URL, json=_discard_payload(), headers=SAME_ORIGIN)
            cross = await client.post(
                DISCARD_URL,
                json=_discard_payload(),
                headers={"Origin": "https://evil.example", "Sec-Fetch-Site": "cross-site"},
            )
            missing = await client.post(DISCARD_URL, json=_discard_payload())
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert allowed.status_code == 200
    assert cross.status_code == 403
    assert missing.status_code == 403
    assert len(calls) == 1


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"operation_id": str(OPERATION_ID)},
        _discard_payload(operation_id="not-a-uuid"),
        _discard_payload(expected_artifact_updated_at="2026-09-10T12:00:00"),
        _discard_payload(status="discarded"),
        _discard_payload(discarded_by=str(OWNER_ID)),
        _discard_payload(owner_user_id=str(OWNER_ID)),
    ],
)
async def test_discard_route_rejects_malformed_or_extended_bodies(
    monkeypatch, body: dict[str, Any]
) -> None:
    monkeypatch.setattr(config, "APP_ORIGINS", ["https://testserver"])
    calls: list[Any] = []

    async def discard(*args: Any):
        calls.append(args)
        return _receipt()

    monkeypatch.setattr(service, "discard_artifact", discard)
    app.dependency_overrides[get_current_user] = lambda: {"id": OWNER_ID}
    try:
        async with _client() as client:
            response = await client.post(DISCARD_URL, json=body, headers=SAME_ORIGIN)
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 422
    assert calls == []


async def test_discard_route_never_schedules_export_or_prepares(monkeypatch) -> None:
    monkeypatch.setattr(config, "APP_ORIGINS", ["https://testserver"])

    async def discard(*_args: Any):
        return _receipt()

    def forbidden(*_args: Any, **_kwargs: Any) -> None:
        raise AssertionError("dismissal must not prepare, resolve or schedule an export")

    monkeypatch.setattr(service, "discard_artifact", discard)
    monkeypatch.setattr(service, "prepare_save", forbidden)
    monkeypatch.setattr(service, "resolve_action", forbidden)
    monkeypatch.setattr(
        "backend.routes.clinical_assistant.evolution_exports_service.schedule_export",
        forbidden,
    )
    app.dependency_overrides[get_current_user] = lambda: {"id": OWNER_ID}
    try:
        async with _client() as client:
            response = await client.post(DISCARD_URL, json=_discard_payload(), headers=SAME_ORIGIN)
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 200


# --------------------------------------------------------------------------- #
# HTTP: decline bundle forwarding, partial rejection and busy mapping
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize("decision", ["approve", "decline"])
async def test_resolve_route_rejects_cross_site_and_missing_origin(
    monkeypatch, decision: str
) -> None:
    monkeypatch.setattr(config, "APP_ORIGINS", ["https://testserver"])

    async def forbidden(*_args: Any, **_kwargs: Any):
        raise AssertionError("cross-site resolution reached the service")

    monkeypatch.setattr(service, "resolve_action", forbidden)
    app.dependency_overrides[get_current_user] = lambda: {"id": OWNER_ID}
    try:
        async with _client() as client:
            for headers in ({}, {"Origin": "https://evil.example", "Sec-Fetch-Site": "cross-site"}):
                response = await client.post(
                    RESOLVE_URL, json=_resolve_payload(decision=decision), headers=headers
                )
                assert response.status_code == 403
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_resolve_bundle_requires_timezone_aware_version() -> None:
    from pydantic import ValidationError

    from backend.clinical_assistant.schemas import ActionResolutionRequest

    bundle = _expected_identity()
    bundle["expected_artifact_updated_at"] = "2026-09-10T12:00:00.123456"
    with pytest.raises(ValidationError):
        ActionResolutionRequest.model_validate(_resolve_payload(**bundle))


async def test_resolve_route_forwards_complete_bundle_to_service(monkeypatch) -> None:
    monkeypatch.setattr(config, "APP_ORIGINS", ["https://testserver"])
    calls: list[tuple[tuple[Any, ...], dict[str, Any]]] = []

    async def resolve(*args: Any, **kwargs: Any):
        calls.append((args, kwargs))
        return {"id": ACTION_ID, "status": "declined", "proposal_hash": HASH}

    monkeypatch.setattr(service, "resolve_action", resolve)
    app.dependency_overrides[get_current_user] = lambda: {"id": OWNER_ID}
    try:
        async with _client() as client:
            response = await client.post(
                RESOLVE_URL,
                json=_resolve_payload(**_expected_identity()),
                headers=SAME_ORIGIN,
            )
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 200
    assert len(calls) == 1
    args, kwargs = calls[0]
    forwarded = " ".join([str(value) for value in (*args, *kwargs.values())])
    assert str(PATIENT_ID) in forwarded
    assert str(THREAD_ID) in forwarded
    assert str(ARTIFACT_ID) in forwarded
    assert "2026-09-10 12:00:00" in forwarded or "2026-09-10T12:00:00" in forwarded


async def test_resolve_route_rejects_partial_bundle(monkeypatch) -> None:
    monkeypatch.setattr(config, "APP_ORIGINS", ["https://testserver"])
    calls: list[Any] = []

    async def resolve(*args: Any, **kwargs: Any):
        calls.append((args, kwargs))
        return {"id": ACTION_ID, "status": "declined", "proposal_hash": HASH}

    monkeypatch.setattr(service, "resolve_action", resolve)
    app.dependency_overrides[get_current_user] = lambda: {"id": OWNER_ID}
    try:
        async with _client() as client:
            response = await client.post(
                RESOLVE_URL,
                json=_resolve_payload(expected_patient_id=str(PATIENT_ID)),
                headers=SAME_ORIGIN,
            )
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 422
    assert calls == []


async def test_resolve_route_maps_dismissal_busy_to_conflict_code(monkeypatch) -> None:
    monkeypatch.setattr(config, "APP_ORIGINS", ["https://testserver"])

    async def resolve(*_args: Any, **_kwargs: Any):
        raise service.DismissalBusyError

    monkeypatch.setattr(service, "resolve_action", resolve)
    app.dependency_overrides[get_current_user] = lambda: {"id": OWNER_ID}
    try:
        async with _client() as client:
            response = await client.post(
                RESOLVE_URL,
                json=_resolve_payload(**_expected_identity()),
                headers=SAME_ORIGIN,
            )
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 409
    assert response.json() == {"detail": {"code": "CLINICAL_DISMISSAL_BUSY"}}


async def test_resolve_route_hides_crossed_identities(monkeypatch) -> None:
    monkeypatch.setattr(config, "APP_ORIGINS", ["https://testserver"])

    async def resolve(*_args: Any, **_kwargs: Any):
        raise LookupError("Action not found")

    monkeypatch.setattr(service, "resolve_action", resolve)
    app.dependency_overrides[get_current_user] = lambda: {"id": OWNER_ID}
    try:
        async with _client() as client:
            response = await client.post(
                RESOLVE_URL,
                json=_resolve_payload(**_expected_identity()),
                headers=SAME_ORIGIN,
            )
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 404
    assert str(PATIENT_ID) not in response.text
    assert str(THREAD_ID) not in response.text
    assert str(ARTIFACT_ID) not in response.text


async def test_resolve_service_forwards_bundle_to_repository(monkeypatch) -> None:
    calls: list[dict[str, Any]] = []

    async def resolve(*_args: Any, **kwargs: Any):
        calls.append(kwargs)
        return {"id": ACTION_ID, "status": "declined", "proposal_hash": HASH}

    monkeypatch.setattr(service.repository, "resolve_action", resolve)

    result = await service.resolve_action(
        OWNER_ID,
        ACTION_ID,
        "decline",
        HASH,
        expected_patient_id=PATIENT_ID,
        expected_thread_id=THREAD_ID,
        expected_artifact_id=ARTIFACT_ID,
        expected_artifact_updated_at=UPDATED_AT,
    )

    assert result["status"] == "declined"
    assert len(calls) == 1
    assert calls[0]["expected_patient_id"] == PATIENT_ID
    assert calls[0]["expected_thread_id"] == THREAD_ID
    assert calls[0]["expected_artifact_id"] == ARTIFACT_ID
    assert calls[0]["expected_artifact_updated_at"] == UPDATED_AT


# --------------------------------------------------------------------------- #
# HTTP: explicit read-only thread mode and receipt projection
# --------------------------------------------------------------------------- #


def _stored_thread() -> dict[str, Any]:
    return {
        "id": THREAD_ID,
        "owner_user_id": OWNER_ID,
        "title": "Asistente clínico",
        "active_patient_id": None,
        "active_turn_id": None,
        "created_at": UPDATED_AT,
        "updated_at": UPDATED_AT,
        "messages": [],
        "artifacts": [
            {
                "id": ARTIFACT_ID,
                "owner_user_id": OWNER_ID,
                "thread_id": THREAD_ID,
                "turn_id": TURN_ID,
                "patient_id": PATIENT_ID,
                "artifact_type": "clinical_draft",
                "status": "discarded",
                "source_note": "Nota",
                "generated_draft": _draft().model_dump(mode="json"),
                "draft": _draft().model_dump(mode="json"),
                "evolution_at": UPDATED_AT,
                "created_at": UPDATED_AT,
                "updated_at": UPDATED_AT,
                "resolved_at": UPDATED_AT,
                "discard_operation_id": OPERATION_ID,
                "discarded_by": OWNER_ID,
                "discard_expected_updated_at": UPDATED_AT,
            }
        ],
        "pending_action": None,
        "actions": [
            {
                "id": ACTION_ID,
                "thread_id": THREAD_ID,
                "turn_id": TURN_ID,
                "artifact_id": ARTIFACT_ID,
                "patient_id": PATIENT_ID,
                "action_type": "save_evolution",
                "proposal_payload": None,
                "proposal_hash": HASH,
                "status": "declined",
                "expires_at": UPDATED_AT,
                "created_at": UPDATED_AT,
                "resolved_at": UPDATED_AT,
                "resolved_by": OWNER_ID,
                "result_resource_id": None,
            }
        ],
    }


async def test_thread_route_passes_read_only_and_projects_receipts(monkeypatch) -> None:
    monkeypatch.setattr(config, "APP_ORIGINS", ["https://testserver"])
    seen: list[bool] = []

    async def get_thread(owner: UUID, thread: UUID, *, read_only: bool = False):
        assert owner == OWNER_ID
        assert thread == THREAD_ID
        seen.append(read_only)
        return _stored_thread()

    async def patient(*_args: Any):
        return None

    monkeypatch.setattr(service.repository, "get_thread", get_thread)
    monkeypatch.setattr(service.patients_repo, "get_patient", patient)
    app.dependency_overrides[get_current_user] = lambda: {"id": OWNER_ID}
    try:
        async with _client() as client:
            read_only = await client.get(f"{THREAD_URL}?read_only=true", headers=SAME_ORIGIN)
            default = await client.get(THREAD_URL, headers=SAME_ORIGIN)
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert read_only.status_code == 200
    assert default.status_code == 200
    assert seen == [True, False]

    body = read_only.json()
    artifact = body["artifacts"][0]
    assert artifact["discard_operation_id"] == str(OPERATION_ID)
    assert artifact["discarded_by"] == str(OWNER_ID)
    assert datetime.fromisoformat(artifact["discard_expected_updated_at"]) == UPDATED_AT
    assert body["actions"][0]["resolved_by"] == str(OWNER_ID)


# --------------------------------------------------------------------------- #
# Response models expose the stored receipt and actor
# --------------------------------------------------------------------------- #


def test_dismissal_models_expose_stored_receipt_and_actor() -> None:
    from backend.clinical_assistant.schemas import ClinicalPendingAction, ClinicalTurnArtifact

    draft = _draft().model_dump(mode="json")
    artifact = ClinicalTurnArtifact(
        id=ARTIFACT_ID,
        owner_user_id=OWNER_ID,
        thread_id=THREAD_ID,
        turn_id=TURN_ID,
        patient_id=PATIENT_ID,
        artifact_type="clinical_draft",
        status="discarded",
        source_note="Nota",
        generated_draft=draft,
        draft=draft,
        evolution_at=UPDATED_AT,
        created_at=UPDATED_AT,
        updated_at=UPDATED_AT,
        resolved_at=UPDATED_AT,
        discard_operation_id=OPERATION_ID,
        discarded_by=OWNER_ID,
        discard_expected_updated_at=UPDATED_AT,
    )
    assert artifact.discard_operation_id == OPERATION_ID
    assert artifact.discarded_by == OWNER_ID
    assert artifact.discard_expected_updated_at == UPDATED_AT

    action = ClinicalPendingAction(
        id=ACTION_ID,
        thread_id=THREAD_ID,
        turn_id=TURN_ID,
        artifact_id=ARTIFACT_ID,
        patient_id=PATIENT_ID,
        action_type="save_evolution",
        proposal_hash=HASH,
        status="declined",
        expires_at=UPDATED_AT,
        created_at=UPDATED_AT,
        resolved_at=UPDATED_AT,
        resolved_by=OWNER_ID,
    )
    assert action.resolved_by == OWNER_ID
