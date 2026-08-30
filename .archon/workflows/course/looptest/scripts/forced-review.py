"""Deterministic stand-in for the loop-test reviewer.

Fallback for `commands/review.md`, used only if the model reviewer declines to
withhold on round one. Same contract, no model involved, so the correction loop
is guaranteed to run:

- Round one (no `review/report.md`): write the report naming L1 and return
  `ready: "false"`.
- Round two: actually check the working tree for what L1 asked — a
  `# regression: issue #<N>` comment directly above a test `def`, and a test
  covering two or more inputs — and return the verdict that check produces.

Round two is a real check against real files. Only round one's refusal is
forced, which is the whole point of the harness.

Booleans are printed as the strings "true"/"false" because the graph's `when:`
and `until_bash` compare against those, exactly as the bundled pack's gates do.
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path

ARTIFACTS = Path(os.environ.get("ARTIFACTS_DIR", ".archon-artifacts"))
REPORT = ARTIFACTS / "review" / "report.md"
MARKER = "<!-- course-fix-looptest-review -->"

L1 = (
    "**L1 — Important (loop-test finding).** The regression test for this fix must be greppable by "
    "issue and must exercise more than one input:\n\n"
    "1. the test function carries a comment line `# regression: issue #<N>` on the line immediately "
    "above its `def`, and\n"
    "2. the test covers at least two distinct inputs (a `@pytest.mark.parametrize` with two or more "
    "cases, or two assertions over different inputs).\n"
)


def sh(*args: str) -> str:
    proc = subprocess.run(args, capture_output=True, text=True)
    return proc.stdout.strip()


def changed_test_files() -> list[Path]:
    base = os.environ.get("BASE_BRANCH", "main")
    for ref in (f"origin/{base}", base):
        out = sh("git", "diff", "--name-only", f"{ref}...HEAD")
        if out:
            return [
                Path(p)
                for p in out.splitlines()
                if "test" in Path(p).name and p.endswith(".py")
            ]
    return []


def check_l1() -> tuple[bool, str]:
    """Round two: did the correction actually do what L1 asked?"""
    files = changed_test_files()
    if not files:
        return False, "no changed test file found in the diff, so L1 cannot be satisfied"

    evidence = []
    for path in files:
        if not path.exists():
            continue
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        marked = [
            (i + 2, lines[i].strip())
            for i, line in enumerate(lines[:-1])
            if re.search(r"#\s*regression:\s*issue\s*#\d+", line)
            and lines[i + 1].lstrip().startswith(("def ", "async def "))
        ]
        parametrized = any("parametrize" in line for line in lines)
        assert_count = sum(1 for line in lines if line.strip().startswith("assert"))
        if marked and (parametrized or assert_count >= 2):
            where = ", ".join(f"{path}:{ln} `{txt}`" for ln, txt in marked)
            how = "parametrized" if parametrized else f"{assert_count} assertions"
            evidence.append(f"{where} — and the test is {how}")

    if evidence:
        return True, "L1 satisfied: " + "; ".join(evidence)

    detail = []
    for path in files:
        detail.append(
            f"{path}: marker above a def = "
            f"{'yes' if re.search(r'#\s*regression:\s*issue\s*#\d+', path.read_text(encoding='utf-8', errors='replace')) else 'no'}"
        )
    return False, "L1 still open — " + "; ".join(detail)


def head_sha() -> str:
    return sh("git", "rev-parse", "HEAD")


def publish(body: str) -> None:
    """One canonical comment, edited in place on re-review."""
    try:
        raw = sh("gh", "pr", "view", "--json", "comments")
        comments = json.loads(raw).get("comments", []) if raw else []
    except Exception:
        comments = []
    existing = next((c for c in comments if MARKER in (c.get("body") or "")), None)
    tmp = ARTIFACTS / "review" / ".comment.md"
    tmp.parent.mkdir(parents=True, exist_ok=True)
    tmp.write_text(body, encoding="utf-8")
    if existing and existing.get("url"):
        node = existing["url"].rsplit("-", 1)[-1]
        subprocess.run(
            ["gh", "api", f"repos/:owner/:repo/issues/comments/{node.lstrip('issuecomment')}",
             "-X", "PATCH", "-F", f"body=@{tmp}"],
            capture_output=True, text=True,
        )
    else:
        subprocess.run(["gh", "pr", "comment", "--body-file", str(tmp)], capture_output=True, text=True)


def main() -> int:
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    sha = head_sha()

    if not REPORT.exists():
        body = (
            f"{MARKER}\n# Review — round 1 (loop-test reviewer)\n\n"
            "## Verdict\n\n**Not ready.** This is `course-fix-looptest`'s forced round-one refusal, "
            "raised to exercise the correction loop. L1 below is a loop-test finding, not a defect the "
            "production reviewer would raise.\n\n"
            f"**Round:** 1\n\n**Reviewed head SHA:** `{sha}`\n\n## Findings\n\n" + L1
        )
        REPORT.write_text(body, encoding="utf-8")
        publish(body)
        print(json.dumps({
            "ready": "false",
            "findings_summary": (
                f"Review report: {REPORT}. Round 1, loop-test reviewer: one Important finding (L1), "
                "forced to exercise the correction loop. Nothing else blocks."
            ),
        }))
        return 0

    ok, why = check_l1()
    body = (
        f"{MARKER}\n# Review — round 2 (continuation, loop-test reviewer)\n\n"
        f"## Verdict\n\n**{'Ready' if ok else 'Not ready'}.** {why}\n\n"
        f"**Round:** 2\n\n**Reviewed head SHA:** `{sha}`\n\n"
        "## Prior findings\n\n"
        f"| ID | Verdict | Evidence |\n|---|---|---|\n| L1 | "
        f"{'fixed at `' + sha + '`' if ok else 'still open'} | {why} |\n"
    )
    REPORT.write_text(body, encoding="utf-8")
    publish(body)
    print(json.dumps({
        "ready": "true" if ok else "false",
        "findings_summary": f"Review report: {REPORT}. Round 2 continuation: {why}",
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
