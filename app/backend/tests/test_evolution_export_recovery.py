"""State-aware, guarded recovery contracts for evolution exports."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import pytest
from httpx import ASGITransport, AsyncClient

from backend import config
from backend.auth.dependencies import get_current_user
from backend.evolution_exports import service
from backend.main import app

OWNER_ID = UUID("22222222-2222-2222-2222-222222222222")
EVOLUTION_ID = UUID("11111111-1111-1111-1111-111111111111")


class _BackgroundTasks:
    def __init__(self) -> None:
        self.calls: list[tuple[object, tuple[object, ...], dict[str, object]]] = []

    def add_task(self, function: object, *args: object, **kwargs: object) -> None:
        self.calls.append((function, args, kwargs))


def _export(status: str = "pending", **changes: Any) -> dict[str, Any]:
    block, content_hash = service.serialize_journal_v1(
        evolution_id=EVOLUTION_ID,
        evolution_at=datetime(2026, 9, 13, 12, tzinfo=UTC),
        patient_display_name="Ana Pérez",
        patient_rut_masked="••.•••.678-5",
        approved_body="Control clínico",
    )
    return {
        "user_id": OWNER_ID,
        "evolution_id": EVOLUTION_ID,
        "period_type": "weekly",
        "period_key": "2026-W37",
        "journal_part": None,
        "drive_file_id": None,
        "drive_version": None,
        "status": status,
        "journal_block": block,
        "content_hash": content_hash,
        "last_error_code": None,
        "synced_at": None,
        "updated_at": datetime.now(UTC),
        **changes,
    }


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status", "connection", "scheduled"),
    [
        ("pending", None, True),
        ("syncing", None, True),
        ("unknown", None, True),
        ("failed", {"status": "active"}, True),
        ("synced", None, False),
    ],
)
async def test_recovery_is_state_aware_without_frontend_staleness(
    monkeypatch: pytest.MonkeyPatch,
    status: str,
    connection: dict[str, str] | None,
    scheduled: bool,
) -> None:
    export = _export(status)
    background_tasks = _BackgroundTasks()
    scheduled_calls: list[tuple[object, ...]] = []

    async def get_export(*_args: object) -> dict[str, Any]:
        return export

    async def get_connection(*_args: object) -> dict[str, str] | None:
        return connection

    def schedule(*args: object, **kwargs: object) -> None:
        scheduled_calls.append((*args, kwargs))

    monkeypatch.setattr(service.evolution_exports_repo, "get_export", get_export)
    monkeypatch.setattr(service.google_drive_repo, "get_connection", get_connection)
    monkeypatch.setattr(service, "schedule_export", schedule)

    state = await service.request_export_recovery(OWNER_ID, EVOLUTION_ID, background_tasks)

    assert state["status"] == status
    assert "operation_id" not in state
    assert "drive_file_id" not in state
    assert bool(scheduled_calls) is scheduled
    if scheduled:
        assert scheduled_calls == [
            (background_tasks, OWNER_ID, EVOLUTION_ID, {"allow_retry": True})
        ]


@pytest.mark.asyncio
@pytest.mark.parametrize("connection_status", ["disconnected", "revoked"])
async def test_failed_recovery_preserves_state_when_drive_is_not_active(
    monkeypatch: pytest.MonkeyPatch,
    connection_status: str,
) -> None:
    export = _export("failed", last_error_code="DRIVE_CONNECTION_REQUIRED")
    scheduled = False

    async def get_export(*_args: object) -> dict[str, Any]:
        return export

    async def get_connection(*_args: object) -> dict[str, str]:
        return {"status": connection_status}

    def unexpected_schedule(*_args: object, **_kwargs: object) -> None:
        nonlocal scheduled
        scheduled = True

    monkeypatch.setattr(service.evolution_exports_repo, "get_export", get_export)
    monkeypatch.setattr(service.google_drive_repo, "get_connection", get_connection)
    monkeypatch.setattr(service, "schedule_export", unexpected_schedule)

    with pytest.raises(service.DriveConnectionRequiredError):
        await service.request_export_recovery(OWNER_ID, EVOLUTION_ID, _BackgroundTasks())

    assert export["status"] == "failed"
    assert not scheduled


@pytest.mark.asyncio
async def test_reconnected_retry_preserves_frozen_export_identity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    export = _export(
        "failed",
        operation_id=UUID("33333333-3333-3333-3333-333333333333"),
        last_error_code="DRIVE_CONNECTION_REQUIRED",
    )
    frozen = tuple(
        export[key]
        for key in ("operation_id", "period_type", "period_key", "journal_block", "content_hash")
    )

    async def get_export(*_args: object) -> dict[str, Any]:
        return export

    async def get_connection(*_args: object) -> dict[str, str]:
        return {"status": "active"}

    monkeypatch.setattr(service.evolution_exports_repo, "get_export", get_export)
    monkeypatch.setattr(service.google_drive_repo, "get_connection", get_connection)

    background_tasks = _BackgroundTasks()
    await service.request_export_recovery(OWNER_ID, EVOLUTION_ID, background_tasks)

    assert (
        tuple(
            export[key]
            for key in (
                "operation_id",
                "period_type",
                "period_key",
                "journal_block",
                "content_hash",
            )
        )
        == frozen
    )
    assert background_tasks.calls == [
        (service.run_export_recovery_background, (str(OWNER_ID), str(EVOLUTION_ID)), {})
    ]


@pytest.mark.asyncio
async def test_connection_lost_after_claim_is_confirmed_no_write_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    export = _export("pending")
    claimed = {**export, "status": "syncing", "previous_status": "pending"}
    statuses: list[tuple[str, str | None]] = []

    async def claim(*_args: object, **_kwargs: object) -> dict[str, Any]:
        return claimed

    async def unavailable(*_args: object) -> tuple[dict[str, str], str]:
        raise service.google_drive.GoogleDriveError(
            "DRIVE_CONNECTION_REQUIRED", "Drive connection required"
        )

    async def update_status(*args: object, **kwargs: object) -> dict[str, Any]:
        raw_error = kwargs.get("last_error_code")
        error = str(raw_error) if raw_error is not None else None
        statuses.append((str(args[3]), error))
        return {**export, "status": str(args[3]), "last_error_code": error}

    async def forbidden_provider_call(*_args: object, **_kwargs: object) -> object:
        raise AssertionError("revoked connection must prevent provider I/O")

    monkeypatch.setattr(service.evolution_exports_repo, "claim_export", claim)
    monkeypatch.setattr(service.evolution_exports_repo, "update_export_status", update_status)
    monkeypatch.setattr(service, "_connection_access_token", unavailable)
    monkeypatch.setattr(service.google_drive, "list_journal_files", forbidden_provider_call)

    result = await service.sync_export(OWNER_ID, EVOLUTION_ID, pool=_Pool())

    assert result is not None and result["status"] == "failed"
    assert statuses == [("failed", "DRIVE_CONNECTION_REQUIRED")]


class _Acquire:
    def __init__(self, connection: object) -> None:
        self.connection = connection

    async def __aenter__(self) -> object:
        return self.connection

    async def __aexit__(self, *_args: object) -> bool:
        return False


class _Pool:
    def acquire(self) -> _Acquire:
        return _Acquire(object())


class _Lock:
    async def __aenter__(self) -> object:
        return object()

    async def __aexit__(self, *_args: object) -> bool:
        return False


@pytest.mark.asyncio
async def test_unknown_recovery_verifies_without_append_or_update(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    identity = service.journal_identity("weekly", "2026-W37", 1)
    export = _export(
        "unknown",
        journal_part=1,
        drive_file_id="journal-1",
        drive_version="7",
    )
    claimed = {**export, "previous_status": "unknown"}
    provider_writes: list[str] = []

    async def claim(*_args: object, **_kwargs: object) -> dict[str, Any]:
        return claimed

    async def get_export(*_args: object, **_kwargs: object) -> dict[str, Any]:
        return export

    async def list_files(*_args: object, **_kwargs: object) -> list[dict[str, Any]]:
        return [{"id": "journal-1", "version": "7", "appProperties": identity.app_properties}]

    async def download(*_args: object, **_kwargs: object) -> bytes:
        return b"another evolution\n"

    async def update_status(*args: object, **_kwargs: object) -> dict[str, Any]:
        return {**export, "status": str(args[3])}

    async def forbidden_write(*_args: object, **_kwargs: object) -> dict[str, Any]:
        provider_writes.append("write")
        raise AssertionError("unknown recovery must not write")

    async def active_connection(*_args: object) -> tuple[dict[str, str], str]:
        return {"status": "active", "folder_id": "folder-1"}, "access-token"

    monkeypatch.setattr(service.evolution_exports_repo, "claim_export", claim)
    monkeypatch.setattr(service.evolution_exports_repo, "get_export_with_connection", get_export)
    monkeypatch.setattr(service.evolution_exports_repo, "update_export_status", update_status)
    monkeypatch.setattr(service.evolution_exports_repo, "period_lock", lambda *_args: _Lock())
    monkeypatch.setattr(service, "_connection_access_token", active_connection)
    monkeypatch.setattr(service.google_drive, "list_journal_files", list_files)
    monkeypatch.setattr(service.google_drive, "download_file", download)
    monkeypatch.setattr(service.google_drive, "create_file", forbidden_write)
    monkeypatch.setattr(service.google_drive, "update_file", forbidden_write)

    result = await service.sync_export(OWNER_ID, EVOLUTION_ID, allow_retry=True, pool=_Pool())

    assert result is not None and result["status"] == "unknown"
    assert provider_writes == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("matches", "content", "expected_status", "expected_error"),
    [
        (
            [{"id": "journal-1", "version": "8"}],
            f"Dental AI ID: {EVOLUTION_ID}\n".encode(),
            "synced",
            None,
        ),
        ([], b"", "unknown", "DRIVE_WRITE_UNKNOWN"),
        (
            [{"id": "journal-1"}, {"id": "journal-2"}],
            b"",
            "unknown",
            "JOURNAL_IDENTITY_CONFLICT",
        ),
    ],
)
async def test_ambiguous_create_reconciles_exact_selected_part_without_create(
    monkeypatch: pytest.MonkeyPatch,
    matches: list[dict[str, Any]],
    content: bytes,
    expected_status: str,
    expected_error: str | None,
) -> None:
    export = _export("unknown", journal_part=2, drive_file_id=None, drive_version=None)
    identity = service.journal_identity("weekly", "2026-W37", 2)
    statuses: list[tuple[str, str | None]] = []
    targets: list[dict[str, object]] = []

    async def find(*_args: object, **kwargs: object) -> list[dict[str, Any]]:
        assert kwargs["journal_part"] == 2
        return [{**match, "appProperties": identity.app_properties} for match in matches]

    async def download(*_args: object, **_kwargs: object) -> bytes:
        return content

    async def update_status(*args: object, **kwargs: object) -> dict[str, Any]:
        status = str(args[3])
        raw_error = kwargs.get("last_error_code")
        error = str(raw_error) if raw_error is not None else None
        statuses.append((status, error))
        return {**export, "status": status, "last_error_code": error}

    async def set_target(*_args: object, **kwargs: object) -> dict[str, Any]:
        targets.append(kwargs)
        return export

    async def forbidden_create(*_args: object, **_kwargs: object) -> object:
        raise AssertionError("ambiguous create recovery must not create")

    monkeypatch.setattr(service.google_drive, "find_journal_files", find)
    monkeypatch.setattr(service.google_drive, "download_file", download)
    monkeypatch.setattr(service.google_drive, "create_file", forbidden_create)
    monkeypatch.setattr(service.evolution_exports_repo, "update_export_status", update_status)
    monkeypatch.setattr(service.evolution_exports_repo, "set_remote_target", set_target)

    result = await service._reconcile_ambiguous_write(
        object(), OWNER_ID, export, "token", folder_id="folder-1"
    )

    assert result is not None and result["status"] == expected_status
    assert statuses == [(expected_status, expected_error)]
    assert bool(targets) is (expected_status == "synced")


@pytest.mark.asyncio
async def test_recovery_route_requires_same_origin_and_returns_sanitized_state(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(config, "APP_ORIGINS", ["https://testserver"])
    calls: list[tuple[object, ...]] = []

    async def recover(owner: UUID, evolution: UUID, background_tasks: object) -> dict[str, Any]:
        calls.append((owner, evolution, background_tasks))
        return {
            "status": "pending",
            "journal": {"period_type": "weekly", "period_key": "2026-W37"},
        }

    monkeypatch.setattr(service, "request_export_recovery", recover)
    app.dependency_overrides[get_current_user] = lambda: {"id": OWNER_ID}
    url = f"/api/clinical/evolutions/{EVOLUTION_ID}/drive-export/retry"
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="https://testserver"
        ) as client:
            response = await client.post(
                url,
                headers={"Origin": "https://testserver", "Sec-Fetch-Site": "same-origin"},
            )
            rejected = await client.post(url)
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 200
    assert response.json() == {
        "drive_export": {
            "status": "pending",
            "journal": {"period_type": "weekly", "period_key": "2026-W37"},
        }
    }
    assert rejected.status_code == 403
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_recovery_route_returns_connection_required_conflict(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(config, "APP_ORIGINS", ["https://testserver"])

    async def blocked(*_args: object) -> dict[str, Any]:
        raise service.DriveConnectionRequiredError

    monkeypatch.setattr(service, "request_export_recovery", blocked)
    app.dependency_overrides[get_current_user] = lambda: {"id": OWNER_ID}
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="https://testserver"
        ) as client:
            response = await client.post(
                f"/api/clinical/evolutions/{EVOLUTION_ID}/drive-export/retry",
                headers={"Origin": "https://testserver", "Sec-Fetch-Site": "same-origin"},
            )
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 409
    assert response.json() == {"detail": {"code": "DRIVE_CONNECTION_REQUIRED"}}
