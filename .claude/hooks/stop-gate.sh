#!/bin/bash
#
# stop-gate.sh — the GATE. Fires when the agent thinks it's done (Stop).
# Green → allowed to finish. Red → blocked, with the failure as the reason.
#
# The guard reads STATE, not memory: the harness's loop flag (it also
# hard-caps at 8 blocks), and a clean worktree means nothing to gate.
# Note the translation: checkers exit 1 on failure, but only a JSON
# decision (or exit 2) blocks a stop.

set -uo pipefail

INPUT=$(cat)

# ── The guard ────────────────────────────────────────────────────────────────
if [ "$(echo "$INPUT" | jq -r '.stop_hook_active // false')" = "true" ]; then
  exit 0
fi
cd "$CLAUDE_PROJECT_DIR"
if ! git status --porcelain | grep -q .; then
  exit 0   # clean tree — nothing was built, nothing to gate
fi

# ── The checks — the same three as V27's script ──────────────────────────────
if checks_output=$(cd app/backend && uv run ruff check . && uv run mypy . && uv run pytest tests -q 2>&1); then
  exit 0   # green — allowed to finish
fi

# ── Red checks → a blocked stop, failure as the reason ───────────────────────
jq -n --arg out "$(echo "$checks_output" | tail -30)" \
  '{decision: "block", reason: ("The checks failed. Fix them before finishing. Output:\n\n" + $out)}'
exit 0
