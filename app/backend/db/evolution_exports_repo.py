"""Owner-scoped PostgreSQL access for durable evolution export intent."""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

from asyncpg import Connection


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
