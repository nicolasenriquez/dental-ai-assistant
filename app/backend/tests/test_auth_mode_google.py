"""
Fail-first contract tests for Google authentication and AUTH_MODE (task 1.1).

These tests pin the Phase 1 contract before the implementation exists; they are
expected to FAIL (red) until tasks 1.3/1.4 land. Seam contract for implementers:

- ``config.AUTH_MODE``: exactly ``"local"`` or ``"google"``; invalid values raise
  ``RuntimeError`` at config import. Defaults to ``"local"``. Google mode requires a
  non-empty ``config.GOOGLE_CLIENT_ID``.
- ``config.APP_ORIGINS``: list of exact allowed application origins consumed by the
  GIS same-origin JSON request-context guard.
- ``routes.auth.verify_google_id_token(credential)`` -> claims dict. Raises
  ``ValueError`` on invalid claims or provider failure (maps to
  ``401 GOOGLE_IDENTITY_INVALID``). Route-level policy applies authoritative-email
  and identity mapping afterwards.
- ``users_repo.create_federated_user(email)`` inserts ``password_hash=NULL``;
  ``users_repo.create_local_user(email, password_hash)`` inserts a real hash.
  ``users_repo.find_identity(provider, provider_subject)`` /
  ``users_repo.create_identity(...)`` own provider-identity persistence.
- Stable error payloads carry an ``"error"`` code
  (e.g. ``{"error": "AUTH_PROVIDER_DISABLED"}``).

Concurrent-identity uniqueness is exercised through the ``auth_identities``
migration constraint tests in task 1.3; HTTP-level reuse is covered here.
"""

from __future__ import annotations

import importlib
import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

os.environ.setdefault("JWT_SECRET", "test-secret-please-do-not-use-in-prod")
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")


def _reload_config():
    from backend import config

    return importlib.reload(config)


# ---------------------------------------------------------------------------
# Fakes — same in-memory repository pattern as test_auth.py
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def fake_users_repo(monkeypatch):
    """In-memory users + auth_identities store patched over users_repo."""
    from backend.db import users_repo

    store: dict[str, dict[str, Any]] = {}
    identities: dict[tuple[str, str], dict[str, Any]] = {}

    def _user_row(uid: str, email: str, password_hash: str | None) -> dict[str, Any]:
        return {
            "id": uid,
            "email": email,
            "password_hash": password_hash,
            "created_at": None,
            "last_login_at": None,
            "is_member": False,
            "member_verified_at": None,
        }

    async def _insert_user(email: str, password_hash: str | None) -> dict[str, Any]:
        import asyncpg

        email_lower = email.lower()
        if any(str(u["email"]).lower() == email_lower for u in store.values()):
            raise asyncpg.UniqueViolationError("duplicate email")
        uid = str(uuid4())
        store[uid] = _user_row(uid, email, password_hash)
        return {k: v for k, v in store[uid].items() if k != "password_hash"}

    async def create_user(email: str, password_hash: str, **kwargs: Any) -> dict[str, Any]:
        return await _insert_user(email, password_hash)

    async def create_local_user(email: str, password_hash: str, **kwargs: Any) -> dict[str, Any]:
        assert password_hash, "create_local_user requires a real password hash"
        return await _insert_user(email, password_hash)

    async def create_federated_user(email: str, **kwargs: Any) -> dict[str, Any]:
        return await _insert_user(email, None)

    async def get_user_by_email(email: str) -> dict[str, Any] | None:
        email_lower = email.lower()
        for u in store.values():
            if str(u["email"]).lower() == email_lower:
                return dict(u)
        return None

    async def get_user_by_id(user_id: Any) -> dict[str, Any] | None:
        u = store.get(str(user_id))
        if not u:
            return None
        return {k: v for k, v in u.items() if k != "password_hash"}

    async def update_last_login(user_id: Any) -> None:
        u = store.get(str(user_id))
        if u:
            u["last_login_at"] = "now"

    async def set_member_status(user_id: Any, *, is_member: bool, **kwargs: Any) -> None:
        from datetime import UTC, datetime

        u = store.get(str(user_id))
        if u:
            u["is_member"] = is_member
            u["member_verified_at"] = datetime.now(UTC)

    async def find_identity(
        provider: str, provider_subject: str, **kwargs: Any
    ) -> dict[str, Any] | None:
        row = identities.get((provider, provider_subject))
        return dict(row) if row else None

    async def create_identity(
        user_id: str,
        provider: str,
        provider_subject: str,
        email_snapshot: str,
        **kwargs: Any,
    ) -> dict[str, Any]:
        import asyncpg

        key = (provider, provider_subject)
        if key in identities or any(
            i["user_id"] == user_id and i["provider"] == provider for i in identities.values()
        ):
            raise asyncpg.UniqueViolationError("duplicate identity")
        row = {
            "user_id": user_id,
            "provider": provider,
            "provider_subject": provider_subject,
            "provider_email_snapshot": email_snapshot,
        }
        identities[key] = row
        return row

    async def update_identity_email_snapshot(
        provider: str, provider_subject: str, email_snapshot: str
    ) -> None:
        row = identities.get((provider, provider_subject))
        if row:
            row["provider_email_snapshot"] = email_snapshot

    for name in (
        "create_user",
        "create_local_user",
        "create_federated_user",
        "get_user_by_email",
        "get_user_by_id",
        "update_last_login",
        "set_member_status",
        "find_identity",
        "create_identity",
        "update_identity_email_snapshot",
    ):
        monkeypatch.setattr(users_repo, name, locals()[name], raising=False)

    return {"users": store, "identities": identities}


@pytest.fixture(autouse=True)
def circle_calls(monkeypatch):
    """Fail-closed Circle stub recording verified emails."""
    from backend.integrations import circle as circle_module
    from backend.routes import auth as auth_route

    calls: list[str] = []

    async def fake_verify(email: str) -> bool:
        calls.append(email)
        return False

    monkeypatch.setattr(circle_module, "verify_paid_member", fake_verify)
    monkeypatch.setattr(auth_route.circle, "verify_paid_member", fake_verify)
    return calls


@pytest.fixture
async def client():
    from backend.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="https://testserver") as c:
        yield c


@pytest.fixture
def google_mode(monkeypatch):
    from backend import config as _config

    monkeypatch.setattr(_config, "AUTH_MODE", "google", raising=False)
    monkeypatch.setattr(
        _config, "GOOGLE_CLIENT_ID", "test-client.apps.googleusercontent.com", raising=False
    )
    monkeypatch.setattr(_config, "APP_ORIGINS", ["https://testserver"], raising=False)


def _stub_verifier(monkeypatch, fn):
    from backend.routes import auth as auth_route

    monkeypatch.setattr(auth_route, "verify_google_id_token", fn, raising=False)


# ---------------------------------------------------------------------------
# AUTH_MODE configuration
# ---------------------------------------------------------------------------


def test_default_auth_mode_is_local(monkeypatch):
    monkeypatch.delenv("AUTH_MODE", raising=False)
    try:
        cfg = _reload_config()
        assert cfg.AUTH_MODE == "local"
    finally:
        _reload_config()


def test_invalid_auth_mode_fails_startup(monkeypatch):
    monkeypatch.setenv("AUTH_MODE", "bogus")
    try:
        with pytest.raises(RuntimeError):
            _reload_config()
    finally:
        monkeypatch.delenv("AUTH_MODE", raising=False)
        _reload_config()


def test_google_mode_requires_client_configuration(monkeypatch):
    monkeypatch.setenv("AUTH_MODE", "google")
    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
    try:
        with pytest.raises(RuntimeError):
            _reload_config()
    finally:
        monkeypatch.delenv("AUTH_MODE", raising=False)
        _reload_config()


# ---------------------------------------------------------------------------
# GET /api/auth/config — safe runtime configuration
# ---------------------------------------------------------------------------


async def test_auth_config_local_mode_exposes_only_safe_fields(client, monkeypatch):
    from backend import config as _config

    monkeypatch.setattr(_config, "AUTH_MODE", "local", raising=False)
    r = await client.get("/api/auth/config")
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"mode", "google_client_id", "drive_enabled", "drive_auto_onboard"}
    assert body["mode"] == "local"
    assert body["google_client_id"] is None


async def test_auth_config_google_mode_exposes_public_client_id(client, google_mode):
    r = await client.get("/api/auth/config")
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "google"
    assert body["google_client_id"] == "test-client.apps.googleusercontent.com"
    assert "secret" not in str(body).lower()


async def test_google_id_token_verifier_receives_google_http_request(monkeypatch, google_mode):
    from backend.routes import auth as auth_route

    calls: dict[str, Any] = {}

    def fake_verify(token: str, request: Any, audience: str) -> dict[str, Any]:
        calls["token"] = token
        calls["request"] = request
        calls["audience"] = audience
        return {"sub": "google-sub", "email": "ana@gmail.com", "email_verified": True}

    from google.oauth2 import id_token as google_id_token

    monkeypatch.setattr(google_id_token, "verify_oauth2_token", fake_verify)

    claims = await auth_route.verify_google_id_token("google-token")

    assert claims["sub"] == "google-sub"
    assert calls["token"] == "google-token"
    assert callable(calls["request"])
    assert calls["audience"] == "test-client.apps.googleusercontent.com"


# ---------------------------------------------------------------------------
# Backend provider enforcement
# ---------------------------------------------------------------------------


async def test_local_mode_disables_google_auth(client):
    r = await client.post("/api/auth/google", json={"credential": "x"})
    assert r.status_code == 404
    assert r.json()["error"] == "AUTH_PROVIDER_DISABLED"
    assert "session" not in r.cookies


async def test_google_mode_disables_local_signup(client, google_mode):
    r = await client.post(
        "/api/auth/signup",
        json={"email": "new@example.com", "password": "password123"},
    )
    assert r.status_code == 404
    assert r.json()["error"] == "AUTH_PROVIDER_DISABLED"
    assert "session" not in r.cookies


async def test_google_mode_disables_local_login(client, google_mode):
    r = await client.post(
        "/api/auth/login",
        json={"email": "new@example.com", "password": "password123"},
    )
    assert r.status_code == 404
    assert r.json()["error"] == "AUTH_PROVIDER_DISABLED"
    assert "session" not in r.cookies


async def test_me_and_logout_remain_available_in_google_mode(client, google_mode):
    me_r = await client.get("/api/auth/me")
    assert me_r.status_code == 401  # enabled route, just unauthenticated
    logout_r = await client.post("/api/auth/logout")
    assert logout_r.status_code == 204


# ---------------------------------------------------------------------------
# POST /api/auth/google — identity, session convergence, finalization
# ---------------------------------------------------------------------------

_VALID_HEADERS = {"Origin": "https://testserver", "Content-Type": "application/json"}


async def test_google_login_establishes_existing_dental_session(
    client, google_mode, fake_users_repo, circle_calls, monkeypatch
):
    async def fake_verify(credential: str) -> dict[str, Any]:
        return {"sub": "google-sub-1", "email": "ana@gmail.com", "email_verified": True}

    _stub_verifier(monkeypatch, fake_verify)

    r = await client.post(
        "/api/auth/google",
        json={"credential": "google-token-abc"},
        headers=_VALID_HEADERS,
    )
    assert r.status_code == 200
    assert r.json()["email"] == "ana@gmail.com"
    assert "session" in r.cookies

    me_r = await client.get("/api/auth/me")
    assert me_r.status_code == 200
    assert me_r.json()["email"] == "ana@gmail.com"

    users = fake_users_repo["users"]
    assert len(users) == 1
    user = next(iter(users.values()))
    assert user["password_hash"] is None  # federated user, no invented credential
    assert user["last_login_at"] == "now"  # shared finalization
    assert user["member_verified_at"] is not None  # shared Circle finalization
    assert circle_calls == ["ana@gmail.com"]
    identity = fake_users_repo["identities"][("google", "google-sub-1")]
    assert identity["user_id"] == user["id"]
    assert identity["provider_email_snapshot"] == "ana@gmail.com"


async def test_google_login_accepts_workspace_identity_with_hd(
    client, google_mode, fake_users_repo, monkeypatch
):
    async def fake_verify(credential: str) -> dict[str, Any]:
        return {
            "sub": "ws-sub-1",
            "email": "doc@dentacare.com",
            "email_verified": True,
            "hd": "dentacare.com",
        }

    _stub_verifier(monkeypatch, fake_verify)

    r = await client.post("/api/auth/google", json={"credential": "tok"}, headers=_VALID_HEADERS)
    assert r.status_code == 200
    assert r.json()["email"] == "doc@dentacare.com"
    assert "session" in r.cookies
    assert ("google", "ws-sub-1") in fake_users_repo["identities"]


async def test_google_login_reuses_existing_identity_mapping(
    client, google_mode, fake_users_repo, monkeypatch
):
    async def fake_verify(credential: str) -> dict[str, Any]:
        email = "first@gmail.com" if credential == "tok-1" else "renamed@gmail.com"
        return {"sub": "stable-sub", "email": email, "email_verified": True}

    _stub_verifier(monkeypatch, fake_verify)

    r1 = await client.post("/api/auth/google", json={"credential": "tok-1"}, headers=_VALID_HEADERS)
    assert r1.status_code == 200
    client.cookies.clear()
    r2 = await client.post("/api/auth/google", json={"credential": "tok-2"}, headers=_VALID_HEADERS)
    assert r2.status_code == 200

    assert len(fake_users_repo["users"]) == 1  # sub is identity, email is snapshot only
    assert r2.json()["email"] == "renamed@gmail.com"


@pytest.mark.parametrize("scope", ["ip", "global"])
async def test_google_signup_guard_only_limits_new_identities(
    client, google_mode, fake_users_repo, monkeypatch, scope
):
    from backend import signup_rate_limit

    attempts = []
    accepted = False

    async def fake_check(ip, conn):
        nonlocal accepted
        if accepted:
            raise signup_rate_limit.SignupRateLimited(scope, "Signup limit reached")

    async def fake_record(conn, ip, email_attempted, outcome):
        nonlocal accepted
        attempts.append((ip, email_attempted, outcome))
        if outcome == "accepted":
            accepted = True

    async def fake_verify(credential: str) -> dict[str, Any]:
        return {"sub": credential, "email": f"{credential}@gmail.com", "email_verified": True}

    monkeypatch.setattr(signup_rate_limit, "check", fake_check)
    monkeypatch.setattr(signup_rate_limit, "record", fake_record)
    _stub_verifier(monkeypatch, fake_verify)

    first = await client.post(
        "/api/auth/google", json={"credential": "first"}, headers=_VALID_HEADERS
    )
    assert first.status_code == 200
    assert attempts == [("127.0.0.1", "first@gmail.com", "accepted")]

    blocked = await client.post(
        "/api/auth/google", json={"credential": "second"}, headers=_VALID_HEADERS
    )
    assert blocked.status_code == 429
    assert blocked.json() == {
        "error": "signup_rate_limited",
        "message": "Signup limit reached",
        "scope": scope,
    }
    assert attempts[-1] == ("127.0.0.1", "second@gmail.com", f"{scope}_limited")
    assert len(fake_users_repo["users"]) == 1

    returning = await client.post(
        "/api/auth/google", json={"credential": "first"}, headers=_VALID_HEADERS
    )
    assert returning.status_code == 200
    assert len(attempts) == 2


async def test_google_concurrent_signup_reuses_winner_at_limit(
    client, google_mode, fake_users_repo, monkeypatch
):
    from backend import signup_rate_limit
    from backend.db import users_repo

    attempts = []

    async def fake_check(ip, conn):
        user = await users_repo.create_federated_user("first@gmail.com", conn=conn)
        await users_repo.create_identity(
            str(user["id"]), "google", "first", "first@gmail.com", conn=conn
        )
        raise signup_rate_limit.SignupRateLimited("ip", "Signup limit reached")

    async def fake_record(conn, ip, email_attempted, outcome):
        attempts.append(outcome)

    async def fake_verify(credential: str) -> dict[str, Any]:
        return {"sub": "first", "email": "first@gmail.com", "email_verified": True}

    monkeypatch.setattr(signup_rate_limit, "check", fake_check)
    monkeypatch.setattr(signup_rate_limit, "record", fake_record)
    _stub_verifier(monkeypatch, fake_verify)

    result = await client.post(
        "/api/auth/google", json={"credential": "first"}, headers=_VALID_HEADERS
    )
    assert result.status_code == 200
    assert len(fake_users_repo["users"]) == 1
    assert attempts == []


@pytest.mark.parametrize("conflict_at", ["create_federated_user", "create_identity"])
@pytest.mark.parametrize("winner_state", ["present", "missing_identity", "missing_user"])
async def test_google_signup_conflict_releases_connection_before_recovery(
    client: AsyncClient,
    google_mode: None,
    fake_users_repo: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
    conflict_at: str,
    winner_state: str,
) -> None:
    import asyncpg

    from backend.db import users_repo
    from backend.routes import auth as auth_route

    events: list[str] = []
    held = False

    class Connection:
        @asynccontextmanager
        async def transaction(self) -> AsyncIterator[None]:
            try:
                yield
            except asyncpg.UniqueViolationError:
                events.append("rollback")
                raise

    class Pool:
        @asynccontextmanager
        async def acquire(self) -> AsyncIterator[Connection]:
            nonlocal held
            assert not held, "nested acquisition would exhaust a single-connection pool"
            held = True
            try:
                yield Connection()
            finally:
                held = False
                events.append("release")

    winner: dict[str, Any] = await users_repo.create_federated_user("first@gmail.com")
    await users_repo.create_identity(winner["id"], "google", "first", "old@gmail.com")
    original_find = users_repo.find_identity
    lookups = 0

    async def find_identity(provider: str, subject: str, **kwargs: Any) -> dict[str, Any] | None:
        nonlocal lookups
        lookups += 1
        if lookups == 1:
            return None  # The winner was not yet visible at the initial lookup.
        assert not held
        assert events == ["rollback", "release"]
        if winner_state == "missing_identity":
            return None
        if winner_state == "missing_user":
            fake_users_repo["users"].clear()
        identity: dict[str, Any] | None = await original_find(provider, subject, **kwargs)
        return identity

    async def no_email_match(email: str) -> None:
        return None

    async def conflict(*args: Any, **kwargs: Any) -> None:
        raise asyncpg.UniqueViolationError("concurrent signup")

    async def provisional_user(*args: Any, **kwargs: Any) -> dict[str, Any]:
        return winner

    async def verify(credential: str) -> dict[str, Any]:
        return {"sub": "first", "email": "first@gmail.com", "email_verified": True}

    monkeypatch.setattr(auth_route, "get_pg_pool", Pool)
    monkeypatch.setattr(users_repo, "find_identity", find_identity)
    monkeypatch.setattr(users_repo, "get_user_by_email", no_email_match)
    if conflict_at == "create_identity":
        monkeypatch.setattr(users_repo, "create_federated_user", provisional_user)
    monkeypatch.setattr(users_repo, conflict_at, conflict)
    _stub_verifier(monkeypatch, verify)

    result = await client.post(
        "/api/auth/google", json={"credential": "first"}, headers=_VALID_HEADERS
    )
    assert events == ["rollback", "release"]
    if winner_state == "present":
        assert result.status_code == 200
        assert result.json()["id"] == winner["id"]
        assert "session" in result.cookies
        identity = fake_users_repo["identities"][("google", "first")]
        assert identity["provider_email_snapshot"] == "first@gmail.com"
    else:
        assert result.status_code == 401
        assert result.json() == {"error": "GOOGLE_IDENTITY_INVALID"}
        assert "session" not in result.cookies


async def test_google_invalid_claims_return_401(client, google_mode, monkeypatch):
    async def bad_verify(credential: str) -> dict[str, Any]:
        raise ValueError("invalid token")

    _stub_verifier(monkeypatch, bad_verify)

    r = await client.post("/api/auth/google", json={"credential": "x"}, headers=_VALID_HEADERS)
    assert r.status_code == 401
    assert r.json()["error"] == "GOOGLE_IDENTITY_INVALID"
    assert "session" not in r.cookies


async def test_google_unverified_email_returns_401(client, google_mode, monkeypatch):
    async def fake_verify(credential: str) -> dict[str, Any]:
        return {"sub": "sub-2", "email": "ana@gmail.com", "email_verified": False}

    _stub_verifier(monkeypatch, fake_verify)

    r = await client.post("/api/auth/google", json={"credential": "x"}, headers=_VALID_HEADERS)
    assert r.status_code == 401
    assert r.json()["error"] == "GOOGLE_IDENTITY_INVALID"


async def test_google_non_authoritative_email_returns_403(
    client, google_mode, fake_users_repo, circle_calls, monkeypatch
):
    async def fake_verify(credential: str) -> dict[str, Any]:
        return {"sub": "sub-3", "email": "ana@outlook.com", "email_verified": True}

    _stub_verifier(monkeypatch, fake_verify)

    r = await client.post("/api/auth/google", json={"credential": "x"}, headers=_VALID_HEADERS)
    assert r.status_code == 403
    assert r.json()["error"] == "GOOGLE_EMAIL_NOT_AUTHORITATIVE"
    assert "session" not in r.cookies
    assert fake_users_repo["identities"] == {}
    assert circle_calls == []  # no finalization side-effects on rejection


async def test_google_email_collision_returns_409(
    client, google_mode, fake_users_repo, monkeypatch
):
    fake_users_repo["users"]["local-1"] = {
        "id": "local-1",
        "email": "bob@gmail.com",
        "password_hash": "some-hash",
        "created_at": None,
        "last_login_at": None,
        "is_member": False,
        "member_verified_at": None,
    }

    async def fake_verify(credential: str) -> dict[str, Any]:
        return {"sub": "new-google-sub", "email": "bob@gmail.com", "email_verified": True}

    _stub_verifier(monkeypatch, fake_verify)

    r = await client.post("/api/auth/google", json={"credential": "x"}, headers=_VALID_HEADERS)
    assert r.status_code == 409
    assert r.json()["error"] == "GOOGLE_ACCOUNT_LINK_REQUIRED"
    assert "session" not in r.cookies
    assert fake_users_repo["identities"] == {}


# ---------------------------------------------------------------------------
# GIS same-origin JSON request-context guard
# ---------------------------------------------------------------------------


async def test_google_auth_rejects_invalid_request_context_before_verification(
    client, google_mode, monkeypatch
):
    calls: list[str] = []

    async def fake_verify(credential: str) -> dict[str, Any]:
        calls.append(credential)
        return {"sub": "s", "email": "a@gmail.com", "email_verified": True}

    _stub_verifier(monkeypatch, fake_verify)

    r = await client.post("/api/auth/google", json={"credential": "x"})
    assert r.status_code == 403
    assert r.json()["error"] == "GOOGLE_AUTH_REQUEST_INVALID"

    r = await client.post(
        "/api/auth/google",
        json={"credential": "x"},
        headers={"Origin": "https://evil.example", "Content-Type": "application/json"},
    )
    assert r.status_code == 403
    assert r.json()["error"] == "GOOGLE_AUTH_REQUEST_INVALID"

    r = await client.post(
        "/api/auth/google",
        json={"credential": "x"},
        headers={"Origin": "https://testserver", "Content-Type": "text/plain"},
    )
    assert r.status_code == 403

    r = await client.post(
        "/api/auth/google",
        json={"credential": "x"},
        headers={"Origin": "https://testserver", "Sec-Fetch-Site": "cross-site"},
    )
    assert r.status_code == 403

    assert calls == []  # guard rejects before provider verification


# ---------------------------------------------------------------------------
# Log safety
# ---------------------------------------------------------------------------


async def test_google_credentials_never_reach_logs(client, google_mode, monkeypatch, caplog):
    async def fake_verify(credential: str) -> dict[str, Any]:
        return {"sub": "secret-sub-x", "email": "ana@gmail.com", "email_verified": True}

    _stub_verifier(monkeypatch, fake_verify)

    with caplog.at_level(logging.DEBUG):
        await client.post(
            "/api/auth/google",
            json={"credential": "super-secret-token"},
            headers=_VALID_HEADERS,
        )

    assert "super-secret-token" not in caplog.text
    assert "secret-sub-x" not in caplog.text


# ---------------------------------------------------------------------------
# Federated users cannot use local password login
# ---------------------------------------------------------------------------


async def test_null_password_user_gets_generic_401(client, fake_users_repo):
    fake_users_repo["users"]["fed-1"] = {
        "id": "fed-1",
        "email": "fed@example.com",
        "password_hash": None,
        "created_at": None,
        "last_login_at": None,
        "is_member": False,
        "member_verified_at": None,
    }

    r = await client.post(
        "/api/auth/login",
        json={"email": "fed@example.com", "password": "any-password"},
    )
    assert r.status_code == 401
    assert "session" not in r.cookies
