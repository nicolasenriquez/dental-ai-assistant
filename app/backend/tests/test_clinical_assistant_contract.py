"""Security and boundary contracts for the isolated Clinical Assistant."""

import asyncio
import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import cast
from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from httpx import ASGITransport, AsyncClient

from tests.fakes import FakeTranscriber


def test_turn_context_is_immutable() -> None:
    from backend.clinical_assistant.policy import ClinicalTurnContext

    context = ClinicalTurnContext(UUID(int=1), UUID(int=2), UUID(int=3), UUID(int=4))
    with pytest.raises(AttributeError):
        context.patient_id = UUID(int=5)


def test_turn_request_validates_structured_drive_context() -> None:
    from backend.clinical_assistant.schemas import ClinicalTurnRequest

    request = ClinicalTurnRequest.model_validate(
        {
            "turn_id": str(UUID(int=2)),
            "content": "Actualizar evolución",
            "context_items": [
                {
                    "id": str(UUID(int=3)),
                    "kind": "drive_selection",
                    "source_id": "drive-file-1",
                    "source_name": "Evaluación.md",
                    "content": "Control en seis meses",
                }
            ],
        }
    )

    assert request.context_items[0].source_name == "Evaluación.md"


@pytest.mark.parametrize(
    "rut", ["12.345.678-5", "12.345.6785", "12.345.678 5", "12 345 678 - 5", "123456785"]
)
async def test_rut_sanitizer_never_returns_raw_identifier(monkeypatch, rut: str) -> None:
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
    result = await sanitize_content(UUID(int=1), f"Nota {rut}")
    assert rut not in result.display_text
    assert rut not in result.model_text
    assert str(UUID(int=8)) in result.model_text
    assert result.masked_ruts == ("••.•••.678-5",)


async def test_rut_sanitizer_accepts_whitespace_before_check_digit(monkeypatch) -> None:
    from backend.clinical_assistant.sensitive_input import sanitize_content

    async def owned_patient(_owner, rut_body):
        return {"id": UUID(int=8), "rut_number": rut_body, "rut_dv": "5"}

    monkeypatch.setattr(
        "backend.clinical_assistant.sensitive_input.patients_repo.get_patient_by_rut",
        owned_patient,
    )

    result = await sanitize_content(UUID(int=1), "Nota 12.345.678 5")

    assert "12.345.678 5" not in result.display_text
    assert "12.345.678 5" not in result.model_text
    assert result.masked_ruts == ("••.•••.678-5",)


async def test_recent_evolutions_are_sanitized_before_model_use(monkeypatch) -> None:
    from backend.clinical_assistant import service
    from backend.clinical_assistant.policy import ClinicalTurnContext

    owner = UUID(int=1)
    patient_id = UUID(int=4)

    async def get_patient(_owner, _patient_id):
        return {"id": patient_id}

    async def get_history(_owner, _patient_id, *, limit):
        assert limit > 0
        return [{"evolution_at": "2026-09-17", "final_text": "RUT 12.345.678-5"}]

    async def sanitize(_owner, content):
        assert content == "RUT 12.345.678-5"
        return type("Sanitized", (), {"model_text": "RUT [PATIENT_REF:4]"})()

    monkeypatch.setattr(service.patients_repo, "get_patient", get_patient)
    monkeypatch.setattr(service.patients_repo, "get_recent_approved_evolutions", get_history)
    monkeypatch.setattr(service, "sanitize_content", sanitize)

    result = await service._get_recent_evolutions(
        ClinicalTurnContext(owner, UUID(int=2), UUID(int=3), patient_id)
    )

    assert result["evolutions"][0]["final_text"] == "RUT [PATIENT_REF:4]"


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


async def test_patient_switch_payload_serializes_uuid_patient_ids(monkeypatch) -> None:
    from backend.db import clinical_assistant_repo

    captured: dict[str, object] = {}

    class Connection:
        async def execute(self, *args: object) -> None:
            captured["payload"] = args[-1]

    class Acquire:
        async def __aenter__(self) -> Connection:
            return Connection()

        async def __aexit__(self, *_args: object) -> bool:
            return False

    class Pool:
        def acquire(self) -> Acquire:
            return Acquire()

    monkeypatch.setattr(clinical_assistant_repo, "get_pg_pool", lambda: Pool())
    await clinical_assistant_repo.set_patient_switch(
        UUID(int=1),
        UUID(int=2),
        UUID(int=3),
        {"current_patient": {"id": UUID(int=4)}},
    )

    assert json.loads(str(captured["payload"])) == {"current_patient": {"id": str(UUID(int=4))}}


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


async def test_invalid_compact_number_is_left_untouched_without_lookup(monkeypatch) -> None:
    from backend.clinical_assistant.sensitive_input import sanitize_content

    async def no_patient(owner, rut_body):
        raise AssertionError("invalid compact candidate must not trigger a lookup")

    monkeypatch.setattr(
        "backend.clinical_assistant.sensitive_input.patients_repo.get_patient_by_rut",
        no_patient,
    )
    result = await sanitize_content(UUID(int=1), "Nota 123456789")
    assert result.display_text == "Nota 123456789"
    assert result.model_text == "Nota 123456789"
    assert result.invalid_candidates == 0


async def test_compact_non_rut_number_is_left_untouched(monkeypatch) -> None:
    from backend.clinical_assistant.sensitive_input import sanitize_content

    async def no_patient(owner, rut_body):
        raise AssertionError("invalid compact candidate must not trigger a lookup")

    monkeypatch.setattr(
        "backend.clinical_assistant.sensitive_input.patients_repo.get_patient_by_rut",
        no_patient,
    )
    result = await sanitize_content(UUID(int=1), "Penicilina 1200000 UI")
    assert result.display_text == "Penicilina 1200000 UI"
    assert result.model_text == "Penicilina 1200000 UI"
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

    monkeypatch.setattr(service, "sanitize_content", sanitize)
    monkeypatch.setattr(service.repository, "rename_thread", rename)
    monkeypatch.setattr(service, "get_thread_response", get_response)

    assert await service.rename_thread(owner, thread, " Control ") == "updated"
    assert calls == [
        ("rename", owner, thread, "Control"),
        ("get", owner, thread),
    ]


async def test_clinical_thread_list_and_delete_routes_stay_owner_scoped(monkeypatch) -> None:
    from fastapi import HTTPException

    from backend.routes import clinical_assistant

    owner = UUID(int=1)
    thread = UUID(int=2)
    calls: list[tuple[object, ...]] = []

    async def list_owned(owner_id):
        calls.append(("list", owner_id))
        return [{"id": thread}]

    async def delete_owned(owner_id, thread_id):
        calls.append(("delete", owner_id, thread_id))
        return thread_id == thread

    monkeypatch.setattr(clinical_assistant.repository, "list_threads", list_owned)
    monkeypatch.setattr(clinical_assistant.repository, "delete_thread", delete_owned)

    user = {"id": str(owner)}
    assert await clinical_assistant.list_threads(user) == [{"id": thread}]
    assert await clinical_assistant.delete_thread(thread, user) is None
    with pytest.raises(HTTPException) as missing:
        await clinical_assistant.delete_thread(UUID(int=3), user)
    assert missing.value.status_code == 404
    assert calls == [
        ("list", owner),
        ("delete", owner, thread),
        ("delete", owner, UUID(int=3)),
    ]


async def test_clinical_acquisition_and_back_to_edit_stay_owner_scoped(monkeypatch) -> None:
    from backend.clinical_assistant import service

    owner = UUID(int=1)
    action = UUID(int=2)
    calls: list[tuple[object, ...]] = []
    empty_thread = {
        "id": UUID(int=3),
        "owner_user_id": owner,
        "title": "Asistente clínico",
        "active_patient_id": None,
        "active_turn_id": None,
        "created_at": "2026-09-10T12:00:00Z",
        "updated_at": "2026-09-10T12:00:00Z",
        "messages": [],
        "artifacts": [],
        "pending_action": None,
    }

    async def acquire(owner_id):
        calls.append(("acquire", owner_id))
        return empty_thread, True

    async def back(owner_id, action_id):
        calls.append(("back", owner_id, action_id))
        return {"id": action_id, "artifact_id": UUID(int=4)}

    monkeypatch.setattr(service.repository, "acquire_thread", acquire)
    monkeypatch.setattr(service.repository, "return_to_editing", back)

    thread, reused = await service.acquire_thread(owner)
    result = await service.return_to_editing(owner, action)

    assert reused is True
    assert thread.id == UUID(int=3)
    assert result["artifact_id"] == UUID(int=4)
    assert calls == [("acquire", owner), ("back", owner, action)]


async def test_auto_title_is_private_deterministic_and_non_blocking(monkeypatch) -> None:
    from backend.clinical_assistant import service

    captured: list[str] = []

    async def patient(*_args):
        return {"first_name": "Camila", "last_name": "Rojas", "rut_masked": "12.345.•••-6"}

    async def update(*_args, **_kwargs):
        captured.append(_args[-1])

    monkeypatch.setattr(service.patients_repo, "get_patient", patient)
    monkeypatch.setattr(service.repository, "update_title_if_default", update)
    await service._set_contextual_title(
        UUID(int=1), UUID(int=2), UUID(int=3), UUID(int=4), "Dolor molar"
    )

    assert captured[0].startswith("Camila Rojas · Evolución · ")
    assert "12.345" not in captured[0]
    assert "Dolor" not in captured[0]

    async def fail(*_args, **_kwargs):
        raise RuntimeError("metadata unavailable")

    monkeypatch.setattr(service.repository, "update_title_if_default", fail)
    await service._set_contextual_title(
        UUID(int=1), UUID(int=2), UUID(int=3), UUID(int=4), "Nota privada"
    )


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


async def test_clinical_turn_marks_cancellation_as_expected_failure(monkeypatch) -> None:
    from backend.clinical_assistant import service

    owner = UUID(int=1)
    thread = UUID(int=2)
    turn = UUID(int=3)
    blocked = asyncio.Event()
    release = asyncio.Event()
    finished: list[tuple[object, ...]] = []

    async def stalled(_owner, _thread, _turn, _content, _context_items, claimed_new):
        claimed_new["value"] = True
        yield "started"
        blocked.set()
        await release.wait()

    async def finish(owner_id, thread_id, turn_id, status="failed", error_code=None):
        finished.append((owner_id, thread_id, turn_id, status, error_code))

    monkeypatch.setattr(service, "_stream_turn", stalled)
    monkeypatch.setattr(service.repository, "finish_turn", finish)

    stream = service.stream_turn(owner, thread, turn, "Control")
    assert await anext(stream) == "started"
    pending = asyncio.create_task(anext(stream))
    await blocked.wait()
    pending.cancel()

    with pytest.raises(asyncio.CancelledError):
        await pending

    assert finished == [
        (owner, thread, turn, "failed", "CLINICAL_TURN_CANCELLED"),
    ]


async def test_clinical_turn_can_answer_without_active_patient(monkeypatch) -> None:
    from backend.clinical_assistant import service
    from backend.clinical_assistant.agent import ClinicalAgentOutput

    owner = UUID(int=1)
    thread = UUID(int=2)
    turn = UUID(int=3)
    appended: list[str] = []

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
        return {"replay": False, "active_patient_id": None}

    async def stored(*_args):
        return {
            "messages": [{"role": "user", "content": "Hola"}],
            "artifacts": [],
        }

    async def agent(*, context, messages, handlers):
        assert context.patient_id is None
        assert messages[-1] == {"role": "user", "content": "Hola"}
        assert "create_evolution_draft" in handlers
        yield ClinicalAgentOutput(kind="assistant", content="Hola, ¿en qué te ayudo?")

    async def append(*_args):
        appended.append(_args[-1])
        return {"id": UUID(int=4)}

    async def no_op(*_args, **_kwargs):
        return None

    monkeypatch.setattr(service, "sanitize_content", sanitize)
    monkeypatch.setattr(service.repository, "claim_turn", claim)
    monkeypatch.setattr(service.repository, "get_thread", stored)
    monkeypatch.setattr(service.repository, "append_message", append)
    monkeypatch.setattr(service.repository, "finish_turn", no_op)
    monkeypatch.setattr(service, "_set_contextual_title", no_op)
    monkeypatch.setattr(service, "run_clinical_agent", agent)
    monkeypatch.setattr(service.clinical_evolutions, "CLINICAL_EXTERNAL_LLM_ENABLED", True)

    chunks = [chunk async for chunk in service.stream_turn(owner, thread, turn, "Hola")]

    assert appended == ["Hola, ¿en qué te ayudo?"]
    assert any("assistant_message" in chunk for chunk in chunks)
    assert chunks[-1].startswith("event: turn.completed")


async def test_drive_context_sends_only_text_to_agent(monkeypatch) -> None:
    from backend.clinical_assistant import service
    from backend.clinical_assistant.agent import ClinicalAgentOutput
    from backend.clinical_assistant.schemas import ClinicalContextItem

    owner = UUID(int=1)
    thread = UUID(int=2)
    turn = UUID(int=3)
    captured: dict[str, object] = {}
    context_item = ClinicalContextItem(
        id=UUID(int=4),
        kind="drive_selection",
        source_id="drive-file",
        source_name="Ficha.md",
        content="Dolor en pieza 1.6",
    )

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

    async def claim(*args):
        captured["stored_context"] = args[-1]
        return {"replay": False, "active_patient_id": None}

    async def stored(*_args):
        return {"messages": [{"role": "user", "content": "Usa ficha"}], "artifacts": []}

    async def agent(*, context, messages, handlers):
        captured["messages"] = messages
        yield ClinicalAgentOutput(kind="assistant", content="Listo")

    async def append(*_args):
        return {"id": UUID(int=5)}

    async def no_op(*_args, **_kwargs):
        return None

    monkeypatch.setattr(service, "sanitize_content", sanitize)
    monkeypatch.setattr(service.repository, "claim_turn", claim)
    monkeypatch.setattr(service.repository, "get_thread", stored)
    monkeypatch.setattr(service.repository, "append_message", append)
    monkeypatch.setattr(service.repository, "finish_turn", no_op)
    monkeypatch.setattr(service, "_set_contextual_title", no_op)
    monkeypatch.setattr(service, "run_clinical_agent", agent)
    monkeypatch.setattr(service.clinical_evolutions, "CLINICAL_EXTERNAL_LLM_ENABLED", True)

    _ = [
        chunk
        async for chunk in service.stream_turn(owner, thread, turn, "Usa ficha", [context_item])
    ]

    model_content = cast(list[dict[str, str]], captured["messages"])[-1]["content"]
    assert model_content == "Usa ficha\n\nDolor en pieza 1.6"
    assert "Fuente: Google Drive" not in model_content
    assert "Ficha.md" not in model_content
    assert "model_content" not in cast(list[dict[str, str]], captured["stored_context"])[0]


async def test_patient_switch_is_persisted_before_event(monkeypatch) -> None:
    from backend.clinical_assistant import service

    owner = UUID(int=1)
    thread = UUID(int=2)
    turn = UUID(int=3)
    current_id = UUID(int=4)
    detected_id = UUID(int=5)
    persisted: list[dict] = []

    async def sanitize(_owner, content):
        return type(
            "Sanitized",
            (),
            {
                "display_text": content,
                "model_text": content,
                "invalid_candidates": 0,
                "unresolved_candidates": 0,
                "patient_ids": (detected_id,),
            },
        )()

    async def claim(*_args):
        return {"replay": False, "active_patient_id": current_id}

    async def get_patient(_owner, patient_id):
        patients = {
            current_id: {
                "id": current_id,
                "first_name": "Ana",
                "last_name": "Pérez",
                "rut_number": 12_345_678,
                "rut_dv": "5",
            },
            detected_id: {
                "id": detected_id,
                "first_name": "Bruno",
                "last_name": "Rojas",
                "rut_number": 98_765_432,
                "rut_dv": "1",
            },
        }
        return patients[UUID(str(patient_id))]

    async def set_switch(_owner, _thread, _turn, patient_switch):
        persisted.append(patient_switch)

    async def finish(*_args, **_kwargs):
        return None

    monkeypatch.setattr(service, "sanitize_content", sanitize)
    monkeypatch.setattr(service.repository, "claim_turn", claim)
    monkeypatch.setattr(service.patients_repo, "get_patient", get_patient)
    monkeypatch.setattr(service.repository, "set_patient_switch", set_switch)
    monkeypatch.setattr(service.repository, "finish_turn", finish)

    chunks = [chunk async for chunk in service.stream_turn(owner, thread, turn, "Actualizar")]
    events = [json.loads(chunk.split("data: ", 1)[1]) for chunk in chunks]
    switch_event = next(item for item in events if item["item_type"] == "patient.switch_required")

    assert persisted[0]["resolution"] == "pending"
    assert persisted[0]["current_patient"]["id"] == current_id
    assert persisted[0]["detected_patient"]["id"] == detected_id
    assert switch_event["data"]["resolution"] == "pending"


async def test_clinical_update_tool_reopens_pending_artifact(monkeypatch) -> None:
    from backend.clinical_assistant import service
    from backend.clinical_assistant.policy import ClinicalTurnContext
    from backend.clinical_assistant.schemas import ClinicalDraft

    owner = UUID(int=1)
    thread = UUID(int=2)
    turn = UUID(int=3)
    patient = UUID(int=4)
    artifact_id = UUID(int=5)
    action_id = UUID(int=6)
    draft = ClinicalDraft(
        context="Control",
        findings="",
        assessment="",
        treatment="Texto largo",
        follow_up="Cuatro semanas",
        review_flags=[],
    )
    reopened: list[UUID] = []

    async def stored(*_args):
        return {"pending_action": {"id": action_id, "artifact_id": artifact_id}}

    async def reopen(_owner, pending_id):
        reopened.append(pending_id)
        return {"artifact_id": artifact_id}

    async def artifact(*_args):
        return {
            "id": artifact_id,
            "turn_id": turn,
            "patient_id": patient,
            "status": "draft",
            "source_note": "Nota segura",
            "draft": draft.model_dump(mode="json"),
            "generated_draft": draft.model_dump(mode="json"),
            "evolution_at": datetime.now(UTC),
        }

    async def sanitize(_owner, content):
        return type("Sanitized", (), {"display_text": content})()

    async def update(*_args, **_kwargs):
        return {"id": artifact_id}

    monkeypatch.setattr(service.repository, "get_thread", stored)
    monkeypatch.setattr(service.repository, "return_to_editing", reopen)
    monkeypatch.setattr(service.repository, "get_artifact", artifact)
    monkeypatch.setattr(service.repository, "update_artifact", update)
    monkeypatch.setattr(service, "sanitize_content", sanitize)

    handlers = service._clinical_tool_handlers(
        ClinicalTurnContext(owner, thread, UUID(int=7), patient, artifact_id),
        "Nota segura",
        "Nota segura",
    )
    result = await handlers["update_evolution_draft"]({"treatment": "Texto breve"})

    assert reopened == [action_id]
    assert result.payload["draft"]["treatment"] == "Texto breve"
    assert result.effect and result.effect["item_id"] == str(artifact_id)


async def test_active_draft_fields_are_included_in_agent_messages() -> None:
    from backend.clinical_assistant import service

    artifact_id = UUID(int=5)
    stored = {
        "messages": [{"role": "user", "content": "Agrega control en seis meses"}],
        "artifacts": [
            {
                "id": artifact_id,
                "draft": {
                    "context": "Control preventivo",
                    "findings": "Sin caries",
                    "assessment": "",
                    "treatment": "Profilaxis",
                    "follow_up": "",
                    "review_flags": [],
                },
            }
        ],
    }

    messages = await service._conversation_messages(
        UUID(int=1), stored, "Agrega control en seis meses", artifact_id
    )

    payload = json.loads(messages[-1]["content"])
    assert payload["USER_REQUEST"] == "Agrega control en seis meses"
    assert payload["CURRENT_DRAFT"]["treatment"] == "Profilaxis"
    assert payload["CURRENT_DRAFT"]["context"] == "Control preventivo"


@pytest.mark.parametrize("status", ["draft", "stale"])
@pytest.mark.parametrize("update_accepted", [True, False])
async def test_regeneration_reuses_originating_drive_context(
    monkeypatch, status: str, update_accepted: bool
) -> None:
    from backend.clinical_assistant import service
    from backend.clinical_assistant.schemas import ClinicalDraft

    owner = UUID(int=1)
    thread = UUID(int=2)
    turn = UUID(int=3)
    patient = UUID(int=4)
    artifact_id = UUID(int=5)
    captured: dict[str, str] = {}
    draft = ClinicalDraft(
        context="Control",
        findings="",
        assessment="",
        treatment="",
        follow_up="",
        review_flags=[],
    )

    async def get_artifact(*_args):
        return {
            "id": artifact_id,
            "turn_id": turn,
            "patient_id": patient,
            "source_note": "Redacta una evolución con este documento",
            "evolution_at": datetime.now(UTC),
            "status": status,
        }

    async def get_patient(*_args):
        return {"id": patient}

    async def get_thread(*_args):
        return {
            "messages": [
                {
                    "turn_id": turn,
                    "role": "user",
                    "context_items": [
                        {
                            "source_name": "Ficha.md",
                            "content": "Dolor en pieza 1.6",
                        }
                    ],
                }
            ]
        }

    async def sanitize(_owner, content):
        return type("Sanitized", (), {"display_text": content, "model_text": content})()

    async def generate(_owner, _patient, raw_note, *, grounding):
        captured["raw_note"] = raw_note
        captured["grounding"] = grounding
        return draft

    async def update(*_args, **_kwargs):
        return {"id": artifact_id} if update_accepted else None

    monkeypatch.setattr(service.repository, "get_artifact", get_artifact)
    monkeypatch.setattr(service.repository, "get_thread", get_thread)
    monkeypatch.setattr(service.repository, "update_artifact", update)
    monkeypatch.setattr(service.patients_repo, "get_patient", get_patient)
    monkeypatch.setattr(service, "sanitize_content", sanitize)
    monkeypatch.setattr(service.clinical_evolutions, "generate_draft", generate)
    monkeypatch.setattr(service.clinical_evolutions, "CLINICAL_EXTERNAL_LLM_ENABLED", True)

    if update_accepted:
        assert await service.regenerate_draft(owner, thread, artifact_id) == draft
    else:
        with pytest.raises(ValueError, match="no longer editable"):
            await service.regenerate_draft(owner, thread, artifact_id)

    assert "Redacta una evolución con este documento" in captured["raw_note"]
    assert "Dolor en pieza 1.6" in captured["raw_note"]
    assert "Fuente: Google Drive" not in captured["raw_note"]
    assert "Ficha.md" not in captured["raw_note"]
    assert (
        cast(service.clinical_evolutions.DraftGrounding, captured["grounding"]).patient_evidence
        == []
    )


@pytest.mark.parametrize("status", ["pending", "approved", "declined", "failed"])
async def test_regeneration_rejects_locked_artifact_before_generation(monkeypatch, status) -> None:
    from backend.clinical_assistant import service

    generate = AsyncMock()
    update = AsyncMock()
    monkeypatch.setattr(
        service.repository, "get_artifact", AsyncMock(return_value={"status": status})
    )
    monkeypatch.setattr(service.repository, "update_artifact", update)
    monkeypatch.setattr(service.clinical_evolutions, "generate_draft", generate)

    with pytest.raises(ValueError, match="no longer editable"):
        await service.regenerate_draft(UUID(int=1), UUID(int=2), UUID(int=3))

    generate.assert_not_awaited()
    update.assert_not_awaited()


async def test_regeneration_route_returns_conflict_for_locked_artifact(monkeypatch) -> None:
    from fastapi import HTTPException

    from backend.routes import clinical_assistant as routes

    monkeypatch.setattr(
        routes.service, "regenerate_draft", AsyncMock(side_effect=ValueError("no longer editable"))
    )
    with pytest.raises(HTTPException) as caught:
        await routes.regenerate_draft(
            UUID(int=2),
            routes.RegenerateDraftRequest(artifact_id=UUID(int=3)),
            {"id": UUID(int=1)},
        )
    assert caught.value.status_code == 409
    assert caught.value.detail == {"code": "CLINICAL_ARTIFACT_LOCKED"}


async def test_repeated_draft_creation_uses_persisted_id_for_events_and_save(monkeypatch) -> None:
    from backend.clinical_assistant import service
    from backend.clinical_assistant.policy import ClinicalTurnContext
    from backend.clinical_assistant.schemas import ClinicalDraft

    context = ClinicalTurnContext(UUID(int=1), UUID(int=2), UUID(int=3), UUID(int=4))
    draft = ClinicalDraft(
        context="Control", findings="", assessment="", treatment="", follow_up="", review_flags=[]
    )
    persisted: dict = {}

    async def create(_owner, _thread, turn, patient, proposed_id, payload):
        persisted.update(payload)
        persisted.setdefault("id", proposed_id)
        persisted.update(turn_id=turn, patient_id=patient)
        return dict(persisted)

    create_mock = AsyncMock(side_effect=create)
    get_mock = AsyncMock(side_effect=lambda *_args: dict(persisted))
    prepare = AsyncMock(return_value={"id": UUID(int=6)})
    monkeypatch.setattr(service, "_draft_evolution", AsyncMock(return_value=draft))
    monkeypatch.setattr(service.repository, "create_artifact", create_mock)
    monkeypatch.setattr(service.repository, "get_artifact", get_mock)
    monkeypatch.setattr(service, "prepare_save", prepare)
    handlers = service._clinical_tool_handlers(context, "Note", "Note")

    first = await handlers["create_evolution_draft"]({})
    second = await handlers["create_evolution_draft"]({})
    assert create_mock.call_args_list[0].args[4] != create_mock.call_args_list[1].args[4]
    for result in (first, second):
        assert result.payload["artifact_id"] == str(persisted["id"])
        assert result.effect["item_id"] == str(persisted["id"])
    await handlers["prepare_evolution_save"]({})
    get_mock.assert_awaited_once_with(context.user_id, context.thread_id, persisted["id"])
    assert prepare.call_args.args[2].artifact_id == persisted["id"]


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

    async def artifacts(*_args):
        return []

    async def unexpected_finish(*_args):
        raise AssertionError("replay must not finish another worker's turn")

    monkeypatch.setattr(service, "sanitize_content", sanitize)
    monkeypatch.setattr(service.repository, "claim_turn", claim)
    monkeypatch.setattr(service.repository, "list_turn_artifacts", artifacts)
    monkeypatch.setattr(service.repository, "finish_turn", unexpected_finish)

    chunks = [chunk async for chunk in service.stream_turn(owner, thread, turn, "Control")]
    events = [json.loads(chunk.split("data: ", 1)[1]) for chunk in chunks]
    assert chunks[-1].splitlines()[0] == f"event: {terminal_event}"
    assert events[-1]["data"].get("error_code") == terminal_error


async def test_clinical_draft_turn_does_not_append_redundant_assistant_message(monkeypatch) -> None:
    from backend.clinical_assistant import service
    from backend.clinical_assistant.agent import ClinicalAgentOutput

    owner = UUID(int=1)
    thread = UUID(int=2)
    turn = UUID(int=3)
    patient = UUID(int=4)
    artifact = UUID(int=5)
    appended: list[str] = []

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
        return {"replay": False, "active_patient_id": patient}

    async def stored(*_args):
        return {"messages": [], "artifacts": []}

    async def agent(*, context, messages, handlers):
        yield ClinicalAgentOutput(
            kind="effect",
            effect={
                "kind": "draft",
                "item_id": str(artifact),
                "draft": {
                    "context": "Control",
                    "findings": "",
                    "assessment": "",
                    "treatment": "",
                    "follow_up": "",
                    "review_flags": [],
                },
                "generated_draft": {
                    "context": "Control",
                    "findings": "",
                    "assessment": "",
                    "treatment": "",
                    "follow_up": "",
                    "review_flags": [],
                },
                "source_note": "Nota",
                "patient_id": str(patient),
                "evolution_at": "2026-09-17T12:00:00+00:00",
            },
        )
        yield ClinicalAgentOutput(kind="assistant", content="Borrador preparado.")

    async def append(*_args):
        appended.append(_args[-1])
        return {"id": UUID(int=6)}

    async def finish(*_args, **_kwargs):
        return None

    monkeypatch.setattr(service, "sanitize_content", sanitize)
    monkeypatch.setattr(service.repository, "claim_turn", claim)
    monkeypatch.setattr(service.repository, "get_thread", stored)
    monkeypatch.setattr(service.repository, "append_message", append)
    monkeypatch.setattr(service.repository, "finish_turn", finish)
    monkeypatch.setattr(service, "_set_contextual_title", finish)
    monkeypatch.setattr(service, "run_clinical_agent", agent)
    monkeypatch.setattr(service.clinical_evolutions, "CLINICAL_EXTERNAL_LLM_ENABLED", True)

    chunks = [chunk async for chunk in service.stream_turn(owner, thread, turn, "Nota")]

    assert appended == []
    assert any('"item_type": "clinical_draft"' in chunk for chunk in chunks)


async def test_clinical_draft_replay_emits_persisted_artifact(monkeypatch) -> None:
    from backend.clinical_assistant import service

    owner = UUID(int=1)
    thread = UUID(int=2)
    turn = UUID(int=3)
    artifact = UUID(int=4)
    patient = UUID(int=5)
    draft = {
        "context": "Control",
        "findings": "",
        "assessment": "",
        "treatment": "",
        "follow_up": "",
        "review_flags": [],
    }

    async def sanitize(_owner, content):
        return type("Sanitized", (), {"display_text": content})()

    async def claim(*_args):
        return {
            "replay": True,
            "messages": [{"id": UUID(int=6), "role": "user", "content": "Nota"}],
            "turn_status": "completed",
            "turn_error_code": None,
        }

    async def artifacts(*_args):
        return [
            {
                "id": artifact,
                "artifact_type": "clinical_draft",
                "status": "draft",
                "draft": draft,
                "generated_draft": draft,
                "source_note": "Nota",
                "patient_id": patient,
                "evolution_at": "2026-09-17T12:00:00+00:00",
            }
        ]

    monkeypatch.setattr(service, "sanitize_content", sanitize)
    monkeypatch.setattr(service.repository, "claim_turn", claim)
    monkeypatch.setattr(service.repository, "list_turn_artifacts", artifacts)

    chunks = [chunk async for chunk in service.stream_turn(owner, thread, turn, "Nota")]
    events = [
        json.loads(chunk.split("data: ", 1)[1]) for chunk in chunks if chunk.startswith("event:")
    ]

    draft_events = [event for event in events if event["item_type"] == "clinical_draft"]
    assert len(draft_events) == 1
    assert draft_events[0]["data"]["item_id"] == str(artifact)
    assert events[-1]["data"]["thread_id"] == str(thread)


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


def test_clinical_write_paths_hold_the_thread_fence() -> None:
    repository = (Path(__file__).parents[1] / "db" / "clinical_assistant_repo.py").read_text(
        encoding="utf-8"
    )
    assert repository.count("SELECT active_turn_id\n            FROM clinical_threads") >= 2
    assert "AND turn_id = $4 AND patient_id = $5 AND status = 'draft'" in repository
    assert repository.count("FOR UPDATE") >= 4
    assert "class StaleClinicalTurnError" in repository
    assert "AND t.active_turn_id = $4" in repository


def test_auth_downgrade_refuses_federated_users_without_mutating_data() -> None:
    migration = (
        Path(__file__).parents[1] / "alembic" / "versions" / "0012_add_auth_identities.py"
    ).read_text(encoding="utf-8")
    assert "password_hash IS NULL" in migration
    assert "raise RuntimeError" in migration
    assert "DROP FROM users" not in migration


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
