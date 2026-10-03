"""Keep CI setup reproducible and validation failures blocking."""

import re
from pathlib import Path

import yaml  # type: ignore[import-untyped]  # Existing dependency has no bundled stubs.


def test_ci_setup_is_immutable_and_validation_cannot_ignore_failures() -> None:
    root = Path(__file__).resolve().parents[3]
    workflow = yaml.safe_load((root / ".github/workflows/ci.yml").read_text())
    job = workflow["jobs"]["validate"]
    assert not job.get("continue-on-error")
    steps = job["steps"]
    uv_action = next(step["uses"] for step in steps if step.get("name") == "Set up uv")
    assert re.fullmatch(r"astral-sh/setup-uv@[0-9a-f]{40}", uv_action)
    commands = {step["run"] for step in steps if "run" in step}
    assert {
        "uv sync --frozen --all-extras",
        "uv run ruff format --check .",
        "uv run ruff check .",
        "uv run mypy .",
        "uv run pytest tests -q",
        "bun install --frozen-lockfile",
        "bun run type-check",
        "bun run lint",
        "bun run test",
        "bun run build",
    } <= commands
    for step in steps:
        assert not step.get("continue-on-error")
        if "run" in step:
            assert "if" not in step
