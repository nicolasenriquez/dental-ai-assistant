"""Owned manual conditions, partial-unique active identities and atomic history."""

import json
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from asyncpg import Connection, UniqueViolationError

from backend.db.patient_notes_repo import _parent
from backend.db.postgres import get_pg_pool
from backend.db.users_repo import professional_display_names
from backend.patients.conditions import (
    ConditionConflict,
    ConditionRevisionsCursor,
    ConditionsCursor,
    canonical_surfaces,
)

SNAPSHOT_KEYS = ("dentition", "tooth_fdi", "condition_code", "surfaces", "note", "status")
CONDITION_READ = """
    SELECT c.*, cu.professional_display_name AS created_by_display_name,
           uu.professional_display_name AS updated_by_display_name,
           to_jsonb(r) AS correction_revision FROM patient_tooth_conditions c
    LEFT JOIN users cu ON cu.id=c.created_by_user_id
    LEFT JOIN users uu ON uu.id=c.updated_by_user_id
    LEFT JOIN patient_tooth_condition_revisions r ON r.condition_id=c.id
        AND r.patient_id=c.patient_id AND r.owner_user_id=c.owner_user_id
        AND r.revision=c.revision AND r.action='corrected'
"""


def _receipt(row: Any) -> dict[str, Any]:
    return {
        "operation_id": row["operation_id"],
        "condition_id": row["condition_id"],
        "correction_revision_id": row["id"],
        "replacement_condition_id": row["replacement_condition_id"],
        "replacement_revision_id": row["replacement_revision_id"],
    }


def _metadata(row: Any) -> dict[str, Any]:
    value = dict(row)
    correction = value.pop("correction_revision", None)
    if isinstance(correction, str):
        correction = json.loads(correction)
    value["correction"] = (
        {**_receipt(correction), "reason": correction["correction_reason"]} if correction else None
    )
    return value


async def _with_names(conn: Connection, row: Any) -> dict[str, Any]:
    value = dict(row)
    names = await professional_display_names(
        conn, [value.get("created_by_user_id"), value.get("updated_by_user_id")]
    )
    created = value.get("created_by_user_id")
    updated = value.get("updated_by_user_id")
    value["created_by_display_name"] = names.get(created) if created else None
    value["updated_by_display_name"] = names.get(updated) if updated else None
    return value


def snapshot(row: Any) -> dict[str, Any]:
    return {key: row[key] for key in SNAPSHOT_KEYS}


async def _record(
    conn: Connection, owner: UUID, patient: UUID, identifier: UUID, lock: bool = False
) -> dict[str, Any]:
    # The only SQL suffix is a fixed lock clause; identifiers and data stay parameterized.
    query = CONDITION_READ + " WHERE c.id=$1 AND c.owner_user_id=$2 AND c.patient_id=$3"
    if lock:
        query += " FOR UPDATE OF c"
    row = await conn.fetchrow(query, identifier, owner, patient)
    if row is None:
        raise LookupError
    return _metadata(row)


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
        raise ConditionConflict(
            "active_condition_exists",
            existing["id"],
            existing=_metadata(await _with_names(conn, existing)),
        )
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
    *,
    revision_id: UUID | None = None,
    correction: dict[str, Any] | None = None,
) -> UUID:
    revision_id = revision_id or uuid4()
    action = (
        "corrected"
        if correction
        else "created"
        if before is None
        else "resolved"
        if after["status"] == "resolved"
        else "edited"
    )
    await conn.execute(
        """
        INSERT INTO patient_tooth_condition_revisions
            (id,condition_id,owner_user_id,patient_id,revision,before_snapshot,after_snapshot,actor_user_id,changed_at,action,
             operation_id,correction_reason,command_snapshot,replacement_condition_id,replacement_revision_id)
        VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$3,$8,$9,$10,$11,$12::jsonb,$13,$14)
    """,
        revision_id,
        identifier,
        owner,
        patient,
        revision,
        json.dumps(before) if before else None,
        json.dumps(after),
        changed_at,
        action,
        UUID(correction["operation_id"]) if correction else None,
        correction["reason"] if correction else None,
        json.dumps(correction["command_snapshot"]) if correction else None,
        correction["replacement_condition_id"] if correction else None,
        correction["replacement_revision_id"] if correction else None,
    )
    return revision_id


async def _insert_condition(
    conn: Connection,
    owner: UUID,
    patient: UUID,
    identifier: UUID,
    value: dict[str, Any],
    supersedes: UUID | None = None,
) -> Any:
    return await conn.fetchrow(
        """
        INSERT INTO patient_tooth_conditions
            (id,owner_user_id,patient_id,dentition,tooth_fdi,condition_code,surfaces,note,created_by_user_id,updated_by_user_id,supersedes_condition_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$2,$2,$9) ON CONFLICT DO NOTHING RETURNING *
        """,
        identifier,
        owner,
        patient,
        value["dentition"],
        value["tooth_fdi"],
        value["condition_code"],
        value["surfaces"],
        value["note"],
        supersedes,
    )


async def create_condition(
    owner: UUID, patient: UUID, identifier: UUID, value: dict[str, Any]
) -> tuple[dict[str, Any], bool]:
    async with get_pg_pool().acquire() as conn, conn.transaction():
        await _parent(conn, owner, patient)
        row = await _insert_condition(conn, owner, patient, identifier, value)
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
        return _metadata(await _with_names(conn, row)), True


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
        if current["status"] == "entered_in_error":
            raise ConditionConflict("condition_entered_in_error", identifier, current["revision"])
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
        return _metadata(await _with_names(conn, row))


async def _committed_correction(
    conn: Connection, owner: UUID, identifier: UUID, command: dict[str, Any]
) -> dict[str, Any] | None:
    row = await conn.fetchrow(
        """SELECT * FROM patient_tooth_condition_revisions
           WHERE owner_user_id=$1 AND operation_id=$2""",
        owner,
        UUID(command["operation_id"]),
    )
    if row is None:
        return None
    if json.loads(row["command_snapshot"]) != command:
        # Never disclose a receipt belonging to another source/patient.
        raise ConditionConflict("idempotency_conflict", identifier)
    return _receipt(row)


async def correct_condition(
    owner: UUID, patient: UUID, identifier: UUID, command: dict[str, Any]
) -> tuple[dict[str, Any], bool]:
    async with get_pg_pool().acquire() as conn:
        try:
            async with conn.transaction():
                await _parent(conn, owner, patient)
                await _record(conn, owner, patient, identifier)
                committed = await _committed_correction(conn, owner, identifier, command)
                if committed:
                    return committed, False
                current = await _record(conn, owner, patient, identifier, lock=True)
                # Another identical command may have committed while we waited for the source.
                committed = await _committed_correction(conn, owner, identifier, command)
                if committed:
                    return committed, False
                if current["revision"] != command["expected_revision"]:
                    raise ConditionConflict("revision_conflict", identifier, current["revision"])
                if current["status"] == "entered_in_error":
                    raise ConditionConflict(
                        "condition_entered_in_error", identifier, current["revision"]
                    )
                replacement = command["replacement"]
                replacement_id = UUID(replacement["id"]) if replacement else None
                if replacement_id == identifier:
                    raise ConditionConflict("idempotency_conflict", identifier)
                replacement_revision = uuid4() if replacement else None
                before = snapshot(current)
                row = await conn.fetchrow(
                    """UPDATE patient_tooth_conditions SET status='entered_in_error',
                       revision=revision+1,updated_by_user_id=$2,updated_at=clock_timestamp()
                       WHERE id=$1 AND owner_user_id=$2 AND patient_id=$3 RETURNING *""",
                    identifier,
                    owner,
                    patient,
                )
                assert row is not None
                revision_id = await _revision(
                    conn,
                    owner,
                    patient,
                    identifier,
                    row["revision"],
                    before,
                    snapshot(row),
                    row["updated_at"],
                    correction={
                        "operation_id": command["operation_id"],
                        "reason": command["reason"],
                        "command_snapshot": command,
                        "replacement_condition_id": replacement_id,
                        "replacement_revision_id": replacement_revision,
                    },
                )
                if replacement:
                    assert replacement_id is not None
                    new = await _insert_condition(
                        conn, owner, patient, replacement_id, replacement, identifier
                    )
                    if new is None:
                        exists = await conn.fetchval(
                            "SELECT id FROM patient_tooth_conditions WHERE id=$1", replacement_id
                        )
                        if exists:
                            await _record(conn, owner, patient, replacement_id)
                            raise ConditionConflict("idempotency_conflict", replacement_id)
                        await _duplicate(
                            conn, owner, patient, {**replacement, "id": replacement_id}
                        )
                        raise AssertionError("duplicate lookup must raise")
                    await _revision(
                        conn,
                        owner,
                        patient,
                        replacement_id,
                        1,
                        None,
                        snapshot(new),
                        new["created_at"],
                        revision_id=replacement_revision,
                    )
                return {
                    "operation_id": UUID(command["operation_id"]),
                    "condition_id": identifier,
                    "correction_revision_id": revision_id,
                    "replacement_condition_id": replacement_id,
                    "replacement_revision_id": replacement_revision,
                }, True
        except UniqueViolationError as error:
            if error.constraint_name != "uq_condition_correction_operation":
                raise
            # Different source locks can race on owner/operation. The entire losing
            # transaction has rolled back before we read/compare the winner's receipt.
            committed = await _committed_correction(conn, owner, identifier, command)
            if committed:
                return committed, False
            raise ConditionConflict("revision_conflict", identifier) from None


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
            CONDITION_READ
            + """
            WHERE c.owner_user_id=$1 AND c.patient_id=$2
                AND ($3::text IS NULL OR c.dentition=$3) AND ($4='all' OR c.status=$4)
                AND ($5::smallint IS NULL OR (c.tooth_fdi,c.created_at,c.id)>($5,$6::timestamptz,$7::uuid))
            ORDER BY c.tooth_fdi,c.created_at,c.id LIMIT $8
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
        return [_metadata(row) for row in rows], int(total)


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
            SELECT r.*,c.supersedes_condition_id,u.professional_display_name AS actor_display_name
            FROM patient_tooth_condition_revisions r
            JOIN patient_tooth_conditions c ON c.id=r.condition_id AND c.patient_id=r.patient_id AND c.owner_user_id=r.owner_user_id
            LEFT JOIN users u ON u.id=r.actor_user_id
            WHERE r.condition_id=$1 AND r.owner_user_id=$2 AND r.patient_id=$3
                AND ($4::int IS NULL OR (r.revision,r.id)<($4,$5::uuid))
            ORDER BY r.revision DESC,r.id DESC LIMIT $6
        """,
            identifier,
            owner,
            patient,
            cursor.revision if cursor else None,
            cursor.id if cursor else None,
            limit + 1,
        )
        return [
            {
                **dict(row),
                "correction": {**_receipt(row), "reason": row["correction_reason"]}
                if row["action"] == "corrected"
                else None,
            }
            for row in rows
        ], int(total)
