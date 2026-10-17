"""Synthetic pre-retirement evidence. Never called by application code."""

import json
from typing import Any
from uuid import UUID, uuid4

import asyncpg


async def seed_condition_correction(
    pool: asyncpg.Pool,
    owner: UUID,
    patient: UUID,
    identifier: UUID,
    command: dict[str, Any],
) -> dict[str, Any]:
    """Seed a historical correction and optional replacement for read-only tests."""
    revision_id = uuid4()
    replacement = command.get("replacement")
    replacement_id = UUID(replacement["id"]) if replacement else None
    replacement_revision = uuid4() if replacement else None
    keys = ("dentition", "tooth_fdi", "condition_code", "surfaces", "note", "status")
    async with pool.acquire() as conn, conn.transaction():
        before = await conn.fetchrow(
            "SELECT * FROM patient_tooth_conditions WHERE id=$1 AND owner_user_id=$2 AND patient_id=$3",
            identifier,
            owner,
            patient,
        )
        after = await conn.fetchrow(
            "UPDATE patient_tooth_conditions SET status='entered_in_error', revision=revision+1,"
            " updated_by_user_id=$2, updated_at=clock_timestamp() WHERE id=$1 RETURNING *",
            identifier,
            owner,
        )
        await conn.execute(
            """INSERT INTO patient_tooth_condition_revisions
            (id,condition_id,owner_user_id,patient_id,revision,before_snapshot,after_snapshot,
             actor_user_id,changed_at,action,operation_id,correction_reason,command_snapshot,
             replacement_condition_id,replacement_revision_id)
            VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$3,$8,'corrected',$9,$10,$11::jsonb,$12,$13)""",
            revision_id,
            identifier,
            owner,
            patient,
            after["revision"],
            json.dumps({key: before[key] for key in keys}),
            json.dumps({key: after[key] for key in keys}),
            after["updated_at"],
            UUID(command["operation_id"]),
            command["reason"].strip(),
            json.dumps({**command, "condition_id": str(identifier)}),
            replacement_id,
            replacement_revision,
        )
        if replacement:
            row = await conn.fetchrow(
                """INSERT INTO patient_tooth_conditions
                (id,owner_user_id,patient_id,dentition,tooth_fdi,condition_code,surfaces,note,
                 created_by_user_id,updated_by_user_id,supersedes_condition_id)
                VALUES($1,$2,$3,$4,$5,$6,$7,$8,$2,$2,$9) RETURNING *""",
                replacement_id,
                owner,
                patient,
                replacement["dentition"],
                replacement["tooth_fdi"],
                replacement["condition_code"],
                sorted(replacement.get("surfaces", []), key="MDOVL".index),
                replacement.get("note", "").strip() or None,
                identifier,
            )
            await conn.execute(
                """INSERT INTO patient_tooth_condition_revisions
                (id,condition_id,owner_user_id,patient_id,revision,after_snapshot,actor_user_id,changed_at,action)
                VALUES($1,$2,$3,$4,1,$5::jsonb,$3,$6,'created')""",
                replacement_revision,
                replacement_id,
                owner,
                patient,
                json.dumps({key: row[key] for key in keys}),
                row["created_at"],
            )
    return {
        "operation_id": command["operation_id"],
        "condition_id": str(identifier),
        "correction_revision_id": str(revision_id),
        "replacement_condition_id": str(replacement_id) if replacement_id else None,
        "replacement_revision_id": str(replacement_revision) if replacement_revision else None,
    }
