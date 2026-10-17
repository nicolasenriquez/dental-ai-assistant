"""Task 3.1 volume gate: 10,000 scoped revisions, plans, latency, statement counts.

Runs only against ``WORKSPACE_LIVE_TEST_DSN`` (an isolated migrated database).
Implements history-read-contract.md "Examples and performance gate": warm each
read shape five times, measure 20 requests per shape with limit=100 and
selected-day/unfiltered variants, and accept only p95 <= 1000ms on the local
Docker test runtime with no N+1 history fetches and no per-item revision scan.
"""

from __future__ import annotations

import json
import os
import time
from datetime import UTC, date, datetime, timedelta
from math import ceil
from typing import Any
from uuid import UUID, uuid4

import asyncpg
import pytest

from backend.db import patient_dental_history_repo as repo
from backend.patients.dental_history import clinical_cutoff, clinical_start
from tests.test_patient_dental_history_live import (
    SCOPED_ROWS,
    _client,
    _events,
    _rows,
    _snapshot,
    history_db,  # noqa: F401
)

DSN = os.environ.get("WORKSPACE_LIVE_TEST_DSN", "")
pytestmark = pytest.mark.skipif(not DSN, reason="WORKSPACE_LIVE_TEST_DSN not set")

DAY = date(2026, 8, 15)
DAY_RESOURCES = 150
CONDITION_TOTAL = TREATMENT_TOTAL = 2_500
CONDITION_TOMBSTONES = 40
TREATMENT_TOMBSTONES = 20
WARMUPS, SAMPLES, LIMIT = 5, 20, 100
EXPECTED_STATEMENTS = {"events": 5, "snapshot": 4}
REVISION_TABLES = frozenset(
    {"patient_tooth_condition_revisions", "patient_dental_treatment_revisions"}
)

VALID_TEETH = tuple(
    fdi for quadrant in (1, 2, 3, 4) for fdi in range(quadrant * 10 + 1, quadrant * 10 + 9)
)
SURFACE_ORDER = "MDOVL"
# The surfaces CHECK requires the canonical MDOVL order, so subsets are generated in it.
SURFACE_SETS = tuple(
    tuple(surface for index, surface in enumerate(SURFACE_ORDER) if mask & (1 << index))
    for mask in range(1, 1 << len(SURFACE_ORDER))
)
CODES = ("caries", "incipient_caries", "pigmentation", "fracture")
CONDITION_STATUSES = ("active", "active", "resolved")
TREATMENT_STATES = ("existing", "planned", "performed", "cancelled")

CONDITION_COLUMNS = (
    "id",
    "owner_user_id",
    "patient_id",
    "dentition",
    "tooth_fdi",
    "condition_code",
    "surfaces",
    "note",
    "status",
    "revision",
    "created_by_user_id",
    "updated_by_user_id",
    "created_at",
    "updated_at",
    "deleted_at",
    "deleted_by_user_id",
)
CONDITION_REVISION_COLUMNS = (
    "id",
    "condition_id",
    "owner_user_id",
    "patient_id",
    "revision",
    "before_snapshot",
    "after_snapshot",
    "actor_user_id",
    "changed_at",
    "action",
)
TREATMENT_COLUMNS = (
    "id",
    "owner_user_id",
    "patient_id",
    "variant_id",
    "catalog_version",
    "label_es",
    "clinical_type",
    "category_key",
    "scope",
    "dentition",
    "arch",
    "provenance",
    "state",
    "note",
    "revision",
    "supersedes_id",
    "replacement_id",
    "created_by_user_id",
    "updated_by_user_id",
    "created_at",
    "updated_at",
    "deleted_at",
    "deleted_by_user_id",
)
TREATMENT_REVISION_COLUMNS = (
    "id",
    "treatment_id",
    "patient_id",
    "owner_user_id",
    "revision",
    "action",
    "before_snapshot",
    "after_snapshot",
    "reason",
    "actor_user_id",
    "changed_at",
)


class _CountingConnection:
    def __init__(self, conn: asyncpg.Connection, log: list[str]) -> None:
        self._conn, self._log = conn, log

    def __getattr__(self, name: str) -> Any:
        return getattr(self._conn, name)

    async def fetch(self, query: str, *args: Any, **kwargs: Any) -> Any:
        self._log.append(query)
        return await self._conn.fetch(query, *args, **kwargs)

    async def fetchrow(self, query: str, *args: Any, **kwargs: Any) -> Any:
        self._log.append(query)
        return await self._conn.fetchrow(query, *args, **kwargs)

    async def fetchval(self, query: str, *args: Any, **kwargs: Any) -> Any:
        self._log.append(query)
        return await self._conn.fetchval(query, *args, **kwargs)

    async def execute(self, query: str, *args: Any, **kwargs: Any) -> Any:
        self._log.append(query)
        return await self._conn.execute(query, *args, **kwargs)


class _CountingLease:
    def __init__(self, pool: asyncpg.Pool, log: list[str]) -> None:
        self._pool, self._log = pool, log
        self._lease: Any = None

    async def __aenter__(self) -> _CountingConnection:
        self._lease = self._pool.acquire()
        return _CountingConnection(await self._lease.__aenter__(), self._log)

    async def __aexit__(self, *exc: Any) -> Any:
        assert self._lease is not None
        return await self._lease.__aexit__(*exc)


class _CountingPool:
    """Counts repository statements per request to prove there is no N+1 fetch."""

    def __init__(self, pool: asyncpg.Pool, log: list[str]) -> None:
        self._pool, self._log = pool, log

    def acquire(self) -> _CountingLease:
        return _CountingLease(self._pool, self._log)


def _window(index: int) -> tuple[datetime, datetime]:
    if index < DAY_RESOURCES:
        first = datetime(2026, 8, 15, 12, 0, tzinfo=UTC) + timedelta(minutes=2 * index)
    else:
        first = datetime(2025, 1, 6, 12, 0, tzinfo=UTC) + timedelta(
            minutes=11 * (index - DAY_RESOURCES)
        )
    return first, first + timedelta(minutes=1)


def _condition_records(
    owner: UUID, patient: UUID, index: int
) -> tuple[tuple[Any, ...], list[tuple[Any, ...]]]:
    first, second = _window(index)
    tooth = VALID_TEETH[index % len(VALID_TEETH)]
    code = CODES[(index // len(VALID_TEETH)) % len(CODES)]
    surfaces = list(SURFACE_SETS[(index // (len(VALID_TEETH) * len(CODES))) % len(SURFACE_SETS)])
    status = CONDITION_STATUSES[index % len(CONDITION_STATUSES)]
    deleted = index >= CONDITION_TOTAL - CONDITION_TOMBSTONES
    identifier = uuid4()
    base = {
        "dentition": "permanent",
        "tooth_fdi": tooth,
        "condition_code": code,
        "surfaces": surfaces,
        "note": None,
        "status": status,
    }
    created = {**base, "deleted_at": None, "deleted_by_user_id": None}
    current = {
        **base,
        "deleted_at": second.isoformat() if deleted else None,
        "deleted_by_user_id": str(owner) if deleted else None,
    }
    source = (
        identifier,
        owner,
        patient,
        "permanent",
        tooth,
        code,
        surfaces,
        None,
        status,
        2,
        owner,
        owner,
        first,
        second,
        second if deleted else None,
        owner if deleted else None,
    )
    revisions = [
        (
            uuid4(),
            identifier,
            owner,
            patient,
            1,
            None,
            json.dumps(created),
            owner,
            first,
            "created",
        ),
        (
            uuid4(),
            identifier,
            owner,
            patient,
            2,
            json.dumps(created),
            json.dumps(current),
            owner,
            second,
            "deleted" if deleted else "edited",
        ),
    ]
    return source, revisions


def _treatment_records(
    owner: UUID, patient: UUID, index: int
) -> tuple[tuple[Any, ...], list[tuple[Any, ...]]]:
    first, second = _window(index)
    tooth = VALID_TEETH[index % len(VALID_TEETH)]
    deleted = index >= TREATMENT_TOTAL - TREATMENT_TOMBSTONES
    identifier = uuid4()
    if index % 25 == 0:
        scope, arch = "global_arch", ("upper" if (index // 25) % 2 else "lower")
        teeth: list[dict[str, Any]] = []
    elif index % 25 == 1:
        scope, arch = "multi_tooth", None
        teeth = [
            {"tooth_fdi": tooth, "role": "tooth", "surfaces": []},
            {
                "tooth_fdi": VALID_TEETH[(index + 1) % len(VALID_TEETH)],
                "role": "tooth",
                "surfaces": [],
            },
        ]
    else:
        scope, arch = "tooth", None
        teeth = [{"tooth_fdi": tooth, "role": "tooth", "surfaces": []}]
    state = TREATMENT_STATES[index % len(TREATMENT_STATES)]
    base = {
        "variant_id": "PREV-SEAL",
        "catalog_version": "v1",
        "label_es": "Sellante preventivo",
        "clinical_type": "preventive",
        "category_key": "prevention",
        "scope": scope,
        "dentition": "permanent",
        "arch": arch,
        "provenance": "observed_existing" if state == "existing" else "planned_in_clinic",
        "state": state,
        "teeth": teeth,
        "note": None,
    }
    created = {
        **base,
        "revision": 1,
        "supersedes_id": None,
        "deleted_at": None,
        "deleted_by_user_id": None,
    }
    current = {
        **base,
        "revision": 2,
        "supersedes_id": None,
        "deleted_at": second.isoformat() if deleted else None,
        "deleted_by_user_id": str(owner) if deleted else None,
    }
    source = (
        identifier,
        owner,
        patient,
        "PREV-SEAL",
        "v1",
        "Sellante preventivo",
        "preventive",
        "prevention",
        scope,
        "permanent",
        arch,
        created["provenance"],
        state,
        None,
        2,
        None,
        None,
        owner,
        owner,
        first,
        second,
        second if deleted else None,
        owner if deleted else None,
    )
    revisions = [
        (
            uuid4(),
            identifier,
            patient,
            owner,
            1,
            "created",
            None,
            json.dumps(created),
            None,
            owner,
            first,
        ),
        (
            uuid4(),
            identifier,
            patient,
            owner,
            2,
            "deleted" if deleted else "edited",
            json.dumps(created),
            json.dumps(current),
            None,
            owner,
            second,
        ),
    ]
    return source, revisions


async def _seed(pool: asyncpg.Pool, owner: UUID, patient: UUID) -> None:
    async with pool.acquire() as conn:
        rows, condition_revisions, treatment_revisions = [], [], []
        for index in range(CONDITION_TOTAL):
            source, revisions = _condition_records(owner, patient, index)
            rows.append(source)
            condition_revisions.extend(revisions)
        async with conn.transaction():
            await conn.copy_records_to_table(
                "patient_tooth_conditions", records=rows, columns=CONDITION_COLUMNS
            )
            await conn.copy_records_to_table(
                "patient_tooth_condition_revisions",
                records=condition_revisions,
                columns=CONDITION_REVISION_COLUMNS,
            )
        rows, condition_revisions = [], []
        for index in range(TREATMENT_TOTAL):
            source, revisions = _treatment_records(owner, patient, index)
            rows.append(source)
            treatment_revisions.extend(revisions)
        async with conn.transaction():
            await conn.copy_records_to_table(
                "patient_dental_treatments", records=rows, columns=TREATMENT_COLUMNS
            )
            await conn.copy_records_to_table(
                "patient_dental_treatment_revisions",
                records=treatment_revisions,
                columns=TREATMENT_REVISION_COLUMNS,
            )
        # Settle stats so the measured window is not disturbed by post-COPY auto-analyze.
        await conn.execute(
            "ANALYZE patient_tooth_conditions, patient_tooth_condition_revisions,"
            " patient_dental_treatments, patient_dental_treatment_revisions"
        )


def _percentile(samples: list[float], percentile: int) -> float:
    ordered = sorted(samples)
    return ordered[max(0, ceil(percentile / 100 * len(ordered)) - 1)]


def _walk(plan: dict[str, Any]) -> list[dict[str, Any]]:
    nodes = [plan]
    for child in plan.get("Plans", []):
        nodes.extend(_walk(child))
    return nodes


def _plan_lines(plan: dict[str, Any], depth: int = 0) -> list[str]:
    label = f"{'  ' * depth}{plan['Node Type']}"
    if plan.get("Relation Name"):
        label += f" on {plan['Relation Name']}"
    if plan.get("Index Name"):
        label += f" via {plan['Index Name']}"
    label += (
        f" rows={plan.get('Actual Rows')} loops={plan.get('Actual Loops')}"
        f" time={plan.get('Actual Total Time'):.2f}ms"
    )
    lines = [label]
    for child in plan.get("Plans", []):
        lines.extend(_plan_lines(child, depth + 1))
    return lines


async def _plan(conn: asyncpg.Connection, sql: str, *args: Any) -> dict[str, Any]:
    rows = await conn.fetch("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + sql, *args)
    payload: list[dict[str, Any]] = json.loads(rows[0][0])
    plan: dict[str, Any] = payload[0]["Plan"]
    return plan


def _assert_no_rescan(name: str, plan: dict[str, Any]) -> None:
    for node in _walk(plan):
        if node.get("Relation Name") in REVISION_TABLES:
            assert node.get("Actual Loops", 1) < 5, (name, node)


async def test_history_volume_gate_reports_plans_latency_and_statement_counts(
    history_db,  # noqa: F811 -- pytest resolves the sibling suite's fixture
    monkeypatch,
    capsys,
):
    pool, owner, _, patient, _ = history_db
    await _seed(pool, owner, patient)
    day, start = DAY.isoformat(), clinical_start(DAY)
    cutoff = clinical_cutoff(DAY)

    async with _client() as client:
        page_one = await _events(client, patient, limit=LIMIT)
        assert page_one.status_code == 200, page_one.text
        assert page_one.json()["total_events"] == 10_000
        events_cursor = page_one.json()["next_cursor"]
        first_day = await _events(client, patient, limit=LIMIT, day=day)
        assert first_day.status_code == 200, first_day.text
        assert first_day.json()["total_events"] == 600
        day_cursor = first_day.json()["next_cursor"]
        current = await _snapshot(client, patient, limit=LIMIT)
        assert current.status_code == 200, current.text
        assert current.json()["counts"]["records"] == 4_940
        assert current.json()["counts"]["deleted_records"] == 60
        as_of = await _snapshot(client, patient, at=day, limit=LIMIT)
        assert as_of.status_code == 200, as_of.text

        before = await _rows(pool, owner)
        assert len(before[SCOPED_ROWS[1]]) == 5_000

        log: list[str] = []
        monkeypatch.setattr(repo, "get_pg_pool", lambda: _CountingPool(pool, log))
        bounds = (start, cutoff)
        second_bound = (
            datetime.fromisoformat(first_day.json()["items"][-1]["changed_at"]),
            first_day.json()["items"][-1]["resource_kind"],
            UUID(first_day.json()["items"][-1]["event_id"]),
        )
        shapes = {
            "events-unfiltered-page1": (
                lambda: _events(client, patient, limit=LIMIT),
                EXPECTED_STATEMENTS["events"],
            ),
            "events-unfiltered-page2": (
                lambda: _events(client, patient, limit=LIMIT, cursor=events_cursor),
                EXPECTED_STATEMENTS["events"],
            ),
            "events-day-page1": (
                lambda: _events(client, patient, limit=LIMIT, day=day),
                EXPECTED_STATEMENTS["events"],
            ),
            "events-day-page2": (
                lambda: _events(client, patient, limit=LIMIT, day=day, cursor=day_cursor),
                EXPECTED_STATEMENTS["events"],
            ),
            "snapshot-current": (
                lambda: _snapshot(client, patient, limit=LIMIT),
                EXPECTED_STATEMENTS["snapshot"],
            ),
            "snapshot-as-of": (
                lambda: _snapshot(client, patient, at=day, limit=LIMIT),
                EXPECTED_STATEMENTS["snapshot"],
            ),
        }
        metrics: dict[str, list[float]] = {}
        for name, (call, expected) in shapes.items():
            for _ in range(WARMUPS):
                log.clear()
                assert (await call()).status_code == 200
            samples, counted = [], set()
            for _ in range(SAMPLES):
                log.clear()
                started = time.perf_counter()
                response = await call()
                samples.append(time.perf_counter() - started)
                assert response.status_code == 200, response.text
                counted.add(len(log))
            assert counted == {expected}, (name, counted)
            metrics[name] = samples

    async with pool.acquire() as conn:
        plans = {
            "events-unfiltered-page1": await _plan(
                conn,
                repo._EVENTS_PAGE,
                owner,
                patient,
                "permanent",
                None,
                None,
                None,
                None,
                None,
                LIMIT + 1,
            ),
            "events-day-page1": await _plan(
                conn,
                repo._EVENTS_PAGE,
                owner,
                patient,
                "permanent",
                *bounds,
                None,
                None,
                None,
                LIMIT + 1,
            ),
            "events-day-page2": await _plan(
                conn,
                repo._EVENTS_PAGE,
                owner,
                patient,
                "permanent",
                *bounds,
                *second_bound,
                LIMIT + 1,
            ),
            "events-day-total": await _plan(
                conn, repo._EVENTS_TOTAL, owner, patient, "permanent", *bounds
            ),
            "snapshot-current": await _plan(conn, repo._LATEST, owner, patient, "permanent", None),
            "snapshot-as-of": await _plan(conn, repo._LATEST, owner, patient, "permanent", cutoff),
            "coverage-epoch": await _plan(conn, repo._COVERAGE, owner, patient, "permanent"),
        }
    after = await _rows(pool, owner)
    assert after == before

    with capsys.disabled():
        print("\n-- history volume gate: seconds per request --")
        for name, samples in metrics.items():
            print(
                f"{name}: p50={_percentile(samples, 50):.3f}"
                f" p95={_percentile(samples, 95):.3f} max={max(samples):.3f}"
            )
        for name, plan in plans.items():
            print(f"\n-- plan {name} --")
            print("\n".join(_plan_lines(plan)))

    overall = [sample for samples in metrics.values() for sample in samples]
    assert all(_percentile(samples, 95) <= 1.0 for samples in metrics.values())
    assert _percentile(overall, 95) <= 1.0
    for name, plan in plans.items():
        _assert_no_rescan(name, plan)
