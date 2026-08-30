"""The AI Tutor's own gate, run as a deterministic check.

This repository writes its validation suite down in CLAUDE.md, so nothing here
needs judgment: run those commands, report what happened, and let the exit code
own the decision. Green means every applicable check passed.

The frontend half is skipped only when the change never touched it — installing
a frontend toolchain to type-check an untouched frontend is spend with no
information in it.
"""

import os
import subprocess
import sys
from pathlib import Path

REPO = Path.cwd()
BACKEND = REPO / "app" / "backend"
FRONTEND = REPO / "app" / "frontend"
ARTIFACTS = Path(os.environ.get("ARTIFACTS_DIR", REPO / ".archon-artifacts"))

BACKEND_CHECKS = [
    ("ruff check", ["uv", "run", "ruff", "check", "."]),
    ("ruff format --check", ["uv", "run", "ruff", "format", "--check", "."]),
    ("mypy", ["uv", "run", "mypy", "."]),
    ("pytest", ["uv", "run", "pytest", "tests", "-q"]),
]

FRONTEND_CHECKS = [
    ("tsc --noEmit", ["bun", "run", "tsc", "--noEmit"]),
    ("biome check", ["bun", "x", "biome", "check", "src"]),
    ("vitest", ["bun", "run", "test"]),
]


def run(label: str, cmd: list[str], cwd: Path, timeout: int = 900) -> tuple[str, bool, str]:
    """Run one check. Returns (label, passed, output tail)."""
    try:
        proc = subprocess.run(
            cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout, shell=False
        )
    except FileNotFoundError as exc:
        return label, False, f"command not found: {exc}"
    except subprocess.TimeoutExpired:
        return label, False, f"timed out after {timeout}s"
    output = (proc.stdout or "") + (proc.stderr or "")
    tail = "\n".join(output.strip().splitlines()[-25:])
    return label, proc.returncode == 0, tail


def frontend_touched() -> bool:
    """Did this run change anything under app/frontend?"""
    base = os.environ.get("BASE_BRANCH", "main")
    for ref in (f"origin/{base}", base):
        diff = subprocess.run(
            ["git", "diff", "--name-only", f"{ref}...HEAD"],
            cwd=REPO,
            capture_output=True,
            text=True,
        )
        if diff.returncode == 0:
            return any(
                line.startswith("app/frontend/") for line in diff.stdout.splitlines()
            )
    # No usable base to diff against: check it rather than assume it is clean.
    return True


def main() -> int:
    results: list[tuple[str, bool, str]] = []

    if not BACKEND.is_dir():
        print(f"validate: {BACKEND} does not exist — wrong checkout?", file=sys.stderr)
        return 1

    for label, cmd in BACKEND_CHECKS:
        results.append(run(f"backend: {label}", cmd, BACKEND))

    if frontend_touched():
        installed = True
        if not (FRONTEND / "node_modules").is_dir():
            install = run(
                "frontend: bun install", ["bun", "install", "--frozen-lockfile"], FRONTEND
            )
            results.append(install)
            installed = install[1]
        if installed:
            for label, cmd in FRONTEND_CHECKS:
                results.append(run(f"frontend: {label}", cmd, FRONTEND))
    else:
        results.append(("frontend: skipped (no frontend files changed)", True, ""))

    green = all(passed for _, passed, _ in results)

    lines = ["# Validation", ""]
    lines.append("green: **true**" if green else "green: **false**")
    lines.append("")
    for label, passed, tail in results:
        lines.append(f"- {'PASS' if passed else 'FAIL'} — {label}")
        if not passed and tail:
            lines.append("")
            lines.append("```")
            lines.append(tail)
            lines.append("```")
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    (ARTIFACTS / "validation.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    for label, passed, tail in results:
        print(f"{'PASS' if passed else 'FAIL'}  {label}")
        if not passed and tail:
            print(tail, file=sys.stderr)

    if not green:
        failed = [label for label, passed, _ in results if not passed]
        print(
            "validation failed: " + ", ".join(failed) + " — see validation.md",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
