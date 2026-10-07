"""Owner-scoped observed procedures. Clinical row, members, history and receipt commit together."""

import hashlib
import json
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from asyncpg import Connection

from backend.db.patient_notes_repo import _parent
from backend.db.postgres import get_pg_pool
from backend.db.users_repo import professional_display_names
from backend.patients.treatment_catalog import VARIANTS, VERSION
from backend.patients.treatments import TreatmentConflict, validate_surfaces


def _json(value: Any) -> str:
    return json.dumps(value, default=str, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


async def _record(
    conn: Connection, owner: UUID, patient: UUID, identifier: UUID, lock: bool = False
) -> dict[str, Any]:
    query = (
        "SELECT * FROM patient_dental_treatments WHERE id=$1 AND owner_user_id=$2 AND patient_id=$3"
    )
    if lock:
        query += " FOR UPDATE"
    row = await conn.fetchrow(query, identifier, owner, patient)
    if row is None:
        raise LookupError
    members = await conn.fetch(
        "SELECT tooth_fdi,role,surfaces FROM patient_dental_treatment_teeth WHERE treatment_id=$1 AND owner_user_id=$2 AND patient_id=$3 ORDER BY tooth_fdi",
        identifier,
        owner,
        patient,
    )
    result = dict(row)
    result.pop("owner_user_id")
    result["teeth"] = [dict(m) for m in members]
    names = await professional_display_names(
        conn, [row["created_by_user_id"], row["updated_by_user_id"]]
    )
    created = result.pop("created_by_user_id")
    updated = result.pop("updated_by_user_id")
    result["created_by"] = {"user_id": created, "display_name": names.get(created)}
    result["updated_by"] = {"user_id": updated, "display_name": names.get(updated)}
    return dict(json.loads(_json(result)))


async def get_treatment(owner: UUID, patient: UUID, identifier: UUID) -> dict[str, Any]:
    async with get_pg_pool().acquire() as conn, conn.transaction(isolation="repeatable_read"):
        await _parent(conn, owner, patient)
        return await _record(conn, owner, patient, identifier)


async def _insert(
    conn: Connection,
    owner: UUID,
    patient: UUID,
    value: dict[str, Any],
    supersedes: UUID | None = None,
    planned: bool = False,
) -> dict[str, Any]:
    variant = VARIANTS[value["variant_id"]]
    identifier = UUID(value["id"])
    inserted = await conn.fetchval(
        """
        INSERT INTO patient_dental_treatments
        (id,owner_user_id,patient_id,variant_id,catalog_version,label_es,clinical_type,category_key,scope,dentition,provenance,state,note,created_by_user_id,updated_by_user_id,supersedes_id,arch)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$14,$15,$11,$2,$2,$12,$13)
        ON CONFLICT DO NOTHING RETURNING id
    """,
        identifier,
        owner,
        patient,
        variant["id"],
        VERSION,
        variant["label_es"],
        variant["clinical_type"],
        variant["category_key"],
        variant["scope"],
        value["dentition"],
        value.get("note"),
        supersedes,
        value.get("arch"),
        "planned_in_clinic" if planned else "observed_existing",
        "planned" if planned else "existing",
    )
    if inserted is None:
        # A UUID belonging to another owner/patient is unavailable, never a disclosed collision.
        await _record(conn, owner, patient, identifier)
        raise TreatmentConflict("idempotency_conflict")
    for member in value["teeth"]:
        await conn.execute(
            """INSERT INTO patient_dental_treatment_teeth
            (treatment_id,patient_id,owner_user_id,dentition,tooth_fdi,role,surfaces)
            VALUES($1,$2,$3,$4,$5,$6,$7)""",
            identifier,
            patient,
            owner,
            value["dentition"],
            member["tooth_fdi"],
            member["role"],
            member["surfaces"],
        )
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
        """INSERT INTO patient_dental_treatment_revisions
        (id,treatment_id,patient_id,owner_user_id,revision,action,before_snapshot,after_snapshot,reason,actor_user_id,changed_at)
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


async def command(
    owner: UUID, patient: UUID, identifier: UUID, action: str, body: dict[str, Any]
) -> tuple[dict[str, Any], bool]:
    payload = {
        "patient_id": str(patient),
        "resource_id": str(identifier),
        "action": action,
        "body": body,
    }
    digest = hashlib.sha256(_json(payload).encode()).hexdigest()
    operation = UUID(body["operation_id"])
    async with get_pg_pool().acquire() as conn, conn.transaction():
        await _parent(conn, owner, patient)
        if action != "create":
            await _record(conn, owner, patient, identifier)
        # Serialize operation identity across resources; resource lock follows this lock.
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
        changed = []
        plan_before = None
        plan_current = None
        if action != "create":
            # Shared aggregate lock always precedes therapeutic row locks.
            from backend.db import patient_clinical_plans_repo as plans

            plan_id = await conn.fetchval(
                "SELECT plan_id FROM patient_clinical_plan_items WHERE treatment_id=$1 AND owner_user_id=$2 AND patient_id=$3",
                identifier,
                owner,
                patient,
            )
            if plan_id:
                plan_before = await plans._record(conn, owner, patient, plan_id, lock=True)
                if body.get("expected_plan_revision") is None:
                    raise ValueError("La corrección requiere la revisión actual del plan")
                if plan_before["revision"] != body["expected_plan_revision"]:
                    raise TreatmentConflict("revision_conflict", plan_before)
        if action == "create":
            current = await _insert(conn, owner, patient, body)
            await _revision(conn, owner, patient, None, current, "created")
        else:
            before = await _record(conn, owner, patient, identifier, lock=True)
            if before["revision"] != body["expected_revision"]:
                raise TreatmentConflict("revision_conflict", plan_before or before)
            if plan_before:
                if action != "correct" or before["state"] == "entered_in_error":
                    raise TreatmentConflict("treatment_read_only", plan_before)
            elif before["state"] != "existing" or before["provenance"] != "observed_existing":
                raise TreatmentConflict("treatment_read_only", before)
            if action == "edit":
                note = body.get("note", before["note"])
                if "surfaces" in body:
                    surfaces = validate_surfaces(body["surfaces"], before["variant_id"])
                    await conn.execute(
                        "UPDATE patient_dental_treatment_teeth SET surfaces=$4 WHERE treatment_id=$1 AND owner_user_id=$2 AND patient_id=$3",
                        identifier,
                        owner,
                        patient,
                        surfaces,
                    )
                await conn.execute(
                    "UPDATE patient_dental_treatments SET note=$4,revision=revision+1,updated_by_user_id=$2,updated_at=clock_timestamp() WHERE id=$1 AND owner_user_id=$2 AND patient_id=$3",
                    identifier,
                    owner,
                    patient,
                    note,
                )
            else:
                replacement = body.get("replacement")
                replacement_id = UUID(replacement["id"]) if replacement else None
                if replacement_id == identifier:
                    raise TreatmentConflict("idempotency_conflict")
                await conn.execute(
                    "UPDATE patient_dental_treatments SET state='entered_in_error',replacement_id=$4,revision=revision+1,updated_by_user_id=$2,updated_at=clock_timestamp() WHERE id=$1 AND owner_user_id=$2 AND patient_id=$3",
                    identifier,
                    owner,
                    patient,
                    replacement_id,
                )
                if replacement:
                    new = await _insert(
                        conn, owner, patient, replacement, identifier, planned=bool(plan_before)
                    )
                    if plan_before:
                        await conn.execute(
                            "UPDATE patient_dental_treatments SET state=$4 WHERE id=$1 AND owner_user_id=$2 AND patient_id=$3",
                            UUID(new["id"]),
                            owner,
                            patient,
                            before["state"],
                        )
                        new = await _record(conn, owner, patient, UUID(new["id"]))
                    replacement_snapshot = new
                    if plan_before:
                        linked_item = next(
                            i for i in plan_before["items"] if i["treatment_id"] == str(identifier)
                        )
                        replacement_snapshot = {
                            **new,
                            "execution": {"plan_id": str(plan_id), "stages": linked_item["stages"]},
                        }
                    await _revision(conn, owner, patient, None, replacement_snapshot, "created")
                    changed.append({"kind": "treatment", "id": new["id"], "revision": 1})
            current = await _record(conn, owner, patient, identifier)
            prior_snapshot, current_snapshot = before, current
            if plan_before:
                linked_item = next(
                    i for i in plan_before["items"] if i["treatment_id"] == str(identifier)
                )
                execution = {"plan_id": str(plan_id), "stages": linked_item["stages"]}
                prior_snapshot = {**before, "execution": execution}
                current_snapshot = {**current, "execution": execution}
            await _revision(
                conn,
                owner,
                patient,
                prior_snapshot,
                current_snapshot,
                "edited" if action == "edit" else "corrected",
                body.get("reason"),
            )
            if plan_before:
                await conn.execute(
                    "UPDATE patient_clinical_plans SET revision=revision+1,updated_by=$2,updated_at=clock_timestamp() WHERE id=$1 AND owner_user_id=$2 AND patient_id=$3",
                    plan_id,
                    owner,
                    patient,
                )
                plan_current = await plans._record(conn, owner, patient, plan_id)
                await plans._revision(
                    conn,
                    owner,
                    patient,
                    plan_before,
                    plan_current,
                    "correct_treatment",
                    body["reason"],
                )
                changed.append(
                    {"kind": "plan", "id": plan_current["id"], "revision": plan_current["revision"]}
                )
        changed.insert(
            0, {"kind": "treatment", "id": current["id"], "revision": current["revision"]}
        )
        receipt = {
            "operation_id": str(operation),
            "resource_id": current["id"],
            "revision": current["revision"],
            "changed_resources": changed,
            "committed": current,
        }
        if plan_current:
            receipt["committed_plan"] = plan_current
        await conn.execute(
            "INSERT INTO patient_clinical_commands(owner_user_id,operation_id,patient_id,payload_hash,receipt) VALUES($1,$2,$3,$4,$5::jsonb)",
            owner,
            operation,
            patient,
            digest,
            _json(receipt),
        )
        return receipt, True


async def list_treatments(
    owner: UUID,
    patient: UUID,
    limit: int,
    before: tuple[datetime, UUID] | None,
    dentition: str | None,
) -> tuple[list[dict[str, Any]], int]:
    async with get_pg_pool().acquire() as conn, conn.transaction(isolation="repeatable_read"):
        await _parent(conn, owner, patient)
        total = await conn.fetchval(
            "SELECT count(*) FROM patient_dental_treatments WHERE owner_user_id=$1 AND patient_id=$2 AND state!='planned' AND ($3::text IS NULL OR dentition=$3)",
            owner,
            patient,
            dentition,
        )
        rows = await conn.fetch(
            """SELECT id FROM patient_dental_treatments WHERE owner_user_id=$1 AND patient_id=$2 AND state!='planned' AND ($3::text IS NULL OR dentition=$3)
            AND ($4::timestamptz IS NULL OR (created_at,id)<($4,$5::uuid)) ORDER BY created_at DESC,id DESC LIMIT $6""",
            owner,
            patient,
            dentition,
            before[0] if before else None,
            before[1] if before else None,
            limit + 1,
        )
        return [await _record(conn, owner, patient, row["id"]) for row in rows], int(total)


async def list_revisions(
    owner: UUID, patient: UUID, identifier: UUID, limit: int, before: tuple[datetime, UUID] | None
) -> tuple[list[dict[str, Any]], int]:
    async with get_pg_pool().acquire() as conn, conn.transaction(isolation="repeatable_read"):
        await _parent(conn, owner, patient)
        await _record(conn, owner, patient, identifier)
        total = await conn.fetchval(
            "SELECT count(*) FROM patient_dental_treatment_revisions WHERE treatment_id=$1 AND owner_user_id=$2 AND patient_id=$3",
            identifier,
            owner,
            patient,
        )
        rows = await conn.fetch(
            """SELECT r.*,u.professional_display_name AS actor_display_name FROM patient_dental_treatment_revisions r
            LEFT JOIN users u ON u.id=r.actor_user_id WHERE r.treatment_id=$1 AND r.owner_user_id=$2 AND r.patient_id=$3
            AND ($4::timestamptz IS NULL OR (r.changed_at,r.id)<($4,$5::uuid)) ORDER BY r.changed_at DESC,r.id DESC LIMIT $6""",
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
                "actor": {
                    "user_id": str(r["actor_user_id"]),
                    "display_name": r["actor_display_name"],
                },
                "changed_at": r["changed_at"].isoformat(),
            }
            for r in rows
        ], int(total)
