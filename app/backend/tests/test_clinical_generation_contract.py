"""Failing-first contracts for guarded, non-persistent clinical drafting."""

import inspect

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
        GenerateEvolutionRequest(patient_id="00000000-0000-0000-0000-000000000001", raw_note=raw_note)


@pytest.mark.parametrize("size", [1, 40_000])
def test_raw_note_accepts_inclusive_boundaries_without_truncation(size: int) -> None:
    from backend.routes.evolutions import GenerateEvolutionRequest

    note = "x" * size
    request = GenerateEvolutionRequest(
        patient_id="00000000-0000-0000-0000-000000000001", raw_note=note
    )
    assert request.raw_note == note


def test_structured_draft_allows_optional_clinical_text_and_requires_flags_for_empty() -> None:
    from backend.services.clinical_evolutions import ClinicalDraft, EmptyClinicalDraftError

    flagged = ClinicalDraft.model_validate(
        {
            "context": "", "findings": "", "assessment": "", "treatment": "", "follow_up": "",
            "review_flags": [{"source_text": "ROM leve", "reason": "Expresion ambigua"}],
        }
    )
    assert flagged.review_flags[0].source_text == "ROM leve"
    with pytest.raises(EmptyClinicalDraftError):
        ClinicalDraft.validate_meaningful(ClinicalDraft.model_validate({
            "context": "", "findings": "", "assessment": "", "treatment": "", "follow_up": "",
            "review_flags": [],
        }))


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
