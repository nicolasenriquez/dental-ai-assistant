"""Real Postgres dental-history read contracts (task 1.1).

Runs against ``WORKSPACE_LIVE_TEST_DSN`` (an isolated migrated database; the
suite removes only the synthetic rows it creates). Pins the read contract in
``openspec/changes/replicate-diagnosis-history/history-read-contract.md``:

- as-of snapshots keep the last eligible revision per resource and never let a
  later correction, replacement or tombstone rewrite a past chart;
- creation, correction and deletion events carry their actual action, actor and
  clinical date, and deletion never relabels clinical status;
- clinical days use America/Santiago boundaries, including the DST gap;
- day-filtered event pages paginate independently of loaded timeline pages;
- the state/count table, coverage markers and tombstones follow the contract;
- a changed revision set reports 409 ``history_changed`` through the shared epoch;
- GET reads leave every source row, revision and receipt unchanged.

Routes and repository are implemented by task 2.1; this suite is the fail-first
proof they must satisfy. Seeds use the real writers where they exist and add
dated revisions directly only where the contract needs historical evidence
(legacy corrections, protected legacy states, backdated commits).
"""

from __future__ import annotations

import base64
import json
import os
import sys
from datetime import UTC, date, datetime, time
from typing import Any
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

import asyncpg
import pytest
from httpx import ASGITransport, AsyncClient

from backend.auth.dependencies import get_current_user
from backend.db import patient_clinical_plans_repo, patient_conditions_repo
from backend.main import app
from tests.legacy_dental_fixtures import seed_condition_correction

DSN = os.environ.get("WORKSPACE_LIVE_TEST_DSN", "")
pytestmark = pytest.mark.skipif(not DSN, reason="WORKSPACE_LIVE_TEST_DSN not set")
TIMEZONE = ZoneInfo("America/Santiago")

SCOPED_ROWS = (
    "SELECT * FROM patient_tooth_conditions WHERE owner_user_id=$1 ORDER BY id",
    "SELECT * FROM patient_tooth_condition_revisions WHERE owner_user_id=$1 ORDER BY id",
    "SELECT * FROM patient_dental_treatments WHERE owner_user_id=$1 ORDER BY id",
    "SELECT * FROM patient_dental_treatment_teeth WHERE owner_user_id=$1"
    " ORDER BY treatment_id,tooth_fdi",
    "SELECT * FROM patient_dental_treatment_revisions WHERE owner_user_id=$1 ORDER BY id",
    "SELECT * FROM patient_clinical_commands WHERE owner_user_id=$1 ORDER BY operation_id",
)


def _auth(user_id: UUID):
    async def user(session=None):
        return {"id": str(user_id)}

    return user


def _client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="https://testserver")


def _aware(value: str | datetime) -> datetime:
    parsed = datetime.fromisoformat(value) if isinstance(value, str) else value
    assert parsed.tzinfo is not None
    return parsed


def _day_start(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=TIMEZONE).astimezone(UTC)


def _moment(day: date, hour: int = 12) -> datetime:
    return datetime.combine(day, time(hour), tzinfo=TIMEZONE).astimezone(UTC)


def _rewrite_cursor(cursor: str, **changes: str) -> str:
    payload = json.loads(base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4)))
    payload.update(changes)
    return base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")


async def _events(client: AsyncClient, patient: UUID, **params):
    params.setdefault("dentition", "permanent")
    return await client.get(f"/api/patients/{patient}/dental-history", params=params)


async def _snapshot(client: AsyncClient, patient: UUID, **params):
    params.setdefault("dentition", "permanent")
    return await client.get(f"/api/patients/{patient}/dental-history/snapshot", params=params)


async def _create_condition(
    client: AsyncClient, patient: UUID, *, tooth: int, note: str | None = None
) -> UUID:
    identifier = uuid4()
    body: dict[str, Any] = {
        "id": str(identifier),
        "dentition": "permanent",
        "tooth_fdi": tooth,
        "condition_code": "caries",
        "surfaces": ["M", "O"],
    }
    if note is not None:
        body["note"] = note
    response = await client.post(f"/api/patients/{patient}/conditions", json=body)
    assert response.status_code == 201, response.text
    return identifier


async def _create_treatment(
    client: AsyncClient,
    patient: UUID,
    *,
    variant: str = "ORTO-BRACK",
    teeth: tuple[tuple[int, str], ...] = ((16, "tooth"),),
    arch: str | None = None,
) -> UUID:
    identifier = uuid4()
    response = await client.post(
        f"/api/patients/{patient}/dental-treatments",
        json={
            "id": str(identifier),
            "operation_id": str(uuid4()),
            "expected_revision": 0,
            "variant_id": variant,
            "dentition": "permanent",
            "teeth": [{"tooth_fdi": tooth, "role": role, "surfaces": []} for tooth, role in teeth],
            "arch": arch,
        },
    )
    assert response.status_code == 201, response.text
    return identifier


async def _resolve_condition(client: AsyncClient, patient: UUID, identifier: UUID) -> None:
    response = await client.patch(
        f"/api/patients/{patient}/conditions/{identifier}",
        json={"expected_revision": 1, "status": "resolved"},
    )
    assert response.status_code == 200, response.text


async def _delete_record(
    client: AsyncClient, patient: UUID, kind: str, identifier: UUID, revision: int = 1
):
    collection = "conditions" if kind == "condition" else "dental-treatments"
    return await client.post(
        f"/api/patients/{patient}/{collection}/{identifier}/delete",
        json={"operation_id": str(uuid4()), "expected_revision": revision},
    )


async def _add_plan_item(owner: UUID, patient: UUID) -> tuple[UUID, UUID]:
    plan_id = uuid4()
    await patient_clinical_plans_repo.command(
        owner,
        patient,
        plan_id,
        "create",
        {"operation_id": str(uuid4()), "title": "Plan sintético"},
    )
    treatment_id = uuid4()
    await patient_clinical_plans_repo.command(
        owner,
        patient,
        plan_id,
        "add_item",
        {
            "operation_id": str(uuid4()),
            "expected_revision": 1,
            "id": str(uuid4()),
            "treatment": {
                "id": str(treatment_id),
                "variant_id": "PREV-SEAL",
                "dentition": "permanent",
                "teeth": [{"tooth_fdi": 22, "role": "tooth", "surfaces": []}],
                "arch": None,
                "note": None,
            },
            "stages": [{"label": "Sesión 1", "note": None}],
        },
    )
    return plan_id, treatment_id


async def _stamp_condition(
    pool: asyncpg.Pool, identifier: UUID, revision: int, at: datetime
) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE patient_tooth_condition_revisions SET changed_at=$3"
            " WHERE condition_id=$1 AND revision=$2",
            identifier,
            revision,
            at,
        )


async def _stamp_treatment(
    pool: asyncpg.Pool, identifier: UUID, revision: int, at: datetime
) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE patient_dental_treatment_revisions SET changed_at=$3"
            " WHERE treatment_id=$1 AND revision=$2",
            identifier,
            revision,
            at,
        )


async def _append_condition_revision(
    pool: asyncpg.Pool,
    owner: UUID,
    patient: UUID,
    identifier: UUID,
    *,
    action: str,
    status: str | None = None,
    deleted: bool = False,
    at: datetime,
) -> None:
    """Append dated legacy evidence without using a retired writer."""
    async with pool.acquire() as conn, conn.transaction():
        row = await conn.fetchrow("SELECT * FROM patient_tooth_conditions WHERE id=$1", identifier)
        before = {key: row[key] for key in patient_conditions_repo.SNAPSHOT_KEYS}
        revision = row["revision"] + 1
        after = {
            **before,
            "status": status or before["status"],
            "deleted_at": at.isoformat() if deleted else None,
            "deleted_by_user_id": str(owner) if deleted else None,
        }
        await conn.execute(
            "UPDATE patient_tooth_conditions SET status=$2, revision=$3, deleted_at=$4,"
            " deleted_by_user_id=$5, updated_at=$6 WHERE id=$1",
            identifier,
            after["status"],
            revision,
            at if deleted else None,
            owner if deleted else None,
            at,
        )
        await conn.execute(
            "INSERT INTO patient_tooth_condition_revisions"
            " (id,condition_id,owner_user_id,patient_id,revision,before_snapshot,after_snapshot,"
            "  actor_user_id,changed_at,action) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$3,$8,$9)",
            uuid4(),
            identifier,
            owner,
            patient,
            revision,
            json.dumps(before, default=str),
            json.dumps(after, default=str),
            at,
            action,
        )


async def _append_treatment_revision(
    pool: asyncpg.Pool,
    owner: UUID,
    patient: UUID,
    identifier: UUID,
    *,
    action: str = "edited",
    state: str | None = None,
    deleted: bool = False,
    at: datetime,
) -> None:
    """Append dated legacy evidence derived from the writer's own revision snapshot."""
    async with pool.acquire() as conn, conn.transaction():
        row = await conn.fetchrow("SELECT * FROM patient_dental_treatments WHERE id=$1", identifier)
        latest = await conn.fetchrow(
            "SELECT after_snapshot FROM patient_dental_treatment_revisions"
            " WHERE treatment_id=$1 ORDER BY revision DESC LIMIT 1",
            identifier,
        )
        before = json.loads(latest["after_snapshot"])
        revision = row["revision"] + 1
        after = {
            **before,
            "revision": revision,
            "state": state or before["state"],
            "updated_at": at.isoformat(),
            "deleted_at": at.isoformat() if deleted else None,
            "deleted_by_user_id": str(owner) if deleted else None,
        }
        await conn.execute(
            "UPDATE patient_dental_treatments SET state=$2, revision=$3, deleted_at=$4,"
            " deleted_by_user_id=$5, updated_at=$6 WHERE id=$1",
            identifier,
            after["state"],
            revision,
            at if deleted else None,
            owner if deleted else None,
            at,
        )
        await conn.execute(
            "INSERT INTO patient_dental_treatment_revisions"
            " (id,treatment_id,patient_id,owner_user_id,revision,action,before_snapshot,"
            "  after_snapshot,reason,actor_user_id,changed_at)"
            " VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,NULL,$4,$9)",
            uuid4(),
            identifier,
            patient,
            owner,
            revision,
            action,
            json.dumps(before),
            json.dumps(after),
            at,
        )


async def _rows(pool: asyncpg.Pool, owner: UUID) -> dict[str, list[str]]:
    fingerprint: dict[str, list[str]] = {}
    async with pool.acquire() as conn:
        for statement in SCOPED_ROWS:
            rows = await conn.fetch(statement, owner)
            fingerprint[statement] = sorted(
                json.dumps(dict(row), default=str, sort_keys=True) for row in rows
            )
    return fingerprint


@pytest.fixture
async def history_db(monkeypatch):
    try:
        pool = await asyncpg.create_pool(DSN, min_size=1, max_size=4)
    except OSError as exc:
        pytest.skip(f"live Postgres unreachable: {exc}")
    # Patch every loaded pool consumer, including the task 2.1 history repository.
    for name, module in tuple(sys.modules.items()):
        if name.startswith("backend.") and hasattr(module, "get_pg_pool"):
            monkeypatch.setattr(module, "get_pg_pool", lambda: pool)
    owner, other = uuid4(), uuid4()
    patient, foreign = uuid4(), uuid4()
    async with pool.acquire() as conn:
        for user in (owner, other):
            await conn.execute(
                "INSERT INTO users (id, email) VALUES ($1, $2)",
                user,
                f"history-{user.hex[:12]}@example.com",
            )
        for index, (identifier, user) in enumerate(((patient, owner), (foreign, other))):
            await conn.execute(
                "INSERT INTO patients (id, owner_user_id, first_name, last_name, rut_number, rut_dv)"
                " VALUES ($1, $2, 'Sintético', 'Historial', $3, '5')",
                identifier,
                user,
                14000000 + index,
            )
    app.dependency_overrides[get_current_user] = _auth(owner)
    try:
        yield pool, owner, other, patient, foreign
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        async with pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM patients WHERE owner_user_id = ANY($1::uuid[])", [owner, other]
            )
            await conn.execute("DELETE FROM users WHERE id = ANY($1::uuid[])", [owner, other])
        await pool.close()


async def test_history_snapshot_preserves_past_correction_and_replacement(history_db):
    pool, owner, _, patient, _ = history_db
    day_a, day_b = date(2026, 9, 10), date(2026, 9, 12)
    async with _client() as client:
        original = await _create_condition(client, patient, tooth=16, note="Original")
        await _stamp_condition(pool, original, 1, _moment(day_a))
        replacement_id = uuid4()
        legacy = await seed_condition_correction(
            pool,
            owner,
            patient,
            original,
            {
                "operation_id": str(uuid4()),
                "expected_revision": 1,
                "reason": "Registro por error",
                "replacement": {
                    "id": str(replacement_id),
                    "dentition": "permanent",
                    "tooth_fdi": 16,
                    "condition_code": "caries",
                    "surfaces": ["M", "O"],
                    "note": "",
                },
            },
        )
        await _stamp_condition(pool, original, 2, _moment(day_b, 11))
        await _stamp_condition(pool, replacement_id, 1, _moment(day_b, 12))
        assert legacy["replacement_condition_id"] == str(replacement_id)

        past = await _snapshot(client, patient, at=day_a.isoformat())
        assert past.status_code == 200, past.text
        page = past.json()
        assert page["selection"]["at"] == day_a.isoformat()
        assert page["selection"]["timezone"] == "America/Santiago"
        assert _aware(page["selection"]["cutoff_exclusive"]) == _day_start(date(2026, 9, 11))
        assert [item["resource_id"] for item in page["items"]] == [str(original)]
        item = page["items"][0]
        assert item["revision"] == 1 and item["chart_eligible"] is True
        assert item["snapshot"] == {
            "dentition": "permanent",
            "tooth_fdi": 16,
            "condition_code": "caries",
            "surfaces": ["M", "O"],
            "note": "Original",
            "status": "active",
            "deleted_at": None,
            "deleted_by_user_id": None,
        }
        assert page["counts"] == {
            "records": 1,
            "findings": 1,
            "procedures": 0,
            "charted_records": 1,
            "affected_teeth": 1,
            "affected_arches": 0,
            "deleted_records": 0,
        }
        assert page["coverage"]["state"] == "complete"

        current = await _snapshot(client, patient)
        assert current.status_code == 200, current.text
        latest = current.json()
        items = {item["resource_id"]: item for item in latest["items"]}
        assert set(items) == {str(original), str(replacement_id)}
        assert items[str(original)]["revision"] == 2
        assert items[str(original)]["chart_eligible"] is False
        assert items[str(original)]["snapshot"]["status"] == "entered_in_error"
        assert items[str(replacement_id)]["chart_eligible"] is True
        assert latest["counts"]["records"] == 2 and latest["counts"]["findings"] == 2
        assert latest["counts"]["charted_records"] == 1

        events = await _events(client, patient)
        assert events.status_code == 200, events.text
        history = events.json()
        assert history["total_events"] == 3
        assert [entry["clinical_date"] for entry in history["items"]] == [
            day_b.isoformat(),
            day_b.isoformat(),
            day_a.isoformat(),
        ]
        assert [entry["action"] for entry in history["items"]] == [
            "created",
            "corrected",
            "created",
        ]
        corrected = history["items"][1]
        assert corrected["resource_id"] == str(original)
        assert corrected["actor"] == {"user_id": str(owner), "display_name": None}
        assert corrected["before"]["status"] == "active"
        assert corrected["after"]["status"] == "entered_in_error"
        # Legacy snapshots without deletion keys normalize to null.
        assert corrected["after"]["deleted_at"] is None
        assert corrected["after"]["deleted_by_user_id"] is None
        assert history["items"][2]["before"] is None
        assert history["items"][2]["resource_id"] == str(original)


async def test_history_deletion_keeps_earlier_chart_and_status(history_db):
    pool, owner, _, patient, _ = history_db
    day_a, day_b = date(2026, 8, 3), date(2026, 8, 5)
    async with _client() as client:
        condition = await _create_condition(client, patient, tooth=16)
        treatment = await _create_treatment(client, patient, teeth=((24, "tooth"),))
        await _stamp_condition(pool, condition, 1, _moment(day_a))
        await _stamp_treatment(pool, treatment, 1, _moment(day_a))
        for response in (
            await _delete_record(client, patient, "condition", condition),
            await _delete_record(client, patient, "procedure", treatment),
        ):
            assert response.status_code == 200, response.text
        await _stamp_condition(pool, condition, 2, _moment(day_b))
        await _stamp_treatment(pool, treatment, 2, _moment(day_b))

        past = await _snapshot(client, patient, at=day_a.isoformat())
        assert past.status_code == 200, past.text
        assert {item["resource_id"] for item in past.json()["items"]} == {
            str(condition),
            str(treatment),
        }
        assert all(item["chart_eligible"] for item in past.json()["items"])
        assert past.json()["counts"] == {
            "records": 2,
            "findings": 1,
            "procedures": 1,
            "charted_records": 2,
            "affected_teeth": 2,
            "affected_arches": 0,
            "deleted_records": 0,
        }

        current = await _snapshot(client, patient)
        assert current.status_code == 200, current.text
        body = current.json()
        assert body["items"] == [] and body["next_cursor"] is None
        assert body["counts"]["records"] == 0 and body["counts"]["deleted_records"] == 2
        assert body["coverage"]["state"] == "complete"

        day = await _events(client, patient, day=day_b.isoformat())
        assert day.status_code == 200, day.text
        deleted = day.json()
        assert deleted["total_events"] == 2
        assert {entry["action"] for entry in deleted["items"]} == {"deleted"}
        by_kind = {entry["resource_kind"]: entry for entry in deleted["items"]}
        for entry in deleted["items"]:
            assert entry["actor"]["user_id"] == str(owner)
            assert entry["clinical_date"] == day_b.isoformat()
            assert entry["before"]["deleted_at"] is None
            # The stamp backdates the revision row only; the tombstone keeps its write time.
            assert entry["after"]["deleted_at"] is not None
            assert "entered_in_error" not in json.dumps(entry["after"])
        assert by_kind["condition"]["after"]["status"] == "active"
        assert by_kind["procedure"]["after"]["state"] == "existing"


async def test_history_clinical_days_follow_santiago_midnight_and_dst_gap(history_db):
    pool, _, _, patient, _ = history_db
    moments = (
        datetime(2026, 9, 5, 3, 30, tzinfo=UTC),
        datetime(2026, 9, 6, 3, 59, 59, tzinfo=UTC),
        datetime(2026, 9, 6, 4, 0, 0, tzinfo=UTC),
        datetime(2026, 10, 17, 2, 59, 0, tzinfo=UTC),
        datetime(2026, 10, 17, 3, 1, 0, tzinfo=UTC),
    )
    identifiers = []
    async with _client() as client:
        for index, moment in enumerate(moments):
            identifier = await _create_condition(client, patient, tooth=11 + index)
            await _stamp_condition(pool, identifier, 1, moment)
            identifiers.append(identifier)

        first_day = await _events(client, patient, day="2026-09-05")
        assert first_day.status_code == 200, first_day.text
        body = first_day.json()
        assert [item["resource_id"] for item in body["items"]] == [str(identifiers[1])]
        assert {item["clinical_date"] for item in body["items"]} == {"2026-09-05"}
        assert body["selection"]["day"] == "2026-09-05"
        assert body["selection"]["timezone"] == "America/Santiago"
        assert _aware(body["selection"]["start_inclusive"]) == datetime(
            2026, 9, 5, 4, 0, tzinfo=UTC
        )
        # Spring-forward gap: the next clinical day starts at 04:00Z, not 03:00Z.
        assert _aware(body["selection"]["cutoff_exclusive"]) == datetime(
            2026, 9, 6, 4, 0, tzinfo=UTC
        )

        second_day = await _events(client, patient, day="2026-09-06")
        assert second_day.status_code == 200, second_day.text
        assert [item["resource_id"] for item in second_day.json()["items"]] == [str(identifiers[2])]
        assert _aware(second_day.json()["selection"]["start_inclusive"]) == datetime(
            2026, 9, 6, 4, 0, tzinfo=UTC
        )

        before_midnight = await _events(client, patient, day="2026-10-16")
        assert before_midnight.status_code == 200, before_midnight.text
        assert [item["resource_id"] for item in before_midnight.json()["items"]] == [
            str(identifiers[3])
        ]
        assert _aware(before_midnight.json()["selection"]["cutoff_exclusive"]) == datetime(
            2026, 10, 17, 3, 0, tzinfo=UTC
        )
        after_midnight = await _events(client, patient, day="2026-10-17")
        assert after_midnight.status_code == 200, after_midnight.text
        assert [item["resource_id"] for item in after_midnight.json()["items"]] == [
            str(identifiers[4])
        ]

        past = await _snapshot(client, patient, at="2026-09-05")
        assert past.status_code == 200, past.text
        assert {item["resource_id"] for item in past.json()["items"]} == {
            str(identifiers[0]),
            str(identifiers[1]),
        }
        gap_day = await _snapshot(client, patient, at="2026-09-06")
        assert gap_day.status_code == 200, gap_day.text
        assert {item["resource_id"] for item in gap_day.json()["items"]} == {
            str(identifiers[0]),
            str(identifiers[1]),
            str(identifiers[2]),
        }


async def test_history_day_filter_paginates_outside_loaded_timeline_pages(history_db):
    pool, owner, other, patient, foreign = history_db
    days = (date(2026, 8, 1), date(2026, 8, 2), date(2026, 8, 3), date(2026, 8, 4))
    counts = (2, 1, 1, 3)
    seeded: dict[str, list[UUID]] = {}
    async with _client() as client:
        teeth = iter((16, 17, 18, 21, 22, 23, 24))
        for day, size in zip(days, counts, strict=True):
            seeded[day.isoformat()] = []
            for index in range(size):
                identifier = await _create_condition(client, patient, tooth=next(teeth))
                await _stamp_condition(pool, identifier, 1, _moment(day, 10 + index))
                seeded[day.isoformat()].append(identifier)

        first_page = await _events(client, patient, limit=2)
        assert first_page.status_code == 200, first_page.text
        page = first_page.json()
        assert page["total_events"] == 7
        assert len(page["items"]) == 2 and page["next_cursor"]
        assert {item["clinical_date"] for item in page["items"]} == {"2026-08-04"}

        day_page = await _events(client, patient, day="2026-08-01", limit=1)
        assert day_page.status_code == 200, day_page.text
        day_body = day_page.json()
        assert day_body["total_events"] == 2 and len(day_body["items"]) == 1
        assert day_body["items"][0]["clinical_date"] == "2026-08-01"
        assert day_body["next_cursor"]
        follow = await _events(
            client, patient, day="2026-08-01", limit=1, cursor=day_body["next_cursor"]
        )
        assert follow.status_code == 200, follow.text
        assert follow.json()["total_events"] == 2
        assert follow.json()["next_cursor"] is None
        assert {
            day_body["items"][0]["resource_id"],
            follow.json()["items"][0]["resource_id"],
        } == {str(identifier) for identifier in seeded["2026-08-01"]}

        empty = await _events(client, patient, day="2026-08-15")
        assert empty.status_code == 200, empty.text
        assert empty.json()["items"] == []
        assert empty.json()["total_events"] == 0 and empty.json()["next_cursor"] is None

        cursor = day_body["next_cursor"]
        mismatches = (
            {"day": "2026-08-02", "limit": 1, "cursor": cursor},
            {"dentition": "primary", "day": "2026-08-01", "limit": 1, "cursor": cursor},
            {"day": "2026-08-01", "limit": 1, "cursor": cursor, "epoch": "another-epoch"},
            {"day": "2026-08-01", "limit": 1, "cursor": _rewrite_cursor(cursor, day="2026-08-02")},
            {
                "day": "2026-08-01",
                "limit": 1,
                "cursor": _rewrite_cursor(cursor, at="2026-08-01"),
            },
            {
                "day": "2026-08-01",
                "limit": 1,
                "cursor": _rewrite_cursor(cursor, patient_id=str(foreign)),
            },
            {
                "day": "2026-08-01",
                "limit": 1,
                "cursor": _rewrite_cursor(cursor, owner_id=str(other)),
            },
        )
        for params in mismatches:
            response = await _events(client, patient, **params)
            assert response.status_code == 422, (params, response.text)
            assert response.json()["detail"]["code"] == "invalid_cursor"

        crossed = await _snapshot(client, patient, at="2026-08-01", limit=1, cursor=cursor)
        assert crossed.status_code == 422, crossed.text
        assert crossed.json()["detail"]["code"] == "invalid_cursor"


async def test_history_snapshot_state_and_count_table(history_db):
    pool, owner, _, patient, _ = history_db
    async with _client() as client:
        active = await _create_condition(client, patient, tooth=11)
        resolved = await _create_condition(client, patient, tooth=12)
        await _resolve_condition(client, patient, resolved)
        legacy = await _create_condition(client, patient, tooth=13)
        await seed_condition_correction(
            pool,
            owner,
            patient,
            legacy,
            {
                "operation_id": str(uuid4()),
                "expected_revision": 1,
                "reason": "Registro por error",
                "replacement": None,
            },
        )
        deleted_finding = await _create_condition(client, patient, tooth=14)
        existing = await _create_treatment(client, patient, teeth=((21, "tooth"),))
        performed = await _create_treatment(client, patient, teeth=((23, "tooth"),))
        await _append_treatment_revision(
            pool, owner, patient, performed, state="performed", at=_moment(date(2026, 7, 1))
        )
        cancelled = await _create_treatment(client, patient, teeth=((24, "tooth"),))
        await _append_treatment_revision(
            pool, owner, patient, cancelled, state="cancelled", at=_moment(date(2026, 7, 1))
        )
        legacy_error = await _create_treatment(client, patient, teeth=((25, "tooth"),))
        await _append_treatment_revision(
            pool,
            owner,
            patient,
            legacy_error,
            action="corrected",
            state="entered_in_error",
            at=_moment(date(2026, 7, 1)),
        )
        deleted_procedure = await _create_treatment(client, patient, teeth=((26, "tooth"),))
        bridge = await _create_treatment(
            client,
            patient,
            variant="REST-BRIDGE-MC",
            teeth=((31, "pillar"), (32, "pontic"), (33, "pillar")),
        )
        arch = await _create_treatment(
            client, patient, variant="REST-SPLINT-OCC", teeth=(), arch="upper"
        )

        _, planned = await _add_plan_item(owner, patient)
        for response in (
            await _delete_record(client, patient, "condition", deleted_finding),
            await _delete_record(client, patient, "procedure", deleted_procedure),
        ):
            assert response.status_code == 200, response.text

        response = await _snapshot(client, patient)
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["counts"] == {
            "records": 10,
            "findings": 3,
            "procedures": 7,
            "charted_records": 6,
            "affected_teeth": 7,
            "affected_arches": 1,
            "deleted_records": 2,
        }
        assert (
            body["counts"]["records"] == body["counts"]["findings"] + body["counts"]["procedures"]
        )
        assert body["coverage"]["state"] == "complete"
        assert body["coverage"]["warnings"] == []

        items = {item["resource_id"]: item for item in body["items"]}
        assert set(items) == {
            str(active),
            str(resolved),
            str(legacy),
            str(existing),
            str(planned),
            str(performed),
            str(cancelled),
            str(legacy_error),
            str(bridge),
            str(arch),
        }
        assert str(deleted_finding) not in items and str(deleted_procedure) not in items
        for item in body["items"]:
            assert set(item) == {
                "resource_kind",
                "resource_id",
                "revision",
                "changed_at",
                "snapshot",
                "chart_eligible",
            }
        assert [
            items[str(identifier)]["chart_eligible"]
            for identifier in (active, existing, planned, performed, bridge, arch)
        ] == [True] * 6
        assert [
            items[str(identifier)]["chart_eligible"]
            for identifier in (resolved, legacy, cancelled, legacy_error)
        ] == [False] * 4
        assert items[str(active)]["snapshot"] == {
            "dentition": "permanent",
            "tooth_fdi": 11,
            "condition_code": "caries",
            "surfaces": ["M", "O"],
            "note": None,
            "status": "active",
            "deleted_at": None,
            "deleted_by_user_id": None,
        }
        assert items[str(resolved)]["snapshot"]["status"] == "resolved"
        assert items[str(legacy)]["snapshot"]["status"] == "entered_in_error"
        assert items[str(existing)]["snapshot"]["state"] == "existing"
        assert items[str(planned)]["snapshot"]["state"] == "planned"
        assert items[str(planned)]["snapshot"]["provenance"] == "planned_in_clinic"
        assert items[str(performed)]["snapshot"]["state"] == "performed"
        assert items[str(cancelled)]["snapshot"]["state"] == "cancelled"
        assert items[str(legacy_error)]["snapshot"]["state"] == "entered_in_error"
        bridge_snapshot = items[str(bridge)]["snapshot"]
        assert bridge_snapshot["scope"] == "multi_tooth"
        assert [(member["tooth_fdi"], member["role"]) for member in bridge_snapshot["teeth"]] == [
            (31, "pillar"),
            (32, "pontic"),
            (33, "pillar"),
        ]
        arch_snapshot = items[str(arch)]["snapshot"]
        assert arch_snapshot["scope"] == "global_arch"
        assert arch_snapshot["arch"] == "upper"
        assert arch_snapshot["teeth"] == []
        for private in ("owner_user_id", "payload_hash", "command_snapshot", "operation_id"):
            assert private not in response.text

        page = await _snapshot(client, patient, limit=3)
        assert page.status_code == 200, page.text
        assert len(page.json()["items"]) == 3 and page.json()["next_cursor"]
        assert page.json()["counts"] == body["counts"]
        collected = list(page.json()["items"])
        cursor = page.json()["next_cursor"]
        while cursor:
            chunk = await _snapshot(client, patient, limit=3, cursor=cursor)
            assert chunk.status_code == 200, chunk.text
            collected.extend(chunk.json()["items"])
            cursor = chunk.json()["next_cursor"]
    assert len(collected) == 10
    assert collected == sorted(
        collected, key=lambda item: (item["resource_kind"], item["resource_id"])
    )


async def test_history_coverage_reports_empty_and_missing_initial_evidence(history_db):
    pool, owner, _, patient, _ = history_db
    async with _client() as client:
        incomplete = await _create_condition(client, patient, tooth=27)
        # Legacy evidence whose initial revision was lost.
        async with pool.acquire() as conn:
            original = await conn.fetchrow(
                "SELECT after_snapshot FROM patient_tooth_condition_revisions"
                " WHERE condition_id=$1 AND revision=1",
                incomplete,
            )
            await conn.execute(
                "DELETE FROM patient_tooth_condition_revisions WHERE condition_id=$1", incomplete
            )
            await conn.execute(
                "UPDATE patient_tooth_conditions SET revision=2 WHERE id=$1", incomplete
            )
            await conn.execute(
                "INSERT INTO patient_tooth_condition_revisions"
                " (id,condition_id,owner_user_id,patient_id,revision,before_snapshot,after_snapshot,"
                "  actor_user_id,changed_at,action) VALUES($1,$2,$3,$4,2,$5::jsonb,$5::jsonb,$3,$6,"
                " 'edited')",
                uuid4(),
                incomplete,
                owner,
                patient,
                original["after_snapshot"],
                datetime(2026, 7, 2, 12, tzinfo=UTC),
            )

        partial = await _snapshot(client, patient)
        assert partial.status_code == 200, partial.text
        partial_body = partial.json()
        assert partial_body["coverage"]["state"] == "partial"
        assert "missing_initial_revision" in partial_body["coverage"]["warnings"]
        assert [item["resource_id"] for item in partial_body["items"]] == [str(incomplete)]
        assert partial_body["items"][0]["revision"] == 2
        assert partial_body["counts"]["records"] == 1
        assert _aware(partial_body["coverage"]["earliest_recorded_at"]) == datetime(
            2026, 7, 2, 12, tzinfo=UTC
        )

        blank = uuid4()
        async with pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO patients (id, owner_user_id, first_name, last_name, rut_number, rut_dv)"
                " VALUES ($1, $2, 'Sintético', 'Vacío', 14000099, '5')",
                blank,
                owner,
            )
        empty = await _snapshot(client, blank)
        assert empty.status_code == 200, empty.text
        body = empty.json()
        assert body["items"] == [] and body["next_cursor"] is None
        assert body["counts"] == {
            "records": 0,
            "findings": 0,
            "procedures": 0,
            "charted_records": 0,
            "affected_teeth": 0,
            "affected_arches": 0,
            "deleted_records": 0,
        }
        assert body["coverage"] == {
            "state": "complete",
            "earliest_recorded_at": None,
            "warnings": [],
        }
        assert body["epoch"]

        empty_events = await _events(client, blank)
        assert empty_events.status_code == 200, empty_events.text
        assert empty_events.json()["items"] == []
        assert empty_events.json()["total_events"] == 0
        assert empty_events.json()["epoch"] == body["epoch"]


async def test_history_stale_epoch_reports_history_changed(history_db):
    pool, _, _, patient, _ = history_db
    days = (date(2026, 6, 1), date(2026, 6, 2), date(2026, 6, 3))
    async with _client() as client:
        for index, day in enumerate(days):
            identifier = await _create_condition(client, patient, tooth=31 + index)
            await _stamp_condition(pool, identifier, 1, _moment(day))
        first = await _events(client, patient, limit=2)
        assert first.status_code == 200, first.text
        epoch = first.json()["epoch"]
        cursor = first.json()["next_cursor"]
        assert epoch and cursor

        # An older-timestamp revision committed after the first read still changes the epoch.
        late = await _create_condition(client, patient, tooth=37)
        await _stamp_condition(pool, late, 1, _moment(date(2026, 1, 5)))

        stale = await _events(client, patient, limit=2, epoch=epoch)
        assert stale.status_code == 409, stale.text
        assert stale.json()["detail"]["code"] == "history_changed"
        page = await _events(client, patient, limit=2, cursor=cursor)
        assert page.status_code == 409, page.text
        assert page.json()["detail"]["code"] == "history_changed"
        snapshot = await _snapshot(client, patient, epoch=epoch)
        assert snapshot.status_code == 409, snapshot.text
        assert snapshot.json()["detail"]["code"] == "history_changed"

        fresh = await _events(client, patient, limit=2)
        assert fresh.status_code == 200, fresh.text
        assert fresh.json()["epoch"] != epoch
        assert fresh.json()["total_events"] == 4


async def test_history_reads_leave_source_rows_and_receipts_unchanged(history_db):
    pool, owner, _, patient, _ = history_db
    day_a, day_b = date(2026, 5, 1), date(2026, 5, 2)
    async with _client() as client:
        condition = await _create_condition(client, patient, tooth=41)
        treatment = await _create_treatment(client, patient, teeth=((42, "tooth"),))
        await _stamp_condition(pool, condition, 1, _moment(day_a))
        await _stamp_treatment(pool, treatment, 1, _moment(day_a))
        legacy = await _create_condition(client, patient, tooth=43)
        await seed_condition_correction(
            pool,
            owner,
            patient,
            legacy,
            {
                "operation_id": str(uuid4()),
                "expected_revision": 1,
                "reason": "Registro por error",
                "replacement": None,
            },
        )
        await _stamp_condition(pool, legacy, 2, _moment(day_b))
        deleted = await _create_condition(client, patient, tooth=44)
        assert (await _delete_record(client, patient, "condition", deleted)).status_code == 200
        await _stamp_condition(pool, deleted, 2, _moment(day_b))

        before = await _rows(pool, owner)
        reads = (
            await _events(client, patient),
            await _events(client, patient, day=day_b.isoformat()),
            await _events(client, patient, limit=1),
            await _snapshot(client, patient),
            await _snapshot(client, patient, at=day_a.isoformat()),
            await _snapshot(client, patient, limit=1),
            await _events(client, patient, epoch="stale-epoch"),
            await _events(client, patient, cursor="!!!"),
        )
        assert [read.status_code for read in reads] == [200, 200, 200, 200, 200, 200, 409, 422]
        after = await _rows(pool, owner)
    assert after == before


async def test_history_inter_page_late_commit_conflicts_and_leaves_rows_unchanged(history_db):
    pool, owner, _, patient, _ = history_db
    async with _client() as client:
        first = await _create_condition(client, patient, tooth=21)
        second = await _create_condition(client, patient, tooth=22)
        await _stamp_condition(pool, first, 1, _moment(date(2026, 4, 1)))
        await _stamp_condition(pool, second, 1, _moment(date(2026, 4, 2)))

        before = await _rows(pool, owner)
        assert before
        page_one = await _events(client, patient, limit=1)
        assert page_one.status_code == 200, page_one.text
        cursor = page_one.json()["next_cursor"]
        page_two = await _events(client, patient, limit=1, cursor=cursor)
        assert page_two.status_code == 200, page_two.text
        assert page_two.json()["items"][0]["resource_id"] == str(first)

        # A late commit between pages invalidates the cursor instead of merging pages.
        late = await _create_condition(client, patient, tooth=23)
        await _stamp_condition(pool, late, 1, _moment(date(2025, 1, 1)))
        stale = await _events(client, patient, limit=1, cursor=cursor)
        assert stale.status_code == 409, stale.text
        assert stale.json()["detail"]["code"] == "history_changed"
        fresh = await _events(client, patient, limit=1)
        assert fresh.status_code == 200, fresh.text
        assert fresh.json()["epoch"] != page_one.json()["epoch"]
        after = await _rows(pool, owner)
    # The only allowed difference is the intentional late commit between the pages.
    pruned = {key: [row for row in rows if str(late) not in row] for key, rows in after.items()}
    assert pruned == before


async def test_history_hides_foreign_patients_and_their_counts(history_db):
    _, owner, other, patient, foreign = history_db
    theirs = uuid4()
    async with _client() as client:
        await _create_condition(client, patient, tooth=15)
    await patient_conditions_repo.create_condition(
        other,
        foreign,
        theirs,
        {
            "dentition": "permanent",
            "tooth_fdi": 16,
            "condition_code": "caries",
            "surfaces": ["M"],
            "note": None,
        },
    )
    async with _client() as client:
        owned = await _snapshot(client, patient)
        assert owned.status_code == 200, owned.text
        assert owned.json()["counts"]["records"] == 1

        app.dependency_overrides[get_current_user] = _auth(other)
        try:
            crossed = await _snapshot(client, patient)
            assert crossed.status_code == 404, crossed.text
            assert crossed.json()["detail"]["code"] == "not_found"
            visible = await _snapshot(client, foreign)
            assert visible.status_code == 200, visible.text
            assert visible.json()["counts"]["records"] == 1
            assert str(theirs) in visible.text
        finally:
            app.dependency_overrides[get_current_user] = _auth(owner)

        hidden = await _snapshot(client, foreign)
        assert hidden.status_code == 404, hidden.text
        assert hidden.json()["detail"]["code"] == "not_found"
        for leaked in (str(theirs), "epoch", "counts", "coverage", "items"):
            assert leaked not in hidden.text
