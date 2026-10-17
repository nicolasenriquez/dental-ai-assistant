"""Read-only temporal dental-history projection over append-only revisions.

Each read runs parent ownership, coverage, epoch, rows and totals in one
read-only repeatable-read transaction. Revision snapshots come from the stored
JSONB evidence, never from today's source row.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any
from uuid import UUID

from backend.db.patient_notes_repo import _parent
from backend.db.postgres import get_pg_pool
from backend.patients import dental_history

_EVENTS_SCOPED = """
    SELECT r.id AS event_id, 'condition' AS resource_kind, r.condition_id AS resource_id,
           r.revision, r.action, r.changed_at, r.before_snapshot, r.after_snapshot,
           r.actor_user_id, u.professional_display_name AS actor_display_name
    FROM patient_tooth_condition_revisions r
    JOIN patient_tooth_conditions s ON s.id = r.condition_id
        AND s.owner_user_id = r.owner_user_id AND s.patient_id = r.patient_id
    LEFT JOIN users u ON u.id = r.actor_user_id
    WHERE r.owner_user_id = $1 AND r.patient_id = $2 AND s.dentition = $3
      AND ($4::timestamptz IS NULL OR r.changed_at >= $4)
      AND ($5::timestamptz IS NULL OR r.changed_at < $5)
    UNION ALL
    SELECT r.id, 'procedure', r.treatment_id, r.revision, r.action, r.changed_at,
           r.before_snapshot, r.after_snapshot, r.actor_user_id, u.professional_display_name
    FROM patient_dental_treatment_revisions r
    JOIN patient_dental_treatments s ON s.id = r.treatment_id
        AND s.owner_user_id = r.owner_user_id AND s.patient_id = r.patient_id
    LEFT JOIN users u ON u.id = r.actor_user_id
    WHERE r.owner_user_id = $1 AND r.patient_id = $2 AND s.dentition = $3
      AND ($4::timestamptz IS NULL OR r.changed_at >= $4)
      AND ($5::timestamptz IS NULL OR r.changed_at < $5)
"""

_EVENTS_PAGE = (
    "WITH scoped AS ("
    + _EVENTS_SCOPED
    + """
    )
    SELECT * FROM scoped
    WHERE $6::timestamptz IS NULL
       OR (scoped.changed_at, scoped.resource_kind, scoped.event_id) < ($6::timestamptz, $7::text, $8::uuid)
    ORDER BY scoped.changed_at DESC, scoped.resource_kind DESC, scoped.event_id DESC
    LIMIT $9
"""
)

_EVENTS_TOTAL = "WITH scoped AS (" + _EVENTS_SCOPED + ") SELECT count(*) FROM scoped"

_LATEST = """
    WITH latest AS (
        (SELECT DISTINCT ON (r.condition_id)
            'condition' AS resource_kind, r.condition_id AS resource_id, r.revision,
            r.changed_at, r.after_snapshot
         FROM patient_tooth_condition_revisions r
         JOIN patient_tooth_conditions s ON s.id = r.condition_id
             AND s.owner_user_id = r.owner_user_id AND s.patient_id = r.patient_id
         WHERE r.owner_user_id = $1 AND r.patient_id = $2 AND s.dentition = $3
           AND ($4::timestamptz IS NULL OR r.changed_at < $4)
         ORDER BY r.condition_id, r.revision DESC)
        UNION ALL
        (SELECT DISTINCT ON (r.treatment_id)
            'procedure', r.treatment_id, r.revision, r.changed_at, r.after_snapshot
         FROM patient_dental_treatment_revisions r
         JOIN patient_dental_treatments s ON s.id = r.treatment_id
             AND s.owner_user_id = r.owner_user_id AND s.patient_id = r.patient_id
         WHERE r.owner_user_id = $1 AND r.patient_id = $2 AND s.dentition = $3
           AND ($4::timestamptz IS NULL OR r.changed_at < $4)
         ORDER BY r.treatment_id, r.revision DESC)
    )
    SELECT * FROM latest ORDER BY resource_kind, resource_id
"""

_COVERAGE = """
    SELECT 'condition' AS resource_kind, r.id AS revision_id, r.condition_id AS resource_id,
           r.revision, r.changed_at, s.revision AS current_revision
    FROM patient_tooth_condition_revisions r
    LEFT JOIN patient_tooth_conditions s ON s.id = r.condition_id
        AND s.owner_user_id = r.owner_user_id AND s.patient_id = r.patient_id
    WHERE r.owner_user_id = $1 AND r.patient_id = $2 AND (s.id IS NULL OR s.dentition = $3)
    UNION ALL
    SELECT 'procedure', r.id, r.treatment_id, r.revision, r.changed_at, s.revision
    FROM patient_dental_treatment_revisions r
    LEFT JOIN patient_dental_treatments s ON s.id = r.treatment_id
        AND s.owner_user_id = r.owner_user_id AND s.patient_id = r.patient_id
    WHERE r.owner_user_id = $1 AND r.patient_id = $2 AND (s.id IS NULL OR s.dentition = $3)
"""


def _snapshot(kind: str, raw: str) -> dict[str, Any]:
    value: dict[str, Any] = json.loads(raw)
    if kind == "condition":
        result: dict[str, Any] = dental_history.condition_snapshot(value)
        return result
    stored: dict[str, Any] = dental_history.treatment_snapshot(value)
    return stored


def _event(row: Any) -> dict[str, Any]:
    kind = row["resource_kind"]
    return {
        "event_id": row["event_id"],
        "resource_kind": kind,
        "resource_id": row["resource_id"],
        "revision": row["revision"],
        "action": row["action"],
        "changed_at": row["changed_at"],
        "actor_user_id": row["actor_user_id"],
        "actor_display_name": row["actor_display_name"],
        "before": _snapshot(kind, row["before_snapshot"]) if row["before_snapshot"] else None,
        "after": _snapshot(kind, row["after_snapshot"]),
    }


async def _epoch_and_coverage(
    conn: Any, owner: UUID, patient: UUID, dentition: str
) -> dict[str, Any]:
    rows = await conn.fetch(_COVERAGE, owner, patient, dentition)
    revisions: list[tuple[str, UUID]] = []
    initial: set[tuple[str, UUID]] = set()
    markers: set[tuple[str, UUID, bool, bool]] = set()
    earliest: datetime | None = None
    for row in rows:
        key = (row["resource_kind"], row["resource_id"])
        revisions.append((row["resource_kind"], row["revision_id"]))
        if row["revision"] == 1:
            initial.add(key)
        if earliest is None or row["changed_at"] < earliest:
            earliest = row["changed_at"]
    for row in rows:
        key = (row["resource_kind"], row["resource_id"])
        orphan = row["current_revision"] is None
        missing = not orphan and key not in initial
        if orphan or missing:
            markers.add((key[0], key[1], missing, orphan))
    return {
        "epoch": dental_history.epoch_digest(revisions, sorted(markers)),
        "coverage": {
            "state": "partial" if markers else "complete",
            "earliest_recorded_at": earliest,
            "warnings": sorted(
                warning
                for warning, present in (
                    ("missing_initial_revision", any(marker[2] for marker in markers)),
                    ("orphan_revision", any(marker[3] for marker in markers)),
                )
                if present
            ),
        },
    }


async def events(
    owner: UUID,
    patient: UUID,
    dentition: str,
    start: datetime | None,
    cutoff: datetime | None,
    after: tuple[datetime, str, UUID] | None,
    limit: int,
) -> dict[str, Any]:
    # READ ONLY would reject the shared parent FOR KEY SHARE ownership lock;
    # repeatable read still yields one consistent snapshot.
    async with (
        get_pg_pool().acquire() as conn,
        conn.transaction(isolation="repeatable_read"),
    ):
        await _parent(conn, owner, patient)
        read_at = await conn.fetchval("SELECT now()")
        rows = await conn.fetch(
            _EVENTS_PAGE,
            owner,
            patient,
            dentition,
            start,
            cutoff,
            after[0] if after else None,
            after[1] if after else None,
            after[2] if after else None,
            limit + 1,
        )
        total = await conn.fetchval(_EVENTS_TOTAL, owner, patient, dentition, start, cutoff)
        epoch = await _epoch_and_coverage(conn, owner, patient, dentition)
    return {
        "items": [_event(row) for row in rows[:limit]],
        "has_more": len(rows) > limit,
        "total_events": int(total),
        "epoch": epoch["epoch"],
        "read_at": read_at,
    }


def _counts(items: list[dict[str, Any]]) -> dict[str, int]:
    charted = [item for item in items if item["chart_eligible"]]
    teeth: set[tuple[str, int]] = set()
    arches: set[tuple[str, int | str]] = set()
    for item in charted:
        snapshot = item["snapshot"]
        if item["resource_kind"] == "condition":
            teeth.add((snapshot["dentition"], snapshot["tooth_fdi"]))
            continue
        for member in snapshot.get("teeth") or []:
            teeth.add((snapshot["dentition"], member["tooth_fdi"]))
        if snapshot.get("scope") == "global_arch" and snapshot.get("arch"):
            arches.add((snapshot["dentition"], snapshot["arch"]))
    findings = sum(1 for item in items if item["resource_kind"] == "condition")
    return {
        "records": len(items),
        "findings": findings,
        "procedures": len(items) - findings,
        "charted_records": len(charted),
        "affected_teeth": len(teeth),
        "affected_arches": len(arches),
    }


async def snapshot(
    owner: UUID,
    patient: UUID,
    dentition: str,
    cutoff: datetime | None,
    after: tuple[str, UUID] | None,
    limit: int,
) -> dict[str, Any]:
    # READ ONLY would reject the shared parent FOR KEY SHARE ownership lock;
    # repeatable read still yields one consistent snapshot.
    async with (
        get_pg_pool().acquire() as conn,
        conn.transaction(isolation="repeatable_read"),
    ):
        await _parent(conn, owner, patient)
        read_at = await conn.fetchval("SELECT now()")
        rows = await conn.fetch(_LATEST, owner, patient, dentition, cutoff)
        epoch = await _epoch_and_coverage(conn, owner, patient, dentition)
    items: list[dict[str, Any]] = []
    deleted = 0
    for row in rows:
        kind = row["resource_kind"]
        stored = _snapshot(kind, row["after_snapshot"])
        if stored.get("deleted_at") is not None:
            deleted += 1
            continue
        items.append(
            {
                "resource_kind": kind,
                "resource_id": row["resource_id"],
                "revision": row["revision"],
                "changed_at": row["changed_at"],
                "snapshot": stored,
                "chart_eligible": dental_history.chart_eligible(kind, stored),
            }
        )
    counts = _counts(items)
    counts["deleted_records"] = deleted
    items.sort(key=lambda item: (item["resource_kind"], str(item["resource_id"])))
    if after is not None:
        bound = (after[0], str(after[1]))
        items = [
            item for item in items if (item["resource_kind"], str(item["resource_id"])) > bound
        ]
    return {
        "items": items[:limit],
        "has_more": len(items) > limit,
        "counts": counts,
        "coverage": epoch["coverage"],
        "epoch": epoch["epoch"],
        "read_at": read_at,
    }
