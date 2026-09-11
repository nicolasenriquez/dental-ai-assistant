"""
Google Drive OAuth — authorization URL, code exchange, refresh, revoke, scope
verification. The only module that knows OAuth endpoint URLs and token payload
shapes. All network access goes through ``httpx.AsyncClient`` so route handlers
stay non-blocking and tests mock the boundary with respx.

Exchange is never retried: a transient failure raises once (authorization
codes are single-use). Revoke is best-effort: exactly one request, never
raises, never retried.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import httpx

from backend import config

# httpx logs full request URLs at INFO; the OAuth callback URL carries the
# one-shot authorization code. Suppress request lines so credentials never
# reach application logs (log-safety invariant).
logging.getLogger("httpx").setLevel(logging.WARNING)

DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file"
FOLDER_NAME = "Dental AI Assistant"

_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_TOKEN_URL = "https://oauth2.googleapis.com/token"
_REVOKE_URL = "https://oauth2.googleapis.com/revoke"

_TIMEOUT = httpx.Timeout(connect=5.0, read=15.0, write=20.0, pool=5.0)


class GoogleDriveOAuthError(Exception):
    """Stable domain error; ``access_token`` is attached for best-effort revoke."""

    def __init__(self, code: str, message: str, *, access_token: str | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.access_token = access_token


@dataclass(frozen=True)
class TokenResponse:
    access_token: str
    refresh_token: str
    scopes: frozenset[str] | None  # None = omitted -> unchanged requested scope


def build_authorization_url(state: str, login_hint: str | None = None) -> str:
    """Backend-built provider URL with exact drive.file consent parameters."""
    params: dict[str, str] = {
        "client_id": config.GOOGLE_DRIVE_CLIENT_ID,
        "redirect_uri": config.GOOGLE_DRIVE_OAUTH_REDIRECT_URI,
        "response_type": "code",
        "scope": DRIVE_SCOPE,
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "false",
        "state": state,
    }
    if login_hint:
        params["login_hint"] = login_hint
    return f"{_AUTH_URL}?{urlencode(params)}"


def _parse_scopes(body: dict[str, Any]) -> frozenset[str] | None:
    if "scope" not in body:
        return None
    granted = frozenset(body["scope"].split())
    if DRIVE_SCOPE not in granted:
        raise GoogleDriveOAuthError(
            "GOOGLE_DRIVE_SCOPE_MISSING",
            "granted scopes do not include drive.file",
            access_token=body.get("access_token"),
        )
    if granted != frozenset({DRIVE_SCOPE}):
        raise GoogleDriveOAuthError(
            "GOOGLE_DRIVE_SCOPE_UNEXPECTED",
            "granted scopes exceed exact drive.file",
            access_token=body.get("access_token"),
        )
    return granted


async def exchange_code(code: str) -> TokenResponse:
    """Exchange a single-use authorization code. Never retried."""
    payload = {
        "code": code,
        "client_id": config.GOOGLE_DRIVE_CLIENT_ID,
        "client_secret": config.GOOGLE_DRIVE_CLIENT_SECRET,
        "redirect_uri": config.GOOGLE_DRIVE_OAUTH_REDIRECT_URI,
        "grant_type": "authorization_code",
    }
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.post(_TOKEN_URL, data=payload)
    except httpx.HTTPError as exc:
        raise GoogleDriveOAuthError("GOOGLE_DRIVE_PROVIDER_ERROR", "token exchange failed") from exc
    if response.status_code != 200:
        raise GoogleDriveOAuthError("GOOGLE_DRIVE_PROVIDER_ERROR", "token exchange failed")
    body: dict[str, Any] = response.json()
    scopes = _parse_scopes(body)
    refresh_token = body.get("refresh_token")
    if not refresh_token:
        raise GoogleDriveOAuthError(
            "GOOGLE_DRIVE_SCOPE_MISSING",
            "token response omitted refresh token",
            access_token=body.get("access_token"),
        )
    return TokenResponse(
        access_token=body["access_token"],
        refresh_token=refresh_token,
        scopes=scopes,
    )


async def refresh_access_token(refresh_token: str) -> TokenResponse:
    """Request-local access-token refresh. Bounded retry lives in callers."""
    payload = {
        "client_id": config.GOOGLE_DRIVE_CLIENT_ID,
        "client_secret": config.GOOGLE_DRIVE_CLIENT_SECRET,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        response = await client.post(_TOKEN_URL, data=payload)
    if response.status_code != 200:
        raise GoogleDriveOAuthError("GOOGLE_DRIVE_PROVIDER_ERROR", "token refresh failed")
    body: dict[str, Any] = response.json()
    return TokenResponse(
        access_token=body["access_token"],
        refresh_token=refresh_token,
        scopes=frozenset(body["scope"].split()) if "scope" in body else None,
    )


async def revoke_token(token: str) -> None:
    """Best-effort revoke: exactly one request, never raises, never retried."""
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            await client.post(_REVOKE_URL, data={"token": token})
    except Exception:
        return None
