"""Fail-first contracts for assistant-selected, owner-scoped clinical evidence."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from unittest.mock import AsyncMock
from uuid import uuid4

import asyncpg
import pytest

from backend.clinical_assistant import service
from backend.clinical_assistant.policy import ClinicalTurnContext
from backend.clinical_assistant.terminology import TermResolution, load_bundled_catalog
from backend.services import clinical_evolutions


def _context() -> ClinicalTurnContext:
    return ClinicalTurnContext(uuid4(), uuid4(), uuid4(), uuid4())


def test_exact_allowlist_pre_resolution_uses_token_boundaries_and_unique_matches() -> None:
    entries = load_bundled_catalog().entries
    grounding = service._pre_resolve_terms(
        "TAD en IZC; TMJ, CBCT/BOP. xTAD TADx, TMD y dental crown.", entries
    )
    assert {item.concept_id for item in grounding.terminology_evidence.values()} == {
        "ortho.tad",
        next(entry["id"] for entry in entries if "TMJ" in entry["aliases"]),
        next(entry["id"] for entry in entries if "CBCT" in entry["aliases"]),
        next(entry["id"] for entry in entries if "BOP" in entry["aliases"]),
    }
    assert not grounding.patient_evidence


@pytest.mark.parametrize("failure", [OSError, asyncpg.InterfaceError])
async def test_pre_resolution_catalog_failure_uses_empty_evidence(
    monkeypatch, caplog, failure
) -> None:
    get_active = AsyncMock(side_effect=failure("private detail"))
    monkeypatch.setattr(service.terminology_repo, "get_active_terms", get_active)
    grounding = await service._new_turn_grounding("TAD en IZC")
    assert grounding.for_generation().terminology_evidence == []
    get_active.assert_awaited_once_with()
    assert "private detail" not in caplog.text


async def test_lowercase_allowlist_pre_resolves_only_whole_tokens(monkeypatch) -> None:
    entries = load_bundled_catalog().entries
    get_active = AsyncMock(return_value=entries)
    monkeypatch.setattr(service.terminology_repo, "get_active_terms", get_active)
    grounding = await service._new_turn_grounding("tad y tMj; xtad, tadx")
    assert set(grounding.terminology_evidence) == {
        "ortho.tad",
        next(entry["id"] for entry in entries if "TMJ" in entry["aliases"]),
    }
    get_active.assert_awaited_once_with()
    get_active.reset_mock()
    assert not (await service._new_turn_grounding("xtad tadx")).terminology_evidence
    get_active.assert_not_awaited()


async def test_assistant_draft_with_explicit_empty_grounding_does_not_query_history(
    monkeypatch,
) -> None:
    captured: dict = {}
    history = AsyncMock(side_effect=AssertionError("history must be selected by the assistant"))

    async def complete(messages, _schema):
        captured.update(json.loads(messages[1]["content"]))
        return json.dumps(
            {
                "context": "Control",
                "findings": "",
                "assessment": "",
                "treatment": "",
                "follow_up": "",
                "review_flags": [],
            }
        )

    monkeypatch.setattr(clinical_evolutions, "CLINICAL_EXTERNAL_LLM_ENABLED", True)
    monkeypatch.setattr(
        clinical_evolutions.patients_repo, "get_patient", AsyncMock(return_value={"id": uuid4()})
    )
    monkeypatch.setattr(
        clinical_evolutions.patients_repo, "get_recent_approved_evolutions", history
    )
    monkeypatch.setattr(clinical_evolutions, "create_structured_completion", complete)
    await clinical_evolutions.generate_draft(
        uuid4(), uuid4(), "TAD en IZC", grounding=clinical_evolutions.DraftGrounding([], [])
    )
    history.assert_not_awaited()
    assert captured == {
        "CURRENT_INPUT": "TAD en IZC",
        "PATIENT_EVIDENCE": [],
        "TERMINOLOGY_EVIDENCE": [],
    }


async def test_history_handler_is_owner_patient_scoped_and_deduplicates_evidence(
    monkeypatch,
) -> None:
    context = _context()
    date = datetime(2026, 9, 20, tzinfo=UTC)
    one, two = uuid4(), uuid4()
    rows = [
        {"id": one, "evolution_at": date, "final_text": "primera"},
        {"id": one, "evolution_at": date, "final_text": "primera"},
        {"id": two, "evolution_at": date, "final_text": "segunda"},
    ]
    get_patient = AsyncMock(return_value={"id": context.patient_id})
    get_history = AsyncMock(return_value=rows)
    monkeypatch.setattr(service.patients_repo, "get_patient", get_patient)
    monkeypatch.setattr(service.patients_repo, "get_recent_approved_evolutions", get_history)
    grounding = service.TurnGrounding()
    handlers = service._clinical_tool_handlers(context, "nota", "nota", grounding=grounding)
    await handlers["get_recent_evolutions"]({})
    await handlers["get_recent_evolutions"]({})
    get_patient.assert_awaited_with(context.user_id, context.patient_id)
    get_history.assert_awaited_with(context.user_id, context.patient_id, limit=3)
    assert len(grounding.patient_evidence) == 2
    assert set(grounding.patient_evidence) == {str(one), str(two)}


async def test_other_owner_or_patient_cannot_supply_history(monkeypatch) -> None:
    context = _context()
    get_patient = AsyncMock(return_value=None)
    get_history = AsyncMock()
    monkeypatch.setattr(service.patients_repo, "get_patient", get_patient)
    monkeypatch.setattr(service.patients_repo, "get_recent_approved_evolutions", get_history)
    grounding = service.TurnGrounding()
    handlers = service._clinical_tool_handlers(context, "nota", "nota", grounding=grounding)
    result = await handlers["get_recent_evolutions"]({})
    assert result.payload == {"ok": False, "error": "PATIENT_NOT_FOUND"}
    get_history.assert_not_awaited()
    assert not grounding.patient_evidence


@pytest.mark.parametrize("failure", [OSError, asyncpg.InterfaceError])
async def test_terminology_lookup_failure_is_safe_and_clarifiable(monkeypatch, failure) -> None:
    monkeypatch.setattr(
        service.terminology_repo,
        "get_active_terms",
        AsyncMock(side_effect=failure("sensitive provider detail")),
    )
    handlers = service._clinical_tool_handlers(_context(), "nota", "nota")
    result = await handlers["lookup_dental_terms"]({"terms": ["IZC"]})
    assert result.payload == {"ok": False, "error": "TERMINOLOGY_UNAVAILABLE"}


async def test_tad_en_izc_keeps_unknown_literal_and_only_tad_as_evidence(monkeypatch) -> None:
    entries = load_bundled_catalog().entries
    grounding = service._pre_resolve_terms("TAD en IZC", entries)
    monkeypatch.setattr(
        service.terminology_repo, "get_active_terms", AsyncMock(return_value=entries)
    )
    handlers = service._clinical_tool_handlers(
        _context(), "TAD en IZC", "TAD en IZC", grounding=grounding
    )
    result = await handlers["lookup_dental_terms"]({"terms": ["TAD", "IZC"]})
    assert [item["status"] for item in result.payload["results"]] == ["matched", "not_found"]
    assert list(grounding.terminology_evidence) == ["ortho.tad"]
    messages = clinical_evolutions._provider_messages(
        "TAD en IZC", [], grounding=grounding.for_generation()
    )
    payload = json.loads(messages[1]["content"])
    assert payload["CURRENT_INPUT"] == "TAD en IZC"
    assert [item["concept_id"] for item in payload["TERMINOLOGY_EVIDENCE"]] == ["ortho.tad"]
    assert "IZC" not in json.dumps(payload["TERMINOLOGY_EVIDENCE"])


def test_turn_grounding_caps_patient_history_and_matches_only_terms() -> None:
    grounding = service.TurnGrounding()
    now = datetime.now(UTC)
    rows = [
        {"id": uuid4(), "evolution_at": now, "final_text": f"history-{index}"} for index in range(5)
    ]
    grounding.add_patient_evidence(rows)
    grounding.add_patient_evidence(rows)
    assert len(grounding.patient_evidence) == 3
    assert len(grounding.for_generation().patient_evidence) == 3


def test_generation_prompt_keeps_terminology_non_patient_evidence() -> None:
    prompt = clinical_evolutions.CLINICAL_SYSTEM_PROMPT
    assert "TERMINOLOGY_EVIDENCE" in prompt
    assert "nunca establece hechos" in prompt
    assert "PATIENT_EVIDENCE" in prompt


@pytest.mark.parametrize("status", ["ambiguous", "not_found"])
def test_non_authoritative_terminology_never_enters_grounding(status: str) -> None:
    grounding = service.TurnGrounding()
    grounding.add_terminology_result(TermResolution("unknown", "unknown", status))
    assert not grounding.terminology_evidence
