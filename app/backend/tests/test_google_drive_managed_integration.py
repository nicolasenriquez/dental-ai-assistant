"""Fail-first mocked Google Drive adapter coverage for task 4.1.

The next implementation task owns this narrow async adapter seam:

* ``get_folder`` and ``find_folder_by_creation_operation`` request only
  authoritative folder metadata and never adopt by name.
* ``list_files`` scopes every query to parent, markers, and patient reference,
  requests at most 100 rows, and accepts an opaque cursor.
* ``get_file_metadata`` and ``download_file`` keep reads bounded to 1 MiB.
* ``create_file`` and ``update_file`` send backend-owned ``text/plain`` TXT
  metadata and operation markers. A transient write is one HTTP request; route
  orchestration performs at most one reconciliation, never a blind retry.

All HTTP is mocked with respx. These tests intentionally run red until task
4.2 supplies the managed-file adapter.
"""

from __future__ import annotations

import httpx
import pytest
import respx

from backend.integrations import google_drive

DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file"
_FILES_URL = "https://www.googleapis.com/drive/v3/files"
_UPLOAD_FILES_URL = "https://www.googleapis.com/upload/drive/v3/files"


def _managed_properties() -> dict[str, str]:
    return {
        "managedBy": "dental-ai-assistant",
        "workspaceSchema": "1",
        "patientRef": "a" * 64,
        "bindingMac": "b" * 64,
        "creationOperationId": "11111111-1111-1111-1111-111111111111",
    }


def _managed_file(file_id: str = "file-1") -> dict:
    return {
        "id": file_id,
        "name": "evolucion.txt",
        "mimeType": "text/plain",
        "modifiedTime": "2026-09-11T12:00:00Z",
        "version": "7",
        "size": "14",
        "parents": ["folder-1"],
        "trashed": False,
        "appProperties": _managed_properties(),
    }


def _adapter(name: str):
    function = getattr(google_drive, name, None)
    assert callable(function), f"missing google_drive.{name} contract"
    return function


@respx.mock
async def test_get_folder_requests_only_authoritative_metadata() -> None:
    route = respx.get(_FILES_URL + "/folder-1").mock(
        return_value=httpx.Response(200, json={"id": "folder-1", "name": "Dental AI Assistant"})
    )

    folder = await _adapter("get_folder")("request-access-token", "folder-1")

    assert folder["id"] == "folder-1"
    fields = route.calls.last.request.url.params["fields"]
    assert fields == "id,name,mimeType,trashed,appProperties"


@respx.mock
async def test_folder_reconciliation_queries_exact_operation_marker() -> None:
    route = respx.get(_FILES_URL).mock(
        return_value=httpx.Response(200, json={"files": [{"id": "folder-1"}]})
    )

    folders = await _adapter("find_folder_by_creation_operation")(
        "request-access-token", "11111111-1111-1111-1111-111111111111"
    )

    assert folders == [{"id": "folder-1"}]
    query = route.calls.last.request.url.params["q"]
    assert "trashed = false" in query
    assert "mimeType = 'application/vnd.google-apps.folder'" in query
    assert "managedBy" in query
    assert "workspaceSchema" in query
    assert "creationOperationId" in query
    assert "11111111-1111-1111-1111-111111111111" in query


@respx.mock
async def test_file_metadata_requests_only_bounded_validation_fields() -> None:
    route = respx.get(_FILES_URL + "/file-1").mock(
        return_value=httpx.Response(200, json=_managed_file())
    )

    file_metadata = await _adapter("get_file_metadata")("request-access-token", "file-1")

    assert file_metadata["id"] == "file-1"
    fields = route.calls.last.request.url.params["fields"]
    assert fields == ("id,name,mimeType,modifiedTime,version,size,parents,trashed,appProperties")


@respx.mock
async def test_list_files_scopes_patient_before_pagination() -> None:
    route = respx.get(_FILES_URL).mock(
        return_value=httpx.Response(
            200,
            json={"files": [_managed_file()], "nextPageToken": "opaque-next"},
        )
    )

    result = await _adapter("list_files")(
        "request-access-token",
        folder_id="folder-1",
        patient_ref="a" * 64,
        page_token="opaque-current",
    )

    assert result["files"][0]["id"] == "file-1"
    assert result["next_page_token"] == "opaque-next"
    params = route.calls.last.request.url.params
    assert params["pageSize"] == "100"
    assert params["orderBy"] == "modifiedTime desc,name"
    assert params["pageToken"] == "opaque-current"
    assert "'folder-1' in parents" in params["q"]
    assert "trashed = false" in params["q"]
    assert "managedBy" in params["q"]
    assert "workspaceSchema" in params["q"]
    assert "patientRef" in params["q"]
    assert params["fields"].startswith("nextPageToken,files(")


@respx.mock
async def test_search_escapes_drive_literal_without_changing_endpoint_shape() -> None:
    route = respx.get(_FILES_URL).mock(return_value=httpx.Response(200, json={"files": []}))

    await _adapter("list_files")(
        "request-access-token",
        folder_id="folder-1",
        patient_ref="a" * 64,
        name_query="O'Reilly",
    )

    query = route.calls.last.request.url.params["q"]
    assert "name contains 'O\\'Reilly'" in query
    assert "'folder-1' in parents" in query


@respx.mock
async def test_invalid_page_token_maps_to_sanitized_error() -> None:
    respx.get(_FILES_URL).mock(return_value=httpx.Response(400, text="invalid page token"))

    with pytest.raises(Exception) as exc_info:
        await _adapter("list_files")(
            "request-access-token",
            folder_id="folder-1",
            patient_ref="a" * 64,
            page_token="invalid-token",
        )

    assert getattr(exc_info.value, "code", None) == "DRIVE_PAGE_TOKEN_INVALID"
    assert "invalid page token" not in str(exc_info.value)


@respx.mock
async def test_download_file_rejects_body_over_one_mib() -> None:
    route = respx.get(_FILES_URL + "/file-1").mock(
        return_value=httpx.Response(200, content=b"x" * (1024 * 1024 + 1))
    )

    with pytest.raises(Exception) as exc_info:
        await _adapter("download_file")("request-access-token", "file-1")

    assert getattr(exc_info.value, "code", None) == "DRIVE_FILE_TOO_LARGE"
    assert route.call_count == 1


@respx.mock
async def test_download_file_rejects_invalid_utf8() -> None:
    respx.get(_FILES_URL + "/file-1").mock(return_value=httpx.Response(200, content=b"\xff"))

    with pytest.raises(Exception) as exc_info:
        await _adapter("download_file")("request-access-token", "file-1")

    assert getattr(exc_info.value, "code", None) == "DRIVE_FILE_ENCODING_INVALID"


@respx.mock
async def test_create_file_sends_backend_owned_txt_metadata_and_markers() -> None:
    route = respx.post(_UPLOAD_FILES_URL).mock(
        return_value=httpx.Response(200, json={"id": "file-1", "version": "1"})
    )

    result = await _adapter("create_file")(
        "request-access-token",
        folder_id="folder-1",
        name="evolucion.txt",
        content=b"plain text\n",
        app_properties=_managed_properties(),
    )

    assert result["id"] == "file-1"
    request = route.calls.last.request
    assert request.url.params["uploadType"] == "multipart"
    assert request.headers["content-type"].startswith("multipart/related")
    body = request.content
    assert b"text/plain" in body
    assert b"evolucion.txt" in body
    assert b"creationOperationId" in body
    assert b"patientRef" in body


@respx.mock
async def test_update_file_sends_last_operation_marker_and_one_request() -> None:
    route = respx.patch(_UPLOAD_FILES_URL + "/file-1").mock(
        return_value=httpx.Response(200, json={"id": "file-1", "version": "8"})
    )

    result = await _adapter("update_file")(
        "request-access-token",
        file_id="file-1",
        content=b"updated\n",
        app_properties={**_managed_properties(), "lastOperationId": "op-2"},
    )

    assert result["version"] == "8"
    assert route.call_count == 1
    assert b"lastOperationId" in route.calls.last.request.content


@respx.mock
async def test_write_transient_failure_is_not_retried_by_adapter() -> None:
    route = respx.post(_UPLOAD_FILES_URL).mock(
        return_value=httpx.Response(503, text="provider body")
    )

    with pytest.raises(Exception) as exc_info:
        await _adapter("create_file")(
            "request-access-token",
            folder_id="folder-1",
            name="evolucion.txt",
            content=b"plain text\n",
            app_properties=_managed_properties(),
        )

    assert getattr(exc_info.value, "code", None) == "DRIVE_UNAVAILABLE"
    assert route.call_count == 1
    assert "provider body" not in str(exc_info.value)
