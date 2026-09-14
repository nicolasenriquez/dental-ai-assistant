"""Approval intent preparation and time boundaries for evolution exports."""

from __future__ import annotations

import hashlib
from datetime import datetime
from typing import Any, cast
from uuid import UUID, uuid4

from asyncpg import Connection

from backend import config
from backend.db import evolution_exports_repo
from backend.patients.rut import mask_rut

JOURNAL_DELIMITER = "=" * 60


def to_clinical_timezone(value: datetime) -> datetime:
    """Convert an aware timestamp to the configured clinical timezone."""
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("Clinical timestamps must include a timezone")
    return value.astimezone(config.CLINICAL_TIMEZONE_INFO)


def derive_period_key(approval_at: datetime, period_type: str) -> str:
    """Derive daily or ISO-week grouping from the approval timestamp only."""
    local = to_clinical_timezone(approval_at)
    if period_type == "daily":
        return local.date().isoformat()
    if period_type == "weekly":
        iso = local.isocalendar()
        return f"{iso.year}-W{iso.week:02d}"
    raise ValueError("period_type must be 'weekly' or 'daily'")


def format_journal_v1_header(evolution_at: datetime) -> str:
    """Format V1's localized evolution header from canonical evolution time."""
    local = to_clinical_timezone(evolution_at)
    return f"EVOLUCIÓN · {local:%d-%m-%Y · %H:%M}"


def serialize_journal_v1(
    *,
    evolution_id: UUID | str,
    evolution_at: datetime,
    patient_display_name: str,
    patient_rut_masked: str,
    approved_body: str,
) -> tuple[str, str]:
    """Return the frozen Journal V1 block and its UTF-8 SHA-256 hash."""
    normalized_body = approved_body.replace("\r\n", "\n").replace("\r", "\n").rstrip("\n")
    block = (
        f"{JOURNAL_DELIMITER}\n"
        f"{format_journal_v1_header(evolution_at)}\n"
        f"Paciente: {patient_display_name}\n"
        f"RUT: {patient_rut_masked}\n"
        f"Dental AI ID: {evolution_id}\n"
        f"{JOURNAL_DELIMITER}\n\n"
        f"{normalized_body}\n"
        f"{JOURNAL_DELIMITER}\n"
    )
    return block, hashlib.sha256(block.encode("utf-8")).hexdigest()


async def persist_approval_export(
    conn: Connection,
    owner_user_id: UUID | str,
    evolution: dict[str, Any],
    patient: dict[str, Any],
    approval_at: datetime,
) -> dict[str, Any] | None:
    """Freeze and persist export intent while approval transaction is open."""
    connection = await evolution_exports_repo.get_connection_for_approval(conn, owner_user_id)
    if connection is None:
        return None

    connection_status = connection["status"]
    if connection_status not in {"active", "disconnected", "revoked"}:
        raise ValueError("Unsupported Google Drive connection status")
    period_type = str(connection["evolution_export_frequency"])
    period_key = derive_period_key(approval_at, period_type)
    journal_block, content_hash = serialize_journal_v1(
        evolution_id=evolution["id"],
        evolution_at=evolution["evolution_at"],
        patient_display_name=f"{patient['first_name']} {patient['last_name']}",
        patient_rut_masked=mask_rut(int(patient["rut_number"]), str(patient["rut_dv"])),
        approved_body=str(evolution["final_text"]),
    )
    usable = connection_status == "active"
    return cast(
        dict[str, Any] | None,
        await evolution_exports_repo.create_export_intent_with_connection(
            conn,
            owner_user_id,
            evolution["id"],
            operation_id=uuid4(),
            period_type=period_type,
            period_key=period_key,
            status="pending" if usable else "failed",
            journal_block=journal_block,
            content_hash=content_hash,
            last_error_code=None if usable else "DRIVE_CONNECTION_REQUIRED",
        ),
    )
