"""Approval-time Journal V1 and export-intent contracts."""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest


def test_journal_v1_normalizes_body_and_hashes_exact_utf8_bytes() -> None:
    from backend.evolution_exports.service import serialize_journal_v1

    evolution_id = UUID("11111111-1111-1111-1111-111111111111")
    block, content_hash = serialize_journal_v1(
        evolution_id=evolution_id,
        evolution_at=datetime(2026, 1, 5, 3, 30, tzinfo=UTC),
        patient_display_name="Ana Pérez",
        patient_rut_masked="••.•••.678-5",
        approved_body="Hallazgo\r\n\r\nTratamiento\r\n\r\n",
    )

    delimiter = "=" * 60
    expected = (
        f"{delimiter}\n"
        "EVOLUCIÓN · 05-01-2026 · 00:30\n"
        "Paciente: Ana Pérez\n"
        "RUT: ••.•••.678-5\n"
        f"Dental AI ID: {evolution_id}\n"
        f"{delimiter}\n\n"
        "Hallazgo\n\n"
        "Tratamiento\n"
        f"{delimiter}\n"
    )
    assert block == expected
    assert "\r" not in block
    assert content_hash == hashlib.sha256(expected.encode("utf-8")).hexdigest()


@pytest.mark.parametrize(
    ("connection_status", "expected_status", "expected_error"),
    [
        ("active", "pending", None),
        ("disconnected", "failed", "DRIVE_CONNECTION_REQUIRED"),
        ("revoked", "failed", "DRIVE_CONNECTION_REQUIRED"),
    ],
)
async def test_approval_export_freezes_identity_for_existing_connection(
    monkeypatch: pytest.MonkeyPatch,
    connection_status: str,
    expected_status: str,
    expected_error: str | None,
) -> None:
    from backend.evolution_exports import service

    captured: dict[str, object] = {}

    async def connection_for_approval(_conn: object, _owner: UUID) -> dict[str, str]:
        return {"status": connection_status, "evolution_export_frequency": "daily"}

    async def insert_export(
        _conn: object, _owner: UUID, _evolution_id: UUID, **kwargs: object
    ) -> dict[str, object]:
        captured.update(kwargs)
        return {"status": kwargs["status"]}

    monkeypatch.setattr(
        service.evolution_exports_repo, "get_connection_for_approval", connection_for_approval
    )
    monkeypatch.setattr(
        service.evolution_exports_repo,
        "create_export_intent_with_connection",
        insert_export,
    )

    evolution_id = uuid4()
    result = await service.persist_approval_export(
        object(),
        UUID(int=1),
        {
            "id": evolution_id,
            "evolution_at": datetime(2026, 1, 5, 3, 30, tzinfo=UTC),
            "final_text": "Texto aprobado\r\n",
        },
        {
            "first_name": "Ana",
            "last_name": "Pérez",
            "rut_number": 12_345_678,
            "rut_dv": "5",
        },
        datetime(2026, 1, 5, 2, 30, tzinfo=UTC),
    )

    assert result == {"status": expected_status}
    assert captured["operation_id"]
    assert captured["period_type"] == "daily"
    assert captured["period_key"] == "2026-01-04"
    assert captured["status"] == expected_status
    assert captured["last_error_code"] == expected_error
    assert f"Dental AI ID: {evolution_id}" in str(captured["journal_block"])


async def test_approval_without_connection_creates_no_export_intent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from backend.evolution_exports import service

    async def no_connection(_conn: object, _owner: UUID) -> None:
        return None

    async def unexpected_insert(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("users without a Drive row must not get an export intent")

    monkeypatch.setattr(
        service.evolution_exports_repo, "get_connection_for_approval", no_connection
    )
    monkeypatch.setattr(
        service.evolution_exports_repo,
        "create_export_intent_with_connection",
        unexpected_insert,
    )

    assert (
        await service.persist_approval_export(
            object(),
            UUID(int=1),
            {
                "id": uuid4(),
                "evolution_at": datetime.now(UTC),
                "final_text": "Texto aprobado",
            },
            {
                "first_name": "Ana",
                "last_name": "Pérez",
                "rut_number": 12_345_678,
                "rut_dv": "5",
            },
            datetime.now(UTC),
        )
        is None
    )


async def test_canonical_save_returns_before_any_external_drive_io(monkeypatch) -> None:
    from backend.evolution_exports import service

    calls: list[str] = []
    owner, patient, evolution_id = uuid4(), uuid4(), uuid4()
    saved = {"id": evolution_id, "final_text": "Aprobado"}

    async def get_patient(_conn, _owner, _patient):
        calls.append("patient")
        return {"id": patient}

    async def create_evolution(_conn, _owner, _patient, **_kwargs):
        calls.append("canonical")
        return saved

    async def prepare_export(_conn, _owner, evolution, _patient, _approval_at):
        assert evolution is saved
        calls.append("intent")
        return {"status": "pending"}

    async def forbidden_drive_io(*_args, **_kwargs):
        raise AssertionError("external Drive I/O cannot block canonical save")

    monkeypatch.setattr(service.patients_repo, "get_patient_with_connection", get_patient)
    monkeypatch.setattr(
        service.evolutions_repo, "create_evolution_with_connection", create_evolution
    )
    monkeypatch.setattr(service, "persist_approval_export", prepare_export)
    monkeypatch.setattr(service.google_drive, "create_file", forbidden_drive_io)
    result = await service.persist_approved_evolution_with_connection(
        object(),
        owner,
        patient,
        evolution_id=evolution_id,
        evolution_at=datetime.now(UTC),
        raw_note="nota",
        generated_text="borrador",
        final_text="Aprobado",
        approval_at=datetime.now(UTC),
    )
    assert result == (saved, {"status": "pending"})
    assert calls == ["patient", "canonical", "intent"]
