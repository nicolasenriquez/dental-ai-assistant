"""Owner-scoped PostgreSQL access for durable evolution export intent."""

from __future__ import annotations

import hashlib
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

import asyncpg
from asyncpg import Connection

from backend import config
from backend.db.postgres import get_pg_pool

_EXPORT_COLUMNS = """
    id, user_id, evolution_id, operation_id, period_type, period_key,
    journal_part, drive_file_id, drive_version, status, journal_block,
    content_hash, last_error_code, created_at, updated_at, synced_at
"""
_QUALIFIED_EXPORT_COLUMNS = """
    exports.id, exports.user_id, exports.evolution_id, exports.operation_id,
    exports.period_type, exports.period_key, exports.journal_part,
    exports.drive_file_id, exports.drive_version, exports.status, exports.journal_block,
    exports.content_hash, exports.last_error_code, exports.created_at,
    exports.updated_at, exports.synced_at
"""


def _uuid(value: UUID | str) -> UUID:
    return value if isinstance(value, UUID) else UUID(str(value))


async def get_connection_for_approval(
    conn: Connection, owner_user_id: UUID | str
) -> dict[str, Any] | None:
    """Read and lock the owner's Drive row for the approval transaction."""
    row = await conn.fetchrow(
        """
        SELECT status, evolution_export_frequency
        FROM google_drive_connections
        WHERE user_id = $1
        FOR UPDATE
        """,
        _uuid(owner_user_id),
    )
    return dict(row) if row else None


async def create_export_intent_with_connection(
    conn: Connection,
    owner_user_id: UUID | str,
    evolution_id: UUID | str,
    *,
    operation_id: UUID | str,
    period_type: str,
    period_key: str,
    status: str,
    journal_block: str,
    content_hash: str,
    last_error_code: str | None,
) -> dict[str, Any]:
    """Persist one frozen export intent inside the caller's transaction."""
    row = await conn.fetchrow(
        """
        INSERT INTO google_drive_evolution_exports (
            id, user_id, evolution_id, operation_id, period_type, period_key,
            journal_part, drive_file_id, drive_version, status, journal_block,
            content_hash, last_error_code, created_at, updated_at, synced_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, NULL, $7, $8, $9, $10,
                now(), now(), NULL)
        RETURNING id, user_id, evolution_id, operation_id, period_type, period_key,
                  journal_part, drive_file_id, drive_version, status, journal_block,
                  content_hash, last_error_code, created_at, updated_at, synced_at
        """,
        uuid4(),
        _uuid(owner_user_id),
        _uuid(evolution_id),
        _uuid(operation_id),
        period_type,
        period_key,
        status,
        journal_block,
        content_hash,
        last_error_code,
    )
    assert row is not None
    return dict(row)


async def get_export_with_connection(
    conn: Connection, owner_user_id: UUID | str, evolution_id: UUID | str
) -> dict[str, Any] | None:
    """Read one export row while preserving owner scope."""
    row = await conn.fetchrow(
        f"""
        SELECT {_EXPORT_COLUMNS}
        FROM google_drive_evolution_exports
        WHERE user_id = $1 AND evolution_id = $2
        """,
        _uuid(owner_user_id),
        _uuid(evolution_id),
    )
    return dict(row) if row else None


async def get_export(owner_user_id: UUID | str, evolution_id: UUID | str) -> dict[str, Any] | None:
    """Read one owner-scoped export row using the application pool."""
    pool = get_pg_pool()
    async with pool.acquire() as conn:
        return await get_export_with_connection(conn, owner_user_id, evolution_id)


async def list_journal_periods(owner_user_id: UUID | str) -> list[dict[str, Any]]:
    """List distinct journal periods belonging to one authenticated owner."""
    async with get_pg_pool().acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT period_type, period_key
            FROM google_drive_evolution_exports
            WHERE user_id = $1
            GROUP BY period_type, period_key
            ORDER BY period_key DESC, period_type
            """,
            _uuid(owner_user_id),
        )
    return [dict(row) for row in rows]


async def list_period_lineage(
    owner_user_id: UUID | str, period_type: str, period_key: str
) -> list[dict[str, Any]]:
    """Return owner-scoped evolution IDs assigned to one frozen period."""
    async with get_pg_pool().acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT evolution_id, period_type, period_key
            FROM google_drive_evolution_exports
            WHERE user_id = $1 AND period_type = $2 AND period_key = $3
            ORDER BY evolution_id
            """,
            _uuid(owner_user_id),
            period_type,
            period_key,
        )
    return [dict(row) for row in rows]


async def claim_export(
    conn: Connection,
    owner_user_id: UUID | str,
    evolution_id: UUID | str,
    *,
    allow_retry: bool = False,
    stale_after_seconds: int = config.EXPORT_SYNC_STALE_AFTER_SECONDS,
) -> dict[str, Any] | None:
    """Atomically claim one export and return its pre-claim status.

    ``SKIP LOCKED`` makes duplicate schedulers exit without waiting for the
    worker that already owns the row. The stale predicate is rechecked by
    PostgreSQL after a concurrent update, so only one stale takeover wins.
    """
    if stale_after_seconds < 0:
        raise ValueError("stale_after_seconds must be non-negative")
    row = await conn.fetchrow(
        f"""
        WITH candidate AS (
            SELECT id, status AS previous_status
            FROM google_drive_evolution_exports
            WHERE user_id = $1 AND evolution_id = $2
              AND (
                  status = 'pending'
                  OR ($3::boolean AND status IN ('failed', 'unknown'))
                  OR (
                      status = 'syncing'
                      AND updated_at < now() - ($4::double precision * interval '1 second')
                  )
              )
            FOR UPDATE SKIP LOCKED
        )
        UPDATE google_drive_evolution_exports AS exports
        SET status = 'syncing', updated_at = now()
        FROM candidate
        WHERE exports.id = candidate.id
        RETURNING {_QUALIFIED_EXPORT_COLUMNS}, candidate.previous_status
        """,
        _uuid(owner_user_id),
        _uuid(evolution_id),
        allow_retry,
        stale_after_seconds,
    )
    return dict(row) if row else None


async def update_export_status(
    conn: Connection,
    owner_user_id: UUID | str,
    evolution_id: UUID | str,
    status: str,
    *,
    last_error_code: str | None = None,
    synced_at: datetime | None = None,
) -> dict[str, Any] | None:
    """Persist one status transition without changing frozen journal data."""
    if status not in {"pending", "syncing", "synced", "failed", "unknown"}:
        raise ValueError("Unsupported export status")
    row = await conn.fetchrow(
        f"""
        UPDATE google_drive_evolution_exports
        SET status = $3,
            last_error_code = $4,
            updated_at = now(),
            synced_at = CASE
                WHEN $3 = 'synced' THEN COALESCE($5::timestamptz, now())
                ELSE NULL
            END
        WHERE user_id = $1 AND evolution_id = $2
        RETURNING {_EXPORT_COLUMNS}
        """,
        _uuid(owner_user_id),
        _uuid(evolution_id),
        status,
        last_error_code,
        synced_at,
    )
    return dict(row) if row else None


async def set_remote_target(
    conn: Connection,
    owner_user_id: UUID | str,
    evolution_id: UUID | str,
    *,
    journal_part: int,
    drive_file_id: str | None,
    drive_version: str | None,
    allow_unknown: bool = False,
) -> dict[str, Any] | None:
    """Persist remote part/file/version as one tuple update."""
    if journal_part < 1:
        raise ValueError("journal_part must be positive")
    row = await conn.fetchrow(
        f"""
        UPDATE google_drive_evolution_exports
        SET journal_part = $3,
            drive_file_id = $4,
            drive_version = $5,
            updated_at = now()
        WHERE user_id = $1 AND evolution_id = $2
          AND ($6::boolean OR status <> 'unknown')
        RETURNING {_EXPORT_COLUMNS}
        """,
        _uuid(owner_user_id),
        _uuid(evolution_id),
        journal_part,
        drive_file_id,
        drive_version,
        allow_unknown,
    )
    return dict(row) if row else None


def period_lock_key(owner_user_id: UUID | str, period_type: str, period_key: str) -> int:
    """Derive a stable signed PostgreSQL advisory-lock key."""
    value = f"{_uuid(owner_user_id)}\0{period_type}\0{period_key}".encode()
    return int.from_bytes(hashlib.sha256(value).digest()[:8], byteorder="big", signed=True)


@asynccontextmanager
async def period_lock(
    pool: asyncpg.Pool,
    owner_user_id: UUID | str,
    period_type: str,
    period_key: str,
) -> AsyncIterator[Connection]:
    """Hold a session advisory lock on a dedicated, transaction-free connection."""
    conn = await pool.acquire()
    key = period_lock_key(owner_user_id, period_type, period_key)
    locked = False
    try:
        await conn.execute("SELECT pg_advisory_lock($1)", key)
        locked = True
        yield conn
    finally:
        try:
            if locked:
                await conn.execute("SELECT pg_advisory_unlock($1)", key)
        finally:
            await pool.release(conn)
