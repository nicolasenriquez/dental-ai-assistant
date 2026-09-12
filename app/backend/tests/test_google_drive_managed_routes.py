"""Fail-first HTTP/security coverage for managed patient Drive files (task 4.1).

The route suite pins the Phase 4 public surface from the capability spec. Google
calls, token refresh, and repository writes are replaced at their boundaries so
tests prove ownership, patient/file binding, operation reconciliation, limits,
and sanitized transport without real credentials or Drive data.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
from types import SimpleNamespace
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from backend import config
from backend.auth import token_cipher
from backend.auth.tokens import encode_token
from backend.db import patients_repo, users_repo
from backend.integrations import google_drive, google_drive_oauth

DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file"
USER_ID = "11111111-1111-1111-1111-111111111111"
OTHER_USER_ID = "22222222-2222-2222-2222-222222222222"
PATIENT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
OTHER_PATIENT_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
ORIGIN = "https://testserver"
MAX_CONTENT_BYTES = 1_048_576
MAX_REQUEST_BYTES = 8 * 1024 * 1024


def _patient_ref(secret: bytes, user_id: str = USER_ID, patient_id: str = PATIENT_ID) -> str:
    payload = b"patient:v1\0" + UUID(user_id).bytes + UUID(patient_id).bytes
    return hmac.new(secret, payload, hashlib.sha256).hexdigest()


def _binding_mac(
    secret: bytes,
    file_id: str,
    patient_ref: str,
    user_id: str = USER_ID,
) -> str:
    payload = (
        b"file:v1\0"
        + file_id.encode()
        + b"\0"
        + UUID(user_id).bytes
        + bytes.fromhex(patient_ref)
        + b"\0"
        + b"1"
    )
    return hmac.new(secret, payload, hashlib.sha256).hexdigest()


@pytest.fixture
def managed_context(monkeypatch):
    """Patch Dental ownership, Drive connection, and Google boundaries."""
    from backend.db import google_drive_repo

    monkeypatch.setattr(config, "GOOGLE_DRIVE_CONFIGURED", True, raising=False)
    monkeypatch.setattr(config, "APP_ORIGINS", [ORIGIN], raising=False)
    monkeypatch.setattr(config, "GOOGLE_DRIVE_RETURN_URL", f"{ORIGIN}/assistant", raising=False)
    monkeypatch.setattr(config, "GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEYS", {"1": bytes(range(32))})
    monkeypatch.setattr(config, "GOOGLE_DRIVE_TOKEN_ACTIVE_KEY_VERSION", "1")

    binding_secret = b"binding-secret-for-route-tests-32b!"
    refresh = token_cipher.encrypt(USER_ID, token_cipher.PURPOSE_REFRESH_TOKEN, b"refresh-secret")
    binding = token_cipher.encrypt(USER_ID, token_cipher.PURPOSE_BINDING_SECRET, binding_secret)
    patient_ref = _patient_ref(binding_secret)
    file_id = "file-1"

    state: dict[str, Any] = {
        "binding_secret": binding_secret,
        "patient_ref": patient_ref,
        "folder": {
            "id": "folder-1",
            "name": "Dental AI Assistant",
            "mimeType": "application/vnd.google-apps.folder",
            "trashed": False,
            "appProperties": {
                "managedBy": "dental-ai-assistant",
                "workspaceSchema": "1",
                "creationOperationId": "11111111-1111-1111-1111-111111111111",
            },
        },
        "reconciled_folders": [],
        "connection": {
            "user_id": USER_ID,
            "google_account_id": "google-account-1",
            "refresh_token_ciphertext": refresh.ciphertext,
            "refresh_token_nonce": refresh.nonce,
            "token_key_version": refresh.key_version,
            "binding_secret_ciphertext": binding.ciphertext,
            "binding_secret_nonce": binding.nonce,
            "binding_key_version": binding.key_version,
            "granted_scopes": [DRIVE_SCOPE],
            "folder_id": "folder-1",
            "folder_name": "Dental AI Assistant",
            "folder_creation_operation_id": "11111111-1111-1111-1111-111111111111",
            "pending_folder_operation_id": None,
            "status": "active",
        },
        "file": {
            "id": file_id,
            "name": "evolucion.txt",
            "mimeType": "text/plain",
            "modifiedTime": "2026-09-11T12:00:00Z",
            "version": "7",
            "size": "12",
            "parents": ["folder-1"],
            "trashed": False,
            "appProperties": {
                "managedBy": "dental-ai-assistant",
                "workspaceSchema": "1",
                "patientRef": patient_ref,
                "bindingMac": _binding_mac(binding_secret, file_id, patient_ref),
                "creationOperationId": "33333333-3333-3333-3333-333333333333",
            },
        },
        "source_file": {
            "id": "source-1",
            "name": "fuente.md",
            "mimeType": "text/markdown",
            "size": "20",
            "trashed": False,
            "parents": ["external-folder"],
            "appProperties": {},
        },
        "body": b"texto remoto\n",
        "list_result": {"files": [], "next_page_token": None},
        "reconcile_file": None,
        "create_error": None,
        "update_error": None,
        "calls": [],
    }

    users = {
        USER_ID: {"id": USER_ID, "email": "ana@gmail.com", "is_member": False},
        OTHER_USER_ID: {"id": OTHER_USER_ID, "email": "bob@gmail.com", "is_member": False},
    }

    async def get_user_by_id(user_id: UUID | str) -> dict[str, Any] | None:
        return cast(dict[str, Any] | None, users.get(str(user_id)))

    async def get_patient(
        owner_user_id: UUID | str, patient_id: UUID | str
    ) -> dict[str, Any] | None:
        if str(owner_user_id) != USER_ID or str(patient_id) != PATIENT_ID:
            return None
        return {"id": UUID(PATIENT_ID), "owner_user_id": UUID(USER_ID)}

    async def get_connection(user_id: UUID | str) -> dict[str, Any] | None:
        if str(user_id) != USER_ID or state["connection"] is None:
            return None
        return dict(state["connection"])

    async def set_pending_folder_operation(user_id: UUID | str, operation_id: UUID | str):
        state["connection"]["pending_folder_operation_id"] = str(operation_id)
        state["calls"].append(("set_pending_folder_operation", str(operation_id)))
        return dict(state["connection"])

    async def complete_folder_operation(
        user_id: UUID | str,
        *,
        folder_id: str,
        folder_name: str,
        operation_id: UUID | str,
    ):
        state["connection"].update(
            {
                "folder_id": folder_id,
                "folder_name": folder_name,
                "folder_creation_operation_id": str(operation_id),
                "pending_folder_operation_id": None,
            }
        )
        state["calls"].append(("complete_folder_operation", str(operation_id)))
        return dict(state["connection"])

    async def mark_workspace_recovery_pending(user_id: UUID | str, operation_id: UUID | str):
        state["connection"]["pending_folder_operation_id"] = str(operation_id)
        state["calls"].append(("mark_workspace_recovery_pending", str(operation_id)))
        return dict(state["connection"])

    async def replace_active_connection(user_id: UUID | str, **kwargs):
        state["connection"].update(kwargs, status="active")
        state["calls"].append(("replace_active_connection", kwargs))
        return dict(state["connection"])

    async def set_revoked(user_id: UUID | str):
        state["connection"].update(
            status="revoked",
            refresh_token_ciphertext=None,
            refresh_token_nonce=None,
            token_key_version=None,
            granted_scopes=[],
        )
        return dict(state["connection"])

    repo_functions = {
        "get_connection": get_connection,
        "set_pending_folder_operation": set_pending_folder_operation,
        "complete_folder_operation": complete_folder_operation,
        "mark_workspace_recovery_pending": mark_workspace_recovery_pending,
        "replace_active_connection": replace_active_connection,
        "set_revoked": set_revoked,
    }
    for name, function in repo_functions.items():
        monkeypatch.setattr(google_drive_repo, name, function, raising=False)

    monkeypatch.setattr(users_repo, "get_user_by_id", get_user_by_id)
    monkeypatch.setattr(patients_repo, "get_patient", get_patient)

    async def refresh_access_token(refresh_token: str):
        state["calls"].append(("refresh_access_token", refresh_token))
        return SimpleNamespace(
            access_token="request-access-token",
            refresh_token=refresh_token,
            scopes=frozenset({DRIVE_SCOPE}),
        )

    async def get_folder(access_token: str, folder_id: str):
        state["calls"].append(("get_folder", folder_id))
        return state["folder"]

    async def find_folder_by_creation_operation(access_token: str, operation_id: str):
        state["calls"].append(("find_folder_by_creation_operation", str(operation_id)))
        return list(state["reconciled_folders"])

    async def create_folder(access_token: str, *, name: str, operation_id: str):
        state["calls"].append(("create_folder", {"name": name, "operation_id": str(operation_id)}))
        return {
            **(state["folder"] or {"id": "folder-1", "name": "Dental AI Assistant"}),
            "name": name,
            "appProperties": {
                "managedBy": "dental-ai-assistant",
                "workspaceSchema": "1",
                "creationOperationId": str(operation_id),
            },
        }

    async def list_files(
        access_token: str,
        *,
        folder_id: str,
        patient_ref: str,
        page_token: str | None = None,
        name_query: str | None = None,
    ):
        state["calls"].append(
            (
                "list_files",
                {
                    "folder_id": folder_id,
                    "patient_ref": patient_ref,
                    "page_token": page_token,
                    "name_query": name_query,
                },
            )
        )
        return state["list_result"]

    async def get_file_metadata(access_token: str, file_id: str):
        state["calls"].append(("get_file_metadata", file_id))
        if file_id == "source-1":
            return state["source_file"]
        return state["file"]

    async def download_file(access_token: str, file_id: str):
        state["calls"].append(("download_file", file_id))
        return state["body"]

    async def create_file(
        access_token: str,
        *,
        folder_id: str,
        name: str,
        content: bytes,
        app_properties: dict[str, str],
    ):
        state["calls"].append(
            (
                "create_file",
                {
                    "folder_id": folder_id,
                    "name": name,
                    "content": content,
                    "app_properties": dict(app_properties),
                },
            )
        )
        if state["create_error"] is not None:
            raise state["create_error"]
        return {"id": "created-file", "name": name, "version": "1", "mimeType": "text/plain"}

    async def update_file(
        access_token: str,
        *,
        file_id: str,
        content: bytes,
        app_properties: dict[str, str],
    ):
        state["calls"].append(
            (
                "update_file",
                {"file_id": file_id, "content": content, "app_properties": dict(app_properties)},
            )
        )
        if state["update_error"] is not None:
            raise state["update_error"]
        return {**state["file"], "id": file_id, "version": "8"}

    async def find_file_by_creation_operation(access_token: str, operation_id: str):
        state["calls"].append(("find_file_by_creation_operation", str(operation_id)))
        return state["reconcile_file"]

    drive_functions = {
        "get_folder": get_folder,
        "find_folder_by_creation_operation": find_folder_by_creation_operation,
        "create_folder": create_folder,
        "list_files": list_files,
        "get_file_metadata": get_file_metadata,
        "get_file": get_file_metadata,
        "download_file": download_file,
        "create_file": create_file,
        "update_file": update_file,
        "find_file_by_creation_operation": find_file_by_creation_operation,
    }
    for name, function in drive_functions.items():
        monkeypatch.setattr(google_drive, name, function, raising=False)

    monkeypatch.setattr(google_drive_oauth, "refresh_access_token", refresh_access_token)
    return state


@pytest.fixture
async def managed_client():
    from backend.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url=ORIGIN) as client:
        yield client


def _headers(user_id: str = USER_ID, *, origin: str | None = ORIGIN) -> dict[str, str]:
    headers = {"Cookie": f"session={cast(str, encode_token(user_id))}"}
    if origin is not None:
        headers["Origin"] = origin
    return headers


def _calls(state: dict[str, Any], name: str) -> list[tuple[Any, ...]]:
    return [call for call in state["calls"] if call[0] == name]


async def test_status_reports_missing_or_pending_authoritative_workspace(
    managed_client: AsyncClient, managed_context: dict[str, Any]
) -> None:
    managed_context["folder"] = None
    missing = await managed_client.get("/api/google-drive/status", headers=_headers())
    assert missing.status_code == 200
    assert missing.json()["status"] == "workspace_missing"

    managed_context["connection"]["pending_folder_operation_id"] = str(uuid4())
    pending = await managed_client.get("/api/google-drive/status", headers=_headers())
    assert pending.status_code == 200
    assert pending.json()["status"] == "workspace_recovery_pending"


async def test_status_reuses_verified_folder_without_creating_duplicate(
    managed_client: AsyncClient, managed_context: dict[str, Any]
) -> None:
    response = await managed_client.get("/api/google-drive/status", headers=_headers())

    assert response.status_code == 200
    assert response.json()["status"] == "connected"
    assert len(_calls(managed_context, "get_folder")) == 1
    assert not _calls(managed_context, "create_folder")


async def test_workspace_recovery_requires_possible_orphan_acknowledgement(
    managed_client: AsyncClient, managed_context: dict[str, Any]
) -> None:
    managed_context["folder"] = None
    managed_context["connection"]["pending_folder_operation_id"] = str(uuid4())
    before = len(_calls(managed_context, "create_folder"))

    response = await managed_client.post(
        "/api/google-drive/workspace/recreate",
        headers={**_headers(), "Content-Type": "application/json"},
        json={"operation_id": str(uuid4()), "acknowledge_possible_orphan": False},
    )

    assert response.status_code == 409
    assert response.json() == {"error": "DRIVE_WORKSPACE_RECOVERY_PENDING"}
    assert len(_calls(managed_context, "create_folder")) == before


async def test_acknowledged_workspace_recreation_uses_one_new_operation_marker(
    managed_client: AsyncClient, managed_context: dict[str, Any]
) -> None:
    managed_context["folder"] = None
    managed_context["connection"]["pending_folder_operation_id"] = str(uuid4())
    operation_id = "44444444-4444-4444-4444-444444444444"

    response = await managed_client.post(
        "/api/google-drive/workspace/recreate",
        headers={**_headers(), "Content-Type": "application/json"},
        json={"operation_id": operation_id, "acknowledge_possible_orphan": True},
    )

    assert response.status_code in (200, 201)
    create_calls = _calls(managed_context, "create_folder")
    assert len(create_calls) == 1
    assert create_calls[0][1]["operation_id"] == operation_id
    assert managed_context["connection"]["folder_creation_operation_id"] == operation_id


async def test_list_requires_owned_patient_before_google_access(
    managed_client: AsyncClient, managed_context: dict[str, Any]
) -> None:
    response = await managed_client.get(
        f"/api/google-drive/files?patient_id={OTHER_PATIENT_ID}", headers=_headers()
    )

    assert response.status_code == 404
    assert response.json().get("error") == "DRIVE_PATIENT_NOT_FOUND"
    assert not _calls(managed_context, "refresh_access_token")
    assert not _calls(managed_context, "list_files")


async def test_list_passes_patient_scope_before_opaque_pagination(
    managed_client: AsyncClient, managed_context: dict[str, Any]
) -> None:
    managed_context["list_result"] = {
        "files": [{"id": "file-1", "name": "evolucion.txt"}],
        "next_page_token": "next-opaque",
    }
    response = await managed_client.get(
        f"/api/google-drive/files?patient_id={PATIENT_ID}&page_token=cursor-1",
        headers=_headers(),
    )

    assert response.status_code == 200
    call = _calls(managed_context, "list_files")[0][1]
    assert call == {
        "folder_id": "folder-1",
        "patient_ref": managed_context["patient_ref"],
        "page_token": "cursor-1",
        "name_query": None,
    }


async def test_list_excludes_invalid_metadata_without_downloading_bodies(
    managed_client: AsyncClient, managed_context: dict[str, Any]
) -> None:
    invalid = {**managed_context["file"], "id": "wrong-mime", "mimeType": "application/pdf"}
    managed_context["list_result"] = {
        "files": [managed_context["file"], invalid],
        "next_page_token": None,
    }

    response = await managed_client.get(
        f"/api/google-drive/files?patient_id={PATIENT_ID}", headers=_headers()
    )

    assert response.status_code == 200
    assert [item["id"] for item in response.json()["files"]] == ["file-1"]
    assert not _calls(managed_context, "download_file")


async def test_search_keeps_query_out_of_endpoint_url_and_scopes_request(
    managed_client: AsyncClient, managed_context: dict[str, Any]
) -> None:
    query = "paciente secreto O'Reilly"
    response = await managed_client.post(
        "/api/google-drive/files/search",
        headers={**_headers(), "Content-Type": "application/json"},
        json={"patient_id": PATIENT_ID, "query": query, "page_token": None},
    )

    assert response.status_code == 200
    assert query not in str(response.request.url)
    assert _calls(managed_context, "list_files")[0][1]["name_query"] == query


@pytest.mark.parametrize(
    "url",
    [
        f"/api/google-drive/files/%00bad?patient_id={PATIENT_ID}",
        f"/api/google-drive/files?patient_id={PATIENT_ID}&page_token={'x' * 2049}",
    ],
)
async def test_opaque_ids_and_cursors_are_bounded_before_google(
    managed_client: AsyncClient, managed_context: dict[str, Any], url: str
) -> None:
    response = await managed_client.get(url, headers=_headers())
    assert response.status_code == 422
    assert not _calls(managed_context, "refresh_access_token")


@pytest.mark.parametrize("name, normalized", [("nota", "nota.txt"), ("nota.md", "nota.txt")])
async def test_create_owns_txt_normalization_and_mime(
    managed_client: AsyncClient,
    managed_context: dict[str, Any],
    name: str,
    normalized: str,
) -> None:
    operation_id = "66666666-6666-6666-6666-666666666666"
    response = await managed_client.post(
        "/api/google-drive/files",
        headers={**_headers(), "Content-Type": "application/json"},
        json={
            "patient_id": PATIENT_ID,
            "operation_id": operation_id,
            "name": name,
            "content": "texto plano\n",
        },
    )

    assert response.status_code in (200, 201)
    create_call = _calls(managed_context, "create_file")[0][1]
    assert create_call["name"] == normalized
    assert create_call["content"] == b"texto plano\n"
    assert "mime_type" not in create_call
    properties = create_call["app_properties"]
    assert properties["managedBy"] == "dental-ai-assistant"
    assert properties["workspaceSchema"] == "1"
    assert properties["patientRef"] == managed_context["patient_ref"]
    assert len(properties["bindingMac"]) == 64
    assert properties["creationOperationId"] == operation_id
    property_sets = [call[1]["app_properties"] for call in _calls(managed_context, "update_file")]
    assert any(
        item.get("bindingMac")
        == _binding_mac(
            managed_context["binding_secret"], "created-file", managed_context["patient_ref"]
        )
        for item in [properties, *property_sets]
    )


@pytest.mark.parametrize("size", [MAX_CONTENT_BYTES + 1])
async def test_create_rejects_export_over_one_mib_before_drive_write(
    managed_client: AsyncClient, managed_context: dict[str, Any], size: int
) -> None:
    response = await managed_client.post(
        "/api/google-drive/files",
        headers={**_headers(), "Content-Type": "application/json"},
        json={
            "patient_id": PATIENT_ID,
            "operation_id": str(uuid4()),
            "name": "nota.txt",
            "content": "x" * size,
        },
    )

    assert response.status_code == 422
    assert response.json() == {"error": "DRIVE_FILE_TOO_LARGE"}
    assert not _calls(managed_context, "create_file")


async def test_create_accepts_exactly_one_mib_of_exported_utf8(
    managed_client: AsyncClient, managed_context: dict[str, Any]
) -> None:
    response = await managed_client.post(
        "/api/google-drive/files",
        headers={**_headers(), "Content-Type": "application/json"},
        json={
            "patient_id": PATIENT_ID,
            "operation_id": str(uuid4()),
            "name": "nota.txt",
            "content": "x" * MAX_CONTENT_BYTES,
        },
    )

    assert response.status_code in (200, 201)


async def test_tampered_file_binding_is_rejected_before_content_read(
    managed_client: AsyncClient, managed_context: dict[str, Any]
) -> None:
    managed_context["file"]["appProperties"]["bindingMac"] = "0" * 64
    response = await managed_client.get(
        f"/api/google-drive/files/file-1?patient_id={PATIENT_ID}", headers=_headers()
    )

    assert response.status_code == 404
    assert response.json().get("error") == "DRIVE_FILE_NOT_MANAGED"
    assert not _calls(managed_context, "download_file")


async def test_managed_plain_text_file_without_extension_can_be_read(
    managed_client: AsyncClient, managed_context: dict[str, Any]
) -> None:
    managed_context["file"]["name"] = "evaluation_prueba"

    response = await managed_client.get(
        f"/api/google-drive/files/file-1?patient_id={PATIENT_ID}", headers=_headers()
    )

    assert response.status_code == 200
    assert response.json()["content"] == "texto remoto\n"


async def test_update_version_conflict_does_not_write(
    managed_client: AsyncClient, managed_context: dict[str, Any]
) -> None:
    response = await managed_client.put(
        "/api/google-drive/files/file-1",
        headers={**_headers(), "Content-Type": "application/json"},
        json={
            "patient_id": PATIENT_ID,
            "operation_id": str(uuid4()),
            "content": "cambio\n",
            "expected_version": "6",
        },
    )

    assert response.status_code == 409
    assert response.json() == {"error": "DRIVE_FILE_CHANGED"}
    assert not _calls(managed_context, "update_file")


async def test_uncertain_create_reconciles_once_without_blind_retry(
    managed_client: AsyncClient, managed_context: dict[str, Any]
) -> None:
    managed_context["create_error"] = google_drive.GoogleDriveError(
        "DRIVE_WRITE_UNKNOWN", "write outcome unknown"
    )
    operation_id = "55555555-5555-5555-5555-555555555555"
    response = await managed_client.post(
        "/api/google-drive/files",
        headers={**_headers(), "Content-Type": "application/json"},
        json={
            "patient_id": PATIENT_ID,
            "operation_id": operation_id,
            "name": "nota.txt",
            "content": "texto\n",
        },
    )

    assert response.status_code == 503
    assert response.json() == {"error": "DRIVE_WRITE_UNKNOWN"}
    assert len(_calls(managed_context, "create_file")) == 1
    assert len(_calls(managed_context, "find_file_by_creation_operation")) == 1


@pytest.mark.parametrize("marker_present", [True, False])
async def test_uncertain_update_reconciles_once_to_success_or_unknown(
    managed_client: AsyncClient, managed_context: dict[str, Any], marker_present: bool
) -> None:
    managed_context["update_error"] = google_drive.GoogleDriveError(
        "DRIVE_UNAVAILABLE", "update outcome unknown"
    )
    operation_id = "88888888-8888-8888-8888-888888888888"
    if marker_present:
        managed_context["file"]["appProperties"]["lastOperationId"] = operation_id

    response = await managed_client.put(
        "/api/google-drive/files/file-1",
        headers={**_headers(), "Content-Type": "application/json"},
        json={
            "patient_id": PATIENT_ID,
            "operation_id": operation_id,
            "content": "cambio\n",
            "expected_version": "7",
        },
    )

    assert len(_calls(managed_context, "update_file")) == 1
    assert len(_calls(managed_context, "get_file_metadata")) == 2
    if marker_present:
        assert response.status_code == 200
    else:
        assert response.status_code == 503
        assert response.json() == {"error": "DRIVE_WRITE_UNKNOWN"}


async def test_managed_source_is_rejected_before_download_or_copy(
    managed_client: AsyncClient, managed_context: dict[str, Any]
) -> None:
    managed_context["source_file"]["appProperties"] = {
        "managedBy": "dental-ai-assistant",
        "workspaceSchema": "1",
    }
    response = await managed_client.post(
        "/api/google-drive/import-copy",
        headers={**_headers(), "Content-Type": "application/json"},
        json={
            "patient_id": PATIENT_ID,
            "operation_id": str(uuid4()),
            "source_file_id": "source-1",
        },
    )

    assert response.status_code == 404
    assert response.json().get("error") == "DRIVE_FILE_NOT_MANAGED"
    assert not _calls(managed_context, "download_file")
    assert not _calls(managed_context, "create_file")


async def test_import_copy_never_mutates_original_source(
    managed_client: AsyncClient, managed_context: dict[str, Any]
) -> None:
    response = await managed_client.post(
        "/api/google-drive/import-copy",
        headers={**_headers(), "Content-Type": "application/json"},
        json={
            "patient_id": PATIENT_ID,
            "operation_id": str(uuid4()),
            "source_file_id": "source-1",
            "name": "importado.md",
        },
    )

    assert response.status_code in (200, 201)
    assert len(_calls(managed_context, "download_file")) == 1
    assert len(_calls(managed_context, "create_file")) == 1
    assert not _calls(managed_context, "delete_file")
    assert all(call[1]["file_id"] != "source-1" for call in _calls(managed_context, "update_file"))
    assert _calls(managed_context, "create_file")[0][1]["name"] == "importado.txt"


async def test_imported_copy_binding_is_file_id_bound_and_survives_listing(
    managed_client: AsyncClient, managed_context: dict[str, Any]
) -> None:
    operation_id = "77777777-7777-7777-7777-777777777777"
    response = await managed_client.post(
        "/api/google-drive/import-copy",
        headers={**_headers(), "Content-Type": "application/json"},
        json={
            "patient_id": PATIENT_ID,
            "operation_id": operation_id,
            "source_file_id": "source-1",
            "name": "importado.md",
        },
    )

    assert response.status_code in (200, 201)
    copy_id = response.json()["id"]
    updates = _calls(managed_context, "update_file")
    assert len(updates) == 1
    assert updates[0][1]["file_id"] == copy_id
    assert updates[0][1]["app_properties"]["bindingMac"] == _binding_mac(
        managed_context["binding_secret"], copy_id, managed_context["patient_ref"]
    )
    assert updates[0][1]["app_properties"]["creationOperationId"] == operation_id

    managed_context["list_result"] = {
        "files": [
            {
                **managed_context["file"],
                "id": copy_id,
                "name": "importado.txt",
                "appProperties": {
                    "managedBy": "dental-ai-assistant",
                    "workspaceSchema": "1",
                    "patientRef": managed_context["patient_ref"],
                    "bindingMac": _binding_mac(
                        managed_context["binding_secret"], copy_id, managed_context["patient_ref"]
                    ),
                    "creationOperationId": operation_id,
                },
            },
            managed_context["file"],
        ],
        "next_page_token": None,
    }

    listing = await managed_client.get(
        f"/api/google-drive/files?patient_id={PATIENT_ID}", headers=_headers()
    )

    assert listing.status_code == 200
    assert [item["id"] for item in listing.json()["files"]] == [copy_id, "file-1"]


async def test_picker_token_is_no_store_and_requires_owned_patient(
    managed_client: AsyncClient, managed_context: dict[str, Any]
) -> None:
    response = await managed_client.post(
        "/api/google-drive/picker-token",
        headers={**_headers(), "Content-Type": "application/json"},
        json={"patient_id": PATIENT_ID},
    )

    assert response.status_code == 200
    assert response.json() == {"access_token": "request-access-token", "expires_in": 300}
    assert "no-store" in response.headers["cache-control"].lower()
    assert response.headers["pragma"].lower() == "no-cache"


async def test_revoked_connection_is_sanitized_and_does_not_refresh(
    managed_client: AsyncClient, managed_context: dict[str, Any]
) -> None:
    managed_context["connection"]["status"] = "revoked"
    response = await managed_client.get(
        f"/api/google-drive/files?patient_id={PATIENT_ID}", headers=_headers()
    )

    assert response.status_code == 403
    assert response.json() == {"error": "GOOGLE_DRIVE_REVOKED"}
    assert not _calls(managed_context, "refresh_access_token")


@pytest.mark.parametrize(
    ("method", "path", "payload"),
    [
        ("post", "/api/google-drive/files", {"patient_id": PATIENT_ID}),
        ("post", "/api/google-drive/files/search", {"patient_id": PATIENT_ID, "query": "x"}),
        ("post", "/api/google-drive/picker-token", {"patient_id": PATIENT_ID}),
        ("post", "/api/google-drive/import-copy", {"patient_id": PATIENT_ID}),
        (
            "put",
            "/api/google-drive/files/file-1",
            {"patient_id": PATIENT_ID},
        ),
        (
            "post",
            "/api/google-drive/workspace/recreate",
            {"operation_id": str(uuid4()), "acknowledge_possible_orphan": False},
        ),
    ],
)
async def test_drive_mutations_require_same_origin_before_side_effects(
    managed_client: AsyncClient,
    managed_context: dict[str, Any],
    method: str,
    path: str,
    payload: dict[str, Any],
) -> None:
    response = await getattr(managed_client, method)(
        path,
        headers={**_headers(origin="https://evil.example"), "Content-Type": "application/json"},
        json=payload,
    )

    assert response.status_code == 403
    assert not _calls(managed_context, "refresh_access_token")
    assert not _calls(managed_context, "create_file")
    assert not _calls(managed_context, "create_folder")


async def test_drive_mutation_rejects_cross_site_fetch_metadata_before_side_effects(
    managed_client: AsyncClient, managed_context: dict[str, Any]
) -> None:
    response = await managed_client.post(
        "/api/google-drive/files/search",
        headers={
            **_headers(),
            "Sec-Fetch-Site": "cross-site",
            "Content-Type": "application/json",
        },
        json={"patient_id": PATIENT_ID, "query": "x"},
    )

    assert response.status_code == 403
    assert not _calls(managed_context, "refresh_access_token")


async def test_drive_mutation_rejects_non_json_body_before_side_effects(
    managed_client: AsyncClient, managed_context: dict[str, Any]
) -> None:
    response = await managed_client.post(
        "/api/google-drive/files/search",
        headers={**_headers(), "Content-Type": "text/plain"},
        content=b"{}",
    )

    assert response.status_code == 403
    assert not _calls(managed_context, "refresh_access_token")


async def test_drive_request_body_limit_runs_before_json_parsing(
    managed_client: AsyncClient, managed_context: dict[str, Any]
) -> None:
    body = b"{" + b"x" * MAX_REQUEST_BYTES + b"}"
    response = await managed_client.post(
        "/api/google-drive/files",
        headers={**_headers(), "Content-Type": "application/json"},
        content=body,
    )

    assert response.status_code == 413
    assert not _calls(managed_context, "refresh_access_token")
    assert not _calls(managed_context, "create_file")


async def test_validation_error_does_not_echo_sensitive_input(
    managed_client: AsyncClient, managed_context: dict[str, Any], caplog
) -> None:
    secret = "clinical-content-never-echo"
    with caplog.at_level(logging.DEBUG):
        response = await managed_client.post(
            "/api/google-drive/files",
            headers={**_headers(), "Content-Type": "application/json"},
            json={
                "patient_id": PATIENT_ID,
                "operation_id": "not-a-uuid",
                "name": secret,
                "content": secret,
            },
        )

    assert response.status_code == 422
    assert secret not in response.text
    assert secret not in caplog.text
    assert not _calls(managed_context, "create_file")


async def test_drive_logs_metadata_only(
    managed_client: AsyncClient, managed_context: dict[str, Any], caplog
) -> None:
    sensitive = {
        "content": "clinical-content-never-log",
        "name": "private-document-name.txt",
        "query": "private search term",
        "token": "request-access-token",
        "source": "source-1",
    }
    with caplog.at_level(logging.DEBUG):
        response = await managed_client.post(
            "/api/google-drive/files/search",
            headers={**_headers(), "Content-Type": "application/json"},
            json={"patient_id": PATIENT_ID, "query": sensitive["query"]},
        )

    assert response.status_code == 200
    for value in sensitive.values():
        assert value not in caplog.text
