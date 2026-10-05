"""Transactional notes and immutable revision reads, scoped to owner and parent."""

from typing import Any
from uuid import UUID, uuid4

from asyncpg import Connection

from backend.db.postgres import get_pg_pool
from backend.patients.notes import NoteConflict, NotesCursor, RevisionsCursor


async def _parent(conn: Connection, owner: UUID, patient: UUID) -> None:
    if not await conn.fetchval(
        "SELECT id FROM patients WHERE id=$1 AND owner_user_id=$2 FOR KEY SHARE", patient, owner
    ):
        raise LookupError


async def get_note(owner: UUID, patient: UUID, note: UUID) -> dict[str, Any]:
    async with get_pg_pool().acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT n.* FROM patient_notes n
            JOIN patients p ON p.id=n.patient_id AND p.owner_user_id=n.owner_user_id
            WHERE n.id=$1 AND n.owner_user_id=$2 AND n.patient_id=$3
        """,
            note,
            owner,
            patient,
        )
        if row is None:
            raise LookupError
        return dict(row)


async def create_note(
    owner: UUID, patient: UUID, note: UUID, body: str
) -> tuple[dict[str, Any], bool]:
    async with get_pg_pool().acquire() as conn, conn.transaction():
        await _parent(conn, owner, patient)
        row = await conn.fetchrow(
            """
            INSERT INTO patient_notes(id,owner_user_id,patient_id,body,created_by_user_id,updated_by_user_id)
            VALUES($1,$2,$3,$4,$2,$2) ON CONFLICT(id) DO NOTHING RETURNING *
        """,
            note,
            owner,
            patient,
            body,
        )
        if row is None:
            row = await conn.fetchrow(
                "SELECT * FROM patient_notes WHERE id=$1 AND owner_user_id=$2 AND patient_id=$3 FOR UPDATE",
                note,
                owner,
                patient,
            )
            if row is None:
                raise LookupError
            original = await conn.fetchval(
                "SELECT new_body FROM patient_note_revisions WHERE note_id=$1 AND owner_user_id=$2 AND patient_id=$3 AND revision=1",
                note,
                owner,
                patient,
            )
            if original != body:
                raise NoteConflict("idempotency_conflict", note)
            return dict(row), False
        await _revision(conn, owner, patient, note, 1, None, body, row["created_at"])
        return dict(row), True


async def _revision(
    conn: Connection,
    owner: UUID,
    patient: UUID,
    note: UUID,
    revision: int,
    previous: str | None,
    body: str,
    timestamp: Any,
) -> None:
    await conn.execute(
        """
        INSERT INTO patient_note_revisions(id,note_id,patient_id,owner_user_id,revision,previous_body,new_body,actor_user_id,changed_at,action)
        VALUES($1,$2,$3,$4,$5,$6,$7,$4,$8,$9)
    """,
        uuid4(),
        note,
        patient,
        owner,
        revision,
        previous,
        body,
        timestamp,
        "created" if revision == 1 else "edited",
    )


async def update_note(
    owner: UUID, patient: UUID, note: UUID, expected: int, body: str
) -> dict[str, Any]:
    async with get_pg_pool().acquire() as conn, conn.transaction():
        await _parent(conn, owner, patient)
        row = await conn.fetchrow(
            "SELECT * FROM patient_notes WHERE id=$1 AND owner_user_id=$2 AND patient_id=$3 FOR UPDATE",
            note,
            owner,
            patient,
        )
        if row is None:
            raise LookupError
        if row["revision"] != expected:
            latest = await conn.fetchrow(
                "SELECT revision, new_body FROM patient_note_revisions WHERE note_id=$1 AND owner_user_id=$2 AND patient_id=$3 ORDER BY revision DESC LIMIT 1",
                note,
                owner,
                patient,
            )
            if (
                row["revision"] == expected + 1
                and latest
                and latest["revision"] == expected + 1
                and latest["new_body"] == body
            ):
                return dict(row)
            raise NoteConflict("revision_conflict", note, row["revision"])
        if row["body"] == body:
            return dict(row)
        updated = await conn.fetchrow(
            """
            UPDATE patient_notes SET body=$4,revision=revision+1,updated_by_user_id=$2,updated_at=clock_timestamp()
            WHERE id=$1 AND owner_user_id=$2 AND patient_id=$3 RETURNING *
        """,
            note,
            owner,
            patient,
            body,
        )
        assert updated is not None
        await _revision(
            conn,
            owner,
            patient,
            note,
            updated["revision"],
            row["body"],
            body,
            updated["updated_at"],
        )
        return dict(updated)


async def list_notes(
    owner: UUID, patient: UUID, limit: int, cursor: NotesCursor | None
) -> tuple[list[dict[str, Any]], int]:
    async with get_pg_pool().acquire() as conn:
        await _parent(conn, owner, patient)
        total = await conn.fetchval(
            "SELECT count(*) FROM patient_notes WHERE owner_user_id=$1 AND patient_id=$2",
            owner,
            patient,
        )
        rows = await conn.fetch(
            """
            SELECT * FROM patient_notes WHERE owner_user_id=$1 AND patient_id=$2
              AND ($3::timestamptz IS NULL OR (updated_at,id)<($3,$4::uuid))
            ORDER BY updated_at DESC,id DESC LIMIT $5
        """,
            owner,
            patient,
            cursor.updated_at if cursor else None,
            cursor.id if cursor else None,
            limit + 1,
        )
        return [dict(row) for row in rows], int(total)


async def list_revisions(
    owner: UUID, patient: UUID, note: UUID, limit: int, cursor: RevisionsCursor | None
) -> tuple[list[dict[str, Any]], int]:
    async with get_pg_pool().acquire() as conn:
        if not await conn.fetchval(
            """
            SELECT n.id FROM patient_notes n JOIN patients p ON p.id=n.patient_id AND p.owner_user_id=n.owner_user_id
            WHERE n.id=$1 AND n.owner_user_id=$2 AND n.patient_id=$3
        """,
            note,
            owner,
            patient,
        ):
            raise LookupError
        total = await conn.fetchval(
            "SELECT count(*) FROM patient_note_revisions WHERE note_id=$1 AND owner_user_id=$2 AND patient_id=$3",
            note,
            owner,
            patient,
        )
        rows = await conn.fetch(
            """
            SELECT * FROM patient_note_revisions WHERE note_id=$1 AND owner_user_id=$2 AND patient_id=$3
              AND ($4::integer IS NULL OR (revision,id)<($4,$5::uuid))
            ORDER BY revision DESC,id DESC LIMIT $6
        """,
            note,
            owner,
            patient,
            cursor.revision if cursor else None,
            cursor.id if cursor else None,
            limit + 1,
        )
        return [dict(row) for row in rows], int(total)
