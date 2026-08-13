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

That split *is* the mental model: **pre = gate, post = log.**

## Also here, and deliberately NOT switched on

Three **automation** hooks. They are a different job from the two above: those two are always-on safety, these three drive a workflow. A hook only exists once it is wired into `.claude/settings.json`, so as files on disk these are **inert**.

| File | Event | Shape | What it does |
|---|---|---|---|
| `format-touched.sh` | PostToolUse `Edit\|Write` | **REACT** | Formats the `.py` file that was just touched |
| `stop-gate.sh` | Stop | **GATE** | Refuses to let the session finish until the checks are green. Guards for a dirty worktree and `stop_hook_active`; translates checker exit 1 into block JSON |
| `baton.sh` | Stop (`async`) | **BATON** | Issue artifact present and fix output absent, so it launches the fix skill in a fresh `claude -p`. Keeps an in-flight marker on disk |

`automation-hooks.settings.json` is the stanza that would wire them up. **It is not the live settings file** and merging it is a deliberate act.

> ⚠️ **Think before you merge that stanza.** Hooks fire on *every* session in the repo they are configured in, not just the one you had in mind. `stop-gate.sh` will stop you ending a session while checks are red, and `baton.sh` spawns a fresh `claude -p` on every Stop. That is the point of them, and it is also why they ship switched off. Merge the stanza when you want the behaviour, and remove it when you are done.

The three shapes are the reason they are worth reading even switched off: **react** to something that happened, **gate** something from finishing, and **hand the baton** to the next agent. Together with the `pre = gate, post = log` pair above, that is the whole hook vocabulary.

## Turning them on

Hooks are the one primitive that does something the moment it exists, so the pack ships the wiring as a
**template** rather than a live file (same idea as `.claude/CLAUDE.md.template`). Copy it in your project:

```bash
cp .claude/settings.json.example .claude/settings.json
```

`.claude/settings.json` is gitignored here in the course repo so the hooks don't fire while you're reading the
material. **In your own project, commit it** — that's how the whole team inherits the same guarantees.
If you already have a `settings.json`, merge the `hooks` block in rather than overwriting it.

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
  wrote. It is the enforcement point, not omniscience.

  Concretely, `pre_tool_use.py` covers three routes to a secret: the **env file**, the **other credential
  files** (ssh keys, `.pem`, `.aws/credentials`, `.netrc`, `credentials.json`), and the **process environment**
  (the env-dumping shell builtins, a bare `env`, echoing a `*_KEY` / `*_TOKEN` variable, or code that reads the
  environment map). That last route matters more than it looks — a guard that blocks the env *file* but not the
  *environment* is mostly theatre, because the same values are sitting right there in the shell.

  **What it deliberately does not cover: the two-step attack.** Nothing stops the agent *writing* a script that
  reads the environment and then running it — the run looks innocent, because the secret-handling lives in a
  file that was just created. Closing that means inspecting the **content** of `Write`/`Edit` calls, not just
  the command, which is a genuinely different check and roughly triples the size of this file. If you are
  guarding something that matters, that is the next thing to add.

## Portability

This is not a Claude Code party trick. Codex and Cursor use the same shape (a script, JSON on stdin,
`exit 2` to block); Gemini CLI does the same job by reading a structured JSON decision instead of the exit
code; Pi and opencode run hooks in-process as plugins. Learn it once, it transfers — the same way `AGENTS.md`
became the shared rules file.
