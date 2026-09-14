"""Fail-first contracts for Drive evolution journal export orchestration."""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import UUID

import pytest

from backend.evolution_exports import service

EVOLUTION_ID = UUID("11111111-1111-1111-1111-111111111111")
OWNER_ID = UUID("22222222-2222-2222-2222-222222222222")


def _export(**changes: object) -> SimpleNamespace:
    block, content_hash = service.serialize_journal_v1(
        evolution_id=EVOLUTION_ID,
        evolution_at=datetime(2026, 1, 5, 3, 30, tzinfo=UTC),
        patient_display_name="Ana Pérez",
        patient_rut_masked="••.•••.678-5",
        approved_body="Control clínico",
    )
    values = {
        "user_id": OWNER_ID,
        "evolution_id": EVOLUTION_ID,
        "operation_id": UUID("33333333-3333-3333-3333-333333333333"),
        "period_type": "weekly",
        "period_key": "2026-W02",
        "journal_part": None,
        "drive_file_id": None,
        "drive_version": None,
        "status": "pending",
        "journal_block": block,
        "content_hash": content_hash,
    }
    values.update(changes)
    return SimpleNamespace(**values)


def _required(name: str):
    value = getattr(service, name, None)
    assert callable(value), f"task 6.3 must implement evolution_exports.service.{name}"
    return value


class _Acquire:
    def __init__(self, connection: object) -> None:
        self.connection = connection

    async def __aenter__(self) -> object:
        return self.connection

    async def __aexit__(self, *_args: object) -> bool:
        return False


class _Pool:
    def __init__(self) -> None:
        self.connection = object()

    def acquire(self) -> _Acquire:
        return _Acquire(self.connection)


class _PeriodLock:
    async def __aenter__(self) -> object:
        return object()

    async def __aexit__(self, *_args: object) -> bool:
        return False


def test_persisted_journal_block_hash_is_verified_without_reconstruction() -> None:
    verify = _required("verify_persisted_block")
    export = _export()

    assert verify(export.journal_block, export.content_hash) == export.journal_block.encode("utf-8")
    with pytest.raises(ValueError, match="JOURNAL_CONTENT_HASH_MISMATCH"):
        verify(export.journal_block + "alterado", export.content_hash)


def test_journal_identity_has_exact_properties_and_names() -> None:
    identity = _required("journal_identity")

    weekly = identity("weekly", "2026-W02", 1)
    daily_part_two = identity("daily", "2026-01-05", 2)

    assert weekly.name == "Evoluciones — 2026-W02.txt"
    assert daily_part_two.name == "Evoluciones — 2026-01-05 — 2.txt"
    assert weekly.app_properties == {
        "managedBy": "dental-ai-assistant",
        "artifactType": "evolution-journal",
        "periodType": "weekly",
        "periodKey": "2026-W02",
        "journalPart": "1",
    }
    assert "patientRef" not in weekly.app_properties


def test_part_selection_is_deferred_and_uses_exact_utf8_bytes() -> None:
    select = _required("select_journal_part")
    export = _export(journal_block="á\n", content_hash=hashlib.sha256("á\n".encode()).hexdigest())

    assert export.journal_part is None
    assert select([(1, "x" * 6)], export.journal_block, max_content_bytes=8) == 2
    assert select([(1, "x" * 5)], export.journal_block, max_content_bytes=8) == 1


@pytest.mark.parametrize(
    ("matches", "expected"),
    [([], None), ([{"id": "file-1"}], "file-1")],
)
def test_exact_identity_lookup_resists_duplicates(
    matches: list[dict[str, str]], expected: str | None
) -> None:
    resolve = _required("resolve_unique_journal")
    result = resolve(matches)
    assert (None if result is None else result["id"]) == expected


def test_duplicate_journal_identity_fails_closed() -> None:
    resolve = _required("resolve_unique_journal")
    with pytest.raises(ValueError, match="JOURNAL_IDENTITY_CONFLICT"):
        resolve([{"id": "file-1"}, {"id": "file-2"}])


@pytest.mark.parametrize(
    ("previous_status", "mode"),
    [
        ("pending", "sync"),
        ("failed", "sync"),
        ("syncing", "reconcile_then_sync"),
        ("unknown", "verify_only"),
    ],
)
def test_recovery_dispatch_is_status_specific(previous_status: str, mode: str) -> None:
    dispatch = _required("recovery_mode")
    assert dispatch(previous_status) == mode


def test_ambiguous_outcome_freezes_selected_part_and_forbids_writes() -> None:
    dispatch = _required("recovery_mode")
    export = _export(status="unknown", journal_part=2, drive_file_id="file-2", drive_version="7")
    frozen = (export.journal_part, export.drive_file_id, export.drive_version)

    assert dispatch(export.status) == "verify_only"
    assert (export.journal_part, export.drive_file_id, export.drive_version) == frozen


def test_known_conflict_can_reselect_rollover_before_ambiguous_outcome() -> None:
    select = _required("select_journal_part")
    export = _export(journal_part=1, drive_file_id="file-1", drive_version="7")

    replacement = select(
        [(1, "x" * 10)], export.journal_block, max_content_bytes=len(export.journal_block.encode())
    )
    assert replacement == 2
    assert (replacement, None, None) == (2, None, None)


def test_process_loss_preserves_frozen_export_identity() -> None:
    before = _export()
    hydrated = _export()

    assert hydrated.status == "pending"
    assert (
        hydrated.operation_id,
        hydrated.period_type,
        hydrated.period_key,
        hydrated.journal_block,
        hydrated.content_hash,
    ) == (
        before.operation_id,
        before.period_type,
        before.period_key,
        before.journal_block,
        before.content_hash,
    )


@pytest.mark.asyncio
async def test_sync_export_claims_selects_and_confirms_new_journal(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    export = vars(_export()).copy()
    export["previous_status"] = "pending"
    persisted: dict[str, object] = {}
    provider_calls: list[str] = []

    async def claim(*_args: object, **_kwargs: object) -> dict[str, object]:
        return export

    async def get_export(*_args: object, **_kwargs: object) -> dict[str, object]:
        return export

    async def set_target(*_args: object, **kwargs: object) -> dict[str, object]:
        persisted.update(kwargs)
        return export

    async def set_status(*args: object, **_kwargs: object) -> dict[str, object]:
        return {**export, "status": str(args[3])}

    async def list_files(*_args: object, **_kwargs: object) -> list[dict[str, object]]:
        provider_calls.append("list")
        return []

    async def create_file(*_args: object, **kwargs: object) -> dict[str, object]:
        provider_calls.append("create")
        properties = kwargs.get("app_properties")
        assert isinstance(properties, dict)
        assert properties["artifactType"] == "evolution-journal"
        return {"id": "journal-1", "version": "1"}

    monkeypatch.setattr(service.evolution_exports_repo, "claim_export", claim)
    monkeypatch.setattr(service.evolution_exports_repo, "get_export_with_connection", get_export)
    monkeypatch.setattr(service.evolution_exports_repo, "set_remote_target", set_target)
    monkeypatch.setattr(service.evolution_exports_repo, "update_export_status", set_status)
    monkeypatch.setattr(service.evolution_exports_repo, "period_lock", lambda *_args: _PeriodLock())
    monkeypatch.setattr(service, "_connection_access_token", lambda *_args: _active_connection())
    monkeypatch.setattr(service.google_drive, "list_journal_files", list_files)
    monkeypatch.setattr(service.google_drive, "create_file", create_file)

    result = await service.sync_export(OWNER_ID, EVOLUTION_ID, pool=_Pool())

    assert result is not None and result["status"] == "synced"
    assert persisted == {
        "journal_part": 1,
        "drive_file_id": "journal-1",
        "drive_version": "1",
    }
    assert provider_calls == ["list", "create"]


async def _active_connection() -> tuple[dict[str, str], str]:
    return ({"status": "active", "folder_id": "folder-1"}, "access-token")
