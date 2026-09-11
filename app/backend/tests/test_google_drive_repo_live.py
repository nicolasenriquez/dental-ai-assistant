"""Live-Postgres proof for the Drive repository persistence invariants (task 2.4).

The in-memory ``fake_drive_repo`` in ``test_google_drive_oauth_routes.py`` pins
route orchestration; this file proves the repository SQL against the real
migration — unique rows, checked statuses, atomic one-shot claim, ciphertext-only
persistence, terminal-state credential clearing, and FK cascade.

Pre-reqs (scratch DB on the local dev container, from ``app/``):

    docker exec dynachat-postgres psql -U dynachat -d dynachat \
        -c "CREATE DATABASE drive_live_test"
    $pw = docker exec dynachat-postgres printenv POSTGRES_PASSWORD
    $env:DATABASE_URL = "postgresql://dynachat:$pw@127.0.0.1:5433/drive_live_test"
    uv --project backend run alembic -c backend/alembic.ini upgrade head

Run with ``DRIVE_LIVE_TEST_DSN`` set to that URL; every test truncates the
Drive tables and ``users`` so the proof is repeatable.
"""

from __future__ import annotations

import hashlib
import os
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import UUID, uuid4

import asyncpg
import pytest

from backend.db import google_drive_repo

DSN = os.environ.get("DRIVE_LIVE_TEST_DSN", "")
if not DSN:
    pytestmark = pytest.mark.skip(reason="DRIVE_LIVE_TEST_DSN not set")

DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file"


@pytest.fixture(autouse=True)
def drive_keyring(monkeypatch):
    from backend import config

    monkeypatch.setattr(config, "GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEYS", {"1": bytes(range(32))})
    monkeypatch.setattr(config, "GOOGLE_DRIVE_TOKEN_ACTIVE_KEY_VERSION", "1")


@pytest.fixture
async def db(monkeypatch):
    try:
        pool = await asyncpg.create_pool(DSN, min_size=1, max_size=1)
    except OSError as exc:
        pytest.skip(f"live Postgres unreachable: {exc}")
    monkeypatch.setattr(google_drive_repo, "get_pg_pool", lambda: pool)
    async with pool.acquire() as conn:
        await conn.execute(
            "TRUNCATE google_drive_oauth_transactions, google_drive_connections, users CASCADE;"
        )
    yield pool
    await pool.close()


async def _make_user(db, uid: str | None = None) -> str:
    uid = uid or str(uuid4())
    async with db.acquire() as conn:
        await conn.execute(
            "INSERT INTO users (id, email, password_hash) VALUES ($1, $2, NULL)",
            UUID(uid),
            f"user-{uid[:8]}@example.com",
        )
    return uid


async def _make_connection(db, uid: str, *, account_id: str = "gid-live") -> dict[str, Any]:
    from backend.auth import token_cipher

    ct = token_cipher.encrypt(uid, token_cipher.PURPOSE_REFRESH_TOKEN, b"live-refresh-plaintext")
    bs = token_cipher.encrypt(uid, token_cipher.PURPOSE_BINDING_SECRET, b"live-binding-plaintext")
    return cast(
        dict[str, Any],
        await google_drive_repo.create_active_connection(
            uid,
            google_account_id=account_id,
            refresh_token_ciphertext=ct.ciphertext,
            refresh_token_nonce=ct.nonce,
            token_key_version=ct.key_version,
            binding_secret_ciphertext=bs.ciphertext,
            binding_secret_nonce=bs.nonce,
            binding_key_version=bs.key_version,
            granted_scopes=[DRIVE_SCOPE],
            folder_id="folder-live",
            folder_name="Dental AI Assistant",
            folder_creation_operation_id=uuid4(),
        ),
    )


async def test_live_schema_matches_contract(db):
    async with db.acquire() as conn:
        cols = await conn.fetch(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'google_drive_connections'"
        )
        check = await conn.fetchval(
            "SELECT pg_get_constraintdef(oid) FROM pg_constraint "
            "WHERE conrelid = 'google_drive_connections'::regclass AND contype = 'c'"
        )
        fks = await conn.fetch(
            "SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint "
            "WHERE conrelid = 'google_drive_connections'::regclass AND contype = 'f'"
        )
        txn_pk = await conn.fetch(
            "SELECT kcu.column_name FROM information_schema.table_constraints tc "
            "JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name "
            "WHERE tc.table_name = 'google_drive_oauth_transactions' "
            "AND tc.constraint_type = 'PRIMARY KEY'"
        )

    names = {c["column_name"] for c in cols}
    assert {
        "user_id",
        "google_account_id",
        "refresh_token_ciphertext",
        "refresh_token_nonce",
        "token_key_version",
        "binding_secret_ciphertext",
        "binding_secret_nonce",
        "binding_key_version",
        "granted_scopes",
        "folder_id",
        "folder_name",
        "folder_creation_operation_id",
        "pending_folder_operation_id",
        "status",
        "status_changed_at",
        "connected_at",
    } <= names
    assert "active" in check and "disconnected" in check and "revoked" in check
    assert any("users" in f["def"] and "CASCADE" in f["def"] for f in fks)
    assert {r["column_name"] for r in txn_pk} == {"state_hash"}


async def test_live_connection_persists_ciphertext_only(db):
    from backend.auth import token_cipher
    from backend.auth.token_cipher import Ciphertext

    uid = await _make_user(db)
    await _make_connection(db, uid)

    async with db.acquire() as conn:
        raw = str(
            await conn.fetchrow(
                "SELECT * FROM google_drive_connections WHERE user_id = $1", UUID(uid)
            )
        )
    assert b"live-refresh-plaintext" not in raw.encode()
    assert b"live-binding-plaintext" not in raw.encode()

    row = await google_drive_repo.get_connection(uid)
    decrypted = token_cipher.decrypt(
        uid,
        token_cipher.PURPOSE_REFRESH_TOKEN,
        Ciphertext(
            ciphertext=bytes(row["refresh_token_ciphertext"]),
            nonce=bytes(row["refresh_token_nonce"]),
            key_version=str(row["token_key_version"]),
        ),
    )
    assert decrypted.plaintext == b"live-refresh-plaintext"


async def test_live_one_connection_per_user_and_replace_overwrites(db):
    uid = await _make_user(db)
    await _make_connection(db, uid)

    with pytest.raises(asyncpg.UniqueViolationError):
        await _make_connection(db, uid, account_id="gid-second")

    async with db.acquire() as conn:
        count = await conn.fetchval("SELECT count(*) FROM google_drive_connections")
    assert count == 1

    from backend.auth import token_cipher

    ct = token_cipher.encrypt(uid, token_cipher.PURPOSE_REFRESH_TOKEN, b"replaced")
    bs = token_cipher.encrypt(uid, token_cipher.PURPOSE_BINDING_SECRET, b"replaced-bs")
    await google_drive_repo.replace_active_connection(
        uid,
        google_account_id="gid-replaced",
        refresh_token_ciphertext=ct.ciphertext,
        refresh_token_nonce=ct.nonce,
        token_key_version=ct.key_version,
        binding_secret_ciphertext=bs.ciphertext,
        binding_secret_nonce=bs.nonce,
        binding_key_version=bs.key_version,
        granted_scopes=[DRIVE_SCOPE],
        folder_id=None,
        folder_name=None,
        folder_creation_operation_id=None,
    )
    async with db.acquire() as conn:
        count = await conn.fetchval(
            "SELECT count(*) FROM google_drive_connections WHERE user_id = $1", UUID(uid)
        )
    assert count == 1
    assert (await google_drive_repo.get_connection(uid))["google_account_id"] == "gid-replaced"


async def test_live_revoked_state_is_durable_and_clears_credentials(db):
    uid = await _make_user(db)
    await _make_connection(db, uid)

    await google_drive_repo.set_revoked(uid)
    row = await google_drive_repo.get_connection(uid)

    assert row["status"] == "revoked"
    assert row["refresh_token_ciphertext"] is None
    assert row["refresh_token_nonce"] is None
    assert row["token_key_version"] is None
    assert row["granted_scopes"] == []
    assert row["pending_folder_operation_id"] is None
    assert row["folder_id"] == "folder-live"
    assert row["google_account_id"] == "gid-live"
    assert row["binding_secret_ciphertext"] is not None

    again = await google_drive_repo.get_connection(uid)
    assert again == row


async def test_live_disconnect_clears_credentials_and_retains_identity(db):
    uid = await _make_user(db)
    await _make_connection(db, uid)

    await google_drive_repo.set_disconnected(uid)
    row = await google_drive_repo.get_connection(uid)

    assert row["status"] == "disconnected"
    assert row["refresh_token_ciphertext"] is None
    assert row["granted_scopes"] == []
    assert row["folder_id"] == "folder-live"
    assert row["binding_secret_ciphertext"] is not None


async def test_live_transaction_claim_is_atomic_and_stores_hash_only(db):
    uid = await _make_user(db)
    raw_state = secrets.token_urlsafe(32)
    state_hash = hashlib.sha256(raw_state.encode()).digest()

    await google_drive_repo.create_oauth_transaction(
        state_hash=state_hash,
        user_id=uid,
        session_fingerprint=hashlib.sha256(b"session-a").digest(),
        expected_google_email="ana@gmail.com",
        folder_operation_id=uuid4(),
        expires_at=datetime.now(UTC) + timedelta(seconds=600),
    )

    row = await google_drive_repo.get_oauth_transaction(state_hash)
    assert row is not None and row["used_at"] is None
    assert row["user_id"] == UUID(uid)

    claimed = await google_drive_repo.claim_oauth_transaction(state_hash)
    assert claimed is not None and claimed["used_at"] is not None
    assert await google_drive_repo.claim_oauth_transaction(state_hash) is None

    async with db.acquire() as conn:
        raw_rows = str(await conn.fetch("SELECT * FROM google_drive_oauth_transactions"))
    assert raw_state.encode() not in raw_rows.encode()


async def test_live_status_check_constraint_rejects_unknown_status(db):
    uid = await _make_user(db)
    async with db.acquire() as conn:
        with pytest.raises(asyncpg.CheckViolationError):
            await conn.execute(
                "INSERT INTO google_drive_connections "
                "(user_id, binding_secret_ciphertext, binding_secret_nonce, binding_key_version, "
                " status, status_changed_at, connected_at, created_at, updated_at) "
                "VALUES ($1, $2, $3, '1', 'weird', now(), now(), now(), now())",
                UUID(uid),
                b"x",
                b"0" * 12,
            )


async def test_live_user_delete_cascades_connection_and_transactions(db):
    uid = await _make_user(db)
    await _make_connection(db, uid)
    await google_drive_repo.create_oauth_transaction(
        state_hash=hashlib.sha256(b"state-x").digest(),
        user_id=uid,
        session_fingerprint=hashlib.sha256(b"session-a").digest(),
        expected_google_email=None,
        folder_operation_id=uuid4(),
        expires_at=datetime.now(UTC) + timedelta(seconds=600),
    )

    async with db.acquire() as conn:
        await conn.execute("DELETE FROM users WHERE id = $1", UUID(uid))
        connections = await conn.fetchval("SELECT count(*) FROM google_drive_connections")
        transactions = await conn.fetchval("SELECT count(*) FROM google_drive_oauth_transactions")
    assert connections == 0 and transactions == 0
