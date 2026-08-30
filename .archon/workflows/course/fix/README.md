# course-fix

The AI Tutor's own issue-to-PR workflow, and the demo subject for course video V33.

An issue goes in one end. A reviewed, ready-for-review pull request comes out the other. Merging is
always a human's.

## Why this exists rather than running the bundled pack

`archon-ship` does the same job and does it well, but it is written to work on a repository it has
never seen. Measured on the AI Tutor (run `95da905c`, issue #17, 2026-08-28) it took **51m 36s** and
flattened to **53 node records**, and 34.6 of those 51 minutes were review: `archon-review` runs four
lenses unconditionally on round one and only `errors`/`docs` are selectable, so nothing about that is
configurable away.

For a video whose claim is *"this graph IS this YAML"*, a 53-node graph and a 110-line router that
delegates the entire lesson to two other files is the wrong artifact. `course-fix` keeps the shape and
loses the generality:

| | archon-ship | course-fix |
|---|---|---|
| Nodes executed, clean run | 53 | 10 |
| Review | 6 specialist lenses + synthesizer | 1 reviewer |
| Routing | triage → investigate / plan / direct | none — the issue is assumed buildable |
| Validation | an agent discovers the project's checks | a script that already knows them |
| Knows this repo | no | yes |

This is the authoring skill's own advice, followed: *"If the user asks for something like archon-ship
but for my repo, write a new workflow in their project's terms, using the pack only as the craft
reference."* Nothing here `include:`s the pack. The prompts under `commands/` were written against the
pack's craft, not composed out of its parts.

## The graph

```
record-start          capture HEAD, so "work happened" is measurable
  → implement         loop, until it declares done  (large)
  → gate-work         green AND the commit moved, or refuse       ← the spend gate
  → pr                open it DRAFT  (medium)
  → review            fresh session, evidence bar, posts to the PR (large)
  → corrections       loop_group, max 2: fix → gate-fix → recheck (a NEW review each round)
  → gate-ready        the join: ready from the first review, or from the last correction
  → validate          the project's real checks, exit code decides
  → flip-ready        gh pr ready
```

Three gates, three kinds, on purpose:

- **`gate-work`** — deterministic. An agent that declines still exits 0, so this checks the two facts
  that matter before anything public happens: the implementer's own `green`, and that HEAD actually
  moved since `record-start`.
- **`review`** — an agent judging against a written evidence bar, its verdict landing in a declared
  boolean the graph can act on. This is the gate you reach for when you do not yet know how to check
  something mechanically.
- **`validate`** — deterministic again, and it can be, because `CLAUDE.md` writes this project's
  checks down. A script that knows `uv run ruff check .` beats an agent rediscovering it every run.

The correction loop re-reviews in a **fresh session** every round: the fixer never grades its own work.
The bound is two rounds. Exhausting it is not an error — the loop ends, `gate-ready` refuses, and the
run fails with the PR still draft and its findings attached. Never an unreviewed final fix.

## Measured runs

Timed from the engine's own node events, on this machine, 2026-08-30.

**`bf1ecc53` — issue #8 (`chunk_video_fallback` off by 60x) → PR #48, flipped ready. 12m 06s.**

| node | duration |
|---|---|
| record-start | 0.8s |
| implement | 4m 22s |
| gate-work | 0.4s |
| pr | 1m 12s |
| review | 5m 52s |
| corrections | *skipped — the first review came back ready* |
| gate-ready | 0.3s |
| validate | 28.1s |
| flip-ready | 3.2s |

**10 node records. 10 artifacts** (`implementation.md`, `review/report.md`, `pr-body.md`,
`validation.md`, the two node transcripts, and a falsification script the reviewer wrote itself), plus
the 203-file `workflow-source` capture every run makes.

**`4f19a3ab` — issue #5 (`parse_youtube_url` captures URL fragments) → PR #49, flipped ready.
15m 12s.** Same shape, same 10 records: implement 5m 55s · pr 1m 4s · review 7m 42s · corrections
skipped · validate 26.3s · flip-ready 2.6s. Run under three-way concurrency, so its agent nodes are
slower than `bf1ecc53`'s; the deterministic nodes are unchanged, which is the point of them.

**`9fa9f9be` — issue #13 (signup 500s on passwords bcrypt cannot hash) → PR #50, flipped ready.
14m 46s.** implement 8m 26s · pr 1m 3s · review 4m 34s · corrections skipped · validate 27.1s ·
flip-ready 2.8s. The longest implement of the three and the shortest review, which is the shape you
want: the reviewer's cost tracks the diff, not the calendar.

**`09fe32d2` — issue #12 (`stream_chat` never emits `[DONE]` on a mid-stream failure) → PR #51,
flipped ready. 25m 28s.** implement 13m 41s · pr 1m 1s · review 10m 5s · corrections skipped ·
validate 37.7s · flip-ready 2.4s. Deliberately the hardest of the four — an SSE error path rather than
a unit bug — and the cost lands where it should: both agent nodes roughly double, every deterministic
node stays put.

**Four for four, every PR flipped ready.** Wallclock 12 / 15 / 15 / 25 minutes; agent nodes carry all
the variance (implement 4m 22s to 13m 41s, review 4m 34s to 10m 5s) while the deterministic nodes are
boringly stable (`gate-work` 0.35-0.46s, `gate-ready` ~0.3s, `validate` 26-38s, `flip-ready`
2.4-3.2s). Three of the four ran under concurrency, so a solo run sits at the fast end.

**`a2ee1fe3` — issue #9 (neighbor expansion discards RRF ranking) → PR #53, flipped ready.
17m 40s.** implement 8m 33s · pr 1m 14s · review 7m 11s · corrections skipped · validate 25.5s ·
flip-ready 2.5s. Picked deliberately as the most design-ambiguous issue in the backlog, to see whether
a reviewer would push back. It did not.

**Five for five on real work, and five clean first reviews.** So `corrections` has never been entered
by a production run. That is a result, not a gap: the implementer must add a regression test and pass
this repo's whole suite before it may claim green, and the reviewer only admits proved defects. Under
those two conditions a well-scoped bug tends to come out right the first time. Do **not** loosen the
reviewer to manufacture a correction round.

**The loop itself is proved, on a real run, by `../looptest/`.** Run `78f77a59` (issue #11 → PR #52)
entered `corrections`, ran `fix` (2m 48s) → `gate-fix` → a fresh `recheck` (3m 27s) that verified the
correction against the code, converged in one round, and flipped the PR ready. Full numbers in that
folder's README. The harness forces only the round-one verdict; every other node in it is real.

Against `archon-ship` on the same repository:Against `archon-ship` on the same repository: **51m 36s and 53 node records**. Four times faster and
five times smaller, doing the same job, because it does not have to work on a repository it has never
seen.

Two things worth noting from that run:

- `validate` took **28 seconds** where the pack's agent-driven equivalent took 135. Knowing the commands
  beats discovering them, and this repo writes them down.
- `pr` runs at `medium`. Writing a PR body from an artifact that already exists is not the hard thinking
  in the graph, and the tier says so.

## Running it

```bash
# From the repo root
archon workflow run course-fix --branch course-fix/issue-8 "Fix issue #8 in this repository: ..." --detach

# Or from the Archon console: project ai-tutor → Start a new run → course-fix (pinned first)
```

One input, `issue`. Empty means the trigger message is the issue.

## Fixtures

```bash
archon workflow test course-fix
```

Five, and three of them are expected-red, because a gate that has never refused anything is decoration:

| Fixture | Proves |
|---|---|
| `clean-review` | the happy path: ready first review, corrections skipped, reaches flip-ready |
| `correction-round` | one round of correction, and that the join takes the loop's verdict over the initial refusal |
| `not-green-refused` | 🔴 `gate-work` refuses a declined implementer (exec-code) |
| `green-substitutes` | 🔴 which branch `gate-work` takes when green is true — the regression test for the bug below |
| `review-never-ready` | 🔴 the bound exhausts, `gate-ready` refuses, the PR stays draft |

## Gotchas found building this

- **A bash node's own `with:` map is never delivered.** `inputEnvVars` in `dag-executor.ts` (line 294)
  guards on `node.runtime !== 'sh'`, so `INPUTS_*` bindings reach `script:` nodes and not `bash:` ones.
  The first real run did the work correctly, committed it, and was then turned away by a gate reading an
  empty string. Gates on bash nodes read fields by **direct substitution** (`$implement.output.green`),
  the way the bundled pack's gates do; `gate-ready` needs `if_skipped` semantics, so it is a `uv` script.
  Note the engine failed closed here, which is the right default and the reason this cost one run rather
  than a bad PR.
- **Exhausting a `loop_group`'s bound is not a node failure.** The group completes carrying its last
  iteration's output; the gate downstream is what refuses. Fixtures should expect the failure at
  `gate-ready`, not at `corrections`.
- **Every run captures `workflow-source/`** — roughly 190 files, ~1.25 MB of Archon's own bundled
  workflows, so the run can resume across an upgrade. It sorts last in the artifacts view, so the real
  output is what you land on, but the file count shown is not the count of things the run made.
- **A UI-started run names its own branch** (`archon/thread-<hash>`). The console's dispatch has no
  branch field; only a CLI launch takes `--branch`.
- **`archon workflow cancel` may not actually kill a detached run.** On Windows it reported
  *"The process with PID … could not be terminated. Reason: The operation attempted is not supported."*
  The parent went away, the agent kept working for a while, then went silent, and the run sat at
  `running` until `archon workflow abandon <full-uuid>` cleared it. Abandon is the reliable exit, and
  a run left in `running` is counted forever — there is no reaper.
