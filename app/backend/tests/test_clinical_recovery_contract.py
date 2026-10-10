"""Fail-first contracts for explicit canonical approval recovery (task 5.1 / F06).

These pin the approved recovery boundary from `design.md` decision 5 before the
route/service/repository exist:

- ``POST /api/clinical-actions/{action_id}/recover-draft`` accepts a strict body
  with only ``proposal_hash`` and ``expected_artifact_updated_at``; patient,
  owner, content, evolution id and status authority never come from the client.
- Success is a discriminated result: ``recovered`` / ``already_recovered`` with
  thread+artifact, or ``saved`` with the exact evolution identity.
- Ineligible, stale and conflicting recoveries are stable 409 codes; lock
  contention is ``CLINICAL_RECOVERY_BUSY``; missing/foreign actions are 404.
- Recovery never prepares, resolves, saves or exports.

Red until task 5.2 implements the route, service validation and transactional
repository operation. The generic frozen-artifact rejections are retained here
so recovery cannot silently relax them.
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
ACTION_ID = UUID("33333333-3333-3333-3333-333333333333")
THREAD_ID = UUID("44444444-4444-4444-4444-444444444444")
ARTIFACT_ID = UUID("55555555-5555-5555-5555-555555555555")
EVOLUTION_ID = UUID("66666666-6666-6666-6666-666666666666")
HASH = "a" * 64
UPDATED_AT = datetime(2026, 9, 10, 12, tzinfo=UTC)
RECOVER_URL = f"/api/clinical-actions/{ACTION_ID}/recover-draft"
SAME_ORIGIN = {"Origin": "https://testserver", "Sec-Fetch-Site": "same-origin"}


def _payload(**changes: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "proposal_hash": HASH,
        "expected_artifact_updated_at": UPDATED_AT.isoformat(),
    }
    body.update(changes)
    return body


def _request():
    from backend.clinical_assistant.schemas import RecoverDraftRequest

    return RecoverDraftRequest.model_validate(_payload())


def _client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="https://testserver")


# --------------------------------------------------------------------------- #
# DTO: strict, tz-aware, no client authority
# --------------------------------------------------------------------------- #


def test_recover_draft_request_accepts_only_hash_and_artifact_timestamp() -> None:
    request = _request()
    assert request.proposal_hash == HASH
    assert request.expected_artifact_updated_at == UPDATED_AT


@pytest.mark.parametrize(
    "field",
    ["patient_id", "owner_user_id", "evolution_id", "status", "content", "draft", "action_type"],
)
def test_recover_draft_request_forbids_client_authority_fields(field: str) -> None:
    from pydantic import ValidationError

    from backend.clinical_assistant.schemas import RecoverDraftRequest

    with pytest.raises(ValidationError):
        RecoverDraftRequest.model_validate(_payload(**{field: str(UUID(int=9))}))


@pytest.mark.parametrize("hash_value", ["", "abc", "A" * 64, "z" * 64, "a" * 63, "a" * 65])
def test_recover_draft_request_requires_canonical_sha256(hash_value: str) -> None:
    from pydantic import ValidationError

    from backend.clinical_assistant.schemas import RecoverDraftRequest

    with pytest.raises(ValidationError):
        RecoverDraftRequest.model_validate(_payload(proposal_hash=hash_value))


@pytest.mark.parametrize(
    "timestamp",
    ["2026-09-10T12:00:00", "2026-09-10", "not-a-date"],
)
def test_recover_draft_request_requires_timezone_aware_timestamp(timestamp: str) -> None:
    from pydantic import ValidationError

    from backend.clinical_assistant.schemas import RecoverDraftRequest

    with pytest.raises(ValidationError):
        RecoverDraftRequest.model_validate(_payload(expected_artifact_updated_at=timestamp))


# --------------------------------------------------------------------------- #
# Service: validate + delegate, discriminate the outcome, never write clinically
# --------------------------------------------------------------------------- #


async def test_recover_draft_delegates_owner_action_hash_and_timestamp(monkeypatch) -> None:
    calls: list[tuple[Any, ...]] = []

    async def recover(owner: UUID, action: UUID, proposal_hash: str, expected: datetime):
        calls.append((owner, action, proposal_hash, expected))
        return {"outcome": "recovered", "thread_id": THREAD_ID, "artifact_id": ARTIFACT_ID}

    monkeypatch.setattr(service.repository, "recover_draft", recover)

    result = await service.recover_draft(OWNER_ID, ACTION_ID, _request())

    assert result == {"outcome": "recovered", "thread_id": THREAD_ID, "artifact_id": ARTIFACT_ID}
    assert calls == [(OWNER_ID, ACTION_ID, HASH, UPDATED_AT)]


async def test_recover_draft_preserves_saved_identity_without_reopening(monkeypatch) -> None:
    async def recover(*_args: Any):
        return {
            "outcome": "saved",
            "thread_id": THREAD_ID,
            "artifact_id": ARTIFACT_ID,
            "evolution_id": EVOLUTION_ID,
        }

    monkeypatch.setattr(service.repository, "recover_draft", recover)

    result = await service.recover_draft(OWNER_ID, ACTION_ID, _request())

    assert result["outcome"] == "saved"
    assert result["evolution_id"] == EVOLUTION_ID


async def test_recover_draft_returns_already_recovered_without_overwriting(monkeypatch) -> None:
    async def recover(*_args: Any):
        return {
            "outcome": "already_recovered",
            "thread_id": THREAD_ID,
            "artifact_id": ARTIFACT_ID,
        }

    monkeypatch.setattr(service.repository, "recover_draft", recover)

    result = await service.recover_draft(OWNER_ID, ACTION_ID, _request())

    assert result["outcome"] == "already_recovered"


@pytest.mark.parametrize(
    "error_name",
    [
        "RecoveryIneligibleError",
        "RecoveryStaleError",
        "RecoveryConflictError",
        "RecoveryBusyError",
    ],
)
async def test_recover_draft_propagates_recovery_rejections(monkeypatch, error_name: str) -> None:
    error_cls = getattr(service, error_name)

    async def recover(*_args: Any):
        raise error_cls

    monkeypatch.setattr(service.repository, "recover_draft", recover)

    with pytest.raises(error_cls):
        await service.recover_draft(OWNER_ID, ACTION_ID, _request())


async def test_recover_draft_never_prepares_or_resolves_clinically(monkeypatch) -> None:
    async def recover(*_args: Any):
        return {"outcome": "recovered", "thread_id": THREAD_ID, "artifact_id": ARTIFACT_ID}

    async def forbidden(*_args: Any, **_kwargs: Any) -> None:
        raise AssertionError("recovery must not prepare, resolve or persist an evolution")

    monkeypatch.setattr(service.repository, "recover_draft", recover)
    monkeypatch.setattr(service, "prepare_save", forbidden)
    monkeypatch.setattr(service, "resolve_action", forbidden)

    result = await service.recover_draft(OWNER_ID, ACTION_ID, _request())

    assert result["outcome"] == "recovered"


# --------------------------------------------------------------------------- #
# HTTP: discriminated success, ownership hiding, same-origin, stable codes
# --------------------------------------------------------------------------- #


async def test_recover_draft_route_returns_discriminated_success(monkeypatch) -> None:
    monkeypatch.setattr(config, "APP_ORIGINS", ["https://testserver"])
    seen: list[tuple[Any, ...]] = []

    async def recover(owner: UUID, action: UUID, request: Any):
        seen.append((owner, action, request.proposal_hash))
        return {"outcome": "recovered", "thread_id": THREAD_ID, "artifact_id": ARTIFACT_ID}

    monkeypatch.setattr(service, "recover_draft", recover)
    app.dependency_overrides[get_current_user] = lambda: {"id": OWNER_ID}
    try:
        async with _client() as client:
            response = await client.post(RECOVER_URL, json=_payload(), headers=SAME_ORIGIN)
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 200
    assert response.json() == {
        "outcome": "recovered",
        "thread_id": str(THREAD_ID),
        "artifact_id": str(ARTIFACT_ID),
    }
    assert seen == [(OWNER_ID, ACTION_ID, HASH)]


async def test_recover_draft_route_returns_saved_identity(monkeypatch) -> None:
    monkeypatch.setattr(config, "APP_ORIGINS", ["https://testserver"])

    async def recover(*_args: Any):
        return {
            "outcome": "saved",
            "thread_id": THREAD_ID,
            "artifact_id": ARTIFACT_ID,
            "evolution_id": EVOLUTION_ID,
        }

    monkeypatch.setattr(service, "recover_draft", recover)
    app.dependency_overrides[get_current_user] = lambda: {"id": OWNER_ID}
    try:
        async with _client() as client:
            response = await client.post(RECOVER_URL, json=_payload(), headers=SAME_ORIGIN)
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 200
    assert response.json()["outcome"] == "saved"
    assert response.json()["evolution_id"] == str(EVOLUTION_ID)


async def test_recover_draft_route_requires_authentication() -> None:
    async with _client() as client:
        response = await client.post(RECOVER_URL, json=_payload(), headers=SAME_ORIGIN)
    assert response.status_code == 401


async def test_recover_draft_route_requires_same_origin(monkeypatch) -> None:
    monkeypatch.setattr(config, "APP_ORIGINS", ["https://testserver"])
    calls: list[Any] = []

    async def recover(*_args: Any):
        calls.append(_args)
        return {"outcome": "recovered", "thread_id": THREAD_ID, "artifact_id": ARTIFACT_ID}

    monkeypatch.setattr(service, "recover_draft", recover)
    app.dependency_overrides[get_current_user] = lambda: {"id": OWNER_ID}
    try:
        async with _client() as client:
            allowed = await client.post(RECOVER_URL, json=_payload(), headers=SAME_ORIGIN)
            cross = await client.post(
                RECOVER_URL,
                json=_payload(),
                headers={"Origin": "https://evil.example", "Sec-Fetch-Site": "cross-site"},
            )
            missing = await client.post(RECOVER_URL, json=_payload())
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert allowed.status_code == 200
    assert cross.status_code == 403
    assert missing.status_code == 403
    assert len(calls) == 1


async def test_recover_draft_route_hides_missing_or_foreign_actions(monkeypatch) -> None:
    monkeypatch.setattr(config, "APP_ORIGINS", ["https://testserver"])

    async def recover(*_args: Any):
        raise LookupError("Action not found")

    monkeypatch.setattr(service, "recover_draft", recover)
    app.dependency_overrides[get_current_user] = lambda: {"id": OWNER_ID}
    try:
        async with _client() as client:
            response = await client.post(RECOVER_URL, json=_payload(), headers=SAME_ORIGIN)
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 404
    assert str(THREAD_ID) not in response.text


@pytest.mark.parametrize(
    ("error_name", "code"),
    [
        ("RecoveryIneligibleError", "CLINICAL_RECOVERY_INELIGIBLE"),
        ("RecoveryStaleError", "CLINICAL_RECOVERY_STALE"),
        ("RecoveryConflictError", "CLINICAL_RECOVERY_CONFLICT"),
        ("RecoveryBusyError", "CLINICAL_RECOVERY_BUSY"),
    ],
)
async def test_recover_draft_route_maps_rejections_to_stable_codes(
    monkeypatch, error_name: str, code: str
) -> None:
    monkeypatch.setattr(config, "APP_ORIGINS", ["https://testserver"])
    error_cls = getattr(service, error_name)

    async def recover(*_args: Any):
        raise error_cls

    monkeypatch.setattr(service, "recover_draft", recover)
    app.dependency_overrides[get_current_user] = lambda: {"id": OWNER_ID}
    try:
        async with _client() as client:
            response = await client.post(RECOVER_URL, json=_payload(), headers=SAME_ORIGIN)
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 409
    assert response.json() == {"detail": {"code": code}}


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"proposal_hash": "abc", "expected_artifact_updated_at": UPDATED_AT.isoformat()},
        {"proposal_hash": HASH},
        {"proposal_hash": HASH, "expected_artifact_updated_at": "2026-09-10T12:00:00"},
        _payload(patient_id=str(UUID(int=9))),
        _payload(evolution_id=str(EVOLUTION_ID)),
    ],
)
async def test_recover_draft_route_rejects_malformed_or_extended_bodies(
    monkeypatch, body: dict[str, Any]
) -> None:
    monkeypatch.setattr(config, "APP_ORIGINS", ["https://testserver"])
    calls: list[Any] = []

    async def recover(*_args: Any):
        calls.append(_args)
        return {"outcome": "recovered", "thread_id": THREAD_ID, "artifact_id": ARTIFACT_ID}

    monkeypatch.setattr(service, "recover_draft", recover)
    app.dependency_overrides[get_current_user] = lambda: {"id": OWNER_ID}
    try:
        async with _client() as client:
            response = await client.post(RECOVER_URL, json=body, headers=SAME_ORIGIN)
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 422
    assert calls == []


async def test_recover_draft_route_never_schedules_export(monkeypatch) -> None:
    monkeypatch.setattr(config, "APP_ORIGINS", ["https://testserver"])

    async def recover(*_args: Any):
        return {
            "outcome": "saved",
            "thread_id": THREAD_ID,
            "artifact_id": ARTIFACT_ID,
            "evolution_id": EVOLUTION_ID,
        }

    def forbidden(*_args: Any, **_kwargs: Any) -> None:
        raise AssertionError("recovery must not schedule a Drive export")

    monkeypatch.setattr(service, "recover_draft", recover)
    monkeypatch.setattr(
        "backend.routes.clinical_assistant.evolution_exports_service.schedule_export",
        forbidden,
    )
    app.dependency_overrides[get_current_user] = lambda: {"id": OWNER_ID}
    try:
        async with _client() as client:
            response = await client.post(RECOVER_URL, json=_payload(), headers=SAME_ORIGIN)
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 200


# --------------------------------------------------------------------------- #
# Generic frozen-artifact rejection is retained for recovery
# --------------------------------------------------------------------------- #


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


async def test_generic_artifact_writes_still_reject_failed_status(monkeypatch) -> None:
    from backend.clinical_assistant.schemas import ClinicalArtifactUpdate

    async def get_artifact(*_args: Any):
        return {
            "id": ARTIFACT_ID,
            "turn_id": UUID(int=7),
            "patient_id": UUID(int=8),
            "status": "failed",
            "source_note": "Nota",
            "generated_draft": _draft().model_dump(mode="json"),
            "draft": _draft().model_dump(mode="json"),
            "evolution_at": UPDATED_AT,
        }

    async def patient(*_args: Any):
        return {"id": UUID(int=8)}

    async def sanitize(_owner: Any, content: str):
        return type("Sanitized", (), {"display_text": content})()

    monkeypatch.setattr(service.repository, "get_artifact", get_artifact)
    monkeypatch.setattr(service.patients_repo, "get_patient", patient)
    monkeypatch.setattr(service, "sanitize_content", sanitize)

    with pytest.raises(ValueError):
        await service.update_artifact(
            OWNER_ID,
            THREAD_ID,
            ARTIFACT_ID,
            ClinicalArtifactUpdate(source_note="Nota", draft=_draft(), evolution_at=UPDATED_AT),
        )
    with pytest.raises(ValueError):
        await service.regenerate_draft(OWNER_ID, THREAD_ID, ARTIFACT_ID)
