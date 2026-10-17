"""Delete receipt identity shared by the two resource-owned transactions."""

import hashlib
import json
from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from asyncpg import Connection

from backend.db.patient_treatments_repo import _json
from backend.db.users_repo import professional_display_names
from backend.patients.deletion import DeletionConflict, DentalDeletionReceipt


async def replay(
    conn: Connection,
    owner: UUID,
    patient: UUID,
    identifier: UUID,
    kind: Literal["condition", "procedure"],
    operation: UUID,
    expected: int,
) -> tuple[str, dict[str, Any] | None]:
    digest = hashlib.sha256(
        _json(
            {
                "version": 1,
                "kind": kind,
                "action": "deleted",
                "patient_id": str(patient),
                "resource_id": str(identifier),
                "expected_revision": expected,
            }
        ).encode("utf-8")
    ).hexdigest()
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
            raise DeletionConflict("idempotency_conflict")
        return digest, dict(json.loads(prior["receipt"]))
    return digest, None


async def commit_receipt(
    conn: Connection,
    owner: UUID,
    patient: UUID,
    identifier: UUID,
    kind: Literal["condition", "procedure"],
    operation: UUID,
    digest: str,
    revision: int,
    revision_id: UUID,
    deleted_at: datetime,
) -> dict[str, Any]:
    names = await professional_display_names(conn, [owner])
    receipt: dict[str, Any] = DentalDeletionReceipt.model_validate(
        {
            "operation_id": str(operation),
            "resource_kind": kind,
            "resource_id": str(identifier),
            "action": "deleted",
            "revision": revision,
            "revision_id": str(revision_id),
            "deleted_at": deleted_at.isoformat(),
            "actor": {"user_id": str(owner), "display_name": names.get(owner)},
        }
    ).model_dump(mode="json")
    await conn.execute(
        """INSERT INTO patient_clinical_commands
        (owner_user_id,operation_id,patient_id,payload_hash,receipt,committed_at)
        VALUES($1,$2,$3,$4,$5::jsonb,$6)""",
        owner,
        operation,
        patient,
        digest,
        _json(receipt),
        deleted_at,
    )
    return receipt
