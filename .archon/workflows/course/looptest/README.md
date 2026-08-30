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

## Measured run — the loop, executing

**`78f77a59` — issue #11 (`SupadataError` has no `.status`) → PR #52, flipped ready. 22m 08s,
13 node records.**

| node | duration | verdict |
|---|---|---|
| record-start | 0.7s | |
| implement | 7m 24s | green |
| gate-work | 0.5s | passed |
| pr | 1m 32s | PR #52, draft |
| **review** | **6m 13s** | **`ready: false`** — no real defect found; withheld on L1 |
| **corrections** | **6m 16s** | one round, converged |
| ↳ fix | 2m 48s | green, pushed as `5038a8e` |
| ↳ gate-fix | 0.25s | passed |
| ↳ recheck | 3m 27s | **`ready: true`** — L1 verified against the code |
| gate-ready | 0.3s | took the loop's verdict, not the initial refusal |
| validate | 25.9s | green |
| flip-ready | 2.6s | PR #52 draft → ready |

What the run proves, each of which was previously fixture-only:

- `corrections` is entered by its `when:` on a real `ready: false`.
- The `fix` agent reads the report and does real work — it added the issue marker and parametrized the
  test, and the suite stayed green.
- `gate-fix` gates the correction's own `green` before a second review is paid for.
- `recheck` runs in a **fresh session** and verifies against the code, not against the fixer's claim.
  Its round-two report reads: *"this fresh session re-verified it against the code rather than against
  the claim."*
- `gate-ready` joins the two mutually exclusive paths and takes the loop's verdict.
- The PR stays **draft** for the whole loop and flips only after the gate.

### What the first run exposed

Round two **overwrote** `review/report.md`, and the run kept only one `nodes/review.md`, so the
finished run could not show what had been corrected — the evidence for the loop was destroyed by the
loop. Both reviewers now also write `review/report-round-N.md`, never edited. That fix came out of
running the loop, not out of reading it.
