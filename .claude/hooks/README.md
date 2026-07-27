# Hooks — the deterministic layer of the AI Layer

Hooks are the fifth primitive. Rules, subagents, tools, and skills are all things the agent *reaches for*.
A hook is the one the agent never chooses: it fires automatically on a lifecycle event.

> **A rule asks the agent to behave. A hook guarantees it.**
>
> Reach for a rule when "usually" is fine. Reach for a hook when it **must** happen every single time.

## What ships here

| File | Event | What it does | Can it block? |
|---|---|---|---|
| `pre_tool_use.py` | **PreToolUse** | Blocks reading/writing/searching a real env file (committed `.env.example` templates are allowed) and blocks `rm -rf`. Prints the reason to stderr and `exit(2)` → the tool is stopped and the agent is told why, so it adapts. | **Yes** — this is the guarantee |
| `post_tool_use.py` | **PostToolUse** | Appends every tool call to `logs/post_tool_use.json` — a full audit trail of what the agent did. | No — the tool already ran; observe only |

Both are wired in `../settings.json`. That split *is* the mental model: **pre = gate, post = log.**

## Try it

```
ask the agent to read your env file          -> blocked (exit 2, reason handed back)
ask it to read app/backend/.env.example      -> allowed
ask it to run `rm -rf ...`                   -> blocked
any normal command                           -> allowed, and logged to logs/post_tool_use.json
```

You can also test a hook directly, without the agent:

```bash
echo '{"tool_name":"Read","tool_input":{"file_path":".env"}}' | uv run .claude/hooks/pre_tool_use.py; echo "exit=$?"
```

`exit=2` means the guard fired.

## Adding your own — you don't have to write Python

Use the **`hooks-create`** skill and describe the guarantee in plain English:

```
/hooks-create "Don't let the agent finish until my tests pass — run my test command when it tries to stop, and if it fails, block the stop and tell it to fix the failures."
```

It picks the right lifecycle event, writes the script, and merges it into `settings.json`.
Common ones worth adding:

- **stop-until-green** (`Stop`) — the agent can't declare done while tests are red.
- **protected paths** (`PreToolUse`) — never edit `migrations/`, prod config, or lockfiles.
- **auto-format** (`PostToolUse`) — format every file the moment it's edited.

## Two things to know

- **Hooks run real code, automatically, with your credentials, with no sandbox.** Review a hook the way you'd
  review a CI script. Only run hooks you have read and trust. This is the same caution as MCP servers.
- **Coverage is yours.** The hook is guaranteed to *run*; what it *catches* is only as good as the check you
  wrote. `pre_tool_use.py` blocks the obvious routes to a secret, not every conceivable one. It is the
  enforcement point, not omniscience.

## Portability

This is not a Claude Code party trick. Codex and Cursor use the same shape (a script, JSON on stdin,
`exit 2` to block); Gemini CLI does the same job by reading a structured JSON decision instead of the exit
code; Pi and opencode run hooks in-process as plugins. Learn it once, it transfers — the same way `AGENTS.md`
became the shared rules file.
