"""Failing-first contracts for guarded, non-persistent clinical drafting."""

import inspect
import json
import logging
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

import pytest


def test_generation_request_owns_only_patient_and_raw_note() -> None:
    from backend.routes.evolutions import GenerateEvolutionRequest

    assert set(GenerateEvolutionRequest.model_fields) == {"patient_id", "raw_note"}


@pytest.mark.parametrize(
    "raw_note", ["", "   ", "x" * 40_001], ids=["empty", "blank", "over-limit"]
)
def test_raw_note_rejects_blank_and_over_limit(raw_note: str) -> None:
    from pydantic import ValidationError

    from backend.routes.evolutions import GenerateEvolutionRequest

    with pytest.raises(ValidationError):
        GenerateEvolutionRequest(
            patient_id=UUID("00000000-0000-0000-0000-000000000001"), raw_note=raw_note
        )


@pytest.mark.parametrize("size", [1, 40_000])
def test_raw_note_accepts_inclusive_boundaries_without_truncation(size: int) -> None:
    from backend.routes.evolutions import GenerateEvolutionRequest

    note = "x" * size
    request = GenerateEvolutionRequest(
        patient_id=UUID("00000000-0000-0000-0000-000000000001"), raw_note=note
    )
    assert request.raw_note == note


def test_structured_draft_allows_optional_clinical_text_and_requires_flags_for_empty() -> None:
    from backend.services.clinical_evolutions import ClinicalDraft, EmptyClinicalDraftError

    flagged = ClinicalDraft.model_validate(
        {
            "context": "",
            "findings": "",
            "assessment": "",
            "treatment": "",
            "follow_up": "",
            "review_flags": [{"source_text": "ROM leve", "reason": "Expresion ambigua"}],
        }
    )
    assert flagged.review_flags[0].source_text == "ROM leve"
    with pytest.raises(EmptyClinicalDraftError):
        ClinicalDraft.validate_meaningful(
            ClinicalDraft.model_validate(
                {
                    "context": "",
                    "findings": "",
                    "assessment": "",
                    "treatment": "",
                    "follow_up": "",
                    "review_flags": [],
                }
            )
        )


def test_prompt_has_data_delimiters_and_clinical_prohibitions() -> None:
    from backend.services.clinical_evolutions import CLINICAL_SYSTEM_PROMPT

    for term in ("PREVIOUS_EVOLUTIONS", "CURRENT_RAW_NOTE", "no diagnosticar", "no inventar"):
        assert term.casefold() in CLINICAL_SYSTEM_PROMPT.casefold()


def test_generation_service_is_owner_scoped_and_does_not_accept_current_time_or_identity() -> None:
    from backend.services.clinical_evolutions import generate_draft

    params = set(inspect.signature(generate_draft).parameters)
    assert params == {"owner_user_id", "patient_id", "raw_note"}


def test_generation_constants_and_fail_closed_gate() -> None:
    from backend import config
    from backend.services import clinical_evolutions

    assert clinical_evolutions.MAX_RAW_NOTE_LENGTH == 40_000
    assert clinical_evolutions.CLINICAL_HISTORY_LIMIT == 3
    assert config.CLINICAL_EXTERNAL_LLM_ENABLED is False


def test_generation_uses_no_chat_quota_or_persistence() -> None:
    from backend.services import clinical_evolutions

    source = inspect.getsource(clinical_evolutions)
    for forbidden in ("rate_limit", "create_message", "create_evolution", "stream_chat"):
        assert forbidden not in source


def test_synthetic_clinical_fixture_covers_safety_cases() -> None:
    cases = json.loads(
        (Path(__file__).parent / "fixtures" / "clinical" / "evolution_cases.json").read_text(
            encoding="utf-8"
        )
    )
    assert {case["id"] for case in cases} == {
        "uncertainty-attribution",
        "inactive-history",
        "explicit-left-reference",
        "ambiguous-rom",
        "fully-ambiguous",
        "hostile-instruction",
        "absent-clinical-sections",
    }
    assert all(case["raw_note"].strip() and "expected" in case for case in cases)


async def test_provider_boundary_is_bounded_ordered_and_identity_free(monkeypatch) -> None:
    from backend.services import clinical_evolutions

    captured: dict = {}
    history = [
        {"evolution_at": datetime(2026, 4, day, tzinfo=UTC), "final_text": f"approved-{day}"}
        for day in (4, 3, 2)
    ]

    async def get_patient(owner_user_id, patient_id):
        return {
            "first_name": "IDENTITY_FIRST",
            "last_name": "IDENTITY_LAST",
            "rut_number": 12_345_678,
            "rut_dv": "5",
            "birth_date": "1980-01-01",
        }

    async def get_history(owner_user_id, patient_id, *, limit):
        captured["limit"] = limit
        return history

    async def complete(messages, schema):
        captured["messages"] = messages
        captured["schema"] = schema
        return json.dumps(
            {
                "context": "Paciente refiere ruido.",
                "findings": "",
                "assessment": "Sospecha conservada.",
                "treatment": "",
                "follow_up": "",
                "review_flags": [],
            }
        )

    monkeypatch.setattr(clinical_evolutions, "CLINICAL_EXTERNAL_LLM_ENABLED", True)
    monkeypatch.setattr(clinical_evolutions.patients_repo, "get_patient", get_patient)
    monkeypatch.setattr(
        clinical_evolutions.patients_repo, "get_recent_approved_evolutions", get_history
    )
    monkeypatch.setattr(clinical_evolutions, "create_structured_completion", complete)

    result = await clinical_evolutions.generate_draft("owner", "patient", "CURRENT_SYNTHETIC")

    payload = str(captured["messages"])
    assert captured["limit"] == 3
    assert payload.index("approved-2") < payload.index("approved-3") < payload.index("approved-4")
    assert "CURRENT_SYNTHETIC" in payload
    for forbidden in (
        "IDENTITY_FIRST",
        "IDENTITY_LAST",
        "12345678",
        "1980-01-01",
        "current_evolution_at",
    ):
        assert forbidden not in payload
    assert result.treatment == ""


async def test_disabled_gate_prevents_repository_and_provider_calls(monkeypatch) -> None:
    from backend.services import clinical_evolutions

    async def forbidden(*args, **kwargs):
        pytest.fail("disabled generation crossed external boundary")

    monkeypatch.setattr(clinical_evolutions, "CLINICAL_EXTERNAL_LLM_ENABLED", False)
    monkeypatch.setattr(clinical_evolutions.patients_repo, "get_patient", forbidden)
    monkeypatch.setattr(clinical_evolutions, "create_structured_completion", forbidden)

    with pytest.raises(clinical_evolutions.ClinicalGenerationDisabledError):
        await clinical_evolutions.generate_draft("owner", "patient", "synthetic")


async def test_provider_failure_logs_only_sanitized_category(monkeypatch, caplog) -> None:
    from backend.services import clinical_evolutions

    secret_note = "SYNTHETIC_SECRET_CLINICAL_NOTE"
    secret_history = "SYNTHETIC_SECRET_APPROVED_HISTORY"

    async def get_patient(owner_user_id, patient_id):
        return {"id": patient_id}

    async def get_history(owner_user_id, patient_id, *, limit):
        return [{"evolution_at": datetime.now(UTC), "final_text": secret_history}]

    async def fail(messages, schema):
        raise RuntimeError("provider rejected payload")

    monkeypatch.setattr(clinical_evolutions, "CLINICAL_EXTERNAL_LLM_ENABLED", True)
    monkeypatch.setattr(clinical_evolutions.patients_repo, "get_patient", get_patient)
    monkeypatch.setattr(
        clinical_evolutions.patients_repo, "get_recent_approved_evolutions", get_history
    )
    monkeypatch.setattr(clinical_evolutions, "create_structured_completion", fail)

    with caplog.at_level(logging.DEBUG), pytest.raises(clinical_evolutions.ClinicalGenerationError):
        await clinical_evolutions.generate_draft("owner", "patient", secret_note)

    logs = caplog.text
    assert "RuntimeError" in logs
    assert secret_note not in logs
    assert secret_history not in logs
