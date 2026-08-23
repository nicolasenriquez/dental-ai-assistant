#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["claude-agent-sdk"]
# ///
"""
fix_issue.py — ONE stage of V27's fix loop, translated to the Agent SDK.

The dependencies live in the header above (PEP 723): one file, no venv,
no install step — `uv run fix_issue.py 42` anywhere uv exists.

Three things a shell script cannot have:
  1. the session is an OBJECT — the client below IS the implementer's context
  2. your .claude/ layer loads automatically
  3. guard() is asked about tool calls AS THEY HAPPEN, and can say no

Deliberately unchanged: the checks stay a subprocess. Either they exit 0
or they don't. A better harness never absorbs your checks.
"""

import subprocess
import sys

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ClaudeSDKClient,
    PermissionResultAllow,
    PermissionResultDeny,
    ResultMessage,
    TextBlock,
    ToolUseBlock,
    query,
)

# The default Windows console codepage can't encode the checkmark below or
# any emoji pulled in from issue text — without this, the script crashes on
# its own status output before it ever finishes. Harmless on platforms that
# are already UTF-8.
sys.stdout.reconfigure(encoding="utf-8")

ISSUE = sys.argv[1] if len(sys.argv) > 1 else sys.exit("usage: fix_issue.py <issue>")

CHECKS_DIR = "app/backend"   # where the checks' config lives — change this first
MAX_FIX_ATTEMPTS = 3         # an unbounded fix loop is money spent on a wall


def run_checks() -> tuple[bool, str]:
    """The deterministic half — no agent involved, no opinions consulted."""
    result = subprocess.run(
        "uv run ruff check . && uv run mypy . && uv run pytest tests -q",
        shell=True, cwd=CHECKS_DIR, capture_output=True, text=True,
    )
    return result.returncode == 0, result.stdout + result.stderr


async def guard(tool_name, tool_input, context):
    """Asked about a tool call WHILE it happens — a script reads the diff after.

    A broadly-allowed tool is auto-approved BEFORE this guard is consulted,
    so Edit/Write stay out of allowed_tools and fall through to here."""
    path = str(tool_input.get("file_path", ""))
    if tool_name in ("Edit", "Write") and "migrations/" in path:
        return PermissionResultDeny(message="migrations are hand-written here")
    return PermissionResultAllow()


async def drain(client: ClaudeSDKClient) -> float:
    """query() only SENDS. Iterating receive_response() is what drives the
    turn to completion — forget this and the run silently does nothing.
    Prints each tool call as it happens — the only way to actually SEE the
    .claude/ auto-load claim, since a skill firing is just a Read of its
    SKILL.md, not anything the SDK announces on its own. Returns this
    turn's cost — the implementer's spend is otherwise never surfaced
    anywhere, since only the review call below prints its own."""
    cost = 0.0
    async for message in client.receive_response():
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, ToolUseBlock):
                    detail = block.input.get("file_path") or block.input.get("command", "")
                    print(f"  → {block.name}: {detail}")
        if isinstance(message, ResultMessage) and message.total_cost_usd:
            cost = message.total_cost_usd
    return cost


async def main() -> None:
    # The implementer. The client IS the session — no session ids, no --resume.
    # Nothing points at our skills or rules: the .claude/ layer loads automatically.
    # allowed_tools is Read+Bash only, so Edit/Write fall through to guard().
    options = ClaudeAgentOptions(
        model="opus",
        allowed_tools=["Read", "Bash"],
        can_use_tool=guard,
    )
    implementer_cost = 0.0
    async with ClaudeSDKClient(options=options) as implementer:
        await implementer.query(
            f"Study GitHub issue #{ISSUE}. Investigate the fix, then fix the issue."
        )
        implementer_cost += await drain(implementer)

        # Same bounded loop as the shell version — failures go back into the
        # SAME context, because it remembers what it just wrote.
        for attempt in range(1, MAX_FIX_ATTEMPTS + 1):
            ok, output = run_checks()
            if ok:
                print("✓ checks pass")
                break
            print(f"→ checks failed ({attempt}/{MAX_FIX_ATTEMPTS}) — handing back")
            await implementer.query(f"The checks failed. Fix them:\n\n{output}")
            implementer_cost += await drain(implementer)
        else:
            sys.exit("✗ still failing — stopping so a human can look")

    # The review: one-shot, nothing carried over — the missing --resume,
    # as a function call. Cheaper model: reading a diff doesn't need the strong brain.
    # Print only the assistant's text — the raw message objects are a wall of
    # SystemMessage/AssistantMessage reprs, not something worth watching.
    review_cost = 0.0
    async for message in query(
        prompt=f"Review the changes for issue #{ISSUE}. "
               "List findings worst-first, BLOCKER or NIT.",
        options=ClaudeAgentOptions(model="sonnet",
                                   allowed_tools=["Read", "Bash"]),
    ):
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, TextBlock):
                    print(block.text)
        elif isinstance(message, ResultMessage) and message.total_cost_usd:
            review_cost = message.total_cost_usd

    total = implementer_cost + review_cost
    print(f"\n✓ done — issue #{ISSUE} "
          f"(implementer ${implementer_cost:.2f} + review ${review_cost:.2f} = ${total:.2f})")


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
