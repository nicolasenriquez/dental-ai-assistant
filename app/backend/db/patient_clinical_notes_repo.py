"""Owner-scoped dental feed and atomic note/history/receipt commands."""

import hashlib
import json
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from asyncpg import Connection

from backend.db.patient_notes_repo import _parent
from backend.db.patient_treatments_repo import _json
from backend.db.postgres import get_pg_pool
from backend.db.users_repo import professional_display_names
from backend.patients.treatments import TreatmentConflict


async def _record(
    conn: Connection, owner: UUID, patient: UUID, identifier: UUID, lock: bool = False
) -> dict[str, Any]:
    row = await conn.fetchrow(
        "SELECT * FROM patient_dental_clinical_notes WHERE id=$1 AND owner_user_id=$2 AND patient_id=$3"
        + (" FOR UPDATE" if lock else ""),
        identifier,
        owner,
        patient,
    )
    if row is None:
        raise LookupError
    result = dict(row)
    result.pop("owner_user_id")
    names = await professional_display_names(conn, [row["created_by"]])
    result["author"] = {
        "user_id": row["created_by"],
        "display_name": names.get(row["created_by"]),
    }
    result["entity_kind"] = (
        "treatment" if row["treatment_id"] else "plan" if row["plan_id"] else "patient"
    )
    result["entity_id"] = row["treatment_id"] or row["plan_id"] or patient
    result["linked_teeth"] = [row["tooth_fdi"]] if row["tooth_fdi"] else []
    result["entity_label"] = None
    if row["treatment_id"]:
        result["entity_label"] = await conn.fetchval(
            "SELECT label_es FROM patient_dental_treatments WHERE id=$1 AND owner_user_id=$2 AND patient_id=$3",
            row["treatment_id"],
            owner,
            patient,
        )
        result["linked_teeth"] = [
            r["tooth_fdi"]
            for r in await conn.fetch(
                "SELECT tooth_fdi FROM patient_dental_treatment_teeth WHERE treatment_id=$1 AND owner_user_id=$2 AND patient_id=$3 ORDER BY tooth_fdi",
                row["treatment_id"],
                owner,
                patient,
            )
        ]
    elif row["plan_id"]:
        result["entity_label"] = await conn.fetchval(
            "SELECT title FROM patient_clinical_plans WHERE id=$1 AND owner_user_id=$2 AND patient_id=$3",
            row["plan_id"],
            owner,
            patient,
        )
    return dict(json.loads(_json(result)))


async def get_note(owner: UUID, patient: UUID, identifier: UUID) -> dict[str, Any]:
    async with get_pg_pool().acquire() as conn, conn.transaction(isolation="repeatable_read"):
        await _parent(conn, owner, patient)
        return await _record(conn, owner, patient, identifier)


async def command(
    owner: UUID, patient: UUID, identifier: UUID, action: str, body: dict[str, Any]
) -> tuple[dict[str, Any], bool]:
    digest = hashlib.sha256(
        _json(
            {
                "kind": "clinical_note",
                "patient": patient,
                "id": identifier,
                "action": action,
                "body": body,
            }
        ).encode()
    ).hexdigest()
    operation = UUID(body["operation_id"])
    async with get_pg_pool().acquire() as conn, conn.transaction():
        await _parent(conn, owner, patient)
        if action != "create":
            await _record(conn, owner, patient, identifier)
        await conn.execute(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))", f"{owner}/{operation}"
        )
        prior = await conn.fetchrow(
            "SELECT payload_hash,receipt FROM patient_clinical_commands WHERE owner_user_id=$1 AND operation_id=$2",
            owner,
            operation,
        )
        if prior:
            if prior["payload_hash"] != digest:
                raise TreatmentConflict("idempotency_conflict")
            return dict(json.loads(prior["receipt"])), False
        before = None
        if action == "create":
            entity = UUID(body["entity_id"])
            treatment = entity if body["entity_kind"] == "treatment" else None
            plan = entity if body["entity_kind"] == "plan" else None
            if body["entity_kind"] == "patient" and entity != patient:
                raise LookupError
            if treatment and not await conn.fetchval(
                "SELECT id FROM patient_dental_treatments WHERE id=$1 AND owner_user_id=$2 AND patient_id=$3 FOR KEY SHARE",
                treatment,
                owner,
                patient,
            ):
                raise LookupError
            if plan and not await conn.fetchval(
                "SELECT id FROM patient_clinical_plans WHERE id=$1 AND owner_user_id=$2 AND patient_id=$3 FOR KEY SHARE",
                plan,
                owner,
                patient,
            ):
                raise LookupError
            inserted = await conn.fetchval(
                "INSERT INTO patient_dental_clinical_notes(id,patient_id,owner_user_id,note_type,treatment_id,plan_id,dentition,tooth_fdi,body,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$3,$3) ON CONFLICT DO NOTHING RETURNING id",
                identifier,
                patient,
                owner,
                body["note_type"],
                treatment,
                plan,
                body.get("dentition"),
                body.get("tooth_fdi"),
                body["body"],
            )
            if not inserted:
                await _record(conn, owner, patient, identifier)
                raise TreatmentConflict("idempotency_conflict")
        else:
            before = await _record(conn, owner, patient, identifier, lock=True)
            if before["revision"] != body["expected_revision"] or before["deleted_at"]:
                raise TreatmentConflict("revision_conflict", before)
            await conn.execute(
                "UPDATE patient_dental_clinical_notes SET body=$4,revision=revision+1,updated_by=$2,updated_at=clock_timestamp(),deleted_at=CASE WHEN $5 THEN clock_timestamp() ELSE deleted_at END WHERE id=$1 AND owner_user_id=$2 AND patient_id=$3",
                identifier,
                owner,
                patient,
                body.get("body", before["body"]),
                action == "delete",
            )
        after = await _record(conn, owner, patient, identifier)
        await conn.execute(
            "INSERT INTO patient_dental_clinical_note_revisions(id,note_id,patient_id,owner_user_id,revision,action,before_snapshot,after_snapshot,actor_user_id,changed_at) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$4,$9)",
            uuid4(),
            identifier,
            patient,
            owner,
            after["revision"],
            {"create": "created", "edit": "edited", "delete": "deleted"}[action],
            _json(before) if before else None,
            _json(after),
            datetime.fromisoformat(after["updated_at"]),
        )
        receipt = {
            "operation_id": str(operation),
            "resource_id": str(identifier),
            "revision": after["revision"],
            "changed_resources": [
                {"kind": "clinical_note", "id": str(identifier), "revision": after["revision"]}
            ],
            "committed": after,
        }
        await conn.execute(
            "INSERT INTO patient_clinical_commands(owner_user_id,operation_id,patient_id,payload_hash,receipt) VALUES($1,$2,$3,$4,$5::jsonb)",
            owner,
            operation,
            patient,
            digest,
            _json(receipt),
        )
        return receipt, True


async def list_notes(
    owner: UUID, patient: UUID, limit: int, before: tuple[datetime, UUID] | None
) -> tuple[list[dict[str, Any]], int]:
    async with get_pg_pool().acquire() as conn, conn.transaction(isolation="repeatable_read"):
        await _parent(conn, owner, patient)
        total = await conn.fetchval(
            "SELECT (SELECT count(*) FROM patient_dental_clinical_notes WHERE owner_user_id=$1 AND patient_id=$2 AND deleted_at IS NULL)+(SELECT count(*) FROM patient_notes WHERE owner_user_id=$1 AND patient_id=$2)",
            owner,
            patient,
        )
        rows = await conn.fetch(
            """SELECT id,created_at,false AS general FROM patient_dental_clinical_notes WHERE owner_user_id=$1 AND patient_id=$2 AND deleted_at IS NULL AND ($3::timestamptz IS NULL OR (created_at,id)<($3,$4)) UNION ALL SELECT id,created_at,true AS general FROM patient_notes WHERE owner_user_id=$1 AND patient_id=$2 AND ($3::timestamptz IS NULL OR (created_at,id)<($3,$4)) ORDER BY created_at DESC,id DESC LIMIT $5""",
            owner,
            patient,
            before[0] if before else None,
            before[1] if before else None,
            limit + 1,
        )
        items = []
        for row in rows:
            if row["general"]:
                general = await conn.fetchrow(
                    "SELECT id,body,revision,created_at,updated_at,created_by_user_id AS created_by FROM patient_notes WHERE id=$1 AND owner_user_id=$2 AND patient_id=$3",
                    row["id"],
                    owner,
                    patient,
                )
                names = await professional_display_names(conn, [general["created_by"]])
                items.append(
                    dict(
                        json.loads(
                            _json(
                                {
                                    **dict(general),
                                    "note_type": "administrative",
                                    "author": {
                                        "user_id": general["created_by"],
                                        "display_name": names.get(general["created_by"]),
                                    },
                                    "entity_kind": "patient",
                                    "entity_id": patient,
                                    "entity_label": None,
                                    "linked_teeth": [],
                                    "tooth_fdi": None,
                                    "dentition": None,
                                    "deleted_at": None,
                                }
                            )
                        )
                    )
                )
            else:
                items.append(await _record(conn, owner, patient, row["id"]))
        return items, int(total)


async def list_revisions(
    owner: UUID, patient: UUID, identifier: UUID, limit: int, before: tuple[datetime, UUID] | None
) -> tuple[list[dict[str, Any]], int]:
    async with get_pg_pool().acquire() as conn, conn.transaction(isolation="repeatable_read"):
        await _parent(conn, owner, patient)
        await _record(conn, owner, patient, identifier)
        total = await conn.fetchval(
            "SELECT count(*) FROM patient_dental_clinical_note_revisions WHERE note_id=$1 AND owner_user_id=$2 AND patient_id=$3",
            identifier,
            owner,
            patient,
        )
        rows = await conn.fetch(
            "SELECT r.id,r.revision,r.action,r.before_snapshot,r.after_snapshot,r.actor_user_id,r.changed_at,u.professional_display_name AS actor_display_name FROM patient_dental_clinical_note_revisions r LEFT JOIN users u ON u.id=r.actor_user_id WHERE r.note_id=$1 AND r.owner_user_id=$2 AND r.patient_id=$3 AND ($4::timestamptz IS NULL OR (r.changed_at,r.id)<($4,$5)) ORDER BY r.changed_at DESC,r.id DESC LIMIT $6",
            identifier,
            owner,
            patient,
            before[0] if before else None,
            before[1] if before else None,
            limit + 1,
        )
        return [dict(r) for r in rows], int(total)
