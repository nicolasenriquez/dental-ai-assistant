from types import SimpleNamespace
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
