#!/bin/bash
#
# baton.sh — the BATON. One skill's artifact starts the next skill, in a
# FRESH context. Runs with "async": true so the finishing session isn't
# held open.
#
# The guard reads STATE, not memory — it can fire a hundred times and act
# once: no artifact → not our event · fix report exists → done (this is
# also the recursion guard) · in-flight marker on disk → already running.

set -uo pipefail

INPUT=$(cat)
cd "$CLAUDE_PROJECT_DIR"

for artifact in docs/issues/issue-*.md; do
  [ -e "$artifact" ] || exit 0

  n=$(basename "$artifact" .md)
  n=${n#issue-}
  done_marker="docs/issues/fix-report-$n.md"   # piv-implement-issue saves its report here
  inflight="docs/issues/.baton-$n.inflight"

  [ -f "$done_marker" ] && continue
  [ -f "$inflight" ] && exit 0

  # One event, one hand-off.
  touch "$inflight"
  claude -p "/piv-implement-issue $n" \
    --allowedTools "Read,Edit,Write,Bash" \
    >/dev/null 2>&1
  rm -f "$inflight"
  exit 0
done

exit 0
