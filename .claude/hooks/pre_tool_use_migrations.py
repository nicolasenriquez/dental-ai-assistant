#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.8"
# ///
"""
PreToolUse hook - the migrations guard.

GUARANTEE: an Alembic migration file that already exists under
`app/backend/alembic/versions/` can never be modified, overwritten, renamed or
deleted by the agent. Creating a BRAND-NEW migration there is still allowed,
because CLAUDE.md requires every schema change to ship as a new revision.

Why this line and not "no writes at all": an applied migration is history. Once
`alembic upgrade head` has run against any database, editing that file silently
desynchronises the code from the schema it supposedly produced - and nothing in
the test suite notices. A new revision is the normal, safe path.

Blocks (exit 2):
  - Edit / MultiEdit / NotebookEdit targeting any file in the protected dir.
  - Write targeting a file in the protected dir that ALREADY EXISTS (overwrite).
  - Bash / PowerShell commands that would mutate an existing protected file
    (sed -i, redirects, tee, rm, mv, cp, git checkout/restore, and friends).

Allows (exit 0): everything else - reading, grepping, `alembic revision`, and
writing a new revision file that does not exist yet.

MAKE IT YOURS: `PROTECTED_DIRS` is the whole policy. Add a path, and every check
below applies to it too.

COVERAGE, HONESTLY: the shell check is a string match over the command. It
catches the ordinary spellings. A command that BUILDS the path at runtime, or
runs a script that does the write, is arbitrary code and no regex reaches it.
The file-tool checks (Edit/Write) have no such gap - those are exact paths.
Known false positive, deliberately kept: copying a protected file OUT
(`cp <protected> /tmp/x`) is blocked too, because telling source from
destination in an arbitrary shell command is not reliably doable. Erring toward
the block is the right bias for a guard.

The hook FAILS OPEN: any unexpected error exits 0, so a bug here can never brick
the session.
"""

import json
import os
import re
import sys

# The whole policy. Repo-relative, forward slashes.
PROTECTED_DIRS = ("app/backend/alembic/versions/",)

FILE_TOOLS = ("Edit", "MultiEdit", "NotebookEdit", "Write")
SHELL_TOOLS = ("Bash", "PowerShell")

# Shell verbs that write, move or destroy. Presence of one of these PLUS a
# protected path is enough to block.
MUTATING = re.compile(
    r"\bsed\b[^|;]*-[a-z]*i"          # sed -i / -i.bak
    r"|\bperl\b[^|;]*-[a-z]*i"
    r"|\btee\b"
    r"|\brm\b|\bunlink\b|\bshred\b|\btruncate\b|\bdd\b"
    r"|\bmv\b|\bcp\b|\binstall\b"
    r"|\bpatch\b"
    r"|\bgit\s+(checkout|restore|apply|clean|rm|mv)\b"
    r"|\btouch\b"
    r"|Set-Content|Add-Content|Clear-Content|Out-File"
    r"|Remove-Item|Move-Item|Copy-Item|New-Item|Rename-Item"
    r"|open\s*\([^)]*['\"][wax]",     # python open(path, 'w')
    re.IGNORECASE,
)

# A redirect is only a mutation when the protected path is the TARGET, i.e. it
# sits after the `>`. `cat <protected> > /tmp/x` is a read and stays allowed.
REDIRECT_TARGET = re.compile(r">>?\s*['\"]?([^\s'\";|&]+)")

# Any path-ish token that lands inside a protected directory.
def _path_tokens(text: str, protected: str) -> list:
    pattern = re.compile(r"[^\s'\";|&()]*" + re.escape(protected) + r"[^\s'\";|&()]*")
    return pattern.findall(text)


def _exists(candidate: str, cwd: str) -> bool:
    """True if the referenced path already exists on disk."""
    candidate = candidate.strip().strip("'\"")
    if not candidate:
        return False
    if not os.path.isabs(candidate):
        candidate = os.path.join(cwd, candidate)
    return os.path.exists(candidate)


def _in_protected(path: str) -> str:
    """Return the protected dir this path sits in, or '' if none."""
    normalized = path.replace("\\", "/")
    for protected in PROTECTED_DIRS:
        if protected in normalized:
            return protected
    return ""


def _blocked_file_tool(tool_name: str, tool_input: dict, cwd: str) -> str:
    path = str(tool_input.get("file_path", "") or tool_input.get("notebook_path", ""))
    if not _in_protected(path):
        return ""
    # Write to a path that does not exist yet = authoring a NEW revision. Fine.
    if tool_name == "Write" and not _exists(path, cwd):
        return ""
    return path


def _blocked_shell(command: str, cwd: str) -> str:
    text = command.replace("\\", "/")

    for protected in PROTECTED_DIRS:
        tokens = _path_tokens(text, protected)
        if not tokens:
            continue

        # A redirect whose target is protected and already exists: block.
        for target in REDIRECT_TARGET.findall(text):
            if _in_protected(target) and _exists(target, cwd):
                return target

        if not MUTATING.search(text):
            continue

        for token in tokens:
            if _exists(token, cwd):
                return token

    return ""


def _message(path: str) -> str:
    return (
        "BLOCKED: `{}` is an existing Alembic migration - migrations are "
        "append-only in this repo.\n"
        "An applied revision is history; editing it desynchronises the code "
        "from the schema it produced.\n"
        "Create a NEW revision instead (`uv run alembic revision -m \"...\"` "
        "from app/backend/, then write the new file)."
    ).format(path)


def main() -> None:
    try:
        data = json.load(sys.stdin)
        tool_name = data.get("tool_name", "")
        tool_input = data.get("tool_input", {}) or {}
        cwd = data.get("cwd", ".")

        hit = ""
        if tool_name in FILE_TOOLS:
            hit = _blocked_file_tool(tool_name, tool_input, cwd)
        elif tool_name in SHELL_TOOLS:
            hit = _blocked_shell(str(tool_input.get("command", "")), cwd)

        if hit:
            # exit 2 = block the tool; stderr goes back to the agent as the reason.
            print(_message(hit), file=sys.stderr)
            sys.exit(2)

        sys.exit(0)  # allow

    except Exception:
        # Fail open - never let a hook error stop the agent from working.
        sys.exit(0)


if __name__ == "__main__":
    main()
