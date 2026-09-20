from __future__ import annotations

from types import SimpleNamespace

import pytest

from backend.llm.tool_loop import stream_tool_loop


class _AsyncStream:
    def __init__(self, chunks: list[object]) -> None:
        self._chunks = iter(chunks)

    def __aiter__(self) -> _AsyncStream:
        return self

    async def __anext__(self) -> object:
        try:
            return next(self._chunks)
        except StopIteration as exc:
            raise StopAsyncIteration from exc


class _Client:
    def __init__(self, streams: list[_AsyncStream]) -> None:
        self._streams = iter(streams)
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

    async def create(self, **_kwargs: object) -> _AsyncStream:
        return next(self._streams)


def _chunk(*, content: str | None = None, finish_reason: str | None = None, tool_calls=None):
    delta = SimpleNamespace(content=content, tool_calls=tool_calls)
    return SimpleNamespace(choices=[SimpleNamespace(delta=delta, finish_reason=finish_reason)])


@pytest.mark.asyncio
async def test_tool_round_text_is_not_streamed_before_final_round() -> None:
    tool_call = SimpleNamespace(
        index=0,
        id="call-1",
        type="function",
        function=SimpleNamespace(name="search_videos", arguments='{"query":"rag"}'),
    )
    client = _Client(
        [
            _AsyncStream(
                [
                    _chunk(content="Buscando...", tool_calls=[tool_call]),
                    _chunk(finish_reason="tool_calls"),
                ]
            ),
            _AsyncStream([_chunk(content="Respuesta final"), _chunk(finish_reason="stop")]),
        ]
    )

    async def execute_tool(_name: str, _arguments: str) -> str:
        return "resultado"

    events = [
        event
        async for event in stream_tool_loop(
            client=client,
            model="test-model",
            system_content="system",
            messages=[],
            tools=[{"type": "function"}],
            tool_executor=execute_tool,
            max_tool_calls=1,
            buffer_text=True,
        )
    ]

    assert [event.text for event in events if event.kind == "text"] == ["Respuesta final"]
    assert events[-1].kind == "final"


@pytest.mark.asyncio
async def test_text_delta_is_emitted_before_provider_stream_finishes() -> None:
    client = _Client(
        [
            _AsyncStream(
                [
                    _chunk(content="Respuesta "),
                    _chunk(content="final"),
                    _chunk(finish_reason="stop"),
                ]
            )
        ]
    )
    events = stream_tool_loop(
        client=client,
        model="test-model",
        system_content="system",
        messages=[],
    )

    first = await anext(events)

    assert first.kind == "text"
    assert first.text == "Respuesta "
    remaining = [event async for event in events]
    assert [event.text for event in remaining if event.kind == "text"] == ["final"]
    assert remaining[-1].text == "Respuesta final"
