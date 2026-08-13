---
name: compose-hook-workflow
description: Use only when the user explicitly asks to compose or automate a workflow using Claude Code hooks, such as "build this workflow with hooks" or "use hooks to trigger the next step".
---

# Compose a Hook Workflow

Turn a desired outcome into a safe, observable event-driven workflow using Claude Code hooks. Resolve what each event should own, propose an ASCII event/state concept for approval, then design and implement one event responsibility at a time.

Own the complete composition. Do not invoke `hooks-create`, Anthropic's hook-development skill, or another hook generator to author the result. The point is to help the user decide how the workflow should behave **their way**, then build and prove exactly that behavior.

## What this composition method is

A hook workflow runs because something happened in Claude Code. A lifecycle event is the invoker: a tool is about to run, an agent tries to stop, a task changes state, a file changes, or another currently supported event occurs. A matching handler observes the event and may react, gate a transition, or pass responsibility onward.

Design hook compositions as state transitions, not merely sequences:

```text
WHEN event E happens
IF state S makes it eligible
THEN perform responsibility R
PRODUCE evidence O
SO the next owner can act
```

One hook should own one event-driven outcome. Do not hide an entire orchestration engine inside hook configuration. A baton may pass responsibility to the next stage; it should not run the whole race.

## Choose the executor by the kind of decision

Counter the common bias toward encoding too much semantic judgment as deterministic conditions.

- Recommend a **command handler** for fully specified mechanics, state checks, transformations, and authoritative commands.
- Recommend a **prompt handler** when the event input contains everything needed for a narrow judgment.
- Recommend an **agent handler** when judgment requires inspecting actual files or repository state, while clearly flagging its current stability and production guidance from the live docs.
- Recommend an **HTTP or MCP handler** when an external system already owns the action.
- Recommend a **fresh agent session** when the event hands a substantial semantic responsibility to the next independent stage.
- Recommend a **hybrid** when an agent should perform semantic work and deterministic state or commands should verify, gate, or bound it.

If a condition can only be specified by explaining what “good” means, prefer an agentic decision. If it can be completely decided by a command, predicate, or schema, prefer deterministic code. Use deterministic state around agent work for eligibility, idempotence, evidence, and bounds—not as a brittle substitute for judgment.

Examples:

| Outcome | Recommend | Why |
|---|---|---|
| Format a touched source file | Command | Mechanical transformation on known input |
| Decide whether a proposed command is contextually dangerous | Prompt | Narrow judgment from event input |
| Verify a task is complete against repository state | Agent + deterministic evidence | Requires inspection, with objective checks where available |
| Start implementation when an approved plan lands | Fresh agent session + state guard | Semantic responsibility passes to a new owner |
| Ensure checks pass before completion | Command gate | Exit status is authoritative |
| Notify a shared operations service | HTTP or MCP | The external system owns delivery |

## Get current before designing configuration

Look up the current official Claude Code hook documentation before asking event- or handler-specific questions or writing configuration.

1. Read the current official hooks guide and hooks reference. Restrict configuration claims to official Anthropic documentation and official Anthropic repositories.
2. Discover the current lifecycle events, matcher behavior, handler types and support matrix, configuration scopes, input fields, decision outputs, blocking behavior, async behavior, concurrency rules, security guidance, debugging surfaces, and limits relevant to this composition.
3. Treat live official docs and the installed Claude Code version as authoritative. Do not rely on remembered event names, schemas, exit behavior, handler support, defaults, caps, or experimental status.
4. Briefly name the official sources used and flag anything that could not be verified.

Do not scan the user's repository, hooks, settings, skills, or agents during this step. Inspect existing configuration only after the concept is approved and implementation requires a safe merge, or when the user explicitly asks.

## Interaction contract

- Ask only enough questions to make the next decision.
- Preserve answers already supplied; never re-ask them.
- Lead every material decision with a recommendation and a reason. Then name the meaningful alternative and let the user approve or adjust it.
- Do not present an undecorated menu of events or handler types.
- Separate the **event/state concept** from implementation details.
- Do not write files until the concept and detailed event responsibilities are approved.
- After concept approval, work through one event responsibility and its outgoing handoff at a time.
- Keep a visible decision record and update the ASCII composition as decisions land.

Use this recommendation pattern:

> **Recommendation:** [choice], because [reason specific to this workflow]. [Alternative] is preferable when [condition]. Does that fit, or should we adjust it?

## Phase 1 — Resolve the outcome

Ask a small initial set of plain-language questions. Avoid event names, JSON fields, handler configuration, model names, and file paths at this point.

1. What outcome should happen automatically?
2. What happens immediately before that outcome today?
3. What observable state means the outcome is eligible to happen?
4. What must prevent it from acting?
5. What responsibility comes next, and who or what should own it?
6. Where, if anywhere, must a human decide?
7. **What would you like to be observable during the run, and what should remain available afterward?**

Clarify only gaps that materially change the concept. For observability, help distinguish:

- event matched or ignored;
- guard verdict and the state it read;
- handler or handoff started/completed;
- agent/session or task identity;
- deterministic verdicts;
- attempts, elapsed time, and bounds;
- output or receipt paths;
- actionable failures and human decisions;
- a durable audit record or final digest.

Recommend this baseline unless the workflow calls for something different: expose event, guard verdict, action start/completion, receipts, bounds, and failures; retain only the evidence needed to understand or resume the composition. Avoid full transcripts, raw event payloads, or hidden reasoning as routine observability.

## Phase 2 — Propose the event/state concept

Translate the answers into a recommended event-driven composition. Label nodes as `EVENT`, `GUARD`, `COMMAND`, `PROMPT`, `AGENT`, `HANDOFF`, `RECEIPT`, or `HUMAN GATE`. Show state conditions, no-op paths, meaningful handoffs, and observability, but omit exact event names and schemas until the concept is approved.

Use a compact shape such as:

```text
[EVENT] Investigation artifact becomes available
    observable: event matched
    │
    ▼
[GUARD]
    input exists
    output receipt absent
    no run already in flight
    │
    ├── false ──► no-op (observable: reason)
    │
    └── true
          ▼
[HANDOFF — FRESH AGENT]
    implement from the investigation
    observable: handoff started + session identity
          │
          ▼
[RECEIPT] implementation-report.md
          │
          ▼
[EVENT] Agent attempts to finish
          │
          ▼
[COMMAND GATE] Run trusted checks
    ├── red ──► return evidence to same agent
    └── green ──► allow completion
```

Explain:

- what outcome each event owns;
- why each executor is deterministic or agentic;
- which state makes each action eligible;
- how duplicate firing and recursion terminate;
- what proves each outcome happened;
- who owns the next responsibility;
- what is observable live and durable afterward.

Explicitly call out anywhere deterministic logic would be brittle and an agent is the better fit. Ask the user to approve or iterate on the concept. Do not proceed until the event/state flow is settled.

## Phase 3 — Design one event responsibility at a time

For each event in causal order, resolve its complete contract before moving to the next.

### Event responsibility contract

1. **Owned outcome** — What single result is this event responsible for making true?
2. **Trigger** — What real lifecycle moment should make it eligible?
3. **Scope and matcher** — Which occurrences qualify, using the current official matcher rules?
4. **Input** — Which event fields, files, artifacts, or external state are needed?
5. **Eligibility guard** — What state must be true before acting?
6. **Negative guard** — What state means no-op, already done, unsafe, or not ours?
7. **Executor** — Command, prompt, agent, HTTP, MCP, or fresh agent handoff?
8. **Action** — What exactly happens when eligible?
9. **Context** — Same agent context, fresh context, or no agent context, and why?
10. **Output** — What value, context, state change, or artifact is produced?
11. **Completion evidence** — What proves the owned outcome happened?
12. **Live observability** — What should be visible, to whom, and where?
13. **Durable record** — What must remain afterward, if anything?
14. **Failure behavior** — Block, feed evidence back, retry, alert, no-op, or escalate?
15. **Idempotence** — Why is repeated delivery safe?
16. **Recursion termination** — What prevents the action from triggering itself forever?
17. **Bound** — What limits retries, time, concurrent processes, agent turns, or cost?
18. **Sibling interaction** — What other handlers may match concurrently, and can their side effects conflict?

Recommend the event and handler rather than asking the user to select from the entire current surface. Explain why the recommendation maps to the desired lifecycle moment and judgment type. Verify its exact current capabilities from the live docs.

### State and guard rule

Always ask:

> If this event fired a hundred times, what observable state would make it act exactly when intended—and no more?

Prefer guards based on authoritative external state: input/output artifacts, check verdicts, task state, worktree state, explicit in-flight markers, or an external idempotency key. Do not assume a hook remembers previous firings.

For a baton, normally require:

- an eligible input or approved state;
- absence of the completion receipt;
- an in-flight or equivalent duplicate-start guard when concurrency is possible;
- a deterministic termination condition that also holds when the spawned work triggers the same hook surface.

For a gate, distinguish the semantic work from the evidence. Let agents run focused checks while they work; run the full authoritative command deterministically when the transition must be enforced.

### Handoff contract

When the action transfers responsibility, resolve:

- what crosses the boundary;
- value/context versus durable artifact;
- full input versus focused summary;
- same context versus fresh context;
- what makes the receiving stage chainable;
- what receipt it must leave;
- what part of the transfer is observable;
- which owner handles failure.

Recommend a **value/context injection** for cheap same-session feedback that does not need inspection or recovery. Recommend a **file/artifact** when the transfer crosses processes, supports parallel work, must remain reviewable, provides resumable state, or doubles as completion evidence.

Recommend the **same context** for correction loops that benefit from remembered intent. Recommend a **fresh context** for a new semantic responsibility or independent judgment.

After each approval, show progress:

```text
✓ Event 1: investigation ready
  Owns: start implementation once
  Guard: input exists; receipt and in-flight marker absent
  Action: fresh implementation agent
  Observable: match, guard, session, receipt

→ Event 2: implementation attempts completion [designing now]
○ Event 3: receipt lands
○ Human gate: approve publish
```

## Phase 4 — Review the complete composition

Present the final ASCII event/state flow plus a compact table of event responsibility contracts. Check before writing:

- Every event owns one clear outcome.
- Semantic work has not been forced into brittle deterministic conditions.
- Every action has positive and negative eligibility state.
- Repeated events are safe and recursion terminates by construction.
- Every handoff names its next owner and completion receipt.
- Blocking is used only where the current event supports and requires it.
- Async work is not expected to control an action that has already happened.
- Concurrent matching handlers do not rely on execution order or conflicting side effects.
- Every loop, process, and agent handoff is bounded.
- Observability is useful without leaking secrets or dumping raw payloads.
- Human gates sit at deliberate seams.

Ask for final design approval. If the user changes the design, update the event flow and affected contracts before building.

## Phase 5 — Choose implementation vessels

For each approved command handler, recommend the simplest maintainable vessel and ask for approval:

- Default to a portable `uv` single-file Python script when structured JSON parsing or non-trivial state handling is needed.
- Prefer a short shell command only when it remains genuinely readable and safe.
- Use another language or an existing project runtime when the user prefers it or integration makes it materially simpler.

For an agent handoff, design the complete invocation, permissions, input, context boundary, receipt, and bound. Do not delegate it to another creator skill.

Confirm the configuration scope only now: user, project, local project, plugin, skill, agent, managed policy, or another currently supported scope. Recommend the narrowest scope that matches who should receive the behavior.

## Phase 6 — Build the composition

Inspect the existing target configuration now and merge safely. Preserve all unrelated user hooks and settings.

Implement using the current official event schemas and handler contracts. Create every required handler, guard, state marker, receipt path, agent handoff, and observability output. Keep behavior aligned with the approved ownership contracts.

Do not silently add events, handlers, retries, fallbacks, repository scans, permissions, or side effects. Do not assume handler order. Make sibling guards disjoint where concurrent handlers could conflict. Never write credentials into configuration, prompts, scripts, logs, or artifacts.

## Phase 7 — Prove the composition

Validate at three levels:

1. **Handler:** feed representative current-schema payloads directly into each handler. Verify eligible, ineligible/no-op, success, failure, and malformed-input behavior.
2. **Configuration:** validate JSON/frontmatter, inspect the hook in Claude Code's current hook browser or equivalent, and use the current debug surface to confirm matching and timing.
3. **Composition:** fire the real event cascade safely. Prove the action happens, fire it again to prove idempotence, trigger one deliberate failure, verify the bound, and confirm the expected receipt and observability.

Obtain user approval before a live test that can incur material model cost, contact an external service, or mutate meaningful state. If a complete live run is unsafe or unavailable, validate everything possible and state precisely what remains unverified. Never report the composition as proven from inspection alone.

Always include the security warning: hook handlers execute automatically with the user's environment and credentials. Review them like CI configuration and run only code the user trusts.

## Final report

Return:

- configuration and handler paths;
- the final ASCII event/state composition;
- each event's owned outcome, guard, executor, evidence, and bound;
- what is observable live and what remains durable;
- the official docs and installed Claude Code version used;
- tests performed and their results;
- anything unverified;
- the few guards, commands, or paths the user is most likely to customize;
- the security warning.
