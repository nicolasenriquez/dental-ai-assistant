"""Owner-scoped plan aggregate, serial revision lock, atomic history and command receipts."""

import hashlib
import json
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from asyncpg import Connection

from backend.db import patient_treatments_repo as treatments
from backend.db.patient_notes_repo import _parent
from backend.db.postgres import get_pg_pool
from backend.patients.treatments import TreatmentConflict

_json = treatments._json

TRANSITIONS = {
    "confirm": ({"draft"}, "pending"),
    "accept": ({"pending"}, "active"),
    "reopen": ({"pending"}, "draft"),
    "close": ({"draft", "pending", "active"}, "closed"),
    "reactivate": ({"closed"}, "draft"),
    "archive": ({"completed"}, "archived"),
}


async def _record(
    conn: Connection, owner: UUID, patient: UUID, identifier: UUID, lock: bool = False
) -> dict[str, Any]:
    query = (
        "SELECT * FROM patient_clinical_plans WHERE id=$1 AND owner_user_id=$2 AND patient_id=$3"
    )
    if lock:
        query += " FOR UPDATE"
    row = await conn.fetchrow(query, identifier, owner, patient)
    if row is None:
        raise LookupError
    result = dict(row)
    result.pop("owner_user_id")
    items = await conn.fetch(
        "SELECT * FROM patient_clinical_plan_items WHERE plan_id=$1 AND owner_user_id=$2 AND patient_id=$3 ORDER BY sequence",
        identifier,
        owner,
        patient,
    )
    result["items"] = []
    for row_item in items:
        item = dict(row_item)
        item.pop("owner_user_id")
        item["treatment"] = await treatments._record(conn, owner, patient, item["treatment_id"])
        stages = await conn.fetch(
            "SELECT id,label,note,sequence,status,completed_at,completed_by,cancelled_at,cancelled_by,cancellation_reason,clinical_note_id FROM patient_clinical_plan_stages WHERE item_id=$1 AND plan_id=$2 AND owner_user_id=$3 AND patient_id=$4 ORDER BY sequence",
            item["id"],
            identifier,
            owner,
            patient,
        )
        item["stages"] = [dict(s) for s in stages]
        for stage in item["stages"]:
            stage["clinical_note"] = None
            if stage["clinical_note_id"]:
                note = await conn.fetchrow(
                    "SELECT id,treatment_id,body,revision,created_at,created_by,deleted_at FROM patient_dental_clinical_notes WHERE id=$1 AND owner_user_id=$2 AND patient_id=$3",
                    stage["clinical_note_id"],
                    owner,
                    patient,
                )
                stage["clinical_note"] = dict(note) if note else None
        result["items"].append(item)
    return dict(json.loads(_json(result)))


async def get_plan(owner: UUID, patient: UUID, identifier: UUID) -> dict[str, Any]:
    async with get_pg_pool().acquire() as conn, conn.transaction(isolation="repeatable_read"):
        await _parent(conn, owner, patient)
        return await _record(conn, owner, patient, identifier)


async def _revision(
    conn: Connection,
    owner: UUID,
    patient: UUID,
    before: dict[str, Any] | None,
    after: dict[str, Any],
    action: str,
    reason: str | None = None,
) -> None:
    await conn.execute(
        """INSERT INTO patient_clinical_plan_revisions(id,plan_id,patient_id,owner_user_id,revision,action,before_snapshot,after_snapshot,reason,actor_user_id,changed_at)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$4,$10)""",
        uuid4(),
        UUID(after["id"]),
        patient,
        owner,
        after["revision"],
        action,
        _json(before) if before else None,
        _json(after),
        reason,
        datetime.fromisoformat(after["updated_at"]),
    )


async def _author(
    conn: Connection,
    owner: UUID,
    patient: UUID,
    identifier: UUID,
    action: str,
    body: dict[str, Any],
    before: dict[str, Any],
) -> list[dict[str, Any]]:
    if before["state"] not in ("draft", "pending", "active"):
        raise TreatmentConflict("plan_read_only", before)
    changed: list[dict[str, Any]] = []
    if action == "edit":
        await conn.execute(
            "UPDATE patient_clinical_plans SET title=$4,diagnosis=$5,internal_notes=$6 WHERE id=$1 AND owner_user_id=$2 AND patient_id=$3",
            identifier,
            owner,
            patient,
            body.get("title", before["title"]) or None,
            body.get("diagnosis", before["diagnosis"]) or None,
            body.get("internal_notes", before["internal_notes"]) or None,
        )
    elif action == "add_item":
        treatment = await treatments._insert(conn, owner, patient, body["treatment"], planned=True)
        await treatments._revision(conn, owner, patient, None, treatment, "created")
        item_id = UUID(body["id"])
        inserted = await conn.fetchval(
            "INSERT INTO patient_clinical_plan_items(id,plan_id,patient_id,owner_user_id,treatment_id,sequence) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING RETURNING id",
            item_id,
            identifier,
            patient,
            owner,
            UUID(treatment["id"]),
            len(before["items"]) + 1,
        )
        if inserted is None:
            existing = await conn.fetchrow(
                "SELECT plan_id,patient_id,owner_user_id FROM patient_clinical_plan_items WHERE id=$1",
                item_id,
            )
            if existing is None or (
                existing["plan_id"],
                existing["patient_id"],
                existing["owner_user_id"],
            ) != (identifier, patient, owner):
                raise LookupError
            raise TreatmentConflict("idempotency_conflict", before)
        for sequence, stage in enumerate(body["stages"], 1):
            await conn.execute(
                "INSERT INTO patient_clinical_plan_stages(id,item_id,plan_id,patient_id,owner_user_id,label,note,sequence) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
                uuid4(),
                item_id,
                identifier,
                patient,
                owner,
                stage["label"],
                stage.get("note") or None,
                sequence,
            )
        changed.append({"kind": "treatment", "id": treatment["id"], "revision": 1})
    elif action == "reorder":
        if set(body["item_ids"]) != {i["id"] for i in before["items"]}:
            raise TreatmentConflict("invalid_item_order", before)
        for sequence, item in enumerate(body["item_ids"], 1):
            await conn.execute(
                "UPDATE patient_clinical_plan_items SET sequence=$5 WHERE id=$1 AND plan_id=$2 AND owner_user_id=$3 AND patient_id=$4",
                UUID(item),
                identifier,
                owner,
                patient,
                sequence,
            )
    else:
        item = next((i for i in before["items"] if i["id"] == body["item_id"]), None)
        if item is None:
            raise LookupError
        if item["status"] != "pending":
            raise TreatmentConflict("item_read_only", before)
        if item["treatment"]["state"] != "planned":
            raise TreatmentConflict("treatment_read_only", before)
        item_id = UUID(item["id"])
        if action == "edit_item":
            treatment_id = UUID(item["treatment_id"])
            original = await treatments._record(conn, owner, patient, treatment_id, lock=True)
            await conn.execute(
                "UPDATE patient_dental_treatments SET note=$4,revision=revision+1,updated_at=clock_timestamp(),updated_by_user_id=$2 WHERE id=$1 AND owner_user_id=$2 AND patient_id=$3",
                treatment_id,
                owner,
                patient,
                body.get("note") or None,
            )
            current = await treatments._record(conn, owner, patient, treatment_id)
            await treatments._revision(conn, owner, patient, original, current, "edited")
            changed.append(
                {"kind": "treatment", "id": current["id"], "revision": current["revision"]}
            )
        elif action == "add_stage":
            stage_id = UUID(body["id"])
            inserted = await conn.fetchval(
                "INSERT INTO patient_clinical_plan_stages(id,item_id,plan_id,patient_id,owner_user_id,label,note,sequence) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING RETURNING id",
                stage_id,
                item_id,
                identifier,
                patient,
                owner,
                body["label"],
                body.get("note") or None,
                len(item["stages"]) + 1,
            )
            if inserted is None:
                existing = await conn.fetchrow(
                    "SELECT item_id,plan_id,patient_id,owner_user_id FROM patient_clinical_plan_stages WHERE id=$1",
                    stage_id,
                )
                if existing is None or (
                    existing["item_id"],
                    existing["plan_id"],
                    existing["patient_id"],
                    existing["owner_user_id"],
                ) != (item_id, identifier, patient, owner):
                    raise LookupError
                raise TreatmentConflict("idempotency_conflict", before)
        elif action == "edit_stage":
            stage = next((s for s in item["stages"] if s["id"] == body["stage_id"]), None)
            if stage is None:
                raise LookupError
            if stage["status"] != "pending":
                raise TreatmentConflict("stage_read_only", before)
            await conn.execute(
                "UPDATE patient_clinical_plan_stages SET label=$6,note=$7 WHERE id=$1 AND item_id=$2 AND plan_id=$3 AND owner_user_id=$4 AND patient_id=$5",
                UUID(stage["id"]),
                item_id,
                identifier,
                owner,
                patient,
                body.get("label", stage["label"]),
                body.get("note", stage["note"]) or None,
            )
        else:
            raise ValueError("Comando no disponible")
    return changed


async def command(
    owner: UUID, patient: UUID, identifier: UUID, action: str, body: dict[str, Any]
) -> tuple[dict[str, Any], bool]:
    digest = hashlib.sha256(
        _json(
            {"patient": str(patient), "plan": str(identifier), "action": action, "body": body}
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
        changed = []
        if action == "create":
            inserted = await conn.fetchval(
                "INSERT INTO patient_clinical_plans(id,patient_id,owner_user_id,title,diagnosis,internal_notes,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$3,$3) ON CONFLICT DO NOTHING RETURNING id",
                identifier,
                patient,
                owner,
                body.get("title") or None,
                body.get("diagnosis") or None,
                body.get("internal_notes") or None,
            )
            if inserted is None:
                await _record(conn, owner, patient, identifier)
                raise TreatmentConflict("idempotency_conflict")
        else:
            before = await _record(conn, owner, patient, identifier, lock=True)
            if before["revision"] != body["expected_revision"]:
                raise TreatmentConflict("revision_conflict", before)
            if action in TRANSITIONS:
                await _transition(conn, owner, patient, identifier, action, body, before)
            elif action in ("complete_stage", "cancel_stage"):
                changed = await _execute_stage(
                    conn, owner, patient, identifier, action, body, before
                )
            else:
                changed = await _author(conn, owner, patient, identifier, action, body, before)
            await conn.execute(
                "UPDATE patient_clinical_plans SET revision=revision+1,updated_by=$2,updated_at=clock_timestamp() WHERE id=$1 AND owner_user_id=$2 AND patient_id=$3",
                identifier,
                owner,
                patient,
            )
        current = await _record(conn, owner, patient, identifier)
        await _revision(conn, owner, patient, before, current, action, body.get("reason"))
        changed.insert(0, {"kind": "plan", "id": current["id"], "revision": current["revision"]})
        receipt = {
            "operation_id": str(operation),
            "resource_id": current["id"],
            "revision": current["revision"],
            "changed_resources": changed,
            "committed": current,
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


async def _execution_note(
    conn: Connection, owner: UUID, patient: UUID, treatment: UUID, body: str
) -> dict[str, Any]:
    identifier = uuid4()
    row = await conn.fetchrow(
        "INSERT INTO patient_dental_clinical_notes(id,patient_id,owner_user_id,note_type,treatment_id,body,created_by,updated_by) VALUES($1,$2,$3,'treatment',$4,$5,$3,$3) RETURNING id,treatment_id,body,revision,created_at,created_by,deleted_at",
        identifier,
        patient,
        owner,
        treatment,
        body,
    )
    snapshot = dict(json.loads(_json(dict(row))))
    await conn.execute(
        "INSERT INTO patient_dental_clinical_note_revisions(id,note_id,patient_id,owner_user_id,revision,action,after_snapshot,actor_user_id) VALUES($1,$2,$3,$4,1,'created',$5::jsonb,$4)",
        uuid4(),
        identifier,
        patient,
        owner,
        _json(snapshot),
    )
    return snapshot


async def _execute_stage(
    conn: Connection,
    owner: UUID,
    patient: UUID,
    identifier: UUID,
    action: str,
    body: dict[str, Any],
    before: dict[str, Any],
) -> list[dict[str, Any]]:
    item = next((i for i in before["items"] if i["id"] == body["item_id"]), None)
    stage = next((s for s in item["stages"] if s["id"] == body["stage_id"]), None) if item else None
    if item is None or stage is None:
        raise LookupError
    if before["state"] != "active" or item["status"] != "pending" or stage["status"] != "pending":
        raise TreatmentConflict("stage_read_only", before)
    treatment_id = UUID(item["treatment_id"])
    original = await treatments._record(conn, owner, patient, treatment_id, lock=True)
    if original["state"] != "planned":
        raise TreatmentConflict("treatment_read_only", before)
    completing = action == "complete_stage"
    status = "completed" if completing else "cancelled"
    changed = []
    note_id = None
    if completing and body.get("clinical_note_body"):
        note = await _execution_note(conn, owner, patient, treatment_id, body["clinical_note_body"])
        note_id = UUID(note["id"])
        changed.append({"kind": "clinical_note", "id": note["id"], "revision": note["revision"]})
    await conn.execute(
        "UPDATE patient_clinical_plan_stages SET status=$6,completed_at=CASE WHEN $6='completed' THEN clock_timestamp() END,completed_by=CASE WHEN $6='completed' THEN $4 END,cancelled_at=CASE WHEN $6='cancelled' THEN clock_timestamp() END,cancelled_by=CASE WHEN $6='cancelled' THEN $4 END,cancellation_reason=$7,clinical_note_id=$8 WHERE id=$1 AND item_id=$2 AND plan_id=$3 AND owner_user_id=$4 AND patient_id=$5",
        UUID(stage["id"]),
        UUID(item["id"]),
        identifier,
        owner,
        patient,
        status,
        body.get("reason") if not completing else None,
        note_id,
    )
    statuses = [status if s["id"] == stage["id"] else s["status"] for s in item["stages"]]
    if "pending" not in statuses:
        item_status = "completed" if "completed" in statuses else "cancelled"
        await conn.execute(
            "UPDATE patient_clinical_plan_items SET status=$5 WHERE id=$1 AND plan_id=$2 AND owner_user_id=$3 AND patient_id=$4",
            UUID(item["id"]),
            identifier,
            owner,
            patient,
            item_status,
        )
        await conn.execute(
            "UPDATE patient_dental_treatments SET state=$4,revision=revision+1,updated_at=clock_timestamp(),updated_by_user_id=$2 WHERE id=$1 AND owner_user_id=$2 AND patient_id=$3",
            treatment_id,
            owner,
            patient,
            "performed" if item_status == "completed" else "cancelled",
        )
        if item_status == "completed" and all(
            i["id"] == item["id"] or i["status"] == "completed" for i in before["items"]
        ):
            await conn.execute(
                "UPDATE patient_clinical_plans SET state='completed' WHERE id=$1 AND owner_user_id=$2 AND patient_id=$3",
                identifier,
                owner,
                patient,
            )
    else:
        # Partial execution also appends therapeutic evidence; state remains planned.
        await conn.execute(
            "UPDATE patient_dental_treatments SET revision=revision+1,updated_at=clock_timestamp(),updated_by_user_id=$2 WHERE id=$1 AND owner_user_id=$2 AND patient_id=$3",
            treatment_id,
            owner,
            patient,
        )
    current = await treatments._record(conn, owner, patient, treatment_id)
    snapshot = await _record(conn, owner, patient, identifier)
    executed_item = next(i for i in snapshot["items"] if i["id"] == item["id"])
    # Keep the historical therapeutic action vocabulary readable by older clients.
    await treatments._revision(
        conn,
        owner,
        patient,
        {**original, "execution": {"plan_id": str(identifier), "stages": item["stages"]}},
        {**current, "execution": {"plan_id": str(identifier), "stages": executed_item["stages"]}},
        "edited",
        body.get("reason"),
    )
    changed.append({"kind": "treatment", "id": current["id"], "revision": current["revision"]})
    return changed


async def _transition(
    conn: Connection,
    owner: UUID,
    patient: UUID,
    identifier: UUID,
    action: str,
    body: dict[str, Any],
    before: dict[str, Any],
) -> None:
    sources, target = TRANSITIONS[action]
    if before["state"] not in sources:
        raise TreatmentConflict("illegal_plan_transition", before)
    if action == "confirm" and (
        not before["items"]
        or not any(
            i["status"] == "pending" and any(s["status"] == "pending" for s in i["stages"])
            for i in before["items"]
        )
        or any(not i["stages"] for i in before["items"])
    ):
        raise TreatmentConflict("empty_or_invalid_plan", before)
    await conn.execute(
        "UPDATE patient_clinical_plans SET state=$4 WHERE id=$1 AND owner_user_id=$2 AND patient_id=$3",
        identifier,
        owner,
        patient,
        target,
    )
    if action == "confirm":
        await conn.execute(
            "UPDATE patient_clinical_plans SET confirmed_at=clock_timestamp(),confirmed_by=$2 WHERE id=$1 AND owner_user_id=$2 AND patient_id=$3",
            identifier,
            owner,
            patient,
        )
    elif action == "accept":
        await conn.execute(
            "UPDATE patient_clinical_plans SET accepted_at=clock_timestamp(),accepted_by=$2,acceptance_note=$4 WHERE id=$1 AND owner_user_id=$2 AND patient_id=$3",
            identifier,
            owner,
            patient,
            body.get("note") or None,
        )
    elif action == "close":
        await conn.execute(
            "UPDATE patient_clinical_plans SET closed_at=clock_timestamp(),closed_by=$2,closure_reason=$4,closure_note=$5 WHERE id=$1 AND owner_user_id=$2 AND patient_id=$3",
            identifier,
            owner,
            patient,
            body["reason"],
            body.get("note") or None,
        )
    elif target == "draft":
        await conn.execute(
            "UPDATE patient_clinical_plans SET confirmed_at=NULL,confirmed_by=NULL,accepted_at=NULL,accepted_by=NULL,acceptance_note=NULL,closed_at=NULL,closed_by=NULL,closure_reason=NULL,closure_note=NULL WHERE id=$1 AND owner_user_id=$2 AND patient_id=$3",
            identifier,
            owner,
            patient,
        )


async def list_plans(
    owner: UUID, patient: UUID, limit: int, before: tuple[datetime, UUID] | None, state: str | None
) -> tuple[list[dict[str, Any]], int]:
    async with get_pg_pool().acquire() as conn, conn.transaction(isolation="repeatable_read"):
        await _parent(conn, owner, patient)
        total = await conn.fetchval(
            "SELECT count(*) FROM patient_clinical_plans WHERE owner_user_id=$1 AND patient_id=$2 AND ($3::text IS NULL OR state=$3)",
            owner,
            patient,
            state,
        )
        rows = await conn.fetch(
            "SELECT id FROM patient_clinical_plans WHERE owner_user_id=$1 AND patient_id=$2 AND ($3::text IS NULL OR state=$3) AND ($4::timestamptz IS NULL OR (created_at,id)<($4,$5::uuid)) ORDER BY created_at DESC,id DESC LIMIT $6",
            owner,
            patient,
            state,
            before[0] if before else None,
            before[1] if before else None,
            limit + 1,
        )
        return [await _record(conn, owner, patient, r["id"]) for r in rows], int(total)


async def list_revisions(
    owner: UUID, patient: UUID, identifier: UUID, limit: int, before: tuple[datetime, UUID] | None
) -> tuple[list[dict[str, Any]], int]:
    async with get_pg_pool().acquire() as conn, conn.transaction(isolation="repeatable_read"):
        await _parent(conn, owner, patient)
        await _record(conn, owner, patient, identifier)
        total = await conn.fetchval(
            "SELECT count(*) FROM patient_clinical_plan_revisions WHERE plan_id=$1 AND owner_user_id=$2 AND patient_id=$3",
            identifier,
            owner,
            patient,
        )
        rows = await conn.fetch(
            "SELECT * FROM patient_clinical_plan_revisions WHERE plan_id=$1 AND owner_user_id=$2 AND patient_id=$3 AND ($4::timestamptz IS NULL OR (changed_at,id)<($4,$5::uuid)) ORDER BY changed_at DESC,id DESC LIMIT $6",
            identifier,
            owner,
            patient,
            before[0] if before else None,
            before[1] if before else None,
            limit + 1,
        )
        return [
            {
                "id": str(r["id"]),
                "revision": r["revision"],
                "action": r["action"],
                "before": json.loads(r["before_snapshot"]) if r["before_snapshot"] else None,
                "after": json.loads(r["after_snapshot"]),
                "reason": r["reason"],
                "actor": {"user_id": str(r["actor_user_id"]), "display_name": None},
                "changed_at": r["changed_at"].isoformat(),
            }
            for r in rows
        ], int(total)
