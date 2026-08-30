# course-fix-looptest

**A test harness. Do not run it on work you care about, and do not act on its verdicts.**

`course-fix` refuses to call a change ready until it passes review, and a well-scoped bug usually
passes on the first try. That is the right outcome, but it means the correction loop rarely runs, so
there is nothing to watch.

This is `course-fix` with exactly one difference: **round one always withholds readiness** on a single
declared, satisfiable requirement, so the loop is guaranteed to execute.

Everything else is real work:

- a real implementation of a real issue,
- a real draft pull request,
- a real `fix` agent reading the report and doing the work,
- the real deterministic `gate-fix` on its `green`,
- a real fresh reviewer verifying the correction against the code,
- the real `validate` and `flip-ready` tail.

Only the round-one verdict is forced. Every other node behaves exactly as it does in `course-fix`.

## Why you might run it

To see the shape of a correction round: what the fixer is given, what a fresh reviewer does with the
correction, and how the join picks the loop's verdict over the initial refusal.

Worth knowing: because the reviewer is doing a real review of real code, it sometimes raises genuine
findings alongside the planted one, and the loop corrects those too.

## Running it

```bash
archon workflow run course-fix-looptest --branch looptest/my-issue "Fix the issue where ..." --detach
```

## Fixture

```bash
archon workflow test course-fix-looptest
```

One fixture, `loop-runs`: round one withholds, the loop runs, the recheck passes, and the run reaches
`flip-ready`.
