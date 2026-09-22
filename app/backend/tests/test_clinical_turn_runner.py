"""A disconnected browser must not own the clinical worker's lifetime."""

import asyncio
import json
from uuid import UUID

import pytest
from fastapi import HTTPException, Request

from backend.clinical_assistant import turn_runner


async def test_disconnect_keeps_turn_running_and_duplicate_does_not_restart(monkeypatch) -> None:
    owner, thread, turn = UUID(int=1), UUID(int=2), UUID(int=3)
    release = asyncio.Event()
    finished = asyncio.Event()
    calls = 0

    async def run(*_args):
        nonlocal calls
        calls += 1
        yield "started"
        await release.wait()
        finished.set()
        yield "completed"

    monkeypatch.setattr(turn_runner.service, "stream_turn", run)
    stream = turn_runner.start(owner, thread, turn, "nota", [])
    assert await anext(stream) == "started"
    await stream.aclose()
    duplicate = turn_runner.start(owner, thread, turn, "nota", [])
    assert json.loads((await anext(duplicate)).split("data: ", 1)[1])["data"]["error_code"] == (
        "TURN_ALREADY_RUNNING"
    )
    assert calls == 1
    release.set()
    await asyncio.wait_for(finished.wait(), 1)
    await asyncio.sleep(0)
    assert (owner, thread, turn) not in turn_runner._tasks


async def test_cancel_route_rejects_other_owner_and_other_turn(monkeypatch) -> None:
    from backend.routes import clinical_assistant as routes

    owner, thread, turn = UUID(int=1), UUID(int=2), UUID(int=3)
    request = Request({"type": "http", "headers": [(b"origin", b"http://localhost:8000")]})
    monkeypatch.setattr(routes.config, "APP_ORIGINS", ["http://localhost:8000"])
    called = False

    async def missing(_owner, _thread):
        return None

    async def cancel(*_args):
        nonlocal called
        called = True
        return True

    monkeypatch.setattr(routes.repository, "get_thread", missing)
    monkeypatch.setattr(routes.turn_runner, "cancel", cancel)
    with pytest.raises(HTTPException) as error:
        await routes.cancel_turn(thread, turn, request, {"id": str(owner)})
    assert error.value.status_code == 404
    assert not called

    async def different_turn(_owner, _thread):
        return {"active_turn_id": UUID(int=9)}

    monkeypatch.setattr(routes.repository, "get_thread", different_turn)
    with pytest.raises(HTTPException) as error:
        await routes.cancel_turn(thread, turn, request, {"id": str(owner)})
    assert error.value.status_code == 409
    assert not called


async def test_explicit_cancel_waits_for_worker_cleanup(monkeypatch) -> None:
    owner, thread, turn = UUID(int=1), UUID(int=2), UUID(int=4)
    entered = asyncio.Event()
    cleaned = asyncio.Event()

    async def run(*_args):
        yield "started"
        entered.set()
        try:
            await asyncio.Event().wait()
        finally:
            cleaned.set()

    monkeypatch.setattr(turn_runner.service, "stream_turn", run)
    stream = turn_runner.start(owner, thread, turn, "nota", [])
    assert await anext(stream) == "started"
    await entered.wait()
    assert not await turn_runner.cancel(UUID(int=9), thread, turn)
    assert await turn_runner.cancel(owner, thread, turn)
    assert cleaned.is_set()
    await stream.aclose()
    assert (owner, thread, turn) not in turn_runner._tasks


async def test_worker_error_ends_stream_and_releases_registry(monkeypatch) -> None:
    owner, thread, turn = UUID(int=1), UUID(int=2), UUID(int=5)

    async def run(*_args):
        yield "started"
        raise RuntimeError("provider unavailable")

    monkeypatch.setattr(turn_runner.service, "stream_turn", run)
    stream = turn_runner.start(owner, thread, turn, "nota", [])
    assert await anext(stream) == "started"
    failed = json.loads((await anext(stream)).split("data: ", 1)[1])
    assert failed["data"]["error_code"] == "CLINICAL_RUNTIME_FAILED"
    assert [chunk async for chunk in stream] == []
    assert (owner, thread, turn) not in turn_runner._tasks
