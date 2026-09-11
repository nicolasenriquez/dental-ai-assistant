"""
Fail-first integration tests for the Google Drive OAuth / Drive adapters (task 2.1).

Expected to FAIL (red) until task 2.2 lands ``integrations/google_drive_oauth.py``
and ``integrations/google_drive.py``. Seam contract for implementers:

- ``google_drive_oauth.build_authorization_url(state, login_hint=None) -> str``:
  reads ``config.GOOGLE_DRIVE_CLIENT_ID`` / ``config.GOOGLE_DRIVE_OAUTH_REDIRECT_URI``
  at call time; exact scope ``https://www.googleapis.com/auth/drive.file``,
  ``response_type=code``, ``access_type=offline``, ``prompt=consent``,
  ``include_granted_scopes=false``, backend-generated ``state``, optional
  backend-generated ``login_hint``.
- ``google_drive_oauth.exchange_code(code) -> TokenResponse`` where
  ``TokenResponse`` is a frozen dataclass with ``access_token: str``,
  ``refresh_token: str``, ``scopes: frozenset[str] | None``.
  - Omitted token-response ``scope`` means unchanged requested scope -> ``None``.
  - Explicit scope set must equal exactly ``{drive.file}``; missing
    ``drive.file`` or a missing refresh token raises an error with
    ``code == "GOOGLE_DRIVE_SCOPE_MISSING"``; any extra scope raises
    ``code == "GOOGLE_DRIVE_SCOPE_UNEXPECTED"``.
  - Authorization-code exchange is NEVER retried (transient failure raises and
    makes exactly one HTTP request).
- ``google_drive_oauth.revoke_token(token)``: best-effort, exactly one HTTP
  request, never raises, never retried.
- ``google_drive.about_user_email(access_token) -> tuple[str, str]``: GET
  ``drive/v3/about`` with EXACTLY ``fields=user(permissionId,emailAddress)``;
  returns ``(permission_id, normalized_email)``; non-200 raises.
- ``google_drive.create_folder(access_token, *, name, operation_id) -> dict``:
  POST ``drive/v3/files`` with folder MIME and exact
  ``appProperties.managedBy == "dental-ai-assistant"``,
  ``workspaceSchema == "1"``, ``creationOperationId == str(operation_id)``.

All Google HTTP calls go through ``httpx.AsyncClient`` so ``respx`` mocks the
boundary; adapters never hit the network in tests.
"""

from __future__ import annotations

import json

import httpx
import pytest
import respx

from backend import config

DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file"

_TOKEN_URL = "https://oauth2.googleapis.com/token"
_REVOKE_URL = "https://oauth2.googleapis.com/revoke"
_ABOUT_URL = "https://www.googleapis.com/drive/v3/about"
_FILES_URL = "https://www.googleapis.com/drive/v3/files"


@pytest.fixture(autouse=True)
def drive_config(monkeypatch):
    monkeypatch.setattr(
        config, "GOOGLE_DRIVE_CLIENT_ID", "drive-client.apps.googleusercontent.com", raising=False
    )
    monkeypatch.setattr(config, "GOOGLE_DRIVE_CLIENT_SECRET", "drive-client-secret", raising=False)
    monkeypatch.setattr(
        config,
        "GOOGLE_DRIVE_OAUTH_REDIRECT_URI",
        "https://chat.dynamous.ai/api/google-drive/oauth/callback",
        raising=False,
    )


def _oauth_mod():
    from backend.integrations import google_drive_oauth

    return google_drive_oauth


def _drive_mod():
    from backend.integrations import google_drive

    return google_drive


# ---------------------------------------------------------------------------
# Authorization URL construction
# ---------------------------------------------------------------------------


def test_authorization_url_has_exact_oauth_params():
    from urllib.parse import parse_qs, urlparse

    mod = _oauth_mod()
    url = mod.build_authorization_url("raw-state-value")
    parsed = urlparse(url)
    assert parsed.scheme == "https"
    assert parsed.netloc == "accounts.google.com"

    qs = parse_qs(parsed.query)
    assert qs["response_type"] == ["code"]
    assert qs["client_id"] == ["drive-client.apps.googleusercontent.com"]
    assert qs["redirect_uri"] == ["https://chat.dynamous.ai/api/google-drive/oauth/callback"]
    assert qs["scope"] == [DRIVE_SCOPE]  # exact, single scope
    assert qs["access_type"] == ["offline"]
    assert qs["prompt"] == ["consent"]
    assert qs["include_granted_scopes"] == ["false"]
    assert qs["state"] == ["raw-state-value"]
    assert "login_hint" not in qs


def test_authorization_url_includes_backend_login_hint_when_provided():
    from urllib.parse import parse_qs, urlparse

    url = _oauth_mod().build_authorization_url("state", login_hint="ana@gmail.com")
    assert parse_qs(urlparse(url).query)["login_hint"] == ["ana@gmail.com"]


# ---------------------------------------------------------------------------
# Authorization-code exchange
# ---------------------------------------------------------------------------


def _token_payload(**overrides) -> dict:
    payload = {
        "access_token": "access-token-xyz",
        "refresh_token": "refresh-token-xyz",
        "token_type": "Bearer",
        "expires_in": 3599,
        "scope": DRIVE_SCOPE,
    }
    payload.update(overrides)
    return payload


@respx.mock
async def test_exchange_code_returns_refresh_token_and_exact_scope():
    mod = _oauth_mod()
    route = respx.post(_TOKEN_URL).mock(return_value=httpx.Response(200, json=_token_payload()))

    result = await mod.exchange_code("auth-code-123")

    assert result.access_token == "access-token-xyz"
    assert result.refresh_token == "refresh-token-xyz"
    assert result.scopes == frozenset({DRIVE_SCOPE})

    body = route.calls.last.request.content.decode()
    assert "code=auth-code-123" in body
    assert "grant_type=authorization_code" in body
    assert "client_id=drive-client.apps.googleusercontent.com" in body
    assert "client_secret=drive-client-secret" in body


@respx.mock
async def test_exchange_omitted_scope_means_unchanged_requested_scope():
    mod = _oauth_mod()
    payload = _token_payload()
    del payload["scope"]
    respx.post(_TOKEN_URL).mock(return_value=httpx.Response(200, json=payload))

    result = await mod.exchange_code("code")
    assert result.scopes is None


@respx.mock
async def test_exchange_scope_missing_drive_file_raises_scope_missing():
    mod = _oauth_mod()
    payload = _token_payload(scope="https://www.googleapis.com/auth/userinfo.email")
    respx.post(_TOKEN_URL).mock(return_value=httpx.Response(200, json=payload))

    with pytest.raises(Exception) as exc_info:
        await mod.exchange_code("code")
    assert exc_info.value.code == "GOOGLE_DRIVE_SCOPE_MISSING"


@respx.mock
async def test_exchange_missing_refresh_token_raises_scope_missing():
    mod = _oauth_mod()
    payload = _token_payload()
    del payload["refresh_token"]
    respx.post(_TOKEN_URL).mock(return_value=httpx.Response(200, json=payload))

    with pytest.raises(Exception) as exc_info:
        await mod.exchange_code("code")
    assert exc_info.value.code == "GOOGLE_DRIVE_SCOPE_MISSING"


@respx.mock
async def test_exchange_unexpected_scope_raises_scope_unexpected():
    mod = _oauth_mod()
    payload = _token_payload(scope=f"{DRIVE_SCOPE} https://www.googleapis.com/auth/drive")
    respx.post(_TOKEN_URL).mock(return_value=httpx.Response(200, json=payload))

    with pytest.raises(Exception) as exc_info:
        await mod.exchange_code("code")
    assert exc_info.value.code == "GOOGLE_DRIVE_SCOPE_UNEXPECTED"


@respx.mock
async def test_exchange_code_transient_failure_is_never_retried():
    mod = _oauth_mod()
    route = respx.post(_TOKEN_URL).mock(return_value=httpx.Response(500, text="boom"))

    with pytest.raises(Exception):
        await mod.exchange_code("code")

    assert route.call_count == 1


@respx.mock
async def test_exchange_code_network_error_is_never_retried():
    mod = _oauth_mod()
    route = respx.post(_TOKEN_URL).mock(side_effect=httpx.ConnectError("no route"))

    with pytest.raises(Exception):
        await mod.exchange_code("code")

    assert route.call_count == 1


# ---------------------------------------------------------------------------
# Revoke (best-effort, never retried, never raises)
# ---------------------------------------------------------------------------


@respx.mock
async def test_revoke_succeeds_without_raising():
    mod = _oauth_mod()
    route = respx.post(_REVOKE_URL).mock(return_value=httpx.Response(200, json={}))
    assert await mod.revoke_token("some-access-token") is None
    assert route.call_count == 1


@respx.mock
async def test_revoke_transient_failure_is_silent_and_never_retried():
    mod = _oauth_mod()
    route = respx.post(_REVOKE_URL).mock(return_value=httpx.Response(500, text="boom"))
    assert await mod.revoke_token("some-access-token") is None
    assert route.call_count == 1


# ---------------------------------------------------------------------------
# Drive about.get — post-exchange account confirmation
# ---------------------------------------------------------------------------


@respx.mock
async def test_about_user_email_requests_exact_fields():
    mod = _drive_mod()
    route = respx.get(_ABOUT_URL).mock(
        return_value=httpx.Response(
            200, json={"user": {"permissionId": "1234567890", "emailAddress": "Ana@gmail.com"}}
        )
    )

    permission_id, email = await mod.about_user_email("access-token-xyz")

    assert permission_id == "1234567890"
    assert email == "ana@gmail.com"  # normalized
    fields = route.calls.last.request.url.params["fields"]
    assert fields == "user(permissionId,emailAddress)"


@respx.mock
async def test_about_user_email_non_200_raises():
    mod = _drive_mod()
    respx.get(_ABOUT_URL).mock(return_value=httpx.Response(401, text="nope"))
    with pytest.raises(Exception):
        await mod.about_user_email("expired-token")


# ---------------------------------------------------------------------------
# Drive first-folder creation
# ---------------------------------------------------------------------------


@respx.mock
async def test_create_folder_sends_exact_name_mime_and_operation_markers():
    mod = _drive_mod()
    route = respx.post(_FILES_URL).mock(
        return_value=httpx.Response(200, json={"id": "folder-1", "name": "Dental AI Assistant"})
    )

    folder = await mod.create_folder(
        "access-token-xyz", name="Dental AI Assistant", operation_id="op-1"
    )

    assert folder["id"] == "folder-1"
    body = json.loads(route.calls.last.request.content.decode())
    assert body["name"] == "Dental AI Assistant"
    assert body["mimeType"] == "application/vnd.google-apps.folder"
    assert body["appProperties"] == {
        "managedBy": "dental-ai-assistant",
        "workspaceSchema": "1",
        "creationOperationId": "op-1",
    }
