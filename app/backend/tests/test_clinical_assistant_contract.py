"""Security and boundary contracts for the isolated Clinical Assistant."""

import hashlib
import json
from pathlib import Path
from uuid import UUID

import pytest
from httpx import ASGITransport, AsyncClient

from tests.fakes import FakeTranscriber


def test_turn_context_is_immutable() -> None:
    from backend.clinical_assistant.policy import ClinicalTurnContext

    context = ClinicalTurnContext(UUID(int=1), UUID(int=2), UUID(int=3), UUID(int=4))
    with pytest.raises(AttributeError):
        context.patient_id = UUID(int=5)


async def test_rut_sanitizer_never_returns_raw_identifier(monkeypatch) -> None:
    from backend.clinical_assistant.sensitive_input import sanitize_content

    async def owned_patient(owner, rut_body):
        assert rut_body == 12_345_678
        return {
            "id": UUID(int=8),
            "first_name": "Juan",
            "last_name": "Pérez",
            "rut_number": rut_body,
            "rut_dv": "5",
        }

    monkeypatch.setattr(
        "backend.clinical_assistant.sensitive_input.patients_repo.get_patient_by_rut",
        owned_patient,
    )
    result = await sanitize_content(UUID(int=1), "Nota 12.345.678-5")
    assert "12.345.678-5" not in result.display_text
    assert "12.345.678-5" not in result.model_text
    assert str(UUID(int=8)) in result.model_text
    assert result.masked_ruts == ("••.•••.678-5",)


async def test_unknown_rut_is_replaced_without_provider_safe_echo(monkeypatch) -> None:
    from backend.clinical_assistant.sensitive_input import sanitize_content

    async def no_patient(owner, rut_body):
        return None

    monkeypatch.setattr(
        "backend.clinical_assistant.sensitive_input.patients_repo.get_patient_by_rut",
        no_patient,
    )
    result = await sanitize_content(UUID(int=1), "Trabajar con 12.345.678-5")
    assert "12.345.678-5" not in result.display_text
    assert "12.345.678-5" not in result.model_text
    assert "[RUT no encontrado]" in result.display_text


async def test_compact_rut_is_redacted(monkeypatch) -> None:
    from backend.clinical_assistant.sensitive_input import sanitize_content

    async def owned_patient(owner, rut_body):
        assert rut_body == 12_345_678
        return {
            "id": UUID(int=8),
            "first_name": "Juan",
            "last_name": "Pérez",
            "rut_number": rut_body,
            "rut_dv": "5",
        }

    monkeypatch.setattr(
        "backend.clinical_assistant.sensitive_input.patients_repo.get_patient_by_rut",
        owned_patient,
    )
    result = await sanitize_content(UUID(int=1), "Nota 123456785")
    assert "123456785" not in result.display_text
    assert "123456785" not in result.model_text
    assert result.masked_ruts == ("••.•••.678-5",)


async def test_invalid_compact_rut_is_redacted_without_lookup(monkeypatch) -> None:
    from backend.clinical_assistant.sensitive_input import sanitize_content

    async def no_patient(owner, rut_body):
        raise AssertionError("invalid compact candidate must not trigger a lookup")

    monkeypatch.setattr(
        "backend.clinical_assistant.sensitive_input.patients_repo.get_patient_by_rut",
        no_patient,
    )
    result = await sanitize_content(UUID(int=1), "Nota 123456789")
    assert "123456789" not in result.display_text
    assert "123456789" not in result.model_text
    assert result.display_text == "Nota [RUT no válido]"
    assert result.invalid_candidates == 1


async def test_compact_non_rut_number_is_left_untouched(monkeypatch) -> None:
    from backend.clinical_assistant.sensitive_input import sanitize_content

    async def no_patient(owner, rut_body):
        raise AssertionError("invalid compact candidate must not trigger a lookup")

    monkeypatch.setattr(
        "backend.clinical_assistant.sensitive_input.patients_repo.get_patient_by_rut",
        no_patient,
    )
    result = await sanitize_content(UUID(int=1), "El control 20253 arrojó")
    assert result.display_text == "El control 20253 arrojó"
    assert result.model_text == "El control 20253 arrojó"
    assert result.invalid_candidates == 0


async def test_masked_rut_is_kept_for_display_and_redacted_for_model(monkeypatch) -> None:
    from backend.clinical_assistant.sensitive_input import sanitize_content

    async def no_patient(owner, rut_body):
        raise AssertionError("masked candidate must not trigger a lookup")

    monkeypatch.setattr(
        "backend.clinical_assistant.sensitive_input.patients_repo.get_patient_by_rut",
        no_patient,
    )
    result = await sanitize_content(UUID(int=1), "Paciente ••.•••.678-5 en control")
    assert "••.•••.678-5" in result.display_text
    assert "••.•••.678-5" not in result.model_text
    assert "[RUT_REDACTED]" in result.model_text


async def test_stale_turn_lock_is_reclaimable() -> None:
    from datetime import UTC, datetime, timedelta

    from backend.db.clinical_assistant_repo import _turn_is_stale

    assert not _turn_is_stale(datetime.now(UTC))
    assert _turn_is_stale(datetime.now(UTC) - timedelta(minutes=20))


async def test_clinical_thread_lifecycle_stays_owner_scoped(monkeypatch) -> None:
    from backend.clinical_assistant import service

    owner = UUID(int=1)
    thread = UUID(int=2)
    calls: list[tuple[object, ...]] = []

    async def sanitize(_owner, title):
        return type("Sanitized", (), {"display_text": title.strip()})()

    async def rename(owner_id, thread_id, title):
        calls.append(("rename", owner_id, thread_id, title))
        return {"id": thread_id}

    async def get_response(owner_id, thread_id):
        calls.append(("get", owner_id, thread_id))
        return "updated"

    async def delete(owner_id, thread_id):
        calls.append(("delete", owner_id, thread_id))
        return True

    monkeypatch.setattr(service, "sanitize_content", sanitize)
    monkeypatch.setattr(service.repository, "rename_thread", rename)
    monkeypatch.setattr(service, "get_thread_response", get_response)
    monkeypatch.setattr(service.repository, "delete_thread", delete)

    assert await service.rename_thread(owner, thread, " Control ") == "updated"
    assert await service.delete_thread(owner, thread)
    assert calls == [
        ("rename", owner, thread, "Control"),
        ("get", owner, thread),
        ("delete", owner, thread),
    ]


async def test_clinical_turn_releases_lock_when_setup_fails(monkeypatch) -> None:
    from backend.clinical_assistant import service

    owner = UUID(int=1)
    thread = UUID(int=2)
    turn = UUID(int=3)
    finished: list[tuple[UUID, UUID, UUID]] = []

    async def sanitize(_owner, content):
        return type(
            "Sanitized",
            (),
            {
                "display_text": content,
                "model_text": content,
                "invalid_candidates": 0,
                "unresolved_candidates": 0,
                "patient_ids": (),
            },
        )()

    async def claim(*_args):
        return {"replay": False, "active_patient_id": owner}

    async def fail_title(*_args):
        raise RuntimeError("database unavailable")

    async def finish(owner_id, thread_id, turn_id):
        finished.append((owner_id, thread_id, turn_id))

    monkeypatch.setattr(service, "sanitize_content", sanitize)
    monkeypatch.setattr(service.repository, "claim_turn", claim)
    monkeypatch.setattr(service, "_set_contextual_title", fail_title)
    monkeypatch.setattr(service.repository, "finish_turn", finish)

    with pytest.raises(RuntimeError, match="database unavailable"):
        _ = [chunk async for chunk in service.stream_turn(owner, thread, turn, "Control")]

    assert finished == [(owner, thread, turn)]


@pytest.mark.parametrize(
    ("status", "error_code", "terminal_event", "terminal_error"),
    [
        ("completed", None, "turn.completed", None),
        ("failed", "CLINICAL_MODEL_UNAVAILABLE", "turn.failed", "CLINICAL_MODEL_UNAVAILABLE"),
        ("running", None, "turn.failed", "TURN_ALREADY_RUNNING"),
    ],
)
async def test_clinical_turn_replay_preserves_terminal_state(
    monkeypatch, status, error_code, terminal_event, terminal_error
) -> None:
    from backend.clinical_assistant import service

    owner = UUID(int=1)
    thread = UUID(int=2)
    turn = UUID(int=3)

    async def sanitize(_owner, content):
        return type("Sanitized", (), {"display_text": content})()

    async def claim(*_args):
        return {
            "replay": True,
            "messages": [{"id": UUID(int=4), "role": "user", "content": "Control"}],
            "turn_status": status,
            "turn_error_code": error_code,
        }

    async def unexpected_finish(*_args):
        raise AssertionError("replay must not finish another worker's turn")

    monkeypatch.setattr(service, "sanitize_content", sanitize)
    monkeypatch.setattr(service.repository, "claim_turn", claim)
    monkeypatch.setattr(service.repository, "finish_turn", unexpected_finish)

    chunks = [chunk async for chunk in service.stream_turn(owner, thread, turn, "Control")]
    events = [json.loads(chunk.split("data: ", 1)[1]) for chunk in chunks]
    assert chunks[-1].splitlines()[0] == f"event: {terminal_event}"
    assert events[-1]["data"].get("error_code") == terminal_error


@pytest.mark.parametrize("artifact_status", ["stale", "pending", "approved", "declined", "failed"])
async def test_prepare_save_rejects_every_frozen_artifact(monkeypatch, artifact_status) -> None:
    from backend.clinical_assistant import service
    from backend.clinical_assistant.schemas import PrepareSaveRequest

    owner = UUID(int=1)
    thread = UUID(int=2)
    turn = UUID(int=3)
    artifact_id = UUID(int=4)

    async def get_thread(*_args):
        return {"id": thread}

    async def get_artifact(*_args):
        return {"turn_id": turn, "status": artifact_status}

    async def unexpected_patient_lookup(*_args):
        raise AssertionError("frozen artifact must fail before patient lookup")

    monkeypatch.setattr(service.repository, "get_thread", get_thread)
    monkeypatch.setattr(service.repository, "get_artifact", get_artifact)
    monkeypatch.setattr(service.patients_repo, "get_patient", unexpected_patient_lookup)

    request = PrepareSaveRequest(turn_id=turn, artifact_id=artifact_id)
    with pytest.raises(service.ArtifactNotDraftError):
        await service.prepare_save(owner, thread, request)


def test_clinical_invariant_indexes_are_migrated() -> None:
    migration = (
        Path(__file__).parents[1]
        / "alembic"
        / "versions"
        / "0008_clinical_pending_and_turn_invariants.py"
    ).read_text(encoding="utf-8")
    assert "uq_clinical_pending_actions_thread_pending" in migration
    assert "uq_clinical_messages_thread_turn_user" in migration
    assert "status = 'pending'" in migration


def test_clinical_turn_outcomes_are_migrated() -> None:
    migration = (
        Path(__file__).parents[1] / "alembic" / "versions" / "0011_add_clinical_turn_outcomes.py"
    ).read_text(encoding="utf-8")
    assert "turn_status" in migration
    assert "turn_error_code" in migration
    assert "'running', 'completed', 'failed'" in migration


def test_production_compose_starts_whisper_without_a_profile() -> None:
    compose = (Path(__file__).parents[3] / "deploy" / "docker-compose.yml").read_text(
        encoding="utf-8"
    )
    whisper_service = compose.split("\n  whisper:", 1)[1].split("\n  app-green:", 1)[0]
    assert "profiles:" not in whisper_service


def test_approval_hash_is_canonical_sha256() -> None:
    from backend.clinical_assistant.service import canonical_proposal

    payload, digest = canonical_proposal({"b": 2, "a": "texto"})
    expected = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    assert digest == hashlib.sha256(expected.encode()).hexdigest()


async def test_fake_transcriber_uses_the_transcription_port() -> None:
    result = await FakeTranscriber("texto dictado").transcribe(b"audio", mime_type="audio/webm")

    assert result.text == "texto dictado"


def test_clinical_events_are_versioned_and_sequenced() -> None:
    from backend.clinical_assistant.events import event

    first = json.loads(
        event(
            "item.completed",
            {
                "thread_id": "thread-1",
                "turn_id": "turn-1",
                "item_id": "item-1",
                "item_type": "activity",
                "status": "completed",
                "label": "Listo",
            },
        ).split("data: ", 1)[1]
    )
    second = json.loads(
        event(
            "turn.completed",
            {"thread_id": "thread-1", "turn_id": "turn-1", "item_id": "item-2"},
        ).split("data: ", 1)[1]
    )

    assert first["schema_version"] == 1
    assert first["event_id"]
    assert first["sequence"] + 1 == second["sequence"]
    assert first["data"]["label"] == "Listo"


def test_prepare_save_requires_the_source_turn() -> None:
    from pydantic import ValidationError

    from backend.clinical_assistant.schemas import PrepareSaveRequest

    with pytest.raises(ValidationError):
        PrepareSaveRequest.model_validate(
            {
                "raw_note": "Nota",
                "draft": {
                    "context": "",
                    "findings": "",
                    "assessment": "",
                    "treatment": "",
                    "follow_up": "",
                    "review_flags": [],
                },
                "evolution_at": "2026-09-08T12:00:00Z",
            }
        )


def test_clinical_artifact_migration_binds_owner_patient_and_turn() -> None:
    migration = (
        Path(__file__).parents[1] / "alembic" / "versions" / "0010_add_clinical_turn_artifacts.py"
    ).read_text(encoding="utf-8")
    assert "clinical_turn_artifacts" in migration
    assert "fk_clinical_artifacts_patient_owner" in migration
    assert "uq_clinical_turn_artifacts_patient_turn" in migration
    assert "artifact_id" in migration
    assert "status IN ('draft', 'stale', 'pending', 'approved', 'declined', 'failed')" in migration


def test_artifact_update_requires_timezone_and_canonical_payload() -> None:
    from datetime import UTC, datetime

    from pydantic import ValidationError

    from backend.clinical_assistant.schemas import ClinicalArtifactUpdate
    from backend.services.clinical_evolutions import ClinicalDraft

    draft = ClinicalDraft(
        context="Control",
        findings="Sin hallazgos",
        assessment="Estable",
        treatment="Mantener higiene",
        follow_up="Seis meses",
        review_flags=[],
    )
    with pytest.raises(ValidationError):
        ClinicalArtifactUpdate.model_validate(
            {
                "source_note": "Nota",
                "draft": draft.model_dump(),
                "evolution_at": "2026-09-08T12:00:00",
            }
        )
    artifact = ClinicalArtifactUpdate(
        source_note="Nota",
        draft=draft,
        evolution_at=datetime(2026, 9, 8, 12, tzinfo=UTC),
    )
    assert artifact.draft.context == "Control"


def test_voice_rate_limit_migration_is_owner_scoped() -> None:
    migration = (
        Path(__file__).parents[1] / "alembic" / "versions" / "0009_add_voice_rate_limit.py"
    ).read_text(encoding="utf-8")
    assert "voice_transcription_requests" in migration
    assert "users.id" in migration
    assert "requested_at" in migration


def test_clinical_persistence_is_separate_from_rag() -> None:
    migration = (
        Path(__file__).parents[1] / "alembic" / "versions" / "0007_add_clinical_assistant.py"
    ).read_text(encoding="utf-8")
    assert "clinical_threads" in migration
    assert "clinical_messages" in migration
    assert "clinical_pending_actions" in migration
    assert "conversations" not in migration
    assert "messages" not in migration.replace("clinical_messages", "")


async def test_clinical_sensitive_validation_does_not_echo_body() -> None:
    from backend.auth.dependencies import get_current_user
    from backend.main import app

    app.dependency_overrides[get_current_user] = lambda: {"id": UUID(int=1)}

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="https://testserver"
        ) as client:
            response = await client.post(
                "/api/clinical-threads/00000000-0000-0000-0000-000000000001/turns",
                json={"turn_id": "00000000-0000-0000-0000-000000000002", "content": "x" * 40_001},
            )
        assert response.status_code == 422
        assert "x" * 100 not in response.text
    finally:
        app.dependency_overrides.pop(get_current_user, None)


async def test_clinical_and_voice_routes_require_authentication() -> None:
    from backend.main import app

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://testserver"
    ) as client:
        clinical = await client.get("/api/clinical-threads")
        voice = await client.post(
            "/api/transcriptions", content=b"audio", headers={"content-type": "audio/webm"}
        )
    assert clinical.status_code == 401
    assert voice.status_code == 401


async def test_streamed_oversized_audio_is_rejected_before_buffering() -> None:
    from backend.auth.dependencies import get_current_user
    from backend.config import VOICE_MAX_BYTES
    from backend.main import app

    app.dependency_overrides[get_current_user] = lambda: {"id": UUID(int=1)}

    async def oversized_stream():
        yield b"a" * VOICE_MAX_BYTES
        yield b"b" * 1024

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="https://testserver"
        ) as client:
            response = await client.post(
                "/api/transcriptions",
                content=oversized_stream(),
                headers={"content-type": "audio/webm"},
            )
        assert response.status_code == 413
        assert response.json()["detail"]["code"] == "AUDIO_TOO_LARGE"
    finally:
        app.dependency_overrides.pop(get_current_user, None)
