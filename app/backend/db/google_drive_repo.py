"""
Google Drive repository — all raw SQL for the Drive connection and OAuth
transaction tables lives here. Routes and integrations never contain SQL.

Status invariants (enforced here, verified against the real migration in
task 2.4): ``active`` carries complete refresh credentials and exact granted
scopes; ``disconnected``/``revoked`` clear refresh credentials, scopes, and
pending folder operations while retaining account/folder identity and the
encrypted binding secret for reconnect.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from backend.db.postgres import get_pg_pool

_CONNECTION_COLUMNS = """
    user_id, google_account_id,
    refresh_token_ciphertext, refresh_token_nonce, token_key_version,
    binding_secret_ciphertext, binding_secret_nonce, binding_key_version,
    granted_scopes, folder_id, folder_name,
    folder_creation_operation_id, pending_folder_operation_id,
    status, status_changed_at, connected_at
"""


def _to_uuid(value: UUID | str) -> UUID:
    return value if isinstance(value, UUID) else UUID(str(value))


async def get_connection(user_id: UUID | str) -> dict[str, Any] | None:
    """Fetch the Drive connection row for one Dental user. None if absent."""
    pool = get_pg_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"SELECT {_CONNECTION_COLUMNS} FROM google_drive_connections WHERE user_id = $1",
            _to_uuid(user_id),
        )
    return dict(row) if row else None


async def create_active_connection(
    user_id: UUID | str,
    *,
    google_account_id: str,
    refresh_token_ciphertext: bytes,
    refresh_token_nonce: bytes,
    token_key_version: str,
    binding_secret_ciphertext: bytes,
    binding_secret_nonce: bytes,
    binding_key_version: str,
    granted_scopes: list[str],
    folder_id: str | None,
    folder_name: str | None,
    folder_creation_operation_id: UUID | str | None,
) -> dict[str, Any]:
    """Insert a new active connection. Caller owns the one-connection invariant."""
    pool = get_pg_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"""
            INSERT INTO google_drive_connections (
                user_id, google_account_id,
                refresh_token_ciphertext, refresh_token_nonce, token_key_version,
                binding_secret_ciphertext, binding_secret_nonce, binding_key_version,
                granted_scopes, folder_id, folder_name, folder_creation_operation_id,
                status, status_changed_at, connected_at, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                    'active', now(), now(), now(), now())
            RETURNING {_CONNECTION_COLUMNS}
            """,
            _to_uuid(user_id),
            google_account_id,
            refresh_token_ciphertext,
            refresh_token_nonce,
            token_key_version,
            binding_secret_ciphertext,
            binding_secret_nonce,
            binding_key_version,
            granted_scopes,
            folder_id,
            folder_name,
            _to_uuid(folder_creation_operation_id) if folder_creation_operation_id else None,
        )
    assert row is not None
    return dict(row)


async def replace_active_connection(
    user_id: UUID | str,
    *,
    google_account_id: str,
    refresh_token_ciphertext: bytes,
    refresh_token_nonce: bytes,
    token_key_version: str,
    binding_secret_ciphertext: bytes,
    binding_secret_nonce: bytes,
    binding_key_version: str,
    granted_scopes: list[str],
    folder_id: str | None,
    folder_name: str | None,
    folder_creation_operation_id: UUID | str | None,
) -> dict[str, Any]:
    """Overwrite an existing row with a fresh active connection.

    Reconnect to the same verified account reuses folder/binding identity
    (caller passes preserved values); a different local-mode account passes
    cleared folder identity and a new binding secret. Clears any pending
    folder operation.
    """
    pool = get_pg_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"""
            UPDATE google_drive_connections
            SET google_account_id = $2,
                refresh_token_ciphertext = $3, refresh_token_nonce = $4,
                token_key_version = $5,
                binding_secret_ciphertext = $6, binding_secret_nonce = $7,
                binding_key_version = $8,
                granted_scopes = $9,
                folder_id = $10, folder_name = $11,
                folder_creation_operation_id = $12,
                pending_folder_operation_id = NULL,
                status = 'active',
                status_changed_at = now(), connected_at = now(), updated_at = now()
            WHERE user_id = $1
            RETURNING {_CONNECTION_COLUMNS}
            """,
            _to_uuid(user_id),
            google_account_id,
            refresh_token_ciphertext,
            refresh_token_nonce,
            token_key_version,
            binding_secret_ciphertext,
            binding_secret_nonce,
            binding_key_version,
            granted_scopes,
            folder_id,
            folder_name,
            _to_uuid(folder_creation_operation_id) if folder_creation_operation_id else None,
        )
    assert row is not None
    return dict(row)


async def _set_terminal(user_id: UUID | str, status_value: str) -> dict[str, Any] | None:
    """Move a connection to a terminal state: clear refresh credentials."""
    pool = get_pg_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"""
            UPDATE google_drive_connections
            SET status = $2,
                refresh_token_ciphertext = NULL, refresh_token_nonce = NULL,
                token_key_version = NULL,
                granted_scopes = '{{}}',
                pending_folder_operation_id = NULL,
                status_changed_at = now(), updated_at = now()
            WHERE user_id = $1
            RETURNING {_CONNECTION_COLUMNS}
            """,
            _to_uuid(user_id),
            status_value,
        )
    return dict(row) if row else None


async def set_disconnected(user_id: UUID | str) -> dict[str, Any] | None:
    """Explicit disconnect: active/revoked -> disconnected, credentials cleared."""
    return await _set_terminal(user_id, "disconnected")


async def set_revoked(user_id: UUID | str) -> dict[str, Any] | None:
    """Invalid grant / repeated Drive 401: active -> revoked, credentials cleared."""
    return await _set_terminal(user_id, "revoked")


async def create_oauth_transaction(
    *,
    state_hash: bytes,
    user_id: UUID | str,
    session_fingerprint: bytes,
    expected_google_email: str | None,
    folder_operation_id: UUID | str,
    expires_at: datetime,
) -> dict[str, Any]:
    """Persist a one-shot OAuth transaction (state hash only, never raw state)."""
    pool = get_pg_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO google_drive_oauth_transactions (
                state_hash, user_id, session_fingerprint, expected_google_email,
                folder_operation_id, expires_at, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, now())
            RETURNING state_hash, user_id, session_fingerprint, expected_google_email,
                      folder_operation_id, expires_at, used_at, created_at
            """,
            state_hash,
            _to_uuid(user_id),
            session_fingerprint,
            expected_google_email,
            _to_uuid(folder_operation_id),
            expires_at,
        )
    assert row is not None
    return dict(row)


async def get_oauth_transaction(state_hash: bytes) -> dict[str, Any] | None:
    pool = get_pg_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT state_hash, user_id, session_fingerprint, expected_google_email,
                   folder_operation_id, expires_at, used_at, created_at
            FROM google_drive_oauth_transactions
            WHERE state_hash = $1
            """,
            state_hash,
        )
    return dict(row) if row else None


async def claim_oauth_transaction(state_hash: bytes) -> dict[str, Any] | None:
    """Atomically consume a one-shot transaction; None when absent or used."""
    pool = get_pg_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            UPDATE google_drive_oauth_transactions
            SET used_at = now()
            WHERE state_hash = $1 AND used_at IS NULL
            RETURNING state_hash, user_id, session_fingerprint, expected_google_email,
                      folder_operation_id, expires_at, used_at, created_at
            """,
            state_hash,
        )
    return dict(row) if row else None
