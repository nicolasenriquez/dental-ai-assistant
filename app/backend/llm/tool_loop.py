"""Bounded, provider-compatible tool loop shared by assistant surfaces."""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import AsyncGenerator, AsyncIterator, Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Literal, TypeVar, cast

from openai.types.chat import ChatCompletionMessageParam

logger = logging.getLogger(__name__)
T = TypeVar("T")

ToolDefinition = dict[str, Any]
ToolExecutor = Callable[[str, str], Awaitable[str]]
ToolSubject = Callable[[str, str], str]


class RunCancelled(Exception):
    """The owning request explicitly cancelled this model run."""


async def wait_or_cancel(awaitable: Awaitable[T], cancel_event: asyncio.Event | None) -> T:
    if cancel_event is None:
        return await awaitable
    work = asyncio.ensure_future(awaitable)
    cancelled = asyncio.create_task(cancel_event.wait())
    done, _ = await asyncio.wait({work, cancelled}, return_when=asyncio.FIRST_COMPLETED)
    if cancelled in done:
        work.cancel()
        await asyncio.gather(work, return_exceptions=True)
        raise RunCancelled
    cancelled.cancel()
    return await work


@dataclass(frozen=True)
class ToolLoopEvent:
    kind: Literal["text", "heartbeat", "tool_start", "tool_done", "final"]
    text: str = ""
    tool_name: str = ""
    subject: str = ""
    finish_reason: str | None = None
    round_num: int = 0
    tool_calls_made: int = 0


async def stream_tool_loop(
    *,
    client: Any,
    model: str,
    system_content: str | list[dict[str, Any]],
    messages: list[dict[str, Any]],
    tools: list[ToolDefinition] | None = None,
    tool_executor: ToolExecutor | None = None,
    max_tool_calls: int = 0,
    max_tokens: int = 8192,
    cancel_event: asyncio.Event | None = None,
    heartbeat_interval_seconds: float = 5.0,
    tool_subject: ToolSubject | None = None,
    cap_message: str | None = None,
) -> AsyncGenerator[ToolLoopEvent, None]:
    """Run one bounded completion loop without imposing a transport format."""
    tools_active = bool(tools) and tool_executor is not None and max_tool_calls > 0
    full_messages: list[ChatCompletionMessageParam] = [
        {"role": "system", "content": system_content},  # type: ignore[misc,list-item]
        *cast(list[ChatCompletionMessageParam], messages),
    ]
    base_kwargs: dict[str, Any] = {
        "model": model,
        "stream": True,
        "max_tokens": max_tokens,
    }
    if tools_active:
        base_kwargs["tools"] = tools

    tool_calls_made = 0
    round_num = 0
    last_heartbeat_at = time.monotonic()
    cap_message_appended = False
    cap_message = cap_message or (
        "You have reached your tool-call budget for this turn and may not call any more "
        "tools. Answer the original request now using only the tool results above."
    )

    while True:
        round_num += 1
        kwargs = dict(base_kwargs)
        if tools_active and tool_calls_made >= max_tool_calls:
            kwargs["tool_choice"] = "none"
            if not cap_message_appended:
                full_messages.append(
                    cast(ChatCompletionMessageParam, {"role": "user", "content": cap_message})
                )
                cap_message_appended = True

        stream = await client.chat.completions.create(messages=full_messages, **kwargs)
        assistant_text_parts: list[str] = []
        pending: dict[int, dict[str, Any]] = {}
        finish_reason: str | None = None

        iterator: AsyncIterator[Any] = stream.__aiter__()
        while True:
            try:
                chunk = await wait_or_cancel(anext(iterator), cancel_event)
            except StopAsyncIteration:
                break
            if not chunk.choices:
                continue
            choice = chunk.choices[0]
            delta = choice.delta
            if choice.finish_reason:
                finish_reason = choice.finish_reason
            if delta and delta.content:
                assistant_text_parts.append(delta.content)
                last_heartbeat_at = time.monotonic()
            if delta and delta.tool_calls:
                for tool_call in delta.tool_calls:
                    slot = pending.setdefault(
                        tool_call.index,
                        {
                            "id": "",
                            "type": "function",
                            "function": {"name": "", "arguments": ""},
                        },
                    )
                    if tool_call.id:
                        slot["id"] = tool_call.id
                    if tool_call.type:
                        slot["type"] = tool_call.type
                    if tool_call.function:
                        if tool_call.function.name:
                            slot["function"]["name"] = tool_call.function.name
                        if tool_call.function.arguments:
                            slot["function"]["arguments"] += tool_call.function.arguments
                if time.monotonic() - last_heartbeat_at >= heartbeat_interval_seconds:
                    yield ToolLoopEvent(kind="heartbeat")
                    last_heartbeat_at = time.monotonic()

        logger.info(
            "tool_loop round=%d finish_reason=%s tool_calls_pending=%d tool_calls_made=%d",
            round_num,
            finish_reason,
            len(pending),
            tool_calls_made,
        )

        if finish_reason == "tool_calls" and pending and tool_executor:
            assistant_text = "".join(assistant_text_parts)
            ordered = [pending[index] for index in sorted(pending)]
            full_messages.append(
                cast(
                    ChatCompletionMessageParam,
                    {"role": "assistant", "content": assistant_text or None, "tool_calls": ordered},
                )
            )
            for tool_call in ordered:
                yield ToolLoopEvent(kind="heartbeat")
                last_heartbeat_at = time.monotonic()
                tool_name = tool_call["function"]["name"]
                raw_arguments = tool_call["function"]["arguments"]
                if tool_calls_made < max_tool_calls:
                    subject = tool_subject(tool_name, raw_arguments) if tool_subject else ""
                    yield ToolLoopEvent(kind="tool_start", tool_name=tool_name, subject=subject)
                    try:
                        payload = await wait_or_cancel(
                            tool_executor(tool_name, raw_arguments), cancel_event
                        )
                    except RunCancelled:
                        raise
                    except Exception as exc:
                        logger.warning("tool executor raised: %s", exc, exc_info=True)
                        payload = f"Error: tool execution failed: {exc}"
                    yield ToolLoopEvent(kind="tool_done", tool_name=tool_name)
                else:
                    payload = (
                        f"Error: per-turn tool call cap ({max_tool_calls}) reached. "
                        "No more tool calls will be executed for this user turn."
                    )
                tool_calls_made += 1
                full_messages.append(
                    cast(
                        ChatCompletionMessageParam,
                        {"role": "tool", "tool_call_id": tool_call["id"], "content": payload},
                    )
                )
            continue

        final_text = "".join(assistant_text_parts)
        if final_text:
            yield ToolLoopEvent(kind="text", text=final_text)
        yield ToolLoopEvent(
            kind="final",
            text=final_text,
            finish_reason=finish_reason,
            round_num=round_num,
            tool_calls_made=tool_calls_made,
        )
        return
