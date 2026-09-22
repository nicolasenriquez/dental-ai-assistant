"""Keep a clinical turn alive when its SSE subscriber goes away."""

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import suppress
from uuid import UUID

from backend.clinical_assistant import service
from backend.clinical_assistant.events import event
from backend.clinical_assistant.schemas import ClinicalContextItem

logger = logging.getLogger(__name__)
_tasks: dict[tuple[UUID, UUID, UUID], asyncio.Task[None]] = {}


def start(
    owner: UUID, thread: UUID, turn: UUID, content: str, context_items: list[ClinicalContextItem]
) -> AsyncIterator[str]:
    key = (owner, thread, turn)
    if key in _tasks:

        async def already_running() -> AsyncIterator[str]:
            yield event(
                "turn.failed",
                {
                    "thread_id": str(thread),
                    "turn_id": str(turn),
                    "item_id": str(turn),
                    "error_code": "TURN_ALREADY_RUNNING",
                },
            )

        return already_running()

    # ponytail: one uvicorn worker; a persistent queue is needed to survive server restarts.
    chunks: asyncio.Queue[str | None] = asyncio.Queue(maxsize=256)
    subscribed = True

    async def run() -> None:
        try:
            async for chunk in service.stream_turn(owner, thread, turn, content, context_items):
                if subscribed:
                    with suppress(asyncio.QueueFull):
                        chunks.put_nowait(chunk)
                    # GET thread remains the source of truth if the subscriber falls behind.
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            codes = {
                service.TurnAlreadyRunningError: "TURN_ALREADY_RUNNING",
                service.TurnIdempotencyConflictError: "TURN_IDEMPOTENCY_CONFLICT",
                service.ClinicalRateLimitError: "CLINICAL_RATE_LIMIT_EXCEEDED",
                service.StaleClinicalTurnError: "CLINICAL_TURN_STALE",
                LookupError: "THREAD_NOT_FOUND",
            }
            code = next((value for kind, value in codes.items() if isinstance(exc, kind)), None)
            if code is None:
                logger.exception("clinical_turn_worker_failed turn_id=%s", turn)
                code = "CLINICAL_RUNTIME_FAILED"
            if subscribed:
                if chunks.full():
                    chunks.get_nowait()
                chunks.put_nowait(
                    event(
                        "turn.failed",
                        {
                            "thread_id": str(thread),
                            "turn_id": str(turn),
                            "item_id": str(turn),
                            "error_code": code,
                        },
                    )
                )
        finally:
            _tasks.pop(key, None)
            if subscribed:
                if chunks.full():
                    chunks.get_nowait()
                chunks.put_nowait(None)

    _tasks[key] = asyncio.create_task(run())

    async def stream() -> AsyncIterator[str]:
        nonlocal subscribed
        try:
            while (chunk := await chunks.get()) is not None:
                yield chunk
        finally:
            subscribed = False

    return stream()


async def cancel(owner: UUID, thread: UUID, turn: UUID) -> bool:
    task = _tasks.get((owner, thread, turn))
    if task is None:
        return False
    task.cancel()
    await asyncio.gather(task, return_exceptions=True)
    return True


async def shutdown() -> None:
    tasks = list(_tasks.values())
    for task in tasks:
        task.cancel()
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)
