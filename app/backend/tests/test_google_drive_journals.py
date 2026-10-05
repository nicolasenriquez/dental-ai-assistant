"""Owner-scoped remote Journal V1 list/read contracts."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, cast
from uuid import UUID

import pytest
from httpx import ASGITransport, AsyncClient

from backend.auth.tokens import encode_token
from backend.evolution_exports import service

ORIGIN = "https://testserver"
OWNER_ID = "11111111-1111-1111-1111-111111111111"
OTHER_OWNER_ID = "22222222-2222-2222-2222-222222222222"
EVOLUTION_ID = UUID("33333333-3333-3333-3333-333333333333")
SECOND_EVOLUTION_ID = UUID("44444444-4444-4444-4444-444444444444")
FOREIGN_EVOLUTION_ID = UUID("55555555-5555-5555-5555-555555555555")
PERIOD_TYPE = "weekly"
PERIOD_KEY = "2026-W37"


def _headers(user_id: str = OWNER_ID) -> dict[str, str]:
    return {"Cookie": f"session={cast(str, encode_token(user_id))}"}


def _journal_metadata(
    period_type: str = PERIOD_TYPE,
    period_key: str = PERIOD_KEY,
    part: int = 1,
    file_id: str = "remote-journal-1",
    modified_time: str = "2026-09-14T12:00:00Z",
) -> dict[str, Any]:
    identity = service.journal_identity(period_type, period_key, part)
    return {
        "id": file_id,
        "name": identity.name,
        "mimeType": "text/plain",
        "modifiedTime": modified_time,
        "version": "7",
        "size": "100",
        "parents": ["folder-1"],
        "trashed": False,
        "appProperties": identity.app_properties,
    }


def _journal_block(evolution_id: UUID, body: str = "Texto remoto") -> str:
    block, _ = service.serialize_journal_v1(
        evolution_id=evolution_id,
        evolution_at=datetime(2026, 9, 13, 16, 30, tzinfo=UTC),
        patient_display_name="Ana Pérez",
        patient_rut_masked="••••••94-1",
        approved_body=body,
    )
    return cast(str, block)


@pytest.fixture
def journal_context(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    from backend import config
    from backend.db import evolution_exports_repo, users_repo
    from backend.integrations import google_drive
    from backend.routes import google_drive as route

    monkeypatch.setattr(config, "GOOGLE_DRIVE_CONFIGURED", True, raising=False)
    monkeypatch.setattr(config, "APP_ORIGINS", [ORIGIN], raising=False)
    state: dict[str, Any] = {
        "calls": [],
        "periods": [{"period_type": PERIOD_TYPE, "period_key": PERIOD_KEY}],
        "lineage": [
            {"evolution_id": EVOLUTION_ID, "period_type": PERIOD_TYPE, "period_key": PERIOD_KEY},
            {
                "evolution_id": SECOND_EVOLUTION_ID,
                "period_type": PERIOD_TYPE,
                "period_key": PERIOD_KEY,
            },
        ],
        "files": [_journal_metadata()],
        "contents": {"remote-journal-1": _journal_block(EVOLUTION_ID)},
    }

    async def get_user_by_id(user_id: UUID | str) -> dict[str, Any] | None:
        if str(user_id) == OWNER_ID:
            return {"id": OWNER_ID, "email": "owner@example.com"}
        if str(user_id) == OTHER_OWNER_ID:
            return {"id": OTHER_OWNER_ID, "email": "other@example.com"}
        return None

    async def list_periods(user_id: UUID | str) -> list[dict[str, Any]]:
        state["calls"].append(("list_periods", str(user_id)))
        if str(user_id) != OWNER_ID:
            return []
        return list(state["periods"])

    async def list_lineage(
        user_id: UUID | str, period_type: str, period_key: str
    ) -> list[dict[str, Any]]:
        state["calls"].append(("list_lineage", str(user_id), period_type, period_key))
        if str(user_id) != OWNER_ID or (period_type, period_key) != (PERIOD_TYPE, PERIOD_KEY):
            return []
        return list(state["lineage"])

    async def access_token(user_id: str):
        state["calls"].append(("access_token", str(user_id)))
        return ({"folder_id": "folder-1", "status": "active"}, "access-token")

    async def ensure_folder(user_id: str, _row: dict[str, Any], _token: str) -> str:
        state["calls"].append(("ensure_folder", user_id))
        return "folder-1"

    async def list_journals(*_args: object, **kwargs: object) -> list[dict[str, Any]]:
        state["calls"].append(("list_journal_files", kwargs))
        return list(state["files"])

    async def find_journals(*_args: object, **kwargs: object) -> list[dict[str, Any]]:
        state["calls"].append(("find_journal_files", kwargs))
        part = int(str(kwargs["journal_part"]))
        return [
            metadata
            for metadata in state["files"]
            if (metadata.get("appProperties") or {}).get("journalPart") == str(part)
        ]

    async def download(_token: str, file_id: str) -> bytes:
        state["calls"].append(("download_file", file_id))
        return cast(str, state["contents"][file_id]).encode("utf-8")

    monkeypatch.setattr(users_repo, "get_user_by_id", get_user_by_id)
    monkeypatch.setattr(evolution_exports_repo, "list_journal_periods", list_periods)
    monkeypatch.setattr(evolution_exports_repo, "list_period_lineage", list_lineage)
    monkeypatch.setattr(route, "_connection_access_token", access_token)
    monkeypatch.setattr(route, "_ensure_folder", ensure_folder)
    monkeypatch.setattr(google_drive, "list_journal_files", list_journals)
    monkeypatch.setattr(google_drive, "find_journal_files", find_journals)
    monkeypatch.setattr(google_drive, "download_file", download)
    return state


@pytest.fixture
async def journal_client():
    from backend.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url=ORIGIN) as client:
        yield client


async def test_list_returns_exact_owner_scoped_remote_shapes_and_modified_time(
    journal_client: AsyncClient, journal_context: dict[str, Any]
) -> None:
    response = await journal_client.get("/api/google-drive/evolution-journals", headers=_headers())

    assert response.status_code == 200
    assert response.json() == {
        "journals": [
            {
                "period_type": PERIOD_TYPE,
                "period_key": PERIOD_KEY,
                "journal_part": 1,
                "display_name": "Evoluciones — 2026-W37.txt",
                "updated_at": "2026-09-14T12:00:00Z",
            }
        ]
    }
    assert journal_context["calls"][0] == ("list_periods", OWNER_ID)
    assert all(key not in response.json()["journals"][0] for key in ("id", "status"))
    assert "entry_count" not in response.text
    assert "remote-journal-1" not in response.text


async def test_list_exposes_rollover_parts_without_duplicate_period_identity(
    journal_client: AsyncClient, journal_context: dict[str, Any]
) -> None:
    journal_context["files"] = [
        _journal_metadata(part=1, file_id="remote-journal-1"),
        _journal_metadata(part=2, file_id="remote-journal-2"),
    ]

    response = await journal_client.get("/api/google-drive/evolution-journals", headers=_headers())

    assert response.status_code == 200
    journals = response.json()["journals"]
    assert [(item["period_key"], item["journal_part"]) for item in journals] == [
        (PERIOD_KEY, 1),
        (PERIOD_KEY, 2),
    ]
    assert all("id" not in item and "entry_count" not in item for item in journals)


async def test_list_is_owner_scoped(
    journal_client: AsyncClient, journal_context: dict[str, Any]
) -> None:
    response = await journal_client.get(
        "/api/google-drive/evolution-journals", headers=_headers(OTHER_OWNER_ID)
    )

    assert response.status_code == 200
    assert response.json() == {"journals": []}
    assert not any(call[0] == "access_token" for call in journal_context["calls"])


async def test_read_returns_structured_remote_truth_for_part_two(
    journal_client: AsyncClient, journal_context: dict[str, Any]
) -> None:
    metadata = _journal_metadata(part=2, file_id="remote-journal-2")
    journal_context["files"] = [metadata]
    journal_context["contents"] = {
        "remote-journal-2": _journal_block(EVOLUTION_ID, "Manual edit from Drive")
    }

    response = await journal_client.get(
        f"/api/google-drive/evolution-journals/{PERIOD_TYPE}/{PERIOD_KEY}/parts/2",
        headers=_headers(),
    )

    assert response.status_code == 200
    journal = response.json()["journal"]
    assert set(journal) == {
        "period_type",
        "period_key",
        "journal_part",
        "display_name",
        "updated_at",
        "entries",
    }
    assert journal["journal_part"] == 2
    assert journal["updated_at"] == metadata["modifiedTime"]
    assert journal["entries"] == [
        {
            "evolution_id": str(EVOLUTION_ID),
            "occurred_at": "2026-09-13T13:30:00-03:00",
            "patient_display_name": "Ana Pérez",
            "patient_rut_masked": "••••••94-1",
            "content": "Manual edit from Drive",
        }
    ]
    assert "remote-journal-2" not in response.text
    assert "journal_block" not in response.text
    assert "operation_id" not in response.text


async def test_read_is_owner_scoped(
    journal_client: AsyncClient, journal_context: dict[str, Any]
) -> None:
    response = await journal_client.get(
        f"/api/google-drive/evolution-journals/{PERIOD_TYPE}/{PERIOD_KEY}/parts/1",
        headers=_headers(OTHER_OWNER_ID),
    )

    assert response.status_code == 404
    assert response.json() == {"error": "GOOGLE_DRIVE_NOT_FOUND"}
    assert not any(
        call[0] in {"access_token", "download_file"} for call in journal_context["calls"]
    )


async def test_read_parses_multiple_complete_lineage_entries_in_order(
    journal_client: AsyncClient, journal_context: dict[str, Any]
) -> None:
    journal_context["contents"] = {
        "remote-journal-1": _journal_block(EVOLUTION_ID, "First")
        + _journal_block(SECOND_EVOLUTION_ID, "Second")
    }

    response = await journal_client.get(
        f"/api/google-drive/evolution-journals/{PERIOD_TYPE}/{PERIOD_KEY}/parts/1",
        headers=_headers(),
    )

    assert response.status_code == 200
    assert [entry["evolution_id"] for entry in response.json()["journal"]["entries"]] == [
        str(EVOLUTION_ID),
        str(SECOND_EVOLUTION_ID),
    ]
    assert [entry["content"] for entry in response.json()["journal"]["entries"]] == [
        "First",
        "Second",
    ]


@pytest.mark.parametrize(
    "path",
    [
        "/api/google-drive/evolution-journals/monthly/2026-W37/parts/1",
        "/api/google-drive/evolution-journals/weekly/2026-W00/parts/1",
        "/api/google-drive/evolution-journals/daily/2026-02-30/parts/1",
        "/api/google-drive/evolution-journals/weekly/2026-W37/parts/0",
        "/api/google-drive/evolution-journals/weekly/2026-W37/parts/01",
    ],
)
async def test_invalid_journal_path_is_rejected_before_repository_or_provider(
    journal_client: AsyncClient, journal_context: dict[str, Any], path: str
) -> None:
    response = await journal_client.get(path, headers=_headers())

    assert response.status_code == 422
    assert response.json() in (
        {"error": "JOURNAL_PERIOD_INVALID"},
        {"error": "JOURNAL_PART_INVALID"},
    )
    assert not journal_context["calls"]


async def test_foreign_lineage_is_not_read_or_fabricated(
    journal_client: AsyncClient, journal_context: dict[str, Any]
) -> None:
    journal_context["contents"] = {
        "remote-journal-1": _journal_block(FOREIGN_EVOLUTION_ID, "do not expose")
    }

    response = await journal_client.get(
        f"/api/google-drive/evolution-journals/{PERIOD_TYPE}/{PERIOD_KEY}/parts/1",
        headers=_headers(),
    )

    assert response.status_code == 422
    assert response.json() == {"error": "JOURNAL_PARSE_INVALID"}
    assert "do not expose" not in response.text


async def test_malformed_remote_v1_returns_sanitized_error_without_entries(
    journal_client: AsyncClient, journal_context: dict[str, Any]
) -> None:
    journal_context["contents"] = {"remote-journal-1": "malformed clinical secret\n"}

    response = await journal_client.get(
        f"/api/google-drive/evolution-journals/{PERIOD_TYPE}/{PERIOD_KEY}/parts/1",
        headers=_headers(),
    )

    assert response.status_code == 422
    assert response.json() == {"error": "JOURNAL_PARSE_INVALID"}
    assert "malformed clinical secret" not in response.text
    assert "entries" not in response.text


async def test_body_delimiters_and_foreign_header_like_text_stay_body(
    journal_client: AsyncClient, journal_context: dict[str, Any]
) -> None:
    body = (
        "before\n"
        f"{service.JOURNAL_DELIMITER}\n"
        "EVOLUCIÓN · 01-01-2026 · 12:00\n"
        "Paciente: Older pasted evolution\n"
        "RUT: ••••••94-1\n"
        f"Dental AI ID: {FOREIGN_EVOLUTION_ID}\n"
        f"{service.JOURNAL_DELIMITER}\n\n"
        "after"
    )
    journal_context["contents"] = {"remote-journal-1": _journal_block(EVOLUTION_ID, body)}

    response = await journal_client.get(
        f"/api/google-drive/evolution-journals/{PERIOD_TYPE}/{PERIOD_KEY}/parts/1",
        headers=_headers(),
    )

    assert response.status_code == 200
    assert response.json()["journal"]["entries"][0]["content"] == body


async def test_duplicate_exact_app_properties_fail_closed_for_list(
    journal_client: AsyncClient, journal_context: dict[str, Any]
) -> None:
    journal_context["files"] = [
        _journal_metadata(file_id="remote-journal-1"),
        _journal_metadata(file_id="remote-journal-duplicate"),
    ]

    response = await journal_client.get("/api/google-drive/evolution-journals", headers=_headers())

    assert response.status_code == 409
    assert response.json() == {"error": "JOURNAL_IDENTITY_CONFLICT"}
    assert "remote-journal" not in response.text


async def test_duplicate_exact_app_properties_fail_closed_for_read(
    journal_client: AsyncClient, journal_context: dict[str, Any]
) -> None:
    journal_context["files"] = [
        _journal_metadata(file_id="remote-journal-1"),
        _journal_metadata(file_id="remote-journal-duplicate"),
    ]

    response = await journal_client.get(
        f"/api/google-drive/evolution-journals/{PERIOD_TYPE}/{PERIOD_KEY}/parts/1",
        headers=_headers(),
    )

    assert response.status_code == 409
    assert response.json() == {"error": "JOURNAL_IDENTITY_CONFLICT"}
    assert not any(call[0] == "download_file" for call in journal_context["calls"])
