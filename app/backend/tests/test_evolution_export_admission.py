"""Admission control for Drive export period locks (REL-003).

Proves waiters queue WITHOUT holding pool connections: with one admission
slot and one held export, a second export must not acquire a second
connection while waiting.
"""

from __future__ import annotations

import asyncio
from uuid import uuid4

import pytest

from backend.db import evolution_exports_repo


@pytest.fixture(autouse=True)
def fresh_semaphore(monkeypatch):
    monkeypatch.setattr(evolution_exports_repo, "_EXPORT_SEMAPHORE", asyncio.Semaphore(1))


class _FakeConn:
    async def execute(self, *args, **kwargs):
        return None


class _TrackingAcquire:
    def __init__(self, pool: _TrackingPool) -> None:
        self._pool = pool

    def __await__(self):
        return self._acquire().__await__()

    async def _acquire(self) -> _FakeConn:
        self._pool.holds += 1
        assert self._pool.holds <= self._pool.max_size, "pool exhausted by export waiters"
        return _FakeConn()

    async def __aenter__(self):
        return await self._acquire()

    async def __aexit__(self, *exc):
        self._pool.holds -= 1
        return False


class _TrackingPool:
    def __init__(self, max_size: int) -> None:
        self.max_size = max_size
        self.holds = 0

    def acquire(self):
        return _TrackingAcquire(self)

    async def release(self, _conn) -> None:
        self.holds -= 1


async def test_waiting_export_holds_no_pool_connection():
    pool = _TrackingPool(max_size=1)
    first_entered = asyncio.Event()
    release_first = asyncio.Event()
    second_done = asyncio.Event()

    async def first_export():
        async with evolution_exports_repo.period_lock(pool, uuid4(), "weekly", "2026-W01"):
            first_entered.set()
            await release_first.wait()

    async def second_export():
        async with evolution_exports_repo.period_lock(pool, uuid4(), "daily", "2026-01-01"):
            second_done.set()

    first = asyncio.create_task(first_export())
    await asyncio.wait_for(first_entered.wait(), timeout=5)
    assert pool.holds == 1

    second = asyncio.create_task(second_export())
    await asyncio.sleep(0.05)
    # The second export is waiting on admission, not on a pool connection.
    assert pool.holds == 1
    assert not second_done.is_set()

    release_first.set()
    await asyncio.wait_for(first, timeout=5)
    await asyncio.wait_for(second, timeout=5)
    assert second_done.is_set()
    assert pool.holds == 0


async def test_admission_slot_released_on_error():
    pool = _TrackingPool(max_size=1)

    async def failing_export():
        async with evolution_exports_repo.period_lock(pool, uuid4(), "weekly", "2026-W02"):
            raise RuntimeError("drive failed")

    with pytest.raises(RuntimeError, match="drive failed"):
        await failing_export()
    assert pool.holds == 0

    ok = False

    async def healthy_export():
        nonlocal ok
        async with evolution_exports_repo.period_lock(pool, uuid4(), "weekly", "2026-W03"):
            ok = True

    await healthy_export()
    assert ok
