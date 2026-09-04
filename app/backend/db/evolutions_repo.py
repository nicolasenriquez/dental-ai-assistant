"""Owner-scoped PostgreSQL access for dental evolutions."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from backend.db.postgres import get_pg_pool


class EvolutionConflictError(Exception):
    """Raised when an evolution UUID is reused with different content."""


def _uuid(value: UUID | str) -> UUID:
    return value if isinstance(value, UUID) else UUID(str(value))


async def create_evolution(
    owner_user_id: UUID | str,
    patient_id: UUID | str,
    *,
    evolution_id: UUID | str,
    evolution_at: datetime,
    raw_note: str,
    generated_text: str,
    final_text: str,
) -> dict[str, Any]:
    owner_id = _uuid(owner_user_id)
    patient_uuid = _uuid(patient_id)
    record_id = _uuid(evolution_id)
    pool = get_pg_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO evolutions (
                id, patient_id, owner_user_id, evolution_at,
                raw_note, generated_text, final_text
            )
            SELECT $1, p.id, p.owner_user_id, $4, $5, $6, $7
            FROM patients p
            WHERE p.id = $2 AND p.owner_user_id = $3
            ON CONFLICT (id) DO NOTHING
            RETURNING id, patient_id, evolution_at, raw_note, generated_text,
                      final_text, created_at, updated_at
            """,
            record_id,
            patient_uuid,
            owner_id,
            evolution_at,
            raw_note,
            generated_text,
            final_text,
        )
        if row:
            return dict(row)

        existing = await conn.fetchrow(
            """
            SELECT id, patient_id, owner_user_id, evolution_at, raw_note,
                   generated_text, final_text, created_at, updated_at
            FROM evolutions
            WHERE id = $1 AND owner_user_id = $2
            """,
            record_id,
            owner_id,
        )
        if not existing:
            raise LookupError("Patient not found")
        if (
            existing["patient_id"] != patient_uuid
            or existing["evolution_at"] != evolution_at
            or existing["raw_note"] != raw_note
            or existing["generated_text"] != generated_text
            or existing["final_text"] != final_text
        ):
            raise EvolutionConflictError
        return {key: value for key, value in dict(existing).items() if key != "owner_user_id"}


async def list_evolutions(
    owner_user_id: UUID | str, patient_id: UUID | str
) -> list[dict[str, Any]] | None:
    pool = get_pg_pool()
    async with pool.acquire() as conn:
        patient_exists = await conn.fetchval(
            "SELECT 1 FROM patients WHERE id = $1 AND owner_user_id = $2",
            _uuid(patient_id),
            _uuid(owner_user_id),
        )
        if not patient_exists:
            return None
        rows = await conn.fetch(
            """
            SELECT id, patient_id, evolution_at, left(final_text, 240) AS preview,
                   created_at
            FROM evolutions
            WHERE patient_id = $1 AND owner_user_id = $2
            ORDER BY evolution_at DESC, created_at DESC
            """,
            _uuid(patient_id),
            _uuid(owner_user_id),
        )
    return [dict(row) for row in rows]


async def get_evolution(
    owner_user_id: UUID | str, evolution_id: UUID | str
) -> dict[str, Any] | None:
    pool = get_pg_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, patient_id, evolution_at, final_text, created_at
            FROM evolutions
            WHERE id = $1 AND owner_user_id = $2
            """,
            _uuid(evolution_id),
            _uuid(owner_user_id),
        )
    return dict(row) if row else None
