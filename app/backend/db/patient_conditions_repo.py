"""Owned manual conditions, partial-unique active identities and atomic history."""

import json
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from asyncpg import Connection, UniqueViolationError

from backend.db.patient_notes_repo import _parent
from backend.db.postgres import get_pg_pool
from backend.patients.conditions import (
    ConditionConflict,
    ConditionRevisionsCursor,
    ConditionsCursor,
    canonical_surfaces,
)

SNAPSHOT_KEYS = ("dentition", "tooth_fdi", "condition_code", "surfaces", "note", "status")


def snapshot(row: Any) -> dict[str, Any]:
    return {key: row[key] for key in SNAPSHOT_KEYS}


async def _record(
    conn: Connection, owner: UUID, patient: UUID, identifier: UUID, lock: bool = False
) -> dict[str, Any]:
    # The only SQL suffix is a fixed lock clause; identifiers and data stay parameterized.
    query = (
        "SELECT * FROM patient_tooth_conditions WHERE id=$1 AND owner_user_id=$2 AND patient_id=$3"
    )
    if lock:
        query += " FOR UPDATE"
    row = await conn.fetchrow(query, identifier, owner, patient)
    if row is None:
        raise LookupError
    return dict(row)


async def get_condition(owner: UUID, patient: UUID, identifier: UUID) -> dict[str, Any]:
    async with get_pg_pool().acquire() as conn:
        await _parent(conn, owner, patient)
        return await _record(conn, owner, patient, identifier)


async def _duplicate(conn: Connection, owner: UUID, patient: UUID, value: dict[str, Any]) -> None:
    existing = await conn.fetchrow(
        """
        SELECT * FROM patient_tooth_conditions WHERE owner_user_id=$1 AND patient_id=$2
            AND dentition=$3 AND tooth_fdi=$4 AND condition_code=$5 AND surfaces=$6 AND status='active'
    """,
        owner,
        patient,
        value["dentition"],
        value["tooth_fdi"],
        value["condition_code"],
        value["surfaces"],
    )
    if existing:
        raise ConditionConflict("active_condition_exists", existing["id"], existing=dict(existing))
    # A concurrently resolved duplicate may vanish between insert and reread; safe to retry.
    raise ConditionConflict("revision_conflict", value["id"])


async def _revision(
    conn: Connection,
    owner: UUID,
    patient: UUID,
    identifier: UUID,
    revision: int,
    before: dict[str, Any] | None,
    after: dict[str, Any],
    changed_at: datetime,
) -> None:
    action = (
        "created" if before is None else "resolved" if after["status"] == "resolved" else "edited"
    )
    await conn.execute(
        """
        INSERT INTO patient_tooth_condition_revisions
            (id,condition_id,owner_user_id,patient_id,revision,before_snapshot,after_snapshot,actor_user_id,changed_at,action)
        VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$3,$8,$9)
    """,
        uuid4(),
        identifier,
        owner,
        patient,
        revision,
        json.dumps(before) if before else None,
        json.dumps(after),
        changed_at,
        action,
    )


async def create_condition(
    owner: UUID, patient: UUID, identifier: UUID, value: dict[str, Any]
) -> tuple[dict[str, Any], bool]:
    async with get_pg_pool().acquire() as conn, conn.transaction():
        await _parent(conn, owner, patient)
        row = await conn.fetchrow(
            """
            INSERT INTO patient_tooth_conditions
                (id,owner_user_id,patient_id,dentition,tooth_fdi,condition_code,surfaces,note,created_by_user_id,updated_by_user_id)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$2,$2) ON CONFLICT DO NOTHING RETURNING *
        """,
            identifier,
            owner,
            patient,
            value["dentition"],
            value["tooth_fdi"],
            value["condition_code"],
            value["surfaces"],
            value["note"],
        )
        if row is None:
            # Check a globally colliding UUID first, without disclosing a foreign resource.
            exists = await conn.fetchval(
                "SELECT id FROM patient_tooth_conditions WHERE id=$1", identifier
            )
            if exists:
                current = await _record(conn, owner, patient, identifier, lock=True)
                original = await conn.fetchval(
                    """
                    SELECT after_snapshot FROM patient_tooth_condition_revisions
                    WHERE condition_id=$1 AND owner_user_id=$2 AND patient_id=$3 AND revision=1
                """,
                    identifier,
                    owner,
                    patient,
                )
                if json.loads(original) != {**value, "status": "active"}:
                    raise ConditionConflict("idempotency_conflict", identifier)
                return current, False
            await _duplicate(conn, owner, patient, {**value, "id": identifier})
            raise AssertionError("duplicate lookup must raise")
        await _revision(conn, owner, patient, identifier, 1, None, snapshot(row), row["created_at"])
        return dict(row), True


async def update_condition(
    owner: UUID, patient: UUID, identifier: UUID, expected: int, changes: dict[str, Any]
) -> dict[str, Any]:
    async with get_pg_pool().acquire() as conn, conn.transaction():
        await _parent(conn, owner, patient)
        current = await _record(conn, owner, patient, identifier, lock=True)
        if "surfaces" in changes:
            changes = {
                **changes,
                "surfaces": canonical_surfaces(changes["surfaces"], current["condition_code"]),
            }
        before = snapshot(current)
        after = {**before, **changes}
        if current["revision"] != expected:
            latest = await conn.fetchrow(
                """
                SELECT before_snapshot,after_snapshot FROM patient_tooth_condition_revisions
                WHERE condition_id=$1 AND owner_user_id=$2 AND patient_id=$3 AND revision=$4
            """,
                identifier,
                owner,
                patient,
                current["revision"],
            )
            if current["revision"] == expected + 1 and latest:
                previous = json.loads(latest["before_snapshot"])
                applied = json.loads(latest["after_snapshot"])
                if {**previous, **changes} == applied:
                    return current
            raise ConditionConflict("revision_conflict", identifier, current["revision"])
        if current["status"] == "resolved":
            raise ConditionConflict("condition_resolved", identifier, current["revision"])
        if before == after:
            return current
        try:
            async with conn.transaction():
                row = await conn.fetchrow(
                    """
                    UPDATE patient_tooth_conditions SET surfaces=$4,note=$5,status=$6,
                        revision=revision+1,updated_by_user_id=$2,updated_at=clock_timestamp()
                    WHERE id=$1 AND owner_user_id=$2 AND patient_id=$3 RETURNING *
                """,
                    identifier,
                    owner,
                    patient,
                    after["surfaces"],
                    after["note"],
                    after["status"],
                )
        except UniqueViolationError:
            await _duplicate(conn, owner, patient, {**after, "id": identifier})
            raise AssertionError("duplicate lookup must raise") from None
        assert row is not None
        await _revision(
            conn, owner, patient, identifier, row["revision"], before, after, row["updated_at"]
        )
        return dict(row)


async def list_conditions(
    owner: UUID,
    patient: UUID,
    dentition: str | None,
    status: str,
    limit: int,
    cursor: ConditionsCursor | None,
) -> tuple[list[dict[str, Any]], int]:
    async with get_pg_pool().acquire() as conn:
        await _parent(conn, owner, patient)
        total = await conn.fetchval(
            """
            SELECT count(*) FROM patient_tooth_conditions WHERE owner_user_id=$1 AND patient_id=$2
                AND ($3::text IS NULL OR dentition=$3) AND ($4='all' OR status=$4)
        """,
            owner,
            patient,
            dentition,
            status,
        )
        rows = await conn.fetch(
            """
            SELECT * FROM patient_tooth_conditions WHERE owner_user_id=$1 AND patient_id=$2
                AND ($3::text IS NULL OR dentition=$3) AND ($4='all' OR status=$4)
                AND ($5::smallint IS NULL OR (tooth_fdi,created_at,id)>($5,$6::timestamptz,$7::uuid))
            ORDER BY tooth_fdi,created_at,id LIMIT $8
        """,
            owner,
            patient,
            dentition,
            status,
            cursor.tooth_fdi if cursor else None,
            cursor.created_at if cursor else None,
            cursor.id if cursor else None,
            limit + 1,
        )
        return [dict(row) for row in rows], int(total)


async def list_revisions(
    owner: UUID,
    patient: UUID,
    identifier: UUID,
    limit: int,
    cursor: ConditionRevisionsCursor | None,
) -> tuple[list[dict[str, Any]], int]:
    async with get_pg_pool().acquire() as conn:
        await _parent(conn, owner, patient)
        await _record(conn, owner, patient, identifier)
        total = await conn.fetchval(
            "SELECT count(*) FROM patient_tooth_condition_revisions WHERE condition_id=$1 AND owner_user_id=$2 AND patient_id=$3",
            identifier,
            owner,
            patient,
        )
        rows = await conn.fetch(
            """
            SELECT * FROM patient_tooth_condition_revisions WHERE condition_id=$1 AND owner_user_id=$2 AND patient_id=$3
                AND ($4::int IS NULL OR (revision,id)<($4,$5::uuid))
            ORDER BY revision DESC,id DESC LIMIT $6
        """,
            identifier,
            owner,
            patient,
            cursor.revision if cursor else None,
            cursor.id if cursor else None,
            limit + 1,
        )
        return [dict(row) for row in rows], int(total)
