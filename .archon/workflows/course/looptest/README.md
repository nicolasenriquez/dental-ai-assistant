# course-fix-looptest

⚠️ **A test harness. Do not run it on work you care about, and do not act on its verdicts.**

## Why it exists

Four consecutive real `course-fix` runs (issues #8, #5, #13, #12 → PRs #48-#51) came back with a clean
first review, so `corrections` was skipped by its `when:` every time. That left the correction loop
proved by fixtures and never observed executing in a live run — no DAG, no node timings, no artifacts
from a real fix round.

This is `course-fix` with exactly one difference: **round one always withholds readiness** on one
declared, satisfiable requirement, so the loop is guaranteed to run.

Everything else is real:

- a real implementation of a real issue,
- a real draft PR,
- a real `fix` agent reading the report and doing the work,
- the real deterministic `gate-fix` on its `green`,
- a real **fresh** re-review that verifies the correction rather than trusting it,
- the real `gate-ready` join, the real `validate` script, and a real ready PR.

Only the round-one *verdict* is forced. The report says so on its face, and the finding is labelled
`L1 — loop-test finding` so nobody mistakes it for something the production reviewer would raise.

## The forced finding

> **L1 (Important, loop-test).** The regression test must carry `# regression: issue #<N>` on the line
> immediately above its `def`, and must cover at least two distinct inputs.

Chosen so it is small, objectively checkable by the continuation reviewer, and squarely inside the
fixer's remit — code, not PR metadata. If a first pass happens to satisfy both halves already, the
round-one reviewer still withholds, marking L1 "already satisfied — withheld to exercise the loop".

## What differs from `course-fix`

| | |
|---|---|
| `commands/review.md` | the loop-test reviewer (this is the whole difference) |
| `commands/implement.md` | production prompt plus one note telling the fixer to satisfy a loop-test finding rather than decline it |
| `commands/pr.md`, `scripts/*` | copies, unchanged |
| `course-fix-looptest.yaml` | the production graph, unchanged node-for-node |

The graph is identical, so a run of this renders the same picture as a `course-fix` run that needed a
correction round.

## Running it

```bash
archon workflow run course-fix-looptest --branch course-fix/looptest-<n> "Fix issue #<n> ..." --detach
archon workflow test course-fix-looptest
```

Pick a small issue. The point is the loop, not the implementation.
