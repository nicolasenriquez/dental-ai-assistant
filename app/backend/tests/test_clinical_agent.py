import json
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from backend.clinical_assistant import agent
from backend.clinical_assistant.agent import ClinicalToolResult
from backend.clinical_assistant.policy import ClinicalTurnContext


async def _outputs(monkeypatch: pytest.MonkeyPatch, effect: dict | None) -> list[str]:
    async def fake_loop(**kwargs):
        if effect is not None:
            await kwargs["tool_executor"]("create_evolution_draft", "{}")
            yield SimpleNamespace(kind="tool_start", tool_name="create_evolution_draft")
            yield SimpleNamespace(kind="tool_done", tool_name="create_evolution_draft")
        yield SimpleNamespace(kind="final", text="Operación completada.")

    async def handler(_arguments: dict) -> ClinicalToolResult:
        return ClinicalToolResult(payload={"ok": True}, effect=effect)

    monkeypatch.setattr(agent, "stream_tool_loop", fake_loop)
    monkeypatch.setattr(agent, "_get_async_client", lambda: object())
    context = ClinicalTurnContext(
        user_id=uuid4(),
        thread_id=uuid4(),
        turn_id=uuid4(),
        patient_id=uuid4(),
        active_artifact_id=None,
    )
    return [
        output.kind
        async for output in agent.run_clinical_agent(
            context=context,
            messages=[{"role": "user", "content": "Ayuda"}],
            handlers={"create_evolution_draft": handler},
        )
    ]


async def test_informational_turn_emits_assistant_message(monkeypatch: pytest.MonkeyPatch) -> None:
    assert await _outputs(monkeypatch, None) == ["assistant"]


@pytest.mark.parametrize("effect_kind", ["draft", "approval"])
async def test_terminal_effect_suppresses_trailing_assistant_message(
    monkeypatch: pytest.MonkeyPatch, effect_kind: str
) -> None:
    kinds = await _outputs(monkeypatch, {"kind": effect_kind, "item_id": str(uuid4())})

    assert kinds == ["activity_started", "effect", "activity_completed"]


def test_clinical_tool_catalog_has_bounded_terminology_and_no_redundant_patient_check() -> None:
    tools = {
        tool["function"]["name"]: tool["function"]["parameters"] for tool in agent.CLINICAL_TOOLS
    }
    assert "get_patient_context" not in tools
    schema = tools["lookup_dental_terms"]
    assert schema["required"] == ["terms"]
    assert schema["properties"]["terms"]["minItems"] == 1
    assert schema["properties"]["terms"]["maxItems"] == 8
    assert schema["additionalProperties"] is False
    assert agent.MAX_CLINICAL_TOOL_CALLS == 4
    assert agent.TOOL_PRESENTATION_POLICY["lookup_dental_terms"][0] == "silent"
    assert not hasattr(agent, "QUIET_TOOLS")


async def test_terminology_is_quiet_and_unresolved_meaning_can_be_clarified(monkeypatch) -> None:
    seen: list[dict] = []

    async def fake_loop(**kwargs):
        result = await kwargs["tool_executor"]("lookup_dental_terms", '{"terms":["IZC"]}')
        seen.append(json.loads(result))
        yield SimpleNamespace(kind="tool_start", tool_name="lookup_dental_terms")
        yield SimpleNamespace(kind="tool_done", tool_name="lookup_dental_terms")
        yield SimpleNamespace(kind="final", text="¿Qué significa IZC en esta nota?")

    async def lookup(arguments: dict) -> ClinicalToolResult:
        assert arguments == {"terms": ["IZC"]}
        return ClinicalToolResult(payload={"ok": True, "results": [{"status": "not_found"}]})

    monkeypatch.setattr(agent, "stream_tool_loop", fake_loop)
    monkeypatch.setattr(agent, "_get_async_client", lambda: object())
    context = ClinicalTurnContext(uuid4(), uuid4(), uuid4(), None)
    outputs = [
        output
        async for output in agent.run_clinical_agent(
            context=context,
            messages=[{"role": "user", "content": "¿Qué es IZC?"}],
            handlers={"lookup_dental_terms": lookup},
        )
    ]
    assert seen == [{"ok": True, "results": [{"status": "not_found"}]}]
    assert [(output.kind, output.content) for output in outputs] == [
        ("assistant", "¿Qué significa IZC en esta nota?")
    ]


@pytest.mark.parametrize("status", ["ambiguous", "not_found", "unavailable"])
async def test_unresolved_terminology_keeps_clarification_possible(monkeypatch, status) -> None:
    async def fake_loop(**kwargs):
        result = await kwargs["tool_executor"]("lookup_dental_terms", '{"terms":["IZC"]}')
        assert json.loads(result)["ok"] is (status != "unavailable")
        yield SimpleNamespace(kind="tool_start", tool_name="lookup_dental_terms")
        yield SimpleNamespace(kind="tool_done", tool_name="lookup_dental_terms")
        yield SimpleNamespace(kind="final", text="¿Qué significa IZC en esta nota?")

    async def lookup(_arguments: dict) -> ClinicalToolResult:
        return ClinicalToolResult(payload={"ok": status != "unavailable", "status": status})

    monkeypatch.setattr(agent, "stream_tool_loop", fake_loop)
    monkeypatch.setattr(agent, "_get_async_client", lambda: object())
    outputs = [
        output
        async for output in agent.run_clinical_agent(
            context=ClinicalTurnContext(uuid4(), uuid4(), uuid4(), None),
            messages=[{"role": "user", "content": "IZC"}],
            handlers={"lookup_dental_terms": lookup},
        )
    ]
    assert [output.kind for output in outputs] == ["assistant"]


async def test_ninth_terminology_term_is_rejected_before_handler(monkeypatch) -> None:
    observed: list[dict] = []

    async def fake_loop(**kwargs):
        result = await kwargs["tool_executor"](
            "lookup_dental_terms", json.dumps({"terms": ["TAD"] * 9})
        )
        observed.append(json.loads(result))
        yield SimpleNamespace(kind="final", text="Aclare la solicitud.")

    async def lookup(_arguments: dict) -> ClinicalToolResult:
        pytest.fail("invalid batch reached the handler")

    monkeypatch.setattr(agent, "stream_tool_loop", fake_loop)
    monkeypatch.setattr(agent, "_get_async_client", lambda: object())
    context = ClinicalTurnContext(uuid4(), uuid4(), uuid4(), None)
    _ = [
        output
        async for output in agent.run_clinical_agent(
            context=context,
            messages=[{"role": "user", "content": "Términos"}],
            handlers={"lookup_dental_terms": lookup},
        )
    ]
    assert observed == [{"ok": False, "error": "INVALID_TOOL_ARGUMENTS"}]


async def test_terminology_telemetry_has_only_allowlisted_fields(monkeypatch, caplog) -> None:
    secret = "RUT 12.345.678-5 and private history"

    async def fake_loop(**kwargs):
        await kwargs["tool_executor"]("lookup_dental_terms", json.dumps({"terms": [secret]}))
        yield SimpleNamespace(kind="final", text="Aclare el término.")

    async def lookup(_arguments: dict) -> ClinicalToolResult:
        return ClinicalToolResult(
            payload={"ok": True, "results": [{"status": "not_found", "raw_term": secret}]}
        )

    monkeypatch.setattr(agent, "stream_tool_loop", fake_loop)
    monkeypatch.setattr(agent, "_get_async_client", lambda: object())
    with caplog.at_level("INFO"):
        _ = [
            output
            async for output in agent.run_clinical_agent(
                context=ClinicalTurnContext(uuid4(), uuid4(), uuid4(), None),
                messages=[{"role": "user", "content": secret}],
                handlers={"lookup_dental_terms": lookup},
            )
        ]
    record = next(record for record in caplog.records if record.msg == "clinical_tool.completed")
    assert record.capability == "lookup_dental_terms"
    assert record.presentation_class == "silent"
    assert record.terminology_not_found_count == 1
    assert secret not in caplog.text


def test_history_tool_description_requires_explicit_longitudinal_dependency() -> None:
    description = next(
        tool["function"]["description"]
        for tool in agent.CLINICAL_TOOLS
        if tool["function"]["name"] == "get_recent_evolutions"
    )
    assert "solo" in description.lower()
    assert "explícita" in description.lower()


async def test_compound_clinical_tool_budget_recovers_with_answer(monkeypatch) -> None:
    async def stream_for_call(name: str, call_id: str):
        yield SimpleNamespace(
            choices=[
                SimpleNamespace(
                    delta=SimpleNamespace(
                        content=None,
                        tool_calls=[
                            SimpleNamespace(
                                index=0,
                                id=call_id,
                                type="function",
                                function=SimpleNamespace(
                                    name=name,
                                    arguments='{"terms":["TAD"]}'
                                    if name == "lookup_dental_terms"
                                    else "{}",
                                ),
                            )
                        ],
                    ),
                    finish_reason="tool_calls",
                )
            ]
        )

    async def final_stream():
        yield SimpleNamespace(
            choices=[
                SimpleNamespace(
                    delta=SimpleNamespace(content="Necesito aclarar la nota.", tool_calls=None),
                    finish_reason="stop",
                )
            ]
        )

    capabilities = [
        "lookup_dental_terms",
        "get_recent_evolutions",
        "create_evolution_draft",
        "update_evolution_draft",
    ]
    streams = [stream_for_call(name, f"call-{index}") for index, name in enumerate(capabilities)]
    streams.append(stream_for_call("lookup_dental_terms", "blocked-fifth"))
    streams.append(final_stream())
    create = AsyncMock(side_effect=streams)
    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    monkeypatch.setattr(agent, "_get_async_client", lambda: client)
    called: list[str] = []

    async def handler(_arguments: dict) -> ClinicalToolResult:
        called.append("handled")
        return ClinicalToolResult(payload={"ok": True})

    outputs = [
        output
        async for output in agent.run_clinical_agent(
            context=ClinicalTurnContext(uuid4(), uuid4(), uuid4(), uuid4()),
            messages=[{"role": "user", "content": "Aclara y prepara la nota."}],
            handlers={name: handler for name in capabilities},
        )
    ]

    assert len(called) == 4
    assert create.call_count == 6
    assert create.call_args_list[4].kwargs["tool_choice"] == "none"
    assert create.call_args_list[4].kwargs["tools"] == agent.CLINICAL_TOOLS
    final_messages = create.call_args_list[5].kwargs["messages"]
    assert any(
        message.get("role") == "tool" and "per-turn tool call cap (4) reached" in message["content"]
        for message in final_messages
    )
    assert outputs[-1].kind == "assistant"
    assert outputs[-1].content == "Necesito aclarar la nota."
