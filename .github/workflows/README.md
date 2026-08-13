# GitHub Actions workflows

Two agentic workflows. Both are the same primitive the rest of the AI Layer uses —
a skill or a prompt, invoked by something that is not a human sitting at a terminal.
Here the invoker is GitHub: an event, and a clock.

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| `claude-review.yml` | `pull_request` (`opened`, `synchronize`) | Runs this repo's `/piv-review-changes` skill against the PR diff and posts findings worst-first, each marked BLOCKER or NIT. |
| `daily-report.yml` | `schedule` — cron `0 9 * * *` (09:00 UTC) | Summarizes yesterday's commits and open issues into the run log. No checkout; it reads through the GitHub API. |

## Required secret

Both workflows need one repository secret:

```
CLAUDE_CODE_OAUTH_TOKEN
```

This is a **subscription** OAuth token, not an API key — runs bill the plan, not a
per-token meter. Generate and install it by running `/install-github-app` inside
Claude Code in this repo, which walks through the GitHub App install and writes the
secret. Nothing else is required; no `ANTHROPIC_API_KEY` is used here.

Until that secret exists, both workflows will fail at the
`anthropics/claude-code-action@v1` step.

## Notes that bite

- **`fetch-depth: 0` in `claude-review.yml` is load-bearing.** The review diffs
  against the base branch; the default shallow checkout (depth 1) would see no
  base to diff against and the review would come back empty.
- **`id-token: write`** is required for the action's GitHub App authentication.
  Content permissions stay read-only on purpose — the reviewer reads and comments,
  it does not push.
- **`claude-review.yml` invokes a skill by name** (`/piv-review-changes`), which
  lives at `.claude/skills/piv-review-changes/SKILL.md` in this repo. The skill
  carries its own allowed-tools frontmatter, so it brings both its instructions and
  its permissions. Rename or remove that skill and this workflow breaks.
- **`daily-report.yml` uses a plain-text prompt, which has no tools until granted.**
  It explicitly allows exactly two: `mcp__github__list_commits` and
  `mcp__github__list_issues`. Both come from the GitHub MCP server that the action
  provides — no `.mcp.json` entry is needed for them.
- **Scheduled runs are attributed to whoever last touched the cron line.** If that
  ever becomes a bot account, it needs allowlisting.
- **Public repos disable scheduled workflows after 60 days without repo activity.**
  A quiet stretch silently stops the daily report.
