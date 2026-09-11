"""
Google Drive REST adapter — Drive API endpoint URLs and request fields.

Owns the Drive REST surface: account confirmation (``about.get``), folder
creation with exact application markers, managed-file list/search/read/
create/update, and the deterministic Markdown-to-plain-text exporter.
OAuth token exchange/refresh/revoke stay in ``google_drive_oauth``. Network
access goes through ``httpx.AsyncClient`` so respx mocks the boundary.

Bounding: reads retry at most twice on transient failures (network, timeout,
429, 5xx) with backoff and jitter; writes are one HTTP request — ambiguous
outcomes are reconciled by the route through operation markers, never by a
blind retry. Every media download stops at 1 MiB regardless of metadata.
"""

from __future__ import annotations

import asyncio
import json
import random
import re
from typing import Any
from uuid import uuid4

import httpx

_ABOUT_URL = "https://www.googleapis.com/drive/v3/about"
_FILES_URL = "https://www.googleapis.com/drive/v3/files"
_UPLOAD_FILES_URL = "https://www.googleapis.com/upload/drive/v3/files"
_FOLDER_MIME = "application/vnd.google-apps.folder"

MANAGED_BY = "dental-ai-assistant"
WORKSPACE_SCHEMA = "1"
MAX_CONTENT_BYTES = 1_048_576  # 1 MiB persisted media cap

_FOLDER_FIELDS = "id,name,mimeType,trashed,appProperties"
_FILE_FIELDS = "id,name,mimeType,modifiedTime,version,size,parents,trashed,appProperties"

_TIMEOUT = httpx.Timeout(connect=5.0, read=15.0, write=20.0, pool=5.0)
_MAX_READ_RETRIES = 2


class GoogleDriveError(Exception):
    """Stable Drive domain error; callers map it to sanitized HTTP."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def _headers(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}


def _escape_query(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")


def _error_for_status(status_code: int) -> GoogleDriveError:
    if status_code == 401:
        return GoogleDriveError("GOOGLE_DRIVE_UNAUTHORIZED", "Drive authorization failed")
    if status_code == 403:
        return GoogleDriveError("GOOGLE_DRIVE_ACCESS_DENIED", "Drive access denied")
    if status_code == 404:
        return GoogleDriveError("GOOGLE_DRIVE_NOT_FOUND", "Drive resource not found")
    return GoogleDriveError("DRIVE_UNAVAILABLE", "Drive unavailable")


async def _read(client: httpx.AsyncClient, method: str, url: str, **kwargs: Any) -> httpx.Response:
    """GET-style request with at most two transient retries and jittered backoff."""
    attempt = 0
    while True:
        try:
            response = await client.request(method, url, **kwargs)
        except httpx.HTTPError:
            response = None
        if response is None or response.status_code == 429 or response.status_code >= 500:
            if attempt >= _MAX_READ_RETRIES:
                raise GoogleDriveError("DRIVE_UNAVAILABLE", "Drive unavailable")
            attempt += 1
            await asyncio.sleep(0.5 * (2**attempt) + random.uniform(0, 0.25))
            continue
        return response


def _multipart_upload_meta(app_properties: dict[str, str]) -> dict[str, Any]:
    return {
        "mimeType": "text/plain",
        "appProperties": app_properties,
    }


async def about_user_email(access_token: str) -> tuple[str, str]:
    """Drive account confirmation: (permission_id, normalized email).

    Requests EXACTLY ``fields=user(permissionId,emailAddress)`` — the only
    identity material the connection boundary needs.
    """
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        response = await client.get(
            _ABOUT_URL,
            params={"fields": "user(permissionId,emailAddress)"},
            headers=_headers(access_token),
        )
    if response.status_code != 200:
        raise GoogleDriveError("GOOGLE_DRIVE_ABOUT_FAILED", "about.get failed")
    user: dict[str, Any] = (response.json() or {}).get("user") or {}
    permission_id = user.get("permissionId") or ""
    email = (user.get("emailAddress") or "").strip().lower()
    return permission_id, email


async def get_folder(access_token: str, folder_id: str) -> dict[str, Any] | None:
    """Fetch one folder's authoritative metadata. None when Google says 404."""
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        response = await _read(
            client,
            "GET",
            f"{_FILES_URL}/{folder_id}",
            params={"fields": _FOLDER_FIELDS},
            headers=_headers(access_token),
        )
    if response.status_code == 404:
        return None
    if response.status_code != 200:
        raise _error_for_status(response.status_code)
    return dict(response.json())


async def find_folder_by_creation_operation(
    access_token: str, operation_id: str
) -> list[dict[str, Any]]:
    """Reconcile an ambiguous folder create by its exact operation marker.

    Never adopts folders by name; the query is marker-scoped only.
    """
    query = (
        "trashed = false"
        f" and mimeType = '{_FOLDER_MIME}'"
        f" and appProperties has {{ key='managedBy' and value='{MANAGED_BY}' }}"
        f" and appProperties has {{ key='workspaceSchema' and value='{WORKSPACE_SCHEMA}' }}"
        " and appProperties has { key='creationOperationId' and value="
        f"'{_escape_query(operation_id)}' }}"
    )
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        response = await _read(
            client,
            "GET",
            _FILES_URL,
            params={"q": query, "fields": f"files({_FOLDER_FIELDS})"},
            headers=_headers(access_token),
        )
    if response.status_code != 200:
        raise _error_for_status(response.status_code)
    return list((response.json() or {}).get("files") or [])


async def get_file_metadata(access_token: str, file_id: str) -> dict[str, Any]:
    """Fetch only the fields managed-file validation needs."""
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        response = await _read(
            client,
            "GET",
            f"{_FILES_URL}/{file_id}",
            params={"fields": _FILE_FIELDS},
            headers=_headers(access_token),
        )
    if response.status_code != 200:
        raise _error_for_status(response.status_code)
    return dict(response.json())


def _scoped_files_query(
    folder_id: str, patient_ref: str | None = None, name_query: str | None = None
) -> str:
    parts = [
        f"'{_escape_query(folder_id)}' in parents",
        "trashed = false",
        f"appProperties has {{ key='managedBy' and value='{MANAGED_BY}' }}",
        f"appProperties has {{ key='workspaceSchema' and value='{WORKSPACE_SCHEMA}' }}",
    ]
    if patient_ref:
        parts.append(
            f"appProperties has {{ key='patientRef' and value='{_escape_query(patient_ref)}' }}"
        )
    if name_query:
        parts.append(f"name contains '{_escape_query(name_query)}'")
    return " and ".join(parts)


async def list_files(
    access_token: str,
    *,
    folder_id: str,
    patient_ref: str,
    page_token: str | None = None,
    name_query: str | None = None,
) -> dict[str, Any]:
    """Patient-scoped metadata listing with opaque cursor pagination."""
    params: dict[str, str] = {
        "q": _scoped_files_query(folder_id, patient_ref, name_query),
        "pageSize": "100",
        "orderBy": "modifiedTime desc,name",
        "fields": f"nextPageToken,files({_FILE_FIELDS})",
    }
    if page_token:
        params["pageToken"] = page_token
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        response = await _read(
            client, "GET", _FILES_URL, params=params, headers=_headers(access_token)
        )
    if response.status_code == 400:
        raise GoogleDriveError("DRIVE_PAGE_TOKEN_INVALID", "Drive page token rejected")
    if response.status_code != 200:
        raise _error_for_status(response.status_code)
    data = response.json() or {}
    return {"files": list(data.get("files") or []), "next_page_token": data.get("nextPageToken")}


async def find_file_by_creation_operation(
    access_token: str, operation_id: str
) -> dict[str, Any] | None:
    """Reconcile one ambiguous file create by its exact operation marker."""
    query = (
        "trashed = false"
        " and appProperties has { key='creationOperationId' and value="
        f"'{_escape_query(operation_id)}' }}"
    )
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        response = await _read(
            client,
            "GET",
            _FILES_URL,
            params={"q": query, "fields": f"files({_FILE_FIELDS})"},
            headers=_headers(access_token),
        )
    if response.status_code != 200:
        raise _error_for_status(response.status_code)
    files = list((response.json() or {}).get("files") or [])
    return files[0] if files else None


async def download_file(access_token: str, file_id: str) -> bytes:
    """Stream one file body with a 1 MiB hard stop and strict UTF-8 decoding."""
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        response = await _read(
            client,
            "GET",
            f"{_FILES_URL}/{file_id}",
            params={"alt": "media"},
            headers=_headers(access_token),
        )
    if response.status_code != 200:
        raise _error_for_status(response.status_code)
    chunks: list[bytes] = []
    total = 0
    async for chunk in response.aiter_bytes(65536):
        total += len(chunk)
        if total > MAX_CONTENT_BYTES:
            raise GoogleDriveError("DRIVE_FILE_TOO_LARGE", "Drive file exceeds 1 MiB")
        chunks.append(chunk)
    content = b"".join(chunks)
    try:
        content.decode("utf-8")
    except UnicodeDecodeError:
        raise GoogleDriveError(
            "DRIVE_FILE_ENCODING_INVALID", "Drive file is not valid UTF-8"
        ) from None
    return content


def _upload_body(metadata: dict[str, Any], content: bytes) -> tuple[bytes, str]:
    boundary = f"dynachat-{uuid4().hex}"
    prefix = (
        f"--{boundary}\r\n"
        "Content-Type: application/json; charset=UTF-8\r\n\r\n"
        f"{json.dumps(metadata)}\r\n"
        f"--{boundary}\r\n"
        "Content-Type: text/plain\r\n\r\n"
    ).encode()
    body = prefix + content + f"\r\n--{boundary}--\r\n".encode("ascii")
    return body, f"multipart/related; boundary={boundary}"


async def _write(
    access_token: str, method: str, url: str, metadata: dict[str, Any], content: bytes
) -> dict[str, Any]:
    """One write request — never retried; ambiguous outcomes belong to the route."""
    body, content_type = _upload_body(metadata, content)
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        response = await client.request(
            method,
            url,
            params={"uploadType": "multipart"},
            headers={**_headers(access_token), "Content-Type": content_type},
            content=body,
        )
    if response.status_code != 200:
        raise _error_for_status(response.status_code)
    return dict(response.json())


async def create_folder(access_token: str, *, name: str, operation_id: str) -> dict[str, Any]:
    """Create the authoritative managed folder with exact markers.

    ``creationOperationId`` is set exactly to the caller-stable operation UUID
    so ambiguous creates can be reconciled later.
    """
    body = {
        "name": name,
        "mimeType": _FOLDER_MIME,
        "appProperties": {
            "managedBy": MANAGED_BY,
            "workspaceSchema": WORKSPACE_SCHEMA,
            "creationOperationId": str(operation_id),
        },
    }
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        response = await client.post(_FILES_URL, json=body, headers=_headers(access_token))
    if response.status_code != 200:
        raise GoogleDriveError("GOOGLE_DRIVE_FOLDER_CREATE_FAILED", "folder create failed")
    return dict(response.json())


async def create_file(
    access_token: str,
    *,
    folder_id: str,
    name: str,
    content: bytes,
    app_properties: dict[str, str],
) -> dict[str, Any]:
    """Create one ``text/plain`` file under the managed folder with markers."""
    metadata = {
        **_multipart_upload_meta(app_properties),
        "name": name,
        "parents": [folder_id],
    }
    return await _write(access_token, "POST", _UPLOAD_FILES_URL, metadata, content)


async def update_file(
    access_token: str,
    *,
    file_id: str,
    content: bytes,
    app_properties: dict[str, str],
) -> dict[str, Any]:
    """Update media plus application markers in one PATCH request."""
    return await _write(
        access_token,
        "PATCH",
        f"{_UPLOAD_FILES_URL}/{file_id}",
        _multipart_upload_meta(app_properties),
        content,
    )


# ---------------------------------------------------------------------------
# Deterministic Markdown-to-plain-text export (shared contract with frontend)
# ---------------------------------------------------------------------------

_STRONG_RE = re.compile(r"(\*\*|__)(.+?)\1")
_EMPH_RE = re.compile(r"(?<![\w*])([*_])([^\s*_](?:[^*_]*?[^\s*_])?)\1(?!\w)")
_LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)\s]+)\)")
_AUTOLINK_RE = re.compile(r"<((?:https?://|mailto:)[^>]+)>")
_CODE_SPAN_RE = re.compile(r"`+([^`]+)`+")
_HTML_TAG_RE = re.compile(r"<[^>]*>")
_HEADING_RE = re.compile(r"^#{1,6}\s+")
_BLOCKQUOTE_RE = re.compile(r"^>+\s?")
_BULLET_RE = re.compile(r"^(\s*)[-*+]\s+(.*)$")
_FENCE_OPEN_RE = re.compile(r"^(```+|~~~+)")

_EMPTY_LINE_RE = re.compile(r"\n{3,}")


def _inline_transform(text: str) -> str:
    text = _STRONG_RE.sub(r"\2", text)
    text = _EMPH_RE.sub(r"\2", text)
    text = _LINK_RE.sub(r"\1 (\2)", text)
    text = _AUTOLINK_RE.sub(r"\1", text)
    text = _CODE_SPAN_RE.sub(r"\1", text)
    text = _HTML_TAG_RE.sub("", text)
    return text


def serialize_markdown_to_plain_text(text: str) -> str:
    """Deterministic Markdown -> clean plain text.

    Strips heading/emphasis/backtick/blockquote/fence delimiters, renders
    readable bullets, keeps link destinations, removes HTML tags without an
    executable path, normalizes CRLF, collapses 3+ newlines to 2, trims
    trailing horizontal whitespace, and ends with exactly one LF.
    """
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    lines: list[str] = []
    in_fence = False
    for line in normalized.split("\n"):
        stripped = line.rstrip()
        if in_fence:
            if _FENCE_OPEN_RE.match(stripped):
                in_fence = False
            else:
                lines.append(stripped)
            continue
        if _FENCE_OPEN_RE.match(stripped):
            in_fence = True
            continue
        stripped = _BLOCKQUOTE_RE.sub("", stripped)
        stripped = _HEADING_RE.sub("", stripped)
        bullet = _BULLET_RE.match(stripped)
        if bullet:
            stripped = f"{bullet.group(1)}• {bullet.group(2)}"
        lines.append(_inline_transform(stripped))
    joined = _EMPTY_LINE_RE.sub("\n\n", "\n".join(lines))
    return joined.rstrip("\n") + "\n"
