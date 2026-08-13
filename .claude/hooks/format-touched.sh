#!/bin/bash
#
# format-touched.sh — the REACT hook. After every Edit/Write, the touched
# Python file comes out formatted. The event guarantees what a rule can
# only ask. Formatting is a courtesy, never a blocker: always exit 0.

set -euo pipefail

FILE=$(jq -r '.tool_input.file_path // empty')

[ -n "$FILE" ] || exit 0
case "$FILE" in
  *.py) ;;
  *) exit 0 ;;
esac

# The AI Tutor's formatter config lives in app/backend.
cd "$CLAUDE_PROJECT_DIR/app/backend" && uv run ruff format "$FILE" >/dev/null 2>&1 || true

exit 0
