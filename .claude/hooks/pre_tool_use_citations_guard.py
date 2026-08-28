#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.8"
# ///
"""
PreToolUse hook - the citations-drift guard.

GUARANTEE: before the agent edits (or creates) any file under
`app/backend/routes/`, it must have already READ
`app/backend/rag/citations.py` at least once this session.

Why: the citation marker format - how a retrieved chunk becomes the
video title / exact-timestamp deep-link / quoted snippet the frontend
renders - is defined in rag/citations.py. Route handlers that build or
forward citations can drift out of sync with that format silently,
because nothing in the type system catches it.

Blocks (exit 2): Edit / MultiEdit / Write targeting a file under
`app/backend/routes/`, when no prior `Read` tool_use of
`app/backend/rag/citations.py` appears earlier in this session's
transcript.

Allows (exit 0): everything else. Once citations.py has been read once
this session, every later routes/ edit is unblocked - reading,
grepping, and edits outside routes/ are never touched.

MAKE IT YOURS: PROTECTED_DIR / REQUIRED_READ are the whole policy -
point them at a different pair-of-files-that-drift and the same guard
applies.

COVERAGE, HONESTLY: this scans the transcript JSONL for a prior
assistant `tool_use` block with name "Read" whose input.file_path
contains REQUIRED_READ. The transcript is written asynchronously and
can lag the current turn - a Read that happened moments ago may not
have flushed to disk yet, which can cause an occasional false block on
the very next tool call. Re-reading (or just retrying) clears it. The
hook fails open on any unexpected error (missing/unreadable transcript,
malformed JSON) - it never fails open on a genuine "not read yet"
finding, which is the whole point of the guarantee.
"""

import json
import os
import sys

PROTECTED_DIR = "app/backend/routes/"
REQUIRED_READ = "app/backend/rag/citations.py"

EDIT_TOOLS = ("Edit", "MultiEdit", "Write")


def _normalize(path: str) -> str:
    return path.replace("\\", "/")


def _is_protected(path: str) -> bool:
    return PROTECTED_DIR in _normalize(path)


def _citations_already_read(transcript_path: str) -> bool:
    if not transcript_path or not os.path.isfile(transcript_path):
        return False

    with open(transcript_path, "r", encoding="utf-8", errors="ignore") as fh:
        for line in fh:
            line = line.strip()
            # Cheap pre-filter before paying for json.loads on every line.
            if not line or "Read" not in line or "file_path" not in line:
                continue
            try:
                entry = json.loads(line)
            except (json.JSONDecodeError, ValueError):
                continue

            content = entry.get("message", {}).get("content", [])
            if not isinstance(content, list):
                continue
            for block in content:
                if not isinstance(block, dict):
                    continue
                if block.get("type") != "tool_use" or block.get("name") != "Read":
                    continue
                file_path = str(block.get("input", {}).get("file_path", ""))
                if REQUIRED_READ in _normalize(file_path):
                    return True

    return False


def _message() -> str:
    return (
        "BLOCKED: editing a file under `{protected}` before reading "
        "`{required}` this session.\n"
        "The citation marker format (video title / timestamp deep-link / "
        "quoted snippet) is defined there, and route handlers silently "
        "drift out of sync with it when edited blind.\n"
        "Read `{required}` first, then retry the edit."
    ).format(protected=PROTECTED_DIR, required=REQUIRED_READ)


def main() -> None:
    try:
        data = json.load(sys.stdin)
        tool_name = data.get("tool_name", "")
        tool_input = data.get("tool_input", {}) or {}
        transcript_path = data.get("transcript_path", "")

        if tool_name not in EDIT_TOOLS:
            sys.exit(0)

        path = str(tool_input.get("file_path", ""))
        if not _is_protected(path):
            sys.exit(0)

        if _citations_already_read(transcript_path):
            sys.exit(0)

        print(_message(), file=sys.stderr)
        sys.exit(2)

    except Exception:
        # Fail open - never let a hook bug brick the session.
        sys.exit(0)


if __name__ == "__main__":
    main()
