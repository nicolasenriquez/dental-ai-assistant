#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.8"
# ///
"""
PreToolUse hook — the deterministic guardrail.

Fires BEFORE every matched tool call. It inspects what the agent is about to do
and, if the call crosses a line you never want crossed, blocks it: print the
reason to stderr and exit(2). Claude Code stops the tool and hands the reason
back to the agent, so it adapts instead of doing the thing.

Two guarantees ship here:
  1. The agent can never read, write, or search a real env file (your secrets).
     Committed `.env.example` templates are allowed through.
  2. The agent can never run a destructive `rm -rf`.

Everything else is allowed (exit 0). The hook FAILS OPEN: any unexpected error
exits 0, so a bug in this script can never brick your session.

MAKE IT YOURS: the two `is_*` functions below are the entire policy. Add your own
(protected paths, prod config, lockfiles, migrations), or run the `hooks-create`
skill and describe the guarantee you want in plain English.

A note on coverage: the hook is GUARANTEED to run — what it CATCHES is only as
good as the checks below. This blocks the obvious routes, not every conceivable
one. The hook is the enforcement point; you still own the coverage.
"""

import json
import re
import sys

# Committed template files that are safe to read. Everything else that looks like
# an env file is treated as real secrets. Change this one line if your repo uses a
# different convention (e.g. add ".env.sample" or ".env.template").
ENV_TEMPLATE_SUFFIXES = (".env.example",)

# Anything that looks like an env file, except the committed templates above.
ENV_PATTERN = re.compile(r"\.env\b(?!\.example)")

BLOCKED_ENV_MESSAGE = (
    "BLOCKED: access to env files is not allowed (they hold secrets).\n"
    "Read a committed .env.example template instead."
)
BLOCKED_RM_MESSAGE = "BLOCKED: refusing to run a recursive-force delete (rm -rf)."


def is_env_file_access(tool_name: str, tool_input: dict) -> bool:
    """True if the call would touch a real env file (templates are fine)."""
    # File tools: check the path argument.
    if tool_name in ("Read", "Edit", "MultiEdit", "Write", "NotebookEdit"):
        path = tool_input.get("file_path", "").replace("\\", "/")
        return ".env" in path and not path.endswith(ENV_TEMPLATE_SUFFIXES)

    # Search tools: block reading secrets out via a pattern or a scoped path.
    if tool_name in ("Grep", "Glob"):
        target = f"{tool_input.get('pattern', '')} {tool_input.get('path', '')}"
        return bool(ENV_PATTERN.search(target.replace("\\", "/")))

    # Bash: check the command text (but allow the committed templates).
    if tool_name == "Bash":
        return bool(ENV_PATTERN.search(tool_input.get("command", "").replace("\\", "/")))

    return False


def is_dangerous_rm(tool_name: str, tool_input: dict) -> bool:
    """True if a Bash command is a recursive-force delete (rm -rf and variants)."""
    if tool_name != "Bash":
        return False
    command = " ".join(tool_input.get("command", "").lower().split())
    # rm with both recursive and force flags, in any order / spelling.
    return bool(
        re.search(r"\brm\b.*-[a-z]*r[a-z]*f", command)
        or re.search(r"\brm\b.*-[a-z]*f[a-z]*r", command)
        or re.search(r"\brm\b.*--recursive.*--force", command)
        or re.search(r"\brm\b.*--force.*--recursive", command)
    )


def main() -> None:
    try:
        data = json.load(sys.stdin)
        tool_name = data.get("tool_name", "")
        tool_input = data.get("tool_input", {})

        if is_env_file_access(tool_name, tool_input):
            # exit 2 = block the tool; stderr goes back to the agent as the reason.
            print(BLOCKED_ENV_MESSAGE, file=sys.stderr)
            sys.exit(2)

        if is_dangerous_rm(tool_name, tool_input):
            print(BLOCKED_RM_MESSAGE, file=sys.stderr)
            sys.exit(2)

        sys.exit(0)  # allow

    except Exception:
        # Fail open — never let a hook error stop the agent from working.
        sys.exit(0)


if __name__ == "__main__":
    main()
