"""Approval intent preparation and time boundaries for evolution exports."""

from __future__ import annotations

import hashlib
import hmac
import logging
import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Any, cast
from uuid import UUID, uuid4

from asyncpg import Connection, Pool

from backend import config
from backend.auth import token_cipher
from backend.auth.token_cipher import Ciphertext
from backend.db import evolution_exports_repo, google_drive_repo
from backend.db.postgres import get_pg_pool
from backend.integrations import google_drive, google_drive_oauth
from backend.patients.rut import mask_rut

logger = logging.getLogger(__name__)

JOURNAL_DELIMITER = "=" * 60
JOURNAL_CONTENT_HASH_MISMATCH = "JOURNAL_CONTENT_HASH_MISMATCH"
JOURNAL_BLOCK_TOO_LARGE = "JOURNAL_BLOCK_TOO_LARGE"
JOURNAL_IDENTITY_CONFLICT = "JOURNAL_IDENTITY_CONFLICT"

_PERIOD_PATTERNS = {
    "weekly": re.compile(r"^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$"),
    "daily": re.compile(r"^\d{4}-\d{2}-\d{2}$"),
}


@dataclass(frozen=True)
class JournalIdentity:
    """Provider name and exact app properties for one journal part."""

    name: str
    app_properties: dict[str, str]


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


def verify_persisted_block(journal_block: str, content_hash: str) -> bytes:
    """Verify frozen persisted bytes before any provider operation."""
    try:
        encoded = journal_block.encode("utf-8")
    except UnicodeEncodeError as exc:
        raise ValueError(JOURNAL_CONTENT_HASH_MISMATCH) from exc
    actual = hashlib.sha256(encoded).hexdigest()
    if not hmac.compare_digest(actual, str(content_hash)):
        raise ValueError(JOURNAL_CONTENT_HASH_MISMATCH)
    return encoded


def journal_identity(period_type: str, period_key: str, journal_part: int) -> JournalIdentity:
    """Build deterministic journal filename and the complete managed identity."""
    pattern = _PERIOD_PATTERNS.get(period_type)
    if pattern is None or not pattern.fullmatch(period_key):
        raise ValueError("Invalid journal period")
    if journal_part < 1:
        raise ValueError("journal_part must be positive")
    suffix = "" if journal_part == 1 else f" — {journal_part}"
    period = f"{period_key}{suffix}"
    return JournalIdentity(
        name=f"Evoluciones — {period}.txt",
        app_properties={
            "managedBy": google_drive.MANAGED_BY,
            "artifactType": "evolution-journal",
            "periodType": period_type,
            "periodKey": period_key,
            "journalPart": str(journal_part),
        },
    )


def _part_values(part: object) -> tuple[int, bytes]:
    if isinstance(part, Mapping):
        raw_part = part.get("journal_part", part.get("part"))
        raw_content = part.get("content", part.get("body", b""))
    else:
        try:
            raw_part, raw_content = part  # type: ignore[misc]
        except (TypeError, ValueError) as exc:
            raise ValueError("Invalid journal part") from exc
    try:
        number = int(raw_part)
    except (TypeError, ValueError) as exc:
        raise ValueError("Invalid journal part") from exc
    if number < 1:
        raise ValueError("journal_part must be positive")
    if isinstance(raw_content, bytes):
        return number, raw_content
    if isinstance(raw_content, str):
        return number, raw_content.encode("utf-8")
    raise ValueError("Invalid journal content")


def select_journal_part(
    parts: Iterable[object],
    journal_block: str | bytes,
    *,
    max_content_bytes: int = google_drive.MAX_CONTENT_BYTES,
) -> int:
    """Choose latest fitting part, or the next part, using UTF-8 byte length."""
    block = journal_block if isinstance(journal_block, bytes) else journal_block.encode("utf-8")
    if max_content_bytes < 1 or len(block) > max_content_bytes:
        raise ValueError(JOURNAL_BLOCK_TOO_LARGE)
    normalized = sorted((_part_values(part) for part in parts), key=lambda value: value[0])
    if not normalized:
        return 1
    latest_part, latest_content = normalized[-1]
    return latest_part if len(latest_content) + len(block) <= max_content_bytes else latest_part + 1


def resolve_unique_journal(matches: Iterable[Mapping[str, Any]]) -> dict[str, Any] | None:
    """Return one exact provider match and reject duplicate identities."""
    candidates = [dict(match) for match in matches]
    if len(candidates) > 1:
        raise ValueError(JOURNAL_IDENTITY_CONFLICT)
    return candidates[0] if candidates else None


def recovery_mode(previous_status: str) -> str:
    """Map pre-claim state to its only permitted provider workflow."""
    return {
        "pending": "sync",
        "failed": "sync",
        "syncing": "reconcile_then_sync",
        "unknown": "verify_only",
        "synced": "no_op",
    }.get(previous_status, "invalid")


def _journal_properties_match(metadata: Mapping[str, Any], identity: JournalIdentity) -> bool:
    """Accept only the exact five-key journal identity owned by this service."""
    return dict(metadata.get("appProperties") or {}) == identity.app_properties


def _journal_part(metadata: Mapping[str, Any]) -> int | None:
    value = (metadata.get("appProperties") or {}).get("journalPart")
    if not isinstance(value, str) or not re.fullmatch(r"[1-9]\d*", value):
        return None
    return int(value)


async def _connection_access_token(owner_user_id: UUID | str) -> tuple[dict[str, Any], str]:
    """Decrypt and refresh one request-local Drive access token."""
    owner = str(owner_user_id)
    row = await google_drive_repo.get_connection(owner)
    if row is None or row.get("status") != "active":
        raise google_drive.GoogleDriveError(
            "DRIVE_CONNECTION_REQUIRED", "Drive connection required"
        )
    try:
        decrypted = token_cipher.decrypt(
            owner,
            token_cipher.PURPOSE_REFRESH_TOKEN,
            Ciphertext(
                ciphertext=bytes(row["refresh_token_ciphertext"]),
                nonce=bytes(row["refresh_token_nonce"]),
                key_version=str(row["token_key_version"]),
            ),
        )
        token_result = await google_drive_oauth.refresh_access_token(
            decrypted.plaintext.decode("utf-8")
        )
    except (KeyError, TypeError, UnicodeDecodeError, ValueError) as exc:
        raise google_drive.GoogleDriveError(
            "DRIVE_CONNECTION_REQUIRED", "Drive connection required"
        ) from exc
    except google_drive_oauth.GoogleDriveOAuthError as exc:
        code = "DRIVE_CONNECTION_REQUIRED" if exc.code == "GOOGLE_DRIVE_INVALID_GRANT" else exc.code
        raise google_drive.GoogleDriveError(code, "Drive token refresh failed") from exc
    if decrypted.rotated is not None:
        await google_drive_repo.update_refresh_token_ciphertext(owner, decrypted.rotated)
    return row, str(token_result.access_token)


async def _mark_claim_failed(
    pool: Pool, owner_user_id: UUID | str, evolution_id: UUID | str, error_code: str
) -> dict[str, Any] | None:
    async with pool.acquire() as conn:
        return cast(
            dict[str, Any] | None,
            await evolution_exports_repo.update_export_status(
                conn,
                owner_user_id,
                evolution_id,
                "failed",
                last_error_code=error_code,
            ),
        )


async def _journal_parts(
    access_token: str,
    *,
    folder_id: str,
    period_type: str,
    period_key: str,
) -> tuple[list[tuple[int, bytes]], dict[int, dict[str, Any]]]:
    files = await google_drive.list_journal_files(
        access_token,
        folder_id=folder_id,
        period_type=period_type,
        period_key=period_key,
    )
    grouped: dict[int, list[dict[str, Any]]] = {}
    for metadata in files:
        part = _journal_part(metadata)
        if part is None:
            continue
        identity = journal_identity(period_type, period_key, part)
        if not _journal_properties_match(metadata, identity):
            continue
        grouped.setdefault(part, []).append(dict(metadata))

    selected: dict[int, dict[str, Any]] = {}
    contents: list[tuple[int, bytes]] = []
    for part, matches in sorted(grouped.items()):
        match = resolve_unique_journal(matches)
        assert match is not None
        file_id = match.get("id")
        if not file_id:
            continue
        selected[part] = match
        contents.append((part, await google_drive.download_file(access_token, str(file_id))))
    return contents, selected


async def _reconcile_ambiguous_write(
    conn: Connection,
    owner_user_id: UUID | str,
    export: Mapping[str, Any],
    access_token: str,
    *,
    folder_id: str,
) -> dict[str, Any] | None:
    """Resolve one ambiguous write by marker presence; never blindly retry."""
    part = int(export["journal_part"])
    matches = await google_drive.find_journal_files(
        access_token,
        folder_id=folder_id,
        period_type=str(export["period_type"]),
        period_key=str(export["period_key"]),
        journal_part=part,
    )
    identity = journal_identity(str(export["period_type"]), str(export["period_key"]), part)
    exact = [metadata for metadata in matches if _journal_properties_match(metadata, identity)]
    file = resolve_unique_journal(exact)
    if file is None:
        return cast(
            dict[str, Any] | None,
            await evolution_exports_repo.update_export_status(
                conn,
                owner_user_id,
                export["evolution_id"],
                "unknown",
                last_error_code="DRIVE_WRITE_UNKNOWN",
            ),
        )
    content = await google_drive.download_file(access_token, str(file["id"]))
    marker = f"Dental AI ID: {export['evolution_id']}\n".encode()
    if marker not in content:
        return cast(
            dict[str, Any] | None,
            await evolution_exports_repo.update_export_status(
                conn,
                owner_user_id,
                export["evolution_id"],
                "unknown",
                last_error_code="DRIVE_WRITE_UNKNOWN",
            ),
        )
    await evolution_exports_repo.set_remote_target(
        conn,
        owner_user_id,
        export["evolution_id"],
        journal_part=part,
        drive_file_id=str(file["id"]),
        drive_version=str(file.get("version") or "") or None,
        allow_unknown=True,
    )
    return cast(
        dict[str, Any] | None,
        await evolution_exports_repo.update_export_status(
            conn,
            owner_user_id,
            export["evolution_id"],
            "synced",
        ),
    )


async def sync_export(
    owner_user_id: UUID | str,
    evolution_id: UUID | str,
    *,
    allow_retry: bool = False,
    pool: Pool | None = None,
) -> dict[str, Any] | None:
    """Claim and perform one bounded journal synchronization attempt."""
    active_pool = pool or get_pg_pool()
    async with active_pool.acquire() as conn:
        claimed = await evolution_exports_repo.claim_export(
            conn,
            owner_user_id,
            evolution_id,
            allow_retry=allow_retry,
        )
    if claimed is None:
        return None

    try:
        connection, access_token = await _connection_access_token(owner_user_id)
    except google_drive.GoogleDriveError as exc:
        return await _mark_claim_failed(active_pool, owner_user_id, evolution_id, exc.code)
    except (UnicodeDecodeError, ValueError, KeyError):
        return await _mark_claim_failed(
            active_pool, owner_user_id, evolution_id, "DRIVE_CONNECTION_REQUIRED"
        )

    folder_id = str(connection.get("folder_id") or "")
    if not folder_id:
        return await _mark_claim_failed(
            active_pool, owner_user_id, evolution_id, "DRIVE_WORKSPACE_MISSING"
        )

    period_type = str(claimed["period_type"])
    period_key = str(claimed["period_key"])
    async with evolution_exports_repo.period_lock(
        active_pool, owner_user_id, period_type, period_key
    ) as lock_conn:
        export = await evolution_exports_repo.get_export_with_connection(
            lock_conn, owner_user_id, evolution_id
        )
        if export is None:
            return None
        try:
            journal_bytes = verify_persisted_block(
                str(export["journal_block"]), str(export["content_hash"])
            )
            contents, files = await _journal_parts(
                access_token,
                folder_id=folder_id,
                period_type=period_type,
                period_key=period_key,
            )
        except google_drive.GoogleDriveError as exc:
            return cast(
                dict[str, Any] | None,
                await evolution_exports_repo.update_export_status(
                    lock_conn,
                    owner_user_id,
                    evolution_id,
                    "failed",
                    last_error_code=exc.code,
                ),
            )
        except ValueError as exc:
            code = str(exc) if str(exc).startswith("JOURNAL_") else JOURNAL_CONTENT_HASH_MISMATCH
            return cast(
                dict[str, Any] | None,
                await evolution_exports_repo.update_export_status(
                    lock_conn,
                    owner_user_id,
                    evolution_id,
                    "failed",
                    last_error_code=code,
                ),
            )
        marker = f"Dental AI ID: {evolution_id}\n".encode()
        matches = [(part, files[part]) for part, content in contents if marker in content]
        if len(matches) > 1:
            raise ValueError(JOURNAL_IDENTITY_CONFLICT)
        if matches:
            part, file = matches[0]
            await evolution_exports_repo.set_remote_target(
                lock_conn,
                owner_user_id,
                evolution_id,
                journal_part=part,
                drive_file_id=str(file["id"]),
                drive_version=str(file.get("version") or "") or None,
                allow_unknown=str(claimed["previous_status"]) in {"syncing", "unknown"},
            )
            return cast(
                dict[str, Any] | None,
                await evolution_exports_repo.update_export_status(
                    lock_conn, owner_user_id, evolution_id, "synced"
                ),
            )

        if recovery_mode(str(claimed["previous_status"])) == "verify_only":
            return cast(
                dict[str, Any] | None,
                await evolution_exports_repo.update_export_status(
                    lock_conn,
                    owner_user_id,
                    evolution_id,
                    "unknown",
                    last_error_code="DRIVE_WRITE_UNKNOWN",
                ),
            )

        part = select_journal_part(contents, journal_bytes)
        existing = files.get(part)
        if int(export.get("journal_part") or 0) != part or (
            existing is None and export.get("drive_file_id") is not None
        ):
            export = (
                await evolution_exports_repo.set_remote_target(
                    lock_conn,
                    owner_user_id,
                    evolution_id,
                    journal_part=part,
                    drive_file_id=None,
                    drive_version=None,
                )
                or export
            )

        identity = journal_identity(period_type, period_key, part)
        try:
            if existing is None:
                remote = await google_drive.create_file(
                    access_token,
                    folder_id=folder_id,
                    name=identity.name,
                    content=journal_bytes,
                    app_properties=identity.app_properties,
                )
            else:
                current = next(content for number, content in contents if number == part)
                remote = await google_drive.update_file(
                    access_token,
                    file_id=str(existing["id"]),
                    content=current + journal_bytes,
                    app_properties=identity.app_properties,
                )
        except google_drive.GoogleDriveError as exc:
            if exc.code in {"DRIVE_UNAVAILABLE", "DRIVE_WRITE_UNKNOWN"}:
                return await _reconcile_ambiguous_write(
                    lock_conn,
                    owner_user_id,
                    export,
                    access_token,
                    folder_id=folder_id,
                )
            return cast(
                dict[str, Any] | None,
                await evolution_exports_repo.update_export_status(
                    lock_conn,
                    owner_user_id,
                    evolution_id,
                    "failed",
                    last_error_code=exc.code,
                ),
            )

        await evolution_exports_repo.set_remote_target(
            lock_conn,
            owner_user_id,
            evolution_id,
            journal_part=part,
            drive_file_id=str(remote["id"]),
            drive_version=str(remote.get("version") or "") or None,
        )
        return cast(
            dict[str, Any] | None,
            await evolution_exports_repo.update_export_status(
                lock_conn, owner_user_id, evolution_id, "synced"
            ),
        )


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
