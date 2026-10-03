"""Live-Postgres contracts for export claims and period locks."""

from __future__ import annotations

import asyncio
import os
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import asyncpg
import pytest

from backend.db import evolution_exports_repo

DSN = os.environ.get("CLINICAL_EXPORT_LIVE_TEST_DSN", "")
if not DSN:
    pytestmark = pytest.mark.skip(reason="CLINICAL_EXPORT_LIVE_TEST_DSN not set")


@pytest.fixture
async def db():
    try:
        pool = await asyncpg.create_pool(DSN, min_size=1, max_size=10)
    except OSError as exc:
        pytest.skip(f"live Postgres unreachable: {exc}")
    async with pool.acquire() as conn:
        await conn.execute("TRUNCATE users CASCADE")
    yield pool
    await pool.close()


async def _make_export(db, *, status: str = "pending", age_seconds: int = 0) -> tuple[UUID, UUID]:
    owner, patient, evolution = uuid4(), uuid4(), uuid4()
    async with db.acquire() as conn:
        await conn.execute(
            "INSERT INTO users (id, email) VALUES ($1, $2)", owner, f"claim-{owner}@example.com"
        )
        await conn.execute(
            """
            INSERT INTO patients (id, owner_user_id, first_name, last_name, rut_number, rut_dv)
            VALUES ($1, $2, 'Ana', 'Pérez', 12345678, '5')
            """,
            patient,
            owner,
        )
        await conn.execute(
            """
            INSERT INTO evolutions (
                id, owner_user_id, patient_id, evolution_at, raw_note, generated_text, final_text
            ) VALUES ($1, $2, $3, now(), 'Control', 'Control', 'Control')
            """,
            evolution,
            owner,
            patient,
        )
        await conn.execute(
            """
            INSERT INTO google_drive_evolution_exports (
                id, user_id, evolution_id, operation_id, period_type, period_key,
                status, journal_block, content_hash, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, 'weekly', '2026-W02', $5, 'block', $6, now(), $7)
            """,
            uuid4(),
            owner,
            evolution,
            uuid4(),
            status,
            "0" * 64,
            datetime.now(UTC) - timedelta(seconds=age_seconds),
        )
    return owner, evolution


def _claim_function():
    claim = getattr(evolution_exports_repo, "claim_export", None)
    assert callable(claim), "task 6.3 must implement evolution_exports_repo.claim_export"
    return claim


async def test_duplicate_scheduling_has_one_atomic_claim_winner(db) -> None:
    owner, evolution = await _make_export(db)
    claim = _claim_function()

    async def attempt():
        async with db.acquire() as conn:
            return await claim(conn, owner, evolution, allow_retry=False, stale_after_seconds=300)

    claims = await asyncio.gather(*(attempt() for _ in range(6)))
    winners = [row for row in claims if row is not None]
    assert len(winners) == 1
    assert winners[0]["previous_status"] == "pending"


@pytest.mark.parametrize(("age_seconds", "claimable"), [(299, False), (301, True)])
async def test_only_five_minute_stale_syncing_is_reclaimable(
    db, age_seconds: int, claimable: bool
) -> None:
    owner, evolution = await _make_export(db, status="syncing", age_seconds=age_seconds)
    claim = _claim_function()
    async with db.acquire() as conn:
        row = await claim(conn, owner, evolution, allow_retry=True, stale_after_seconds=300)

    assert (row is not None) is claimable
    if row:
        assert row["previous_status"] == "syncing"


@pytest.mark.parametrize("status", ["failed", "unknown"])
async def test_retry_claim_returns_previous_status(db, status: str) -> None:
    owner, evolution = await _make_export(db, status=status)
    async with db.acquire() as conn:
        row = await evolution_exports_repo.claim_export(
            conn, owner, evolution, allow_retry=True, stale_after_seconds=300
        )

    assert row is not None
    assert row["previous_status"] == status


async def test_period_lock_serializes_six_workers_without_transaction_or_deadlock(db) -> None:
    period_lock = getattr(evolution_exports_repo, "period_lock", None)
    assert callable(period_lock), "task 6.3 must implement evolution_exports_repo.period_lock"
    owner = uuid4()
    active = 0
    peak = 0

    async def worker() -> None:
        nonlocal active, peak
        async with period_lock(db, owner, "weekly", "2026-W02") as conn:
            assert not conn.is_in_transaction()
            active += 1
            peak = max(peak, active)
            await asyncio.sleep(0.02)
            active -= 1

    await asyncio.wait_for(asyncio.gather(*(worker() for _ in range(6))), timeout=3)
    assert peak == 1
    async with db.acquire() as conn:
        assert await conn.fetchval("SELECT 1") == 1


async def test_unrelated_query_completes_during_locked_provider_io(db) -> None:
    period_lock = getattr(evolution_exports_repo, "period_lock", None)
    assert callable(period_lock), "task 6.3 must implement evolution_exports_repo.period_lock"
    owner = uuid4()

    async with period_lock(db, owner, "weekly", "2026-W02") as lock_conn:
        assert not lock_conn.is_in_transaction()
        async with asyncio.timeout(1):
            async with db.acquire() as unrelated_conn:
                assert await unrelated_conn.fetchval("SELECT 1") == 1


async def test_period_lock_releases_lock_and_connection_after_exception(db) -> None:
    period_lock = getattr(evolution_exports_repo, "period_lock", None)
    assert callable(period_lock), "task 6.3 must implement evolution_exports_repo.period_lock"
    owner = uuid4()

    with pytest.raises(RuntimeError, match="provider failed"):
        async with period_lock(db, owner, "weekly", "2026-W02") as conn:
            assert not conn.is_in_transaction()
            raise RuntimeError("provider failed")

    async with asyncio.timeout(1):
        async with period_lock(db, owner, "weekly", "2026-W02"):
            pass
    assert db.get_idle_size() == db.get_size()
