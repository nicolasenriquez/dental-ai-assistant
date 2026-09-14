from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

OWNER = UUID("11111111-1111-1111-1111-111111111111")
THREAD = UUID("22222222-2222-2222-2222-222222222222")
PATIENT = UUID("33333333-3333-3333-3333-333333333333")
ACTION = UUID("44444444-4444-4444-4444-444444444444")
EVOLUTION = UUID("55555555-5555-5555-5555-555555555555")


def _action() -> dict[str, object]:
    timestamp = datetime(2026, 9, 13, 12, tzinfo=UTC)
    return {
        "id": ACTION,
        "thread_id": THREAD,
        "turn_id": UUID(int=6),
        "artifact_id": None,
        "patient_id": PATIENT,
        "action_type": "save_evolution",
        "proposal_payload": None,
        "proposal_hash": "a" * 64,
        "status": "approved",
        "expires_at": timestamp,
        "created_at": timestamp,
        "resolved_at": timestamp,
        "result_resource_id": EVOLUTION,
    }


def _export(status: str = "synced") -> dict[str, object]:
    return {
        "status": status,
        "period_type": "weekly",
        "period_key": "2026-W37",
        "journal_part": 2,
        "last_error_code": None,
        "synced_at": datetime(2026, 9, 13, 12, tzinfo=UTC) if status == "synced" else None,
    }


async def test_thread_hydration_adds_owner_scoped_sanitized_export_without_side_effects(
    monkeypatch,
) -> None:
    from backend.clinical_assistant import service

    timestamp = datetime(2026, 9, 13, 12, tzinfo=UTC)
    stored = {
        "id": THREAD,
        "owner_user_id": OWNER,
        "title": "Asistente clínico",
        "active_patient_id": None,
        "active_turn_id": None,
        "created_at": timestamp,
        "updated_at": timestamp,
        "messages": [],
        "artifacts": [],
        "pending_action": None,
        "actions": [_action()],
    }
    export_calls: list[tuple[UUID, UUID]] = []

    async def get_thread(owner: UUID, thread: UUID):
        assert (owner, thread) == (OWNER, THREAD)
        return stored

    async def get_patient(owner: UUID, patient: UUID):
        assert (owner, patient) == (OWNER, PATIENT)
        return {
            "id": PATIENT,
            "first_name": "Ana",
            "last_name": "Pérez",
            "rut_number": 12_345_694,
            "rut_dv": "1",
        }

    async def get_export(owner: UUID, evolution: UUID):
        export_calls.append((owner, evolution))
        return _export()

    monkeypatch.setattr(service.repository, "get_thread", get_thread)
    monkeypatch.setattr(service.patients_repo, "get_patient", get_patient)
    monkeypatch.setattr(service.evolution_exports_repo, "get_export", get_export)

    response = await service.get_thread_response(OWNER, THREAD)

    assert response is not None
    state = response.actions[0].drive_export
    assert state is not None
    assert state.status == "synced"
    assert state.journal is not None and state.journal.journal_part == 2
    assert export_calls == [(OWNER, EVOLUTION)]
    assert "drive_file_id" not in state.model_dump()
    assert "operation_id" not in state.model_dump()


async def test_live_approval_returns_same_optional_export_state(monkeypatch) -> None:
    from backend.clinical_assistant import service

    action = _action()

    async def resolve(*_args):
        return dict(action)

    async def get_export(owner: UUID, evolution: UUID):
        assert (owner, evolution) == (OWNER, EVOLUTION)
        return _export("pending")

    monkeypatch.setattr(service.repository, "resolve_action", resolve)
    monkeypatch.setattr(service.evolution_exports_repo, "get_export", get_export)

    result = await service.resolve_action(OWNER, ACTION, "approve", "a" * 64)

    assert result["drive_export"] == {
        "status": "pending",
        "journal": {
            "period_type": "weekly",
            "period_key": "2026-W37",
            "journal_part": 2,
            "display_name": "Evoluciones — 2026-W37 — 2.txt",
        },
    }
