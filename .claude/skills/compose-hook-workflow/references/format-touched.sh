#!/bin/bash
#
# format-touched.sh — the REACT hook. After every Edit/Write, the touched
# Python file comes out formatted. The event guarantees what a rule can
# only ask.
#
# Formatting is a courtesy, never a blocker: this hook always exits 0.
# Even if it wanted to complain, PostToolUse cannot block — the tool has
# already run. exit 2 there only shows stderr to the agent.

set -uo pipefail

FILE=$(jq -r '.tool_input.file_path // empty' 2>/dev/null || true)

[ -n "$FILE" ] || exit 0
case "$FILE" in
  *.py) ;;
  *) exit 0 ;;
esac

# The AI Tutor's formatter config lives in app/backend.
cd "$CLAUDE_PROJECT_DIR/app/backend" 2>/dev/null && uv run ruff format "$FILE" >/dev/null 2>&1

exit 0
