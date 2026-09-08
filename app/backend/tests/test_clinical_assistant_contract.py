"""Security and boundary contracts for the isolated Clinical Assistant."""

import hashlib
import json
from pathlib import Path
from uuid import UUID

import pytest
from httpx import ASGITransport, AsyncClient

from backend.transcription.port import FakeTranscriber


def test_turn_context_is_immutable() -> None:
    from backend.clinical_assistant.policy import ClinicalTurnContext

    context = ClinicalTurnContext(UUID(int=1), UUID(int=2), UUID(int=3), UUID(int=4))
    with pytest.raises(AttributeError):
        context.patient_id = UUID(int=5)  # type: ignore[misc]


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


def test_approval_hash_is_canonical_sha256() -> None:
    from backend.clinical_assistant.service import canonical_proposal

    payload, digest = canonical_proposal({"b": 2, "a": "texto"})
    expected = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    assert digest == hashlib.sha256(expected.encode()).hexdigest()


async def test_fake_transcriber_uses_the_transcription_port() -> None:
    result = await FakeTranscriber("texto dictado").transcribe(b"audio", mime_type="audio/webm")

    assert result.text == "texto dictado"


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
