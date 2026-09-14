"""Contracts for response-first, ID-only evolution export scheduling."""

from __future__ import annotations

from uuid import UUID

import pytest

from backend.clinical_assistant import service as clinical_service
from backend.clinical_assistant.schemas import ActionResolutionRequest
from backend.evolution_exports import service
from backend.routes import clinical_assistant

OWNER_ID = UUID("22222222-2222-2222-2222-222222222222")
EVOLUTION_ID = UUID("11111111-1111-1111-1111-111111111111")
ACTION_ID = UUID("33333333-3333-3333-3333-333333333333")


class _BackgroundTasks:
    def __init__(self) -> None:
        self.calls: list[tuple[object, tuple[object, ...], dict[str, object]]] = []

    def add_task(self, function: object, *args: object, **kwargs: object) -> None:
        self.calls.append((function, args, kwargs))


@pytest.mark.parametrize(
    ("allow_retry", "task_name"),
    [
        (False, "run_export_background"),
        (True, "run_export_recovery_background"),
    ],
)
def test_scheduler_passes_only_stable_ids(allow_retry: bool, task_name: str) -> None:
    background_tasks = _BackgroundTasks()

    service.schedule_export(background_tasks, OWNER_ID, EVOLUTION_ID, allow_retry=allow_retry)

    function, args, kwargs = background_tasks.calls[0]
    assert function is getattr(service, task_name)
    assert args == (str(OWNER_ID), str(EVOLUTION_ID))
    assert kwargs == {}


@pytest.mark.asyncio
@pytest.mark.parametrize("allow_retry", [False, True])
async def test_background_runner_reacquires_work_from_ids(
    monkeypatch: pytest.MonkeyPatch, allow_retry: bool
) -> None:
    calls: list[tuple[object, ...]] = []

    async def sync(owner: str, evolution: str, *, allow_retry: bool = False) -> None:
        calls.append((owner, evolution, allow_retry))

    monkeypatch.setattr(service, "sync_export", sync)
    runner = (
        service.run_export_recovery_background if allow_retry else service.run_export_background
    )

    await runner(str(OWNER_ID), str(EVOLUTION_ID))

    assert calls == [(str(OWNER_ID), str(EVOLUTION_ID), allow_retry)]


@pytest.mark.asyncio
async def test_approval_success_schedules_export_but_decline_does_not(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def resolve(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {"status": "approved", "result": {"id": EVOLUTION_ID}}

    monkeypatch.setattr(clinical_service, "resolve_action", resolve)
    background_tasks = _BackgroundTasks()
    request = ActionResolutionRequest(decision="approve", proposal_hash="a" * 64)

    result = await clinical_assistant.resolve_action(
        ACTION_ID, request, background_tasks, {"id": OWNER_ID}
    )

    assert result["status"] == "approved"
    assert len(background_tasks.calls) == 1

    async def decline(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {"status": "declined"}

    monkeypatch.setattr(clinical_service, "resolve_action", decline)
    declined_tasks = _BackgroundTasks()
    declined = await clinical_assistant.resolve_action(
        ACTION_ID, request, declined_tasks, {"id": OWNER_ID}
    )

    assert declined["status"] == "declined"
    assert declined_tasks.calls == []
