"""Manual OpenRouter evaluation using synthetic dental notes only."""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path

from backend.llm.openrouter import create_structured_completion
from backend.services.clinical_evolutions import ClinicalDraft, _provider_messages


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
        print(f"\nCASE: {case['id']}")
        print(f"SYNTHETIC INPUT: {case['raw_note']}")
        print(f"BOUNDED APPROVED HISTORY: {case['history'][-3:]}")
        print(f"STRUCTURED DRAFT: {draft.model_dump_json(indent=2)}")
        print(f"REVIEW FLAGS: {[flag.model_dump() for flag in draft.review_flags]}")


if __name__ == "__main__":
    asyncio.run(main())
