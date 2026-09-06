"""Owner-scoped PostgreSQL access for patients."""

from __future__ import annotations

from datetime import date
from typing import Any
from uuid import UUID, uuid4

from backend.db.postgres import get_pg_pool


def _uuid(value: UUID | str) -> UUID:
    return value if isinstance(value, UUID) else UUID(str(value))


async def create_patient(
    owner_user_id: UUID | str,
    *,
    first_name: str,
    last_name: str,
    rut_body: int,
    check_digit: str,
    birth_date: date | None,
) -> dict[str, Any]:
    pool = get_pg_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO patients (
                id, owner_user_id, first_name, last_name, rut_number, rut_dv, birth_date
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, first_name, last_name, rut_number, rut_dv, birth_date,
                      created_at, updated_at, NULL::timestamptz AS last_evolution_at
            """,
            uuid4(),
            _uuid(owner_user_id),
            first_name,
            last_name,
            rut_body,
            check_digit,
            birth_date,
        )
    return dict(row)


async def list_patients(owner_user_id: UUID | str) -> list[dict[str, Any]]:
    pool = get_pg_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT p.id, p.first_name, p.last_name, p.rut_number, p.rut_dv, p.birth_date,
                   MAX(e.evolution_at) AS last_evolution_at
            FROM patients p
            LEFT JOIN evolutions e
              ON e.patient_id = p.id AND e.owner_user_id = p.owner_user_id
            WHERE p.owner_user_id = $1
            GROUP BY p.id
            ORDER BY p.last_name, p.first_name, p.id
            """,
            _uuid(owner_user_id),
        )
    return [dict(row) for row in rows]


async def search_patients(
    owner_user_id: UUID | str,
    *,
    query: str | None = None,
    rut_body: int | None = None,
) -> list[dict[str, Any]]:
    pool = get_pg_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT p.id, p.first_name, p.last_name, p.rut_number, p.rut_dv, p.birth_date,
                   MAX(e.evolution_at) AS last_evolution_at
            FROM patients p
            LEFT JOIN evolutions e
              ON e.patient_id = p.id AND e.owner_user_id = p.owner_user_id
            WHERE p.owner_user_id = $1
              AND (($2::bigint IS NOT NULL AND p.rut_number = $2)
                   OR ($2::bigint IS NULL AND concat_ws(' ', p.first_name, p.last_name) ILIKE $3))
            GROUP BY p.id
            ORDER BY p.last_name, p.first_name, p.id
            """,
            _uuid(owner_user_id),
            rut_body,
            None if rut_body is not None else f"%{query or ''}%",
        )
    return [dict(row) for row in rows]


async def get_patient(owner_user_id: UUID | str, patient_id: UUID | str) -> dict[str, Any] | None:
    pool = get_pg_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, first_name, last_name, rut_number, rut_dv, birth_date,
                   created_at, updated_at
            FROM patients
            WHERE owner_user_id = $1 AND id = $2
            """,
            _uuid(owner_user_id),
            _uuid(patient_id),
        )
    return dict(row) if row else None


async def update_patient(
    owner_user_id: UUID | str,
    patient_id: UUID | str,
    *,
    first_name: str,
    last_name: str,
    birth_date: date | None,
    rut_body: int | None = None,
    check_digit: str | None = None,
) -> dict[str, Any] | None:
    pool = get_pg_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            UPDATE patients
            SET first_name = $3,
                last_name = $4,
                birth_date = $5,
                rut_number = COALESCE($6, rut_number),
                rut_dv = COALESCE($7, rut_dv),
                updated_at = now()
            WHERE owner_user_id = $1 AND id = $2
            RETURNING id, first_name, last_name, rut_number, rut_dv, birth_date,
                      created_at, updated_at
            """,
            _uuid(owner_user_id),
            _uuid(patient_id),
            first_name,
            last_name,
            birth_date,
            rut_body,
            check_digit,
        )
        if row is None:
            return None

        result = dict(row)
        result["last_evolution_at"] = await conn.fetchval(
            """
            SELECT MAX(evolution_at)
            FROM evolutions
            WHERE patient_id = $1 AND owner_user_id = $2
            """,
            _uuid(patient_id),
            _uuid(owner_user_id),
        )
    return result


async def get_patient_by_rut(owner_user_id: UUID | str, rut_body: int) -> dict[str, Any] | None:
    pool = get_pg_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT p.id, p.first_name, p.last_name, p.rut_number, p.rut_dv, p.birth_date,
                   MAX(e.evolution_at) AS last_evolution_at
            FROM patients p
            LEFT JOIN evolutions e
              ON e.patient_id = p.id AND e.owner_user_id = p.owner_user_id
            WHERE p.owner_user_id = $1 AND p.rut_number = $2
            GROUP BY p.id
            """,
            _uuid(owner_user_id),
            rut_body,
        )
    return dict(row) if row else None


async def get_recent_approved_evolutions(
    owner_user_id: UUID | str, patient_id: UUID | str, *, limit: int
) -> list[dict[str, Any]]:
    pool = get_pg_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT evolution_at, final_text
            FROM evolutions
            WHERE owner_user_id = $1 AND patient_id = $2
              AND btrim(final_text) <> ''
            ORDER BY evolution_at DESC, created_at DESC
            LIMIT $3
            """,
            _uuid(owner_user_id),
            _uuid(patient_id),
            limit,
        )
    return [dict(row) for row in rows]
