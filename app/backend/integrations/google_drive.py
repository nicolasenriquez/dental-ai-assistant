"""
Google Drive REST adapter — Drive API endpoint URLs and request fields.

Owns only the Drive REST surface: account confirmation (``about.get``), folder
creation with exact application markers, and (Phase 4) managed-file operations.
OAuth token exchange/refresh/revoke stay in ``google_drive_oauth``. Network
access goes through ``httpx.AsyncClient`` so respx mocks the boundary.
"""

from __future__ import annotations

from typing import Any

import httpx

_ABOUT_URL = "https://www.googleapis.com/drive/v3/about"
_FILES_URL = "https://www.googleapis.com/drive/v3/files"
_FOLDER_MIME = "application/vnd.google-apps.folder"

_MANAGED_BY = "dental-ai-assistant"
_WORKSPACE_SCHEMA = "1"

_TIMEOUT = httpx.Timeout(connect=5.0, read=15.0, write=20.0, pool=5.0)


class GoogleDriveError(Exception):
    """Stable Drive domain error; callers map it to sanitized HTTP."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def _headers(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}


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


async def create_folder(access_token: str, *, name: str, operation_id: str) -> dict[str, Any]:
    """Create the authoritative managed folder with exact markers.

    ``creationOperationId`` is set exactly to the caller-stable operation UUID
    so ambiguous creates can be reconciled later.
    """
    body = {
        "name": name,
        "mimeType": _FOLDER_MIME,
        "appProperties": {
            "managedBy": _MANAGED_BY,
            "workspaceSchema": _WORKSPACE_SCHEMA,
            "creationOperationId": str(operation_id),
        },
    }
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        response = await client.post(_FILES_URL, json=body, headers=_headers(access_token))
    if response.status_code != 200:
        raise GoogleDriveError("GOOGLE_DRIVE_FOLDER_CREATE_FAILED", "folder create failed")
    return dict(response.json())
