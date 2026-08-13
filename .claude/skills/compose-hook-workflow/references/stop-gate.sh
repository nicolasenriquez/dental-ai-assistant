#!/bin/bash
#
# stop-gate.sh — the GATE. Fires when the agent thinks it's done (Stop).
# Green → allowed to finish. Red → blocked, with the failure as the reason.
#
# The mechanism is the same one pre_tool_use.py uses: **exit 2 blocks**.
# Per the hooks docs, exit 2 on a Stop event "prevents Claude from stopping"
# and continues the conversation, and the blocking reason is read from stderr.
# Note the translation: your checkers exit 1 on failure, and exit 1 does NOT
# block — only exit 2 does. Converting one to the other is the whole job.
#
# The guard reads STATE, not memory: a clean worktree means nothing was built,
# so there is nothing to gate.

set -uo pipefail

INPUT=$(cat)

# ── The guard ────────────────────────────────────────────────────────────────
# `stop_hook_active` is true when this Stop was itself triggered by a previous
# block — without it a red tree could gate forever. Not currently in the public
# hooks reference, so treat it as belt-and-braces: `// false` means an absent
# field simply falls through to the checks below.
if [ "$(echo "$INPUT" | jq -r '.stop_hook_active // false')" = "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR" || exit 0
if ! git status --porcelain | grep -q .; then
  exit 0   # clean tree — nothing was built, nothing to gate
fi

# ── The checks — the same ones V27's script runs ─────────────────────────────
if checks_output=$(cd app/backend && uv run ruff check . && uv run mypy . && uv run pytest tests -q 2>&1); then
  exit 0   # green — allowed to finish
fi

# ── Red checks → block the stop, failure as the reason ───────────────────────
# stderr is what the agent is told. exit 2 is what stops it finishing.
{
  echo "The checks failed. Fix them before finishing. Output:"
  echo
  echo "$checks_output" | tail -30
} >&2
exit 2
