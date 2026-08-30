# course-fix

Takes one issue in this repository from a description to a reviewed, ready-for-review pull request.

Merging is always a human's.

## Why this repo has its own instead of using the bundled pack

Archon ships `archon-ship`, which does the same job well. It is written to work on a repository it has
never seen, so it opens by working out what kind of problem it has been handed, then reviews the result
through a fan-out of specialist lenses.

`course-fix` keeps that shape and drops the generality, because it only ever runs here:

| | `archon-ship` | `course-fix` |
|---|---|---|
| Routing | works out whether to investigate, plan, or build | none — the issue is assumed buildable |
| Review | several specialist lenses plus a synthesizer | one reviewer |
| Validation | an agent discovers the project's checks | a script that already knows them |
| Knows this repo | no | yes |

The result is roughly a fifth of the nodes and a quarter of the wallclock, doing the same job.

Nothing here `include:`s the pack. The prompts under `commands/` were written against the pack's craft
rather than composed out of its parts, which is the advice the authoring skill gives for exactly this
case: if you want something like the pack but for your own repository, write it in your repository's
terms and keep the pack as the craft reference.

## The graph

```
record-start          capture HEAD, so "work happened" is measurable
  -> implement        loop, until it declares done
  -> gate-work        green AND the commit moved, or refuse       <- the spend gate
  -> pr               open it DRAFT
  -> review           fresh session, evidence bar, posts to the PR
  -> corrections      loop_group, max 2: fix -> gate-fix -> a NEW review each round
  -> gate-ready       the join: ready from the first review, or from the last correction
  -> validate         the project's real checks, exit code decides
  -> flip-ready       mark the PR ready for review
```

## Three gates, three kinds, on purpose

**`gate-work` is deterministic.** An agent that declines to do the work still exits 0, so this checks the
two facts that matter before anything public happens: the implementer's own `green`, and that HEAD
actually moved since `record-start`.

**`review` is an agent judging against a written evidence bar**, with its verdict landing in a declared
boolean the graph can act on. This is the gate you reach for when you cannot yet check something
mechanically.

**`validate` is deterministic again**, and it can be, because this project writes its checks down in
`CLAUDE.md`. A script that knows the commands beats an agent rediscovering them every run.

The correction loop re-reviews in a **fresh session** every round, so the fixer never grades its own
work. The bound is two rounds. Exhausting it is not an error: the loop ends, `gate-ready` refuses, and
the run fails with the PR still draft and the findings attached to it. There is never an unreviewed
final fix.

## Running it

From the Archon console: **project `ai-tutor` -> Start a new run -> `course-fix`**, then describe the
issue in the form field.

Or from the CLI, in the repo root:

```bash
archon workflow run course-fix --branch course-fix/my-issue "Fix the issue where ..." --detach
```

One input, `issue`. Leave it empty and the run's trigger message is the issue.

## Fixtures

```bash
archon workflow test course-fix
```

Five, and three of them expect a refusal, because a gate that has never refused anything is decoration:

| Fixture | Proves |
|---|---|
| `clean-review` | the happy path: ready on the first review, corrections skipped, reaches flip-ready |
| `correction-round` | one round of correction, and that the join takes the loop's verdict over the initial refusal |
| `not-green-refused` | `gate-work` refuses an implementer that declined |
| `green-substitutes` | which branch `gate-work` takes when green is true |
| `review-never-ready` | the bound exhausts, `gate-ready` refuses, and the PR stays draft |

The correction loop is also exercised end to end by `../looptest/`, a harness that forces round one to
withhold readiness so the loop is guaranteed to run.
