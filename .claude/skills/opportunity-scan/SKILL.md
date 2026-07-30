---
name: opportunity-scan
description: "Scan how you actually use your coding agent — read the agent's own capabilities, then your recent session logs — and surface the recurring work worth turning into a skill, hook, subagent, or automation. Agent-agnostic. Outputs a shape-only HTML report. Use to find what to build next / evolve your system from real usage (the portable cousin of Claude Code's /insights)."
---

# Opportunity Scan — find what to build from how you actually work

Reads your agent's own capabilities and your recent usage, finds the patterns worth encoding, and recommends which
primitive each should become. **Agent-agnostic** (Claude Code, Codex, PI, …). It's the custom, portable cousin of
Claude Code's built-in `/insights` — but it maps what you repeat to the **full primitive palette** (rules · skill ·
hook · subagent · MCP · automation/workflow), not just rules, and it works for **any** agent because it learns that
agent's capabilities first.

This is a **discovery** tool — *what to build* — NOT a quality **eval** (*whether a built thing is good*). Keep the
two separate.

## Inputs — ask for any that weren't given

`$ARGUMENTS` may carry some of these; ask for whatever's missing, don't guess.

1. **Where the agent's own docs live** — a URL or path to your agent's capability / extensibility docs, so the scan
   knows what your agent *can become* (its real extension points). Don't assume Claude Code.
2. **Where your agent's logs live** — the session-log location for your agent. Examples: Claude Code →
   `~/.claude/projects/` + `~/.claude/history.jsonl`; Codex → `~/.codex/sessions/`; PI → your extension's log dir.
3. **The window** — how many days/weeks of logs to scan. Default: the last 2 weeks.
4. **What you care about** *(optional — ask once, accept "nothing specific")* — where you want leverage right now,
   in your words: the kind of work you want to stop doing by hand, a quality bar you keep enforcing, a part of the
   loop that keeps costing you. This **steers what the scan pays attention to**; without it the scan just ranks by
   frequency, which is not the same as ranking by what matters to you.

## Steps — keep them literal; this is the fragile part (meta-prompting)

1. **Learn your own capabilities.** Read the agent docs from input 1. Write a short internal list of *this* agent's
   extension points (rules, skill, hook, subagent, MCP/tool, automation/workflow, whatever the docs describe). Use
   what the docs say — do not assume a fixed set.
2. **Read recent usage.** Read the logs from input 2 within the window. Pull out what you actually did: recurring
   commands, repeated multi-step sequences, repeated instructions/corrections, tools reached for, friction/retries.
   **Aggregate, don't ingest:** logs can be huge — prefer the prompt/command-history file over raw session
   transcripts, and reduce with shell tools (`jq`/`grep`/`sort | uniq -c`) so only frequencies and representative
   samples enter your context, never whole log files. If you can't locate or parse the logs, ask the user rather
   than invent.
3. **Find the opportunities.** For each recurring pattern, pick the **best-fit primitive** (from step 1's list) and
   say *why*. If input 4 was given, **weight it** — surface what the user said they care about even when it isn't
   the most frequent pattern, and say plainly when a high-frequency pattern is *not* worth encoding. And propose
   each build **in the house style of the artifacts that already exist**: skim a couple of the project's current
   rules/skills/agents first, and shape the recommendation to look like them (same structure, same conventions), so
   what it suggests is something the user would actually build. Examples of the mapping:
   - a rule you keep restating → **rules** (CLAUDE.md / AGENTS.md)
   - a repeated multi-step workflow → a **skill**
   - a must-never / must-always you keep enforcing by hand → a **hook**
   - a specialized recurring delegation → a **subagent**
   - a clean end-to-end hand-off you do often → an **automation** (later: an Archon workflow)
   Rank them by roughly (how often it occurs × how much encoding it would save).
4. **Write the report** as a single self-contained HTML file (see the contract below), then tell the user where it
   is.

## Report contract — prescribe HOW to render, never WHAT to include

**Let the analysis drive the report.** Which sections exist, what goes in them, how deep each goes, how many
opportunities, which quotes or numbers are worth pulling out — all of that comes from what you actually found, NOT
from this skill. Do **not** box the report into a fixed set of sections, do **not** seed findings, do **not** tell
it what to conclude. If the data is rich, the report is rich; if a single finding deserves its own deep section,
give it one; if something surprising turns up, surface it.

Only the **rendering** is prescribed:
- One **self-contained `.html`** file (inline CSS), opens in any browser.
- **Visually clean, scannable, and generous** — let the findings breathe; use whatever layout, sections, real
  quotes, stats, or visuals best fit what was actually found.

The rule: this skill governs *how to put it on the page*, never *what goes on the page*.

## Keep it light
Do exactly these four steps, clearly. Don't add scoring frameworks, config, or extra passes it doesn't need. If a
step can't complete (docs or logs not found), stop and ask — never fabricate the analysis.
