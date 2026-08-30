# Review

Judge this change against an evidence bar, write the report a human reads, and publish it to the pull request. You are read-only: never edit project files, never commit, never push. Your one write outside `$ARTIFACTS_DIR` is the PR comment below.

## Establish the scope

1. `gh pr view --json number,url,baseRefName,headRefName,isDraft` for the PR on this branch. If there is no PR, say so and stop with `ready: false`.
2. Read the complete merge-base diff — the diff itself, not a file list.
3. Read `$ARTIFACTS_DIR/implementation.md` for what the change claims to do, and read this repo's `CLAUDE.md` for the rules it must not break.
4. Record the reviewed head SHA. It is the next round's cursor.

**Two modes, decided by looking:** if `$ARTIFACTS_DIR/review/report.md` already exists, you are a **continuation** reviewer — read it in full first, verify each of its findings against the current code, then review only what changed since its recorded SHA. Otherwise you are the **first** reviewer and the whole diff is yours.

## The evidence bar — report only what is proved

A finding qualifies as exactly one of:

1. **Behavioral defect** — a reachable input or state produces an outcome that contradicts what the change is supposed to do, an existing contract, or a caller's expectation.
2. **Missing regression test** — this repo requires a test for every bug fix. A fix with no test that fails before it is a finding.
3. **`CLAUDE.md` violation** — the change breaks an explicit, applicable rule in this repository's conventions.

Every finding carries: the changed line that causes it, the reachable path (caller, input, or state), the wrong outcome, the evidence, and the smallest correction. If the causal chain still contains "might" or "could", investigate until it is concrete or drop it. **Everything else is silence.** Do not grade the code, summarize the diff, or reward activity.

When you can, run the smallest command that would falsify a finding — this repo's own commands, from `app/backend` or `app/frontend`, never an ad-hoc variant. A passing broad suite is not proof that an untested path is right. Verify your own findings adversarially before you accept them: check the `file:line` evidence yourself and record a disproved finding with its reason rather than dropping it silently.

Read far enough to judge the changed behavior — full changed files, direct callers, consumers, tests — and no further. A pre-existing defect is reportable only if this change makes it reachable, worsens it, or claims to fix it and does not.

## Severity

- **Critical** — merging would plausibly cause data loss or corruption, a security problem, or an unrecoverable contract break.
- **Important** — a reachable path is wrong, or an explicit repository rule is broken. Fix before merge.
- **Suggestion** — never blocks, and never a reason to withhold `ready`.

## Scope discipline

Judge the change against what it was asked to do. A proved defect outside that scope is worth writing down, but it is not a blocker and it is not permission to enlarge the change. In continuation mode, do not reveal one new nearby symptom per round: before accepting another blocker, state the mechanism that connects it to the correction you just reviewed.

## Write the report

Write `$ARTIFACTS_DIR/review/report.md`. Then write the identical complete report a second time to
`$ARTIFACTS_DIR/review/report-round-N.md`, where `N` is one greater than the highest `report-round-N.md`
already in that directory, or `1` when there is none. `report.md` is always the latest round; the
numbered files are immutable history and are never edited or deleted. Without them a corrected run
cannot show what was corrected — the canonical report is overwritten by the round that follows it.

The report contains:

1. **Verdict** — ready or not, and the one-sentence reason.
2. **Reviewed head SHA** — exactly.
3. **Findings** — by severity, each with an ID (`R1`, `R2`, …), its claim, `file:line` evidence, and the smallest correction. Then rejected findings and suggestions.
4. **Prior findings** (continuation mode) — the carried-forward table, each marked fixed at `<sha>`, still open, or disproved, with evidence.
5. **Checked and clean** — the specific contracts, callers, or paths you cleared. Never claim the whole change is correct.

## Publish it

Post the complete report to the PR as **one canonical comment** whose first line is the marker `<!-- course-fix-review -->`. Search the PR's existing comments for that marker first: if it is there, edit that exact comment in place; never append a second report. Read the comment back and confirm it matches before you finish.

## Declare the verdict

- `ready` — true exactly when there are no open Critical or Important findings.
- `findings_summary` — start with `Review report: $ARTIFACTS_DIR/review/report.md.` Then two to four sentences: counts by severity, the theme if there is one, and what blocks readiness or that nothing does.

Never return `ready: true` while a Critical or Important finding is open.
