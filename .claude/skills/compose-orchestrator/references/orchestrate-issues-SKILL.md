---
name: orchestrate-issues
description: Run the issue pipeline end to end — investigate, implement, PR, review — through background agents, with gates, a cap, and a digest. Send it one issue or several; it runs them in parallel and reports once.
---

# Orchestrate Issues

Send an agent this prompt exactly, where X is the input: run the investigate skill on X.
When the investigation is done, send a new agent: run the implement skill on the artifact.
When the implementation is done, send the SAME agent: now run the pr skill.
When the PR is up, send a NEW agent: run the review skill on it.

Send me one digest when everything is done. Don't narrate while things run.
I might send you more of these — run them in parallel.

## The upgrade pass

- Run stages as background agents; completion comes to you as a notification.
- If a stage is off course, message the SAME agent with a correction — steering beats respawning.
- Before reporting a stage done, check the authority: the PR exists, the checks are green, the artifact
  landed. An agent saying "done" is a claim; a green PR is a fact.
- At every merge or destructive step: if a standing decision covers it, act and record it; if not, send me a
  short digest and wait.
- At most three workstreams in parallel. A stage that stalls twice gets stopped and escalated, not restarted.

## The vessel

For the fix stage you may run ./fix-issue.sh instead.
Before reporting a PR done, wait for its CI check to finish.

## When it goes wrong

If a workstream fails its gate twice or stalls, run the opportunity-scan on that run's artifacts — include
the symptom and what ran — and put its proposals in the digest. Never change the AI layer without my go.
