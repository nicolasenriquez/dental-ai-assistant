"""Manual OpenRouter evaluation using synthetic dental notes only."""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path

from backend.llm.openrouter import create_structured_completion
from backend.services.clinical_evolutions import ClinicalDraft, _provider_messages

CLINICAL_FIELDS = ("context", "findings", "assessment", "treatment", "follow_up")


def assert_expected(case: dict, draft: ClinicalDraft) -> None:
    expected = case["expected"]
    fields = {name: getattr(draft, name) for name in CLINICAL_FIELDS}
    clinical_text = "\n".join(fields.values()).casefold()

    for text in expected.get("preserve", []):
        assert text.casefold() in clinical_text
    for text in expected.get("forbid", []):
        assert text.casefold() not in clinical_text
    for field in expected.get("empty", []):
        assert fields[field] == ""
    if expected.get("clinical_fields_empty"):
        assert not any(value.strip() for value in fields.values())
    if expected.get("requires_flags"):
        assert draft.review_flags
    if literal := expected.get("flag_literal"):
        assert any(flag.source_text == literal for flag in draft.review_flags)


async def main() -> None:
    fixture = Path(__file__).parents[1] / "tests" / "fixtures" / "clinical" / "evolution_cases.json"
    cases = json.loads(fixture.read_text(encoding="utf-8"))
    for case in cases:
        history = [
            {"evolution_at": datetime(2026, 1, index + 1, tzinfo=UTC), "final_text": text}
            for index, text in enumerate(case["history"][-3:])
        ]
        content = await create_structured_completion(
            _provider_messages(case["raw_note"], list(reversed(history))),
            ClinicalDraft.model_json_schema(),
        )
        draft = ClinicalDraft.validate_meaningful(ClinicalDraft.model_validate_json(content))
        assert_expected(case, draft)
        print(f"\nCASE: {case['id']}")
        print(f"SYNTHETIC INPUT: {case['raw_note']}")
        print(f"BOUNDED APPROVED HISTORY: {case['history'][-3:]}")
        print(f"STRUCTURED DRAFT: {draft.model_dump_json(indent=2)}")
        print(f"REVIEW FLAGS: {[flag.model_dump() for flag in draft.review_flags]}")


if __name__ == "__main__":
    asyncio.run(main())
