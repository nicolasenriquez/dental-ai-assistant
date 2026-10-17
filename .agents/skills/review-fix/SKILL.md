---
name: review-fix
description: Use after /review when the user wants root-cause proposals, blast-radius and blind-spot analysis, classic unified diffs, and implementation with regression evidence.
---

# Review Fix

Apply Ponytail ultra to the findings supplied by a completed Codex review.
Treat each finding as a hypothesis until the repository proves it. Produce a
complete per-finding proposal, then implement confirmed fixes when the user
asks for implementation in the same request.

## Input boundary

- Use findings from the current thread, a pasted review report, or a path the
  user supplies. Keep the review's finding IDs, severity, evidence, and cited
  locations.
- If no findings are available, ask for the report or path. Do not invent
  findings from a general scan.
- Continue from the supplied review. Use another review only when the user
  explicitly requests one.
- Treat `ponytail ultra` as an implementation constraint: question YAGNI,
  reuse existing code, prefer standard or native behavior, and make the
  smallest localized root-cause patch. Keep the requested analysis complete.

## Workflow

### 1. Establish the baseline

Read the root routing files and the closest applicable local `AGENTS.md`,
`index.md`, and context file before substantive work. Inspect `git status
--short`, the current branch, and the relevant diff or commits. Preserve every
pre-existing staged and unstaged change. Do not create commits, pushes, tags,
releases, or external messages unless the user explicitly requests them.

Create an inventory for every supplied finding:

| ID | Claim | Evidence | Location | Severity | Status |
| --- | --- | --- | --- | --- | --- |

Use `unverified` until the finding is confirmed, disproved, or shown to be
ambiguous. The baseline is complete only when every supplied finding has one
status and an evidence source.

### 2. Verify the real failure

For each finding, read the cited code and its surrounding contract. Trace the
runtime path from input to affected behavior. Search every caller, sibling
implementation, test, type, configuration value, and boundary that can share
the behavior. Reproduce the issue with the smallest relevant check when that
is safe and practical.

Prefer a shared root-cause fix over repeated caller guards. Preserve input
validation, authorization, data-loss protection, error handling, accessibility,
and compatibility behavior even in ultra mode. Load a relevant repo skill such
as `security-review`, `diagnose`, `nestjs-patterns`, or `react-patterns` when
the finding crosses that skill's scope.

Mark a finding `confirmed`, `disproved`, or `ambiguous`. A finding is verified
only when the code path, affected contract, and regression boundary are clear.
Every finding has a status and evidence before proposal work begins.

### 3. Write one proposal per finding

For each `confirmed` or `ambiguous` finding, write these fields in this order:

1. **Finding** — quote or tightly summarize the supplied claim.
2. **Root cause** — explain the causal defect, not the visible symptom.
3. **Code location** — give repository-relative file paths and line numbers
   from the current tree.
4. **Blast radius** — name affected callers, routes, data, users, and behavior;
   state what the patch intentionally leaves unchanged.
5. **Blind spots** — list edge cases, sibling paths, compatibility risks,
   environment assumptions, and checks that could miss a regression.
6. **Proposed fix** — describe the smallest long-term change at the narrowest
   shared boundary that owns the defect.
7. **Why this fix** — compare it with the nearest alternatives and state why
   they are larger, weaker, duplicative, or more fragile.
8. **Regression check** — name the smallest check that fails before the fix and
   passes after it, plus any repository-required validation.

For `disproved` findings, record the evidence and explain why no patch is
needed. For `ambiguous` findings, propose only the smallest safe containment
when its contract is explicit; otherwise report the exact missing evidence and
leave the code unchanged.

Every supplied finding appears exactly once in the proposal set, with a
root-cause conclusion, scope, and validation plan.

### 4. Show the exact patch preview

Before editing, show the proposed as-is versus to-be change for every patch in
classic unified git format:

```diff
diff --git a/path/to/file b/path/to/file
--- a/path/to/file
+++ b/path/to/file
@@ -old-line,count +new-line,count @@
 unchanged context
-as-is line
+to-be line
```

Derive the old lines, context, paths, and hunk ranges from the current files.
Use one diff block per logical patch. Show no pseudo-diff, guessed code, or
unrelated formatter churn. The preview is complete when it covers every file
the proposal will modify and no file outside that scope.

### 5. Implement the safe patch

When implementation is requested, apply only `confirmed` fixes and any
explicitly justified safe containment. Use the repository's patch/editing
workflow. Keep the patch localized, avoid new dependencies and speculative
abstractions, and do not rewrite tests merely to make them pass.

If the working tree changed or a hunk no longer matches the preview, stop,
re-read the affected files, and regenerate the preview before editing. Never
force a stale patch through. After editing, compare the actual diff with the
preview and confirm that every changed line belongs to a named finding.

Implementation is complete only when the actual diff is localized, matches the
approved proposal, and contains no unexplained file or behavior changes.

### 6. Validate and report

Run the smallest relevant regression check first. Then run the changed-file
lint, typecheck, tests, build, or other checks required by the repository's
routing files. Report commands and outcomes exactly, including failures and
environment blockers. Do not claim validation that was not run.

Return:

- the implementation result and changed files;
- one complete analysis block per finding, including root cause, location,
  blast radius, blind spots, alternatives, and validation;
- the exact unified diff for the applied patch;
- disproved or ambiguous findings and why they were left unchanged;
- skipped YAGNI scope and the condition that would justify adding it.

For a proposal-only request, stop after the preview and say that no files were
changed. For an implementation request, stop after validation and the report;
do not commit or push.
