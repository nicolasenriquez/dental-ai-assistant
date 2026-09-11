"""
Fail-first contract tests for the authenticated Drive OAuth routes (task 2.1).

Expected to FAIL (red) until task 2.2 lands ``routes/google_drive.py``,
``db/google_drive_repo.py``, and the OAuth/Drive integrations. Seam contract for
implementers:

- ``GET /api/google-drive/status`` (Dental session required), returns
  ``{"configured": bool, "status": "unconfigured|disconnected|connected|revoked", ...}``;
  active connections report ``connected`` plus ``workspace.folder_name``.
- ``POST /api/google-drive/oauth/start`` is the ONLY start contract (GET -> 405).
  Requires Dental session, same-origin request context, and configured Drive
  (``503 GOOGLE_DRIVE_NOT_CONFIGURED`` otherwise). Returns exactly
  ``{"authorization_url": "https://accounts.google.com/..."}`` and sets an
  HttpOnly/Secure/SameSite=lax ``google_drive_oauth_state`` cookie scoped to the
  callback path with Max-Age=600. In ``AUTH_MODE=google`` the expected email is
  read server-side via ``users_repo.get_google_identity(user_id)``; missing
  identity returns ``409 GOOGLE_DRIVE_ACCOUNT_MISMATCH`` with no transaction.
- ``GET /api/google-drive/oauth/callback`` (browser transport): invalid
  security state (missing/mismatched/expired/replayed/wrong user/wrong session)
  returns sanitized ``400 GOOGLE_DRIVE_OAUTH_STATE_INVALID`` BEFORE code
  exchange; handled outcomes return ``303 See Other`` to the fixed
  ``config.GOOGLE_DRIVE_RETURN_URL`` with ONLY
  ``result=connected|consent_denied|account_mismatch|provider_error``. The
  callback never returns HTTP 409 and clears the state cookie on every
  terminal path.
- ``POST /api/google-drive/disconnect`` requires session + same-origin context,
  best-effort revokes, ALWAYS clears local credentials, and is idempotent.
- Repo seam (``db.google_drive_repo``, referenced through the module so tests
  can patch): ``get_connection``, ``create_active_connection``,
  ``replace_active_connection``, ``set_disconnected``, ``set_revoked``,
  ``create_oauth_transaction``, ``get_oauth_transaction``,
  ``claim_oauth_transaction`` (atomic one-shot claim).
- Access tokens are request-local: never passed to the repository and never
  logged. The cipher contract is pinned in ``test_drive_token_cipher.py``.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any, cast
from urllib.parse import parse_qs, urlparse
from uuid import UUID

import httpx
import pytest
from httpx import ASGITransport, AsyncClient

DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file"

USER_ID = "11111111-1111-1111-1111-111111111111"
USER_ID_B = "22222222-2222-2222-2222-222222222222"

_ORIGIN_HEADERS = {"Origin": "https://testserver"}
_STATE_COOKIE = "google_drive_oauth_state"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def drive_config(monkeypatch):
    from backend import config

    monkeypatch.setattr(config, "AUTH_MODE", "local", raising=False)
    monkeypatch.setattr(
        config, "GOOGLE_DRIVE_CLIENT_ID", "drive-client.apps.googleusercontent.com", raising=False
    )
    monkeypatch.setattr(config, "GOOGLE_DRIVE_CLIENT_SECRET", "drive-secret", raising=False)
    monkeypatch.setattr(
        config,
        "GOOGLE_DRIVE_OAUTH_REDIRECT_URI",
        "https://testserver/api/google-drive/oauth/callback",
        raising=False,
    )
    monkeypatch.setattr(
        config, "GOOGLE_DRIVE_RETURN_URL", "https://testserver/assistant", raising=False
    )
    monkeypatch.setattr(
        config, "GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEYS", {"1": bytes(range(32))}, raising=False
    )
    monkeypatch.setattr(config, "GOOGLE_DRIVE_TOKEN_ACTIVE_KEY_VERSION", "1", raising=False)
    monkeypatch.setattr(config, "GOOGLE_DRIVE_CONFIGURED", True, raising=False)
    monkeypatch.setattr(config, "APP_ORIGINS", ["https://testserver"], raising=False)


@pytest.fixture
def google_mode(monkeypatch):
    from backend import config

    monkeypatch.setattr(config, "AUTH_MODE", "google", raising=False)
    monkeypatch.setattr(
        config, "GOOGLE_CLIENT_ID", "gis-client.apps.googleusercontent.com", raising=False
    )


def _user_row(uid: str, email: str) -> dict[str, Any]:
    return {"id": uid, "email": email, "is_member": False}


@pytest.fixture(autouse=True)
def fake_users(monkeypatch):
    """In-memory users + google identity snapshot patched over users_repo."""
    from backend.db import users_repo

    identity = {"email": None}  # provider_email_snapshot for USER_ID when set

    async def get_user_by_id(user_id):
        uid = str(user_id)
        if uid == USER_ID:
            return _user_row(USER_ID, "ana@gmail.com")
        if uid == USER_ID_B:
            return _user_row(USER_ID_B, "bob@gmail.com")
        return None

    async def get_google_identity(user_id):
        if str(user_id) == USER_ID and identity["email"]:
            return {
                "user_id": USER_ID,
                "provider": "google",
                "provider_subject": "sub-1",
                "provider_email_snapshot": identity["email"],
            }
        return None

    monkeypatch.setattr(users_repo, "get_user_by_id", get_user_by_id)
    monkeypatch.setattr(users_repo, "get_google_identity", get_google_identity, raising=False)
    return identity


@pytest.fixture(autouse=True)
def fake_drive_repo(monkeypatch):
    """In-memory connection/transaction store patched over google_drive_repo.

    Persistence SQL invariants (unique rows, checked statuses, atomic claim) are
    proven against the real migration in task 2.4; this double pins route
    orchestration — what the routes persist, clear, and preserve.
    """
    from backend.db import google_drive_repo as repo_mod
    from backend.routes import google_drive as route_mod

    state: dict[str, Any] = {"connections": {}, "transactions": {}, "calls": []}

    async def get_connection(user_id):
        row = state["connections"].get(str(user_id))
        return dict(row) if row else None

    async def create_active_connection(user_id, **kwargs):
        row = {"user_id": str(user_id), "status": "active", **kwargs}
        state["connections"][str(user_id)] = row
        state["calls"].append(("create_active_connection", str(user_id), dict(kwargs)))
        return dict(row)

    async def replace_active_connection(user_id, **kwargs):
        old = state["connections"].get(str(user_id)) or {}
        row = {**old, "user_id": str(user_id), "status": "active", **kwargs}
        state["connections"][str(user_id)] = row
        state["calls"].append(("replace_active_connection", str(user_id), dict(kwargs)))
        return dict(row)

    async def _to_terminal(user_id, status: str):
        row = state["connections"].get(str(user_id))
        if row is None:
            return None
        row["status"] = status
        row["refresh_token_ciphertext"] = None
        row["refresh_token_nonce"] = None
        row["token_key_version"] = None
        row["granted_scopes"] = []
        row["pending_folder_operation_id"] = None
        state["calls"].append((f"set_{status}", str(user_id)))
        return dict(row)

    async def set_disconnected(user_id):
        return await _to_terminal(user_id, "disconnected")

    async def set_revoked(user_id):
        return await _to_terminal(user_id, "revoked")

    async def create_oauth_transaction(**kwargs):
        state_hash = kwargs["state_hash"]
        row = {**kwargs, "used_at": None}
        state["transactions"][state_hash] = row
        state["calls"].append(("create_oauth_transaction", state_hash))
        return dict(row)

    async def get_oauth_transaction(state_hash):
        row = state["transactions"].get(state_hash)
        return dict(row) if row else None

    async def claim_oauth_transaction(state_hash):
        row = state["transactions"].get(state_hash)
        if row is None or row["used_at"] is not None:
            return None
        row["used_at"] = "now"
        state["calls"].append(("claim_oauth_transaction", state_hash))
        return dict(row)

    fns = {
        "get_connection": get_connection,
        "create_active_connection": create_active_connection,
        "replace_active_connection": replace_active_connection,
        "set_disconnected": set_disconnected,
        "set_revoked": set_revoked,
        "create_oauth_transaction": create_oauth_transaction,
        "get_oauth_transaction": get_oauth_transaction,
        "claim_oauth_transaction": claim_oauth_transaction,
    }
    for name, fn in fns.items():
        monkeypatch.setattr(repo_mod, name, fn, raising=False)
        monkeypatch.setattr(route_mod, name, fn, raising=False)
    return state


@pytest.fixture(autouse=True)
def fake_google_integrations(monkeypatch):
    """Configurable fakes for the OAuth/Drive integrations at the route seam."""
    import types

    from backend.integrations import google_drive as drive_mod
    from backend.integrations import google_drive_oauth as oauth_mod
    from backend.routes import google_drive as route_mod

    box: dict[str, Any] = {
        "login_hints": [],
        "exchange_codes": [],
        "revoked": [],
        "about_calls": [],
        "folder_calls": [],
        "token_result": types.SimpleNamespace(
            access_token="access-token-xyz",
            refresh_token="refresh-token-xyz",
            scopes=frozenset({DRIVE_SCOPE}),
        ),
        "token_error": None,
        "about_result": ("gid-1", "ana@gmail.com"),
        "revoke_error": None,
    }

    async def build_authorization_url(state, login_hint=None):
        from urllib.parse import urlencode

        box["login_hints"].append(login_hint)
        params = {
            "client_id": "drive-client.apps.googleusercontent.com",
            "response_type": "code",
            "redirect_uri": "https://testserver/api/google-drive/oauth/callback",
            "scope": DRIVE_SCOPE,
            "access_type": "offline",
            "prompt": "consent",
            "include_granted_scopes": "false",
            "state": state,
        }
        if login_hint:
            params["login_hint"] = login_hint
        return "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)

    async def exchange_code(code):
        box["exchange_codes"].append(code)
        if box["token_error"] is not None:
            raise box["token_error"]
        return box["token_result"]

    async def revoke_token(token):
        if box["revoke_error"] is not None:
            raise box["revoke_error"]
        box["revoked"].append(token)

    async def about_user_email(access_token):
        box["about_calls"].append(access_token)
        return box["about_result"]

    async def create_folder(access_token, *, name, operation_id):
        box["folder_calls"].append(
            {"access_token": access_token, "name": name, "operation_id": operation_id}
        )
        return {"id": "folder-1", "name": name}

    fns = {
        "build_authorization_url": build_authorization_url,
        "exchange_code": exchange_code,
        "revoke_token": revoke_token,
        "about_user_email": about_user_email,
        "create_folder": create_folder,
    }
    for name, fn in fns.items():
        monkeypatch.setattr(oauth_mod, name, fn, raising=False)
        monkeypatch.setattr(drive_mod, name, fn, raising=False)
        monkeypatch.setattr(route_mod, name, fn, raising=False)
    return box


@pytest.fixture
async def client():
    from backend.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport, base_url="https://testserver", follow_redirects=False
    ) as c:
        yield c


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _session_token(user_id: str, offset: float = 0.0) -> str:
    """Signed Dental session token; offset makes two tokens byte-distinct."""
    from backend.auth import tokens as tokens_mod

    original = tokens_mod.time.time
    tokens_mod.time.time = lambda: original() + offset
    try:
        return cast(str, tokens_mod.encode_token(user_id))
    finally:
        tokens_mod.time.time = original


def _auth_headers(
    user_id: str = USER_ID, offset: float = 0.0, origin: bool = True
) -> dict[str, str]:
    headers = {"Cookie": f"session={_session_token(user_id, offset)}"}
    if origin:
        headers.update(_ORIGIN_HEADERS)
    return headers


def _state_from_response(r: httpx.Response) -> str:
    for header in r.headers.get_list("set-cookie"):
        if header.startswith(_STATE_COOKIE):
            return header.split(";")[0].split("=", 1)[1]
    raise AssertionError(
        f"{_STATE_COOKIE} cookie not present in {r.headers.get_list('set-cookie')}"
    )


def _assert_state_cookie_cleared(r) -> None:
    cleared = [
        h
        for h in r.headers.get_list("set-cookie")
        if h.startswith(_STATE_COOKIE) and ("Max-Age=0" in h or "expires=Thu, 01 Jan 1970" in h)
    ]
    assert cleared, "state cookie was not cleared"


def _seed_active_connection(state: dict, refresh_token: bytes = b"rt-plaintext") -> dict:
    from backend.auth import token_cipher

    ct = token_cipher.encrypt(USER_ID, token_cipher.PURPOSE_REFRESH_TOKEN, refresh_token)
    row = {
        "user_id": USER_ID,
        "google_account_id": "gid-1",
        "refresh_token_ciphertext": ct.ciphertext,
        "refresh_token_nonce": ct.nonce,
        "token_key_version": ct.key_version,
        "binding_secret_ciphertext": b"bs-ct",
        "binding_secret_nonce": b"0" * 12,
        "binding_key_version": "1",
        "granted_scopes": [DRIVE_SCOPE],
        "folder_id": "folder-old",
        "folder_name": "Dental AI Assistant",
        "folder_creation_operation_id": "folder-op-old",
        "pending_folder_operation_id": None,
        "status": "active",
    }
    state["connections"][USER_ID] = row
    return row


async def _start_oauth(client, headers: dict[str, str]):
    return await client.post("/api/google-drive/oauth/start", headers=headers)


# ---------------------------------------------------------------------------
# GET /api/google-drive/status
# ---------------------------------------------------------------------------


async def test_status_requires_dental_session(client):
    r = await client.get("/api/google-drive/status")
    assert r.status_code == 401


async def test_status_unconfigured_reports_configured_false(client, monkeypatch):
    from backend import config

    monkeypatch.setattr(config, "GOOGLE_DRIVE_CONFIGURED", False, raising=False)
    r = await client.get("/api/google-drive/status", headers=_auth_headers())
    assert r.status_code == 200
    assert r.json() == {"configured": False, "status": "unconfigured"}


async def test_status_connected_reports_workspace(client, fake_drive_repo):
    _seed_active_connection(fake_drive_repo)
    r = await client.get("/api/google-drive/status", headers=_auth_headers())
    assert r.status_code == 200
    body = r.json()
    assert body["configured"] is True
    assert body["status"] == "connected"
    assert body["workspace"] == {"folder_name": "Dental AI Assistant"}
    assert "folder_id" not in str(body)  # folder identity is never public


@pytest.mark.parametrize("status", ["disconnected", "revoked"])
async def test_status_maps_terminal_rows(client, fake_drive_repo, status):
    row = _seed_active_connection(fake_drive_repo)
    row["status"] = status
    r = await client.get("/api/google-drive/status", headers=_auth_headers())
    assert r.status_code == 200
    assert r.json()["status"] == status


# ---------------------------------------------------------------------------
# POST /api/google-drive/oauth/start
# ---------------------------------------------------------------------------


async def test_start_requires_dental_session(client, fake_drive_repo):
    r = await client.post("/api/google-drive/oauth/start", headers=_ORIGIN_HEADERS)
    assert r.status_code == 401
    assert fake_drive_repo["transactions"] == {}


async def test_start_unconfigured_returns_503(client, monkeypatch, fake_drive_repo):
    from backend import config

    monkeypatch.setattr(config, "GOOGLE_DRIVE_CONFIGURED", False, raising=False)
    r = await _start_oauth(client, _auth_headers())
    assert r.status_code == 503
    assert r.json()["error"] == "GOOGLE_DRIVE_NOT_CONFIGURED"
    assert fake_drive_repo["transactions"] == {}


async def test_start_rejects_missing_origin(client, fake_drive_repo):
    r = await _start_oauth(client, _auth_headers(origin=False))
    assert r.status_code == 403
    assert fake_drive_repo["transactions"] == {}


async def test_start_rejects_foreign_origin(client, fake_drive_repo):
    headers = _auth_headers()
    headers["Origin"] = "https://evil.example"
    r = await _start_oauth(client, headers)
    assert r.status_code == 403
    assert fake_drive_repo["transactions"] == {}


async def test_start_has_no_get_fallback(client):
    r = await client.get("/api/google-drive/oauth/start", headers=_auth_headers())
    assert r.status_code == 405


async def test_start_local_mode_returns_backend_url_without_login_hint(
    client, fake_drive_repo, fake_google_integrations, fake_users
):
    fake_users["email"] = "ana@gmail.com"  # ignored in local mode
    r = await _start_oauth(client, _auth_headers())

    assert r.status_code == 200
    assert set(r.json()) == {"authorization_url"}

    url = r.json()["authorization_url"]
    qs = parse_qs(urlparse(url).query)
    assert qs["scope"] == [DRIVE_SCOPE]
    assert qs["access_type"] == ["offline"]
    assert qs["prompt"] == ["consent"]
    assert qs["include_granted_scopes"] == ["false"]
    assert "login_hint" not in qs
    assert fake_google_integrations["login_hints"] == [None]

    raw_state = qs["state"][0]
    cookie_state = _state_from_response(r)
    assert cookie_state == raw_state

    txn_hash, txn = next(iter(fake_drive_repo["transactions"].items()))
    assert txn_hash != raw_state.encode()  # only the state hash is persisted
    assert len(txn_hash) == 32
    assert txn["user_id"] == USER_ID
    assert txn["expected_google_email"] is None
    assert len(txn["session_fingerprint"]) == 32
    assert isinstance(txn["folder_operation_id"], str | UUID)
    expires_in = (txn["expires_at"] - datetime.now(UTC)).total_seconds()
    assert 590 <= expires_in <= 610


async def test_start_state_cookie_is_httponly_secure_lax_and_short_lived(client):
    r = await _start_oauth(client, _auth_headers())
    set_cookie = r.headers.get_list("set-cookie")
    assert len(set_cookie) >= 1
    assert any(_STATE_COOKIE in h for h in set_cookie)
    state_cookie = next(h for h in set_cookie if h.startswith(_STATE_COOKIE))
    assert "HttpOnly" in state_cookie
    assert "Secure" in state_cookie
    assert "SameSite=lax" in state_cookie
    assert "Max-Age=600" in state_cookie
    assert "Path=/api/google-drive/oauth/callback" in state_cookie


async def test_start_google_mode_binds_expected_email_and_login_hint(
    client, google_mode, fake_drive_repo, fake_google_integrations, fake_users
):
    fake_users["email"] = "ana@gmail.com"
    r = await _start_oauth(client, _auth_headers())

    assert r.status_code == 200
    qs = parse_qs(urlparse(r.json()["authorization_url"]).query)
    assert qs["login_hint"] == ["ana@gmail.com"]
    assert fake_google_integrations["login_hints"] == ["ana@gmail.com"]

    txn = next(iter(fake_drive_repo["transactions"].values()))
    assert txn["expected_google_email"] == "ana@gmail.com"


async def test_start_google_mode_without_identity_returns_409(
    client, google_mode, fake_drive_repo, fake_google_integrations, fake_users
):
    fake_users["email"] = None
    r = await _start_oauth(client, _auth_headers())
    assert r.status_code == 409
    assert r.json()["error"] == "GOOGLE_DRIVE_ACCOUNT_MISMATCH"
    assert fake_drive_repo["transactions"] == {}
    assert _STATE_COOKIE not in "".join(r.headers.get_list("set-cookie"))


# ---------------------------------------------------------------------------
# GET /api/google-drive/oauth/callback — invalid security state
# ---------------------------------------------------------------------------


async def _callback(client, session_token: str, raw_state: str, query: str = "code=code-1"):
    cookie = f"session={session_token}; {_STATE_COOKIE}={raw_state}"
    return await client.get(f"/api/google-drive/oauth/callback?{query}", headers={"Cookie": cookie})


async def test_callback_missing_state_returns_400_before_exchange(client, fake_google_integrations):
    r = await client.get(
        "/api/google-drive/oauth/callback?code=code-1",
        headers={"Cookie": f"session={_session_token(USER_ID)}"},
    )
    assert r.status_code == 400
    assert r.json()["error"] == "GOOGLE_DRIVE_OAUTH_STATE_INVALID"
    assert fake_google_integrations["exchange_codes"] == []
    _assert_state_cookie_cleared(r)


async def test_callback_state_cookie_mismatch_returns_400(client, fake_google_integrations):
    start_r = await _start_oauth(client, _auth_headers())
    _state_from_response(start_r)  # real cookie state
    r = await _callback(client, _session_token(USER_ID), "wrong-state-value")
    assert r.status_code == 400
    assert r.json()["error"] == "GOOGLE_DRIVE_OAUTH_STATE_INVALID"
    assert fake_google_integrations["exchange_codes"] == []


async def test_callback_unknown_state_returns_400(
    client, fake_drive_repo, fake_google_integrations
):
    r = await _callback(client, _session_token(USER_ID), "never-created-state")
    assert r.status_code == 400
    assert r.json()["error"] == "GOOGLE_DRIVE_OAUTH_STATE_INVALID"
    assert fake_google_integrations["exchange_codes"] == []


async def test_callback_expired_state_returns_400(
    client, fake_drive_repo, fake_google_integrations
):
    start_r = await _start_oauth(client, _auth_headers())
    raw_state = _state_from_response(start_r)
    txn = next(iter(fake_drive_repo["transactions"].values()))
    txn["expires_at"] = txn["expires_at"] - timedelta(seconds=1000)

    r = await _callback(client, _session_token(USER_ID), raw_state)
    assert r.status_code == 400
    assert r.json()["error"] == "GOOGLE_DRIVE_OAUTH_STATE_INVALID"
    assert fake_google_integrations["exchange_codes"] == []


async def test_callback_wrong_user_returns_400(client, fake_google_integrations):
    start_r = await _start_oauth(client, _auth_headers())
    raw_state = _state_from_response(start_r)
    r = await _callback(client, _session_token(USER_ID_B), raw_state)
    assert r.status_code == 400
    assert r.json()["error"] == "GOOGLE_DRIVE_OAUTH_STATE_INVALID"
    assert fake_google_integrations["exchange_codes"] == []


async def test_callback_wrong_session_fingerprint_returns_400(client, fake_google_integrations):
    start_r = await _start_oauth(client, _auth_headers(USER_ID, offset=0.0))
    raw_state = _state_from_response(start_r)
    different_session = _session_token(USER_ID, offset=5.0)  # same user, other session
    r = await _callback(client, different_session, raw_state)
    assert r.status_code == 400
    assert r.json()["error"] == "GOOGLE_DRIVE_OAUTH_STATE_INVALID"
    assert fake_google_integrations["exchange_codes"] == []


async def test_callback_replayed_state_returns_400(
    client, fake_drive_repo, fake_google_integrations
):
    start_r = await _start_oauth(client, _auth_headers())
    raw_state = _state_from_response(start_r)
    session_token = _session_token(USER_ID)

    first = await _callback(client, session_token, raw_state)
    assert first.status_code == 303  # consumed once

    second = await _callback(client, session_token, raw_state)
    assert second.status_code == 400
    assert second.json()["error"] == "GOOGLE_DRIVE_OAUTH_STATE_INVALID"
    assert fake_google_integrations["exchange_codes"] == ["code-1"]  # not exchanged twice


# ---------------------------------------------------------------------------
# GET /api/google-drive/oauth/callback — handled outcomes
# ---------------------------------------------------------------------------


async def _started_state(client):
    start_r = await _start_oauth(client, _auth_headers())
    return _state_from_response(start_r)


async def test_callback_success_redirects_connected_and_persists_encrypted_connection(
    client, fake_drive_repo, fake_google_integrations
):
    raw_state = await _started_state(client)
    r = await _callback(client, _session_token(USER_ID), raw_state)

    assert r.status_code == 303
    assert r.headers["location"] == "https://testserver/assistant?result=connected"
    _assert_state_cookie_cleared(r)

    assert fake_google_integrations["exchange_codes"] == ["code-1"]
    assert fake_google_integrations["about_calls"] == ["access-token-xyz"]

    txn = next(iter(fake_drive_repo["transactions"].values()))
    assert txn["used_at"] is not None  # one-shot claim before exchange

    row = fake_drive_repo["connections"][USER_ID]
    assert row["status"] == "active"
    assert row["google_account_id"] == "gid-1"
    assert row["refresh_token_ciphertext"] is not None
    assert row["granted_scopes"] == [DRIVE_SCOPE]
    assert row["folder_id"] == "folder-1"
    assert row["folder_creation_operation_id"] == txn["folder_operation_id"]
    assert fake_google_integrations["folder_calls"] == [
        {
            "access_token": "access-token-xyz",
            "name": "Dental AI Assistant",
            "operation_id": txn["folder_operation_id"],
        }
    ]
    assert "access-token-xyz" not in str(row)  # access tokens are request-local


async def test_callback_missing_refresh_token_returns_provider_error_without_persistence(
    client, fake_drive_repo, fake_google_integrations
):
    fake_google_integrations["token_result"].refresh_token = None
    raw_state = await _started_state(client)

    r = await _callback(client, _session_token(USER_ID), raw_state)
    assert r.status_code == 303
    assert r.headers["location"] == "https://testserver/assistant?result=provider_error"
    assert fake_drive_repo["connections"] == {}
    assert fake_google_integrations["folder_calls"] == []


async def test_callback_exchange_failure_returns_provider_error_without_persistence(
    client, fake_drive_repo, fake_google_integrations
):
    fake_google_integrations["token_error"] = RuntimeError("exchange failed")
    raw_state = await _started_state(client)

    r = await _callback(client, _session_token(USER_ID), raw_state)
    assert r.status_code == 303
    assert r.headers["location"] == "https://testserver/assistant?result=provider_error"
    assert fake_drive_repo["connections"] == {}
    assert fake_google_integrations["about_calls"] == []


async def test_callback_scope_error_revokes_returned_credential_and_persists_nothing(
    client, fake_drive_repo, fake_google_integrations
):
    # Raising a non-Exception (e.g. SimpleNamespace) would be converted to
    # TypeError by CPython and lose the attached code/access_token; use a real
    # exception carrying the same contract attributes as the real
    # GoogleDriveOAuthError.
    class _ScopeError(Exception):
        pass

    err = _ScopeError("scope error")
    err.code = "GOOGLE_DRIVE_SCOPE_UNEXPECTED"
    err.access_token = "returned-access-token"
    fake_google_integrations["token_error"] = err
    raw_state = await _started_state(client)

    r = await _callback(client, _session_token(USER_ID), raw_state)
    assert r.status_code == 303
    assert r.headers["location"] == "https://testserver/assistant?result=provider_error"
    assert fake_google_integrations["revoked"] == ["returned-access-token"]
    assert fake_drive_repo["connections"] == {}


async def test_callback_consent_denied_returns_303_consent_denied(client, fake_google_integrations):
    raw_state = await _started_state(client)
    r = await _callback(
        client, _session_token(USER_ID), raw_state, query=f"state={raw_state}&error=access_denied"
    )
    assert r.status_code == 303
    assert r.headers["location"] == "https://testserver/assistant?result=consent_denied"
    assert fake_google_integrations["exchange_codes"] == []
    _assert_state_cookie_cleared(r)


async def test_callback_provider_error_param_returns_303_provider_error(
    client, fake_google_integrations
):
    raw_state = await _started_state(client)
    r = await _callback(
        client, _session_token(USER_ID), raw_state, query=f"state={raw_state}&error=server_error"
    )
    assert r.status_code == 303
    assert r.headers["location"] == "https://testserver/assistant?result=provider_error"
    assert fake_google_integrations["exchange_codes"] == []


async def test_callback_google_mode_account_mismatch_preserves_prior_connection(
    client,
    google_mode,
    fake_drive_repo,
    fake_google_integrations,
    fake_users,
):
    fake_users["email"] = "ana@gmail.com"
    fake_google_integrations["about_result"] = ("gid-2", "someone.else@gmail.com")
    prior = _seed_active_connection(fake_drive_repo)
    raw_state = await _started_state(client)

    r = await _callback(client, _session_token(USER_ID), raw_state)
    assert r.status_code == 303
    assert r.headers["location"] == "https://testserver/assistant?result=account_mismatch"
    assert fake_google_integrations["revoked"] == ["access-token-xyz"]  # best-effort revoke
    assert fake_google_integrations["folder_calls"] == []  # no workspace
    assert fake_drive_repo["connections"][USER_ID] == prior  # prior connection untouched
    connection_writes = [
        name
        for name, *_ in fake_drive_repo["calls"]
        if name in ("create_active_connection", "replace_active_connection")
    ]
    assert connection_writes == []


async def test_callback_google_mode_account_mismatch_without_prior_connection_persists_nothing(
    client, google_mode, fake_drive_repo, fake_google_integrations, fake_users
):
    fake_users["email"] = "ana@gmail.com"
    fake_google_integrations["about_result"] = ("gid-2", "someone.else@gmail.com")
    raw_state = await _started_state(client)

    r = await _callback(client, _session_token(USER_ID), raw_state)
    assert r.status_code == 303
    assert r.headers["location"] == "https://testserver/assistant?result=account_mismatch"
    assert fake_drive_repo["connections"] == {}
    assert fake_google_integrations["folder_calls"] == []


async def test_callback_local_mode_allows_explicit_account_change(
    client, fake_drive_repo, fake_google_integrations
):
    prior = _seed_active_connection(fake_drive_repo)
    fake_google_integrations["about_result"] = ("gid-9", "anyone@gmail.com")
    raw_state = await _started_state(client)

    r = await _callback(client, _session_token(USER_ID), raw_state)
    assert r.status_code == 303
    assert r.headers["location"] == "https://testserver/assistant?result=connected"

    row = fake_drive_repo["connections"][USER_ID]
    assert row["google_account_id"] == "gid-9"
    assert row["folder_id"] != prior["folder_id"]  # old folder identity cleared
    assert row["binding_secret_ciphertext"] != prior["binding_secret_ciphertext"]


async def test_callback_reconnect_same_account_preserves_folder_identity(
    client, fake_drive_repo, fake_google_integrations
):
    prior = _seed_active_connection(fake_drive_repo)
    prior["status"] = "disconnected"
    fake_google_integrations["about_result"] = ("gid-1", "ana@gmail.com")
    raw_state = await _started_state(client)

    r = await _callback(client, _session_token(USER_ID), raw_state)
    assert r.status_code == 303
    assert r.headers["location"] == "https://testserver/assistant?result=connected"
    assert fake_drive_repo["connections"][USER_ID]["folder_id"] == prior["folder_id"]


async def test_callback_transport_matrix_never_returns_409(
    client, google_mode, fake_drive_repo, fake_google_integrations, fake_users
):
    """Task 2.5 contract: handled outcomes → 303 with ONLY the allowlisted
    result; invalid security state → sanitized 400 before exchange; the
    browser callback never emits HTTP 409 (reserved for same-origin JSON)."""
    fake_users["email"] = "ana@gmail.com"
    outcomes: dict[str, tuple[int, str]] = {}

    raw_state = await _started_state(client)
    r = await _callback(client, _session_token(USER_ID), raw_state)
    outcomes["connected"] = (r.status_code, r.headers["location"])

    fake_google_integrations["about_result"] = ("gid-9", "someone.else@gmail.com")
    raw_state = await _started_state(client)
    r = await _callback(client, _session_token(USER_ID), raw_state)
    outcomes["account_mismatch"] = (r.status_code, r.headers["location"])
    fake_google_integrations["about_result"] = ("gid-1", "ana@gmail.com")

    raw_state = await _started_state(client)
    r = await _callback(
        client, _session_token(USER_ID), raw_state, query=f"state={raw_state}&error=access_denied"
    )
    outcomes["consent_denied"] = (r.status_code, r.headers["location"])

    raw_state = await _started_state(client)
    r = await _callback(
        client, _session_token(USER_ID), raw_state, query=f"state={raw_state}&error=server_error"
    )
    outcomes["provider_error"] = (r.status_code, r.headers["location"])

    raw_state = await _started_state(client)
    r = await _callback(client, _session_token(USER_ID), "bogus-state-value")
    outcomes["invalid_state"] = (r.status_code, r.headers.get("location", ""))
    assert r.json()["error"] == "GOOGLE_DRIVE_OAUTH_STATE_INVALID"
    assert fake_google_integrations["exchange_codes"] == ["code-1", "code-1"]  # success + mismatch

    for name in ("connected", "account_mismatch", "consent_denied", "provider_error"):
        status_code, location = outcomes[name]
        assert status_code == 303
        assert location == f"https://testserver/assistant?result={name}"

    assert outcomes["invalid_state"][0] == 400
    assert all(status_code != 409 for status_code, _ in outcomes.values())


# ---------------------------------------------------------------------------
# POST /api/google-drive/disconnect
# ---------------------------------------------------------------------------


async def test_disconnect_requires_session(client):
    r = await client.post("/api/google-drive/disconnect", headers=_ORIGIN_HEADERS)
    assert r.status_code == 401


async def test_disconnect_rejects_foreign_origin(client):
    headers = _auth_headers()
    headers["Origin"] = "https://evil.example"
    r = await client.post("/api/google-drive/disconnect", headers=headers)
    assert r.status_code == 403


async def test_disconnect_clears_local_connection(
    client, fake_drive_repo, fake_google_integrations
):
    _seed_active_connection(fake_drive_repo)
    r = await client.post("/api/google-drive/disconnect", headers=_auth_headers())

    assert r.status_code == 200
    assert r.json() == {"status": "disconnected"}

    row = fake_drive_repo["connections"][USER_ID]
    assert row["status"] == "disconnected"
    assert row["refresh_token_ciphertext"] is None
    assert row["token_key_version"] is None
    assert row["granted_scopes"] == []
    assert row["folder_id"] == "folder-old"  # folder identity retained for reconnect
    assert row["binding_secret_ciphertext"] == b"bs-ct"  # binding secret retained


async def test_disconnect_clears_locally_even_when_remote_revoke_fails(
    client, fake_drive_repo, fake_google_integrations
):
    _seed_active_connection(fake_drive_repo)
    fake_google_integrations["revoke_error"] = RuntimeError("revoke failed")

    r = await client.post("/api/google-drive/disconnect", headers=_auth_headers())
    assert r.status_code == 200
    assert fake_drive_repo["connections"][USER_ID]["status"] == "disconnected"


async def test_disconnect_is_idempotent(client, fake_drive_repo, fake_google_integrations):
    r = await client.post("/api/google-drive/disconnect", headers=_auth_headers())
    assert r.status_code == 200
    assert r.json() == {"status": "disconnected"}
    assert fake_google_integrations["revoked"] == []  # nothing to revoke


# ---------------------------------------------------------------------------
# Log safety
# ---------------------------------------------------------------------------


async def test_drive_credentials_never_reach_logs(
    client, fake_drive_repo, fake_google_integrations, caplog
):
    import logging

    raw_state = await _started_state(client)
    with caplog.at_level(logging.DEBUG):
        await _callback(client, _session_token(USER_ID), raw_state)

        fake_google_integrations["token_error"] = RuntimeError("exchange failed")
        raw_state_2 = await _started_state(client)
        await _callback(client, _session_token(USER_ID), raw_state_2)

    assert "access-token-xyz" not in caplog.text
    assert "refresh-token-xyz" not in caplog.text
    assert "code-1" not in caplog.text
    assert "drive-secret" not in caplog.text
