from unittest.mock import AsyncMock

import httpx
import pytest
import respx
from fastapi import FastAPI

from backend import config
from backend.auth.dependencies import get_current_user
from backend.integrations import google_drive
from backend.routes import google_drive as routes

_FILES_URL = "https://www.googleapis.com/drive/v3/files"
_UPLOAD_FILES_URL = "https://www.googleapis.com/upload/drive/v3/files"


@pytest.fixture
def source_context(monkeypatch):
    metadata = {
        "id": "source-1",
        "_revision": '"revision-3"',
        "name": "notas.md",
        "mimeType": "text/markdown",
        "modifiedTime": "2026-09-12T12:00:00Z",
        "version": "3",
        "capabilities": {"canEdit": True, "canDownload": True},
    }
    token = AsyncMock(return_value=({}, "private-token"))
    monkeypatch.setattr(routes, "_connection_access_token", token)
    monkeypatch.setattr(
        routes, "_managed_context", AsyncMock(side_effect=AssertionError("patient boundary"))
    )
    monkeypatch.setattr(google_drive, "get_source_metadata", AsyncMock(return_value=metadata))
    monkeypatch.setattr(google_drive, "download_blob", AsyncMock(return_value=b"# Alpha\nBeta\n"))
    monkeypatch.setattr(
        google_drive, "update_blob", AsyncMock(return_value={**metadata, "version": "4"})
    )
    monkeypatch.setattr(config, "APP_ORIGINS", ["http://test"])
    app = FastAPI()
    app.include_router(routes.router, prefix="/api")
    app.dependency_overrides[get_current_user] = lambda: {"id": "user-1"}
    return app, metadata, token


async def test_source_read_and_save_have_no_patient_binding(source_context):
    app, _, token = source_context
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app), base_url="http://test"
    ) as client:
        read = await client.get("/api/google-drive/sources/source-1/content")
        assert read.status_code == 200
        assert read.json()["content"] == "# Alpha\nBeta\n"
        assert "patient_id" not in read.json()
        saved = await client.put(
            "/api/google-drive/sources/source-1/content",
            headers={"Origin": "http://test"},
            json={"content": "# unchanged markdown\n"},
        )
        assert saved.status_code == 200
        assert saved.json()["version"] == "4"
        google_drive.update_blob.assert_awaited_once_with(
            "private-token",
            "source-1",
            b"# unchanged markdown\n",
            "text/markdown",
        )
        token.assert_awaited_with("user-1")


async def test_sources_require_authentication() -> None:
    app = FastAPI()
    app.include_router(routes.router, prefix="/api")
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app), base_url="http://test"
    ) as client:
        assert (await client.get("/api/google-drive/sources")).status_code == 401


async def test_source_list_filters_provider_results(source_context, monkeypatch) -> None:
    app, metadata, _ = source_context
    managed = {**metadata, "id": "managed", "appProperties": {"managedBy": google_drive.MANAGED_BY}}
    folder = {
        **metadata,
        "id": "folder",
        "mimeType": "application/vnd.google-apps.folder",
    }
    monkeypatch.setattr(
        google_drive,
        "list_source_files",
        AsyncMock(return_value={"files": [metadata, managed, folder], "next_page_token": "next"}),
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app), base_url="http://test"
    ) as client:
        response = await client.get("/api/google-drive/sources")
    assert response.status_code == 200
    assert [item["id"] for item in response.json()["files"]] == ["source-1"]
    assert response.json()["next_page_token"] == "next"


@pytest.mark.parametrize(
    ("change", "status"),
    [
        ({"trashed": True}, 404),
        ({"mimeType": "image/png"}, 422),
        ({"mimeType": "application/vnd.google-apps.folder"}, 422),
        ({"appProperties": {"managedBy": google_drive.MANAGED_BY}}, 409),
    ],
)
async def test_sources_reject_managed_and_unsupported_files(source_context, change, status):
    app, metadata, _ = source_context
    metadata.update(change)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app), base_url="http://test"
    ) as client:
        assert (await client.get("/api/google-drive/sources/source-1")).status_code == status


async def test_source_write_protects_origin_and_size_without_app_version(source_context):
    app, _, _ = source_context
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app), base_url="http://test"
    ) as client:
        url = "/api/google-drive/sources/source-1/content"
        body = {"content": "local"}
        assert (await client.put(url, json=body)).status_code == 403
        assert (
            await client.put(url, headers={"Origin": "http://test"}, json=body)
        ).status_code == 200
        google_drive.update_blob.reset_mock()
        body = {"content": "x" * (google_drive.MAX_CONTENT_BYTES + 1)}
        assert (
            await client.put(url, headers={"Origin": "http://test"}, json=body)
        ).status_code == 422
        google_drive.update_blob.assert_not_awaited()


async def test_source_write_timeout_is_not_retried(source_context):
    app, _, _ = source_context
    google_drive.update_blob.side_effect = httpx.ReadTimeout("timeout")
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app), base_url="http://test"
    ) as client:
        result = await client.put(
            "/api/google-drive/sources/source-1/content",
            headers={"Origin": "http://test"},
            json={"content": "local"},
        )
        assert result.status_code == 503
        assert result.json()["error"] == "DRIVE_WRITE_UNKNOWN"
        google_drive.update_blob.assert_awaited_once()


@respx.mock
async def test_source_adapter_lists_supported_unmanaged_files() -> None:
    request = respx.get(_FILES_URL).mock(
        return_value=httpx.Response(200, json={"files": [], "nextPageToken": "next"})
    )
    result = await google_drive.list_source_files("request-token", "current")
    params = request.calls.last.request.url.params
    assert result == {"files": [], "next_page_token": "next"}
    assert params["pageToken"] == "current"
    assert "trashed = false" in params["q"]
    assert "application/pdf" in params["q"]
    assert "application/vnd.google-apps.folder" not in params["q"]
    assert "managedBy" in params["q"]


@respx.mock
async def test_source_adapter_updates_without_provider_revision() -> None:
    request = respx.patch(_UPLOAD_FILES_URL + "/source-1").mock(
        return_value=httpx.Response(200, json={"id": "source-1", "version": "4"})
    )
    result = await google_drive.update_blob(
        "request-token",
        "source-1",
        b"clinical notes",
        "text/plain",
    )
    sent = request.calls.last.request
    assert result["version"] == "4"
    assert sent.url.params["uploadType"] == "media"
    assert sent.headers["Content-Type"] == "text/plain"
    assert "If-Match" not in sent.headers
    assert sent.content == b"clinical notes"
    assert b"managedBy" not in sent.content
