"""Read persisted events directly; no mirrored timeline or clinical text."""

from typing import Any
from uuid import UUID

from backend.db.postgres import get_pg_pool
from backend.patients.activity import ActivityCursor, ActivityFilter


async def list_activity(
    owner: UUID, patient: UUID, kind: ActivityFilter, limit: int, before: ActivityCursor | None
) -> tuple[list[dict[str, Any]], int]:
    async with (
        get_pg_pool().acquire() as conn,
        conn.transaction(readonly=True, isolation="repeatable_read"),
    ):
        if not await conn.fetchval(
            "SELECT id FROM patients WHERE id=$1 AND owner_user_id=$2", patient, owner
        ):
            raise LookupError
        rows = await conn.fetch(
            """
            WITH events AS (
                SELECT e.id AS event_id, e.id AS resource_id, 'evolutions'::text AS kind,
                    'created'::text AS action, e.created_at AS occurred_at,
                    NULL::uuid AS actor_user_id, NULL::integer AS tooth_fdi
                FROM evolutions e WHERE e.owner_user_id=$1 AND e.patient_id=$2
                UNION ALL
                SELECT r.id, r.note_id, 'notes', r.action, r.changed_at, r.actor_user_id, NULL::integer
                FROM patient_note_revisions r WHERE r.owner_user_id=$1 AND r.patient_id=$2
                UNION ALL
                SELECT r.id, r.condition_id, 'diagnoses', r.action, r.changed_at, r.actor_user_id,
                    (r.after_snapshot->>'tooth_fdi')::integer
                FROM patient_tooth_condition_revisions r
                WHERE r.owner_user_id=$1 AND r.patient_id=$2
            ), filtered AS (
                SELECT * FROM events WHERE $3::text='all' OR kind=$3
            )
            SELECT page.*, totals.total FROM (SELECT count(*)::integer AS total FROM filtered) totals
            LEFT JOIN LATERAL (
                SELECT * FROM filtered
                WHERE $4::timestamptz IS NULL OR occurred_at<$4
                    OR (occurred_at=$4 AND kind>$5::text)
                    OR (occurred_at=$4 AND kind=$5 AND event_id<$6::uuid)
                ORDER BY occurred_at DESC, kind ASC, event_id DESC LIMIT $7
            ) page ON true
            ORDER BY page.occurred_at DESC, page.kind ASC, page.event_id DESC
            """,
            owner,
            patient,
            kind,
            before.occurred_at if before else None,
            before.kind if before else None,
            before.event_id if before else None,
            limit + 1,
        )
    return [dict(row) for row in rows if row["event_id"] is not None], rows[0]["total"]
