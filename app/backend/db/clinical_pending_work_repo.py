"""Read-only owner-scoped projection of existing clinical work."""

from datetime import datetime
from typing import Any
from uuid import UUID

from backend.db.postgres import get_pg_pool


async def list_pending_work(
    owner: UUID,
    patient_id: UUID | None,
    limit: int,
    before: tuple[datetime, str] | None = None,
    kind: str | None = None,
) -> list[dict[str, Any]]:
    async with get_pg_pool().acquire() as conn:
        rows = await conn.fetch(
            """
            WITH work AS (
              SELECT 'approval:' || a.id::text AS id, 'approval_required' AS kind,
                     a.patient_id, a.thread_id, a.id AS resource_id, a.created_at AS updated_at
              FROM clinical_pending_actions a
              WHERE a.owner_user_id = $1 AND a.status = 'pending' AND a.expires_at > now()
              UNION ALL
              SELECT 'draft:' || a.id::text, 'recoverable_draft', a.patient_id,
                     a.thread_id, a.id, a.updated_at
              FROM clinical_turn_artifacts a
              WHERE a.owner_user_id = $1 AND a.status IN ('draft', 'stale')
                AND NOT EXISTS (
                  SELECT 1 FROM clinical_pending_actions p WHERE p.artifact_id = a.id
                  AND p.status = 'pending' AND p.expires_at > now()
                )
              UNION ALL
              SELECT 'drive:' || e.evolution_id::text, 'drive_export_failed', v.patient_id,
                     link.thread_id, e.evolution_id, e.updated_at
              FROM google_drive_evolution_exports e
              JOIN evolutions v ON v.id = e.evolution_id AND v.owner_user_id = $1
              LEFT JOIN LATERAL (
                SELECT a.thread_id FROM clinical_pending_actions a
                WHERE a.owner_user_id = $1 AND a.result_resource_id = e.evolution_id
                  AND a.status = 'approved'
                ORDER BY a.created_at DESC, a.id DESC LIMIT 1
              ) link ON true
              WHERE e.user_id = $1 AND e.status = 'failed'
            ), visible AS (
              SELECT w.*, p.first_name, p.last_name, p.rut_number, p.rut_dv
              FROM work w JOIN patients p ON p.id = w.patient_id AND p.owner_user_id = $1
              WHERE ($2::uuid IS NULL OR w.patient_id = $2)
                AND ($6::text IS NULL OR w.kind = $6)
            ), counts AS (SELECT count(*) AS total FROM visible)
            SELECT page.*, counts.total FROM counts
            LEFT JOIN LATERAL (
              SELECT * FROM visible
              WHERE ($3::timestamptz IS NULL OR (updated_at, id) < ($3, $4::text))
              ORDER BY updated_at DESC, id DESC LIMIT $5
            ) page ON true
            ORDER BY page.updated_at DESC, page.id DESC
            """,
            owner,
            patient_id,
            before[0] if before else None,
            before[1] if before else None,
            limit + 1,
            kind,
        )
    return [dict(row) for row in rows]
