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

**`53817b6e` — issue #15 (`?limit=0` silently syncs everything) → PR #54, flipped ready. 27m 09s,
13 node records.** implement 6m 47s · gate-work 0.45s · pr 1m 21s · **review 5m 30s `ready: false`** ·
**corrections 12m 04s** (fix 6m 15s → gate-fix 0.32s → recheck 5m 48s `ready: true`) · gate-ready
0.36s · validate 28.9s · flip-ready 2.9s.

**This is the run to keep.** Round one did not only raise the harness's synthetic L1 — it found a real
**Critical** defect, `C1`, in the first implementation:

> Switching the parameter default from the literal `None` to a `Query(...)` marker object changed the
> value seen by *direct Python callers* of the handler. `routes/admin.py:288` calls the handler as a
> plain function with no arguments, so `limit` binds to the `fastapi.params.Query` instance itself,
> every `limit is not None` check is `True` on the path that means "full channel", and the slice raises
> `TypeError`.

So the loop corrected a genuine regression that would have broken the admin "Sync channel" button, not
just the planted requirement. Round two verified both findings and — unprompted — wrote
`review/probe/reinject_c1.py`, a pytest plugin that re-injects the C1 mechanism at collection time
without touching a project file, to prove the new test actually fails against the pre-fix behaviour.
That probe is in the run's artifacts.

Both rounds are on disk as `review/report-round-1.md` and `report-round-2.md`, which is the fix the
first run's gap earned.

### What the first run exposed

Two things, both about evidence rather than behaviour, and both found only by running it.

**1. Round two overwrote round one's report.** `review/report.md` is canonical and the continuation
reviewer rewrites it, so the finished run could not show what had been corrected. Round one's *declared
output* did survive in `nodes/review.md` — its findings summary is intact and names L1 with the
`file:line` — but the full report was gone. Both reviewers now also write `review/report-round-N.md`,
never edited.

**2. Nodes inside a `loop_group` leave no node artifacts.** This run wrote `nodes/implement.md` and
`nodes/review.md` and nothing for `fix`, `gate-fix` or `recheck`. Their outputs exist in the run's
event log and in the database, but not on disk beside the others. That is the engine's behaviour, not
something this workflow chose, and it is worth knowing: *judge the run by its artifacts* is weakest at
exactly the point where the correction happened. The round-N reports are the fix for that too — they
are written by the reviewer into `review/`, so a correction round now leaves a durable record whatever
the engine does with node artifacts.
