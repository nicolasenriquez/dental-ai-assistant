# Subagent Fan-Out — when a spawned agent's turn may end

> **Five skills fan out today:** `orchestrate-issues`, `piv-investigate-issue`, `piv-slice-epic`,
> `rules-create-global`, `worktree-create`. Each points here with a one-line pointer rather than
> re-deriving the rule. Found by `opportunity-scan` after a real stall: the mechanism to wait correctly
> was never missing — an agent had built two working wait loops and killed both before ending its turn.
> The rule about *when the turn may end* was.

## dispatch mode

Choose deliberately, every time:
- **Blocking** when the next step needs the result.
- **Background** only when there's a real queue of independent work to run alongside it.

## when the turn may end

- **Ending your turn is not waiting.** A spawned subagent's completion is delivered to a running parent.
  An agent that stops to wait is not running, and will wait forever.
- **A status is not a result.** "Still running" is never an acceptable answer to the task you were given.
  Produce the deliverable from your own evidence, and fold in whatever the subagent finds once it lands.
- **Before you background anything, name what you'll be doing while it runs.** If you can't name it,
  block instead.
