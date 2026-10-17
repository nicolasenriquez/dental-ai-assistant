"""Owned, strictly read-only temporal dental history and snapshot reads."""

from __future__ import annotations

from collections.abc import Awaitable
from datetime import date, datetime
from typing import Annotated, Any, Literal, NoReturn, TypeVar
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from backend.auth.dependencies import get_current_user
from backend.db import patient_dental_history_repo as repo
from backend.patients import dental_history
from backend.patients.schemas import Actor

router = APIRouter(prefix="/patients", tags=["patient-dental-history"])
User = Annotated[dict[str, Any], Depends(get_current_user)]
Action = Literal["created", "edited", "resolved", "corrected", "deleted"]
ResourceKind = Literal["condition", "procedure"]
T = TypeVar("T")


def _fail(status: int, code: str, message: str) -> NoReturn:
    raise HTTPException(status, detail={"code": code, "message": message})


class EventsSelection(BaseModel):
    day: date | None
    timezone: Literal["America/Santiago"]
    start_inclusive: datetime | None
    cutoff_exclusive: datetime | None


class HistoryEvent(BaseModel):
    event_id: UUID
    resource_kind: ResourceKind
    resource_id: UUID
    revision: int
    action: Action
    changed_at: datetime
    clinical_date: date
    actor: Actor
    before: dict[str, Any] | None
    after: dict[str, Any]


class EventsPage(BaseModel):
    selection: EventsSelection
    items: list[HistoryEvent]
    next_cursor: str | None
    total_events: int
    epoch: str
    timezone: Literal["America/Santiago"]
    read_at: datetime


class SnapshotSelection(BaseModel):
    at: date | None
    timezone: Literal["America/Santiago"]
    cutoff_exclusive: datetime | None


class SnapshotItem(BaseModel):
    resource_kind: ResourceKind
    resource_id: UUID
    revision: int
    changed_at: datetime
    snapshot: dict[str, Any]
    chart_eligible: bool


class HistoryCounts(BaseModel):
    records: int
    findings: int
    procedures: int
    charted_records: int
    affected_teeth: int
    affected_arches: int
    deleted_records: int


class HistoryCoverage(BaseModel):
    state: Literal["complete", "partial"]
    earliest_recorded_at: datetime | None
    warnings: list[Literal["missing_initial_revision", "orphan_revision"]]


class SnapshotPage(BaseModel):
    selection: SnapshotSelection
    items: list[SnapshotItem]
    next_cursor: str | None
    epoch: str
    read_at: datetime
    counts: HistoryCounts
    coverage: HistoryCoverage


async def _read(operation: Awaitable[T]) -> T:
    try:
        return await operation
    except LookupError:
        _fail(404, "not_found", "Paciente no encontrado")


def _query(reader: str, request: Request) -> dental_history.HistoryQuery:
    try:
        return dental_history.parse_query(reader, request.query_params)
    except dental_history.InvalidCursor:
        _fail(422, "invalid_cursor", "Cursor inválido para esta consulta")
    except dental_history.InvalidHistoryQuery:
        _fail(422, "invalid_history_query", "Parámetros de historial inválidos")


def _check_epoch(expected: str | None, actual: str) -> None:
    if expected is not None and expected != actual:
        _fail(409, "history_changed", "El historial cambió; actualiza la lectura")


def _decoded_cursor(
    reader: str, query: dental_history.HistoryQuery, patient_id: UUID, owner: UUID
) -> Any:
    try:
        if reader == "events":
            return dental_history.decode_events_cursor(
                query.cursor,
                owner=owner,
                patient=patient_id,
                dentition=query.dentition,
                day=query.day,
                epoch=query.epoch,
            )
        return dental_history.decode_snapshot_cursor(
            query.cursor,
            owner=owner,
            patient=patient_id,
            dentition=query.dentition,
            at=query.at,
            epoch=query.epoch,
        )
    except dental_history.InvalidCursor:
        _fail(422, "invalid_cursor", "Cursor inválido para esta consulta")


@router.get("/{patient_id}/dental-history", response_model=EventsPage)
async def dental_history_events(patient_id: UUID, request: Request, user: User) -> EventsPage:
    owner = UUID(str(user["id"]))
    query = _query("events", request)
    cursor = _decoded_cursor("events", query, patient_id, owner)
    start = dental_history.clinical_start(query.day) if query.day else None
    cutoff = dental_history.clinical_cutoff(query.day) if query.day else None
    result = await _read(
        repo.events(
            owner,
            patient_id,
            query.dentition,
            start,
            cutoff,
            cursor.after if cursor else None,
            query.limit,
        )
    )
    _check_epoch(query.epoch or (cursor.epoch if cursor else None), result["epoch"])
    items = [
        HistoryEvent(
            event_id=row["event_id"],
            resource_kind=row["resource_kind"],
            resource_id=row["resource_id"],
            revision=row["revision"],
            action=row["action"],
            changed_at=row["changed_at"],
            clinical_date=dental_history.clinical_date(row["changed_at"]),
            actor=Actor(user_id=row["actor_user_id"], display_name=row["actor_display_name"]),
            before=row["before"],
            after=row["after"],
        )
        for row in result["items"]
    ]
    next_cursor = None
    if result["has_more"]:
        last = items[-1]
        next_cursor = dental_history.encode_events_cursor(
            dental_history.EventsCursor(
                v=1,
                reader="events",
                owner_id=owner,
                patient_id=patient_id,
                dentition=query.dentition,
                day=query.day,
                at=None,
                epoch=result["epoch"],
                after=(last.changed_at, last.resource_kind, last.event_id),
            )
        )
    return EventsPage(
        selection=EventsSelection(
            day=query.day,
            timezone=dental_history.HISTORY_TIMEZONE,
            start_inclusive=start,
            cutoff_exclusive=cutoff,
        ),
        items=items,
        next_cursor=next_cursor,
        total_events=result["total_events"],
        epoch=result["epoch"],
        timezone=dental_history.HISTORY_TIMEZONE,
        read_at=result["read_at"],
    )


@router.get("/{patient_id}/dental-history/snapshot", response_model=SnapshotPage)
async def dental_history_snapshot(patient_id: UUID, request: Request, user: User) -> SnapshotPage:
    owner = UUID(str(user["id"]))
    query = _query("snapshot", request)
    cursor = _decoded_cursor("snapshot", query, patient_id, owner)
    cutoff = dental_history.clinical_cutoff(query.at) if query.at else None
    result = await _read(
        repo.snapshot(
            owner,
            patient_id,
            query.dentition,
            cutoff,
            cursor.after if cursor else None,
            query.limit,
        )
    )
    _check_epoch(query.epoch or (cursor.epoch if cursor else None), result["epoch"])
    items = [
        SnapshotItem(
            resource_kind=row["resource_kind"],
            resource_id=row["resource_id"],
            revision=row["revision"],
            changed_at=row["changed_at"],
            snapshot=row["snapshot"],
            chart_eligible=row["chart_eligible"],
        )
        for row in result["items"]
    ]
    next_cursor = None
    if result["has_more"]:
        last = items[-1]
        next_cursor = dental_history.encode_snapshot_cursor(
            dental_history.SnapshotCursor(
                v=1,
                reader="snapshot",
                owner_id=owner,
                patient_id=patient_id,
                dentition=query.dentition,
                day=None,
                at=query.at,
                epoch=result["epoch"],
                after=(last.resource_kind, last.resource_id),
            )
        )
    return SnapshotPage(
        selection=SnapshotSelection(
            at=query.at,
            timezone=dental_history.HISTORY_TIMEZONE,
            cutoff_exclusive=cutoff,
        ),
        items=items,
        next_cursor=next_cursor,
        epoch=result["epoch"],
        read_at=result["read_at"],
        counts=HistoryCounts(**result["counts"]),
        coverage=HistoryCoverage(**result["coverage"]),
    )
