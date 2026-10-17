"""Clinical-day cutoffs, versioned cursors and the dataset epoch for History reads.

Owns the read contract in ``openspec/changes/replicate-diagnosis-history/
history-read-contract.md``: one clinical-day window in America/Santiago, the
base64url cursor payloads bound to reader/owner/patient/dentition/date/epoch and
the SHA-256 dataset epoch over the scoped revision set and coverage markers.
"""

from __future__ import annotations

import binascii
import hashlib
import json
import re
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated, Any, Literal, cast
from uuid import UUID
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, StringConstraints, model_validator

from backend.patients.conditions import Dentition
from backend.patients.cursors import decode_cursor_payload, encode_cursor_payload

HISTORY_TIMEZONE: Literal["America/Santiago"] = "America/Santiago"
CURSOR_MAX_LENGTH = 2048
CONDITION_SNAPSHOT_KEYS = (
    "dentition",
    "tooth_fdi",
    "condition_code",
    "surfaces",
    "note",
    "status",
    "deleted_at",
    "deleted_by_user_id",
)
_PRIVATE_SNAPSHOT_KEYS = frozenset(
    {"owner_user_id", "payload_hash", "command_snapshot", "operation_id"}
)
_DEFAULTS = {"events": (50, 100), "snapshot": (100, 100)}
_ALLOWED = {
    "events": frozenset({"dentition", "day", "epoch", "cursor", "limit"}),
    "snapshot": frozenset({"dentition", "at", "epoch", "cursor", "limit"}),
}
_DATE = re.compile(r"\d{4}-\d{2}-\d{2}\Z")
_ZONE = ZoneInfo(HISTORY_TIMEZONE)
ResourceKind = Literal["condition", "procedure"]


class InvalidHistoryQuery(ValueError):
    """Malformed, unrecognized or future-dated query parameters."""


class InvalidCursor(ValueError):
    """Undecodable or rebound pagination cursor."""


@dataclass(frozen=True)
class HistoryQuery:
    dentition: Dentition
    day: date | None
    at: date | None
    epoch: str | None
    cursor: str | None
    limit: int


def today() -> date:
    return datetime.now(_ZONE).date()


def clinical_start(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=_ZONE).astimezone(UTC)


def clinical_cutoff(day: date) -> datetime:
    return clinical_start(day + timedelta(days=1))


def clinical_date(moment: datetime) -> date:
    return moment.astimezone(_ZONE).date()


def _date_param(value: str, name: str) -> date:
    if not _DATE.fullmatch(value):
        raise InvalidHistoryQuery(f"{name} inválido")
    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        raise InvalidHistoryQuery(f"{name} inválido") from None
    if parsed > today():
        raise InvalidHistoryQuery(f"{name} no puede ser futuro")
    return parsed


def parse_query(reader: str, params: Mapping[str, str]) -> HistoryQuery:
    """Validate one endpoint's query string; extra names are rejected."""
    extra = set(params) - _ALLOWED[reader]
    if extra:
        raise InvalidHistoryQuery(f"Parámetros no admitidos: {sorted(extra)}")
    dentition = params.get("dentition")
    if dentition not in ("permanent", "primary"):
        raise InvalidHistoryQuery("Dentición requerida")
    default, maximum = _DEFAULTS[reader]
    raw_limit = params.get("limit")
    if raw_limit is None:
        limit = default
    else:
        try:
            limit = int(raw_limit)
        except ValueError:
            raise InvalidHistoryQuery("Límite inválido") from None
        if not 1 <= limit <= maximum:
            raise InvalidHistoryQuery("Límite inválido")
    day = _date_param(params["day"], "Día") if reader == "events" and "day" in params else None
    at = _date_param(params["at"], "Fecha") if reader == "snapshot" and "at" in params else None
    epoch = params.get("epoch")
    if epoch is not None and not epoch:
        raise InvalidHistoryQuery("Época inválida")
    cursor = params.get("cursor")
    if cursor is not None and len(cursor) > CURSOR_MAX_LENGTH:
        raise InvalidCursor("Cursor inválido")
    return HistoryQuery(cast(Dentition, dentition), day, at, epoch, cursor, limit)


Epoch = Annotated[str, StringConstraints(min_length=1)]


class EventsCursor(BaseModel):
    model_config = ConfigDict(extra="forbid")
    v: Literal[1]
    reader: Literal["events"]
    owner_id: UUID
    patient_id: UUID
    dentition: Dentition
    day: date | None
    at: None = None
    epoch: Epoch
    after: tuple[datetime, ResourceKind, UUID]

    @model_validator(mode="after")
    def _aware(self) -> EventsCursor:
        if self.after[0].utcoffset() is None:
            raise ValueError("Cursor sin zona horaria")
        return self


class SnapshotCursor(BaseModel):
    model_config = ConfigDict(extra="forbid")
    v: Literal[1]
    reader: Literal["snapshot"]
    owner_id: UUID
    patient_id: UUID
    dentition: Dentition
    day: None = None
    at: date | None
    epoch: Epoch
    after: tuple[ResourceKind, UUID]


def decode_events_cursor(
    value: str | None,
    *,
    owner: UUID,
    patient: UUID,
    dentition: Dentition,
    day: date | None,
    epoch: str | None,
) -> EventsCursor | None:
    if value is None:
        return None
    try:
        cursor = EventsCursor.model_validate(decode_cursor_payload(value))
    except (ValueError, TypeError, binascii.Error):
        raise InvalidCursor("Cursor inválido") from None
    if (
        cursor.owner_id != owner
        or cursor.patient_id != patient
        or cursor.dentition != dentition
        or cursor.day != day
        or (epoch is not None and cursor.epoch != epoch)
    ):
        raise InvalidCursor("Cursor inválido para esta consulta")
    return cursor


def decode_snapshot_cursor(
    value: str | None,
    *,
    owner: UUID,
    patient: UUID,
    dentition: Dentition,
    at: date | None,
    epoch: str | None,
) -> SnapshotCursor | None:
    if value is None:
        return None
    try:
        cursor = SnapshotCursor.model_validate(decode_cursor_payload(value))
    except (ValueError, TypeError, binascii.Error):
        raise InvalidCursor("Cursor inválido") from None
    if (
        cursor.owner_id != owner
        or cursor.patient_id != patient
        or cursor.dentition != dentition
        or cursor.at != at
        or (epoch is not None and cursor.epoch != epoch)
    ):
        raise InvalidCursor("Cursor inválido para esta consulta")
    return cursor


def encode_events_cursor(cursor: EventsCursor) -> str:
    encoded: str = encode_cursor_payload(cursor)
    return encoded


def encode_snapshot_cursor(cursor: SnapshotCursor) -> str:
    encoded: str = encode_cursor_payload(cursor)
    return encoded


def condition_snapshot(raw: Mapping[str, Any]) -> dict[str, Any]:
    """Keep only the incumbent condition fields; legacy deletion metadata reads as null."""
    return {key: raw.get(key) for key in CONDITION_SNAPSHOT_KEYS}


def treatment_snapshot(raw: Mapping[str, Any]) -> dict[str, Any]:
    """Preserve the stored public treatment fields and normalize deletion metadata."""
    value = {key: item for key, item in raw.items() if key not in _PRIVATE_SNAPSHOT_KEYS}
    value["deleted_at"] = raw.get("deleted_at")
    value["deleted_by_user_id"] = raw.get("deleted_by_user_id")
    return value


def chart_eligible(kind: str, snapshot: Mapping[str, Any]) -> bool:
    if kind == "condition":
        return snapshot.get("status") == "active"
    return snapshot.get("state") in ("existing", "planned", "performed")


def epoch_digest(
    revisions: list[tuple[str, UUID]], markers: list[tuple[str, UUID, bool, bool]]
) -> str:
    """Deterministic epoch over scoped revision IDs plus coverage markers."""
    payload = json.dumps(
        {
            "revisions": sorted([kind, str(identifier)] for kind, identifier in revisions),
            "markers": sorted(
                [kind, str(resource_id), missing, orphan]
                for kind, resource_id, missing, orphan in markers
            ),
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode()).hexdigest()
