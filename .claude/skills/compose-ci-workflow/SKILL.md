---
name: compose-ci-workflow
description: Use only when the user explicitly asks to build an agentic CI workflow that runs a coding agent in GitHub Actions, such as "run this skill from GitHub Actions", "automate this with Claude in CI", or the same request aimed at Codex, Gemini CLI, or another agent, or invoke /compose-ci-workflow.
---

# Compose an Agentic CI Workflow

Turn a repository event into a safe, observable coding-agent workflow running in GitHub Actions. Resolve the purpose and trust boundary first, propose an ASCII concept for approval, then design one responsibility and handoff at a time before writing and proving the workflow.

## What this composition method is

An agentic CI workflow runs a coding agent on GitHub-hosted or self-hosted runners because a repository event, manual dispatch, upstream workflow, or schedule occurred. GitHub Actions owns invocation, trust decisions, preparation, routing, mechanical checks, bounds, and authority. The agent owns semantic work that benefits from interpretation or judgment.

Design the composition as a repository event crossing a trust boundary:

```text
WHEN repository event E occurs
IF actor, ref, and state are eligible
THEN prepare trusted inputs and invoke capability C
PRODUCE evidence O
SO deterministic CI or a human can decide what happens next
```

The user has already selected CI as the invoker by invoking this skill. Do not compare it against a headless script, SDK program, hooks, or an orchestrator unless the user asks. Do not turn the opening into a method-selection exercise.

## Agents provide meaning; CI retains authority

Counter the common bias toward encoding semantic judgment as a growing set of deterministic conditions. Also resist the opposite failure: letting an agent claim authority that belongs to CI or a human.

- Recommend an **agent** for review, investigation, interpretation, classification, synthesis, adaptation, or repair.
- Recommend **deterministic CI** for actor/ref eligibility, schema validation, exit status, tests, deployment rules, branch protection, secret handling, timeouts, concurrency, and routing known states.
- Recommend a **hybrid** when an agent makes a semantic judgment and CI validates its output or decides the consequential next action.
- Recommend a **human gate** for decisions whose risk, ambiguity, or organizational ownership should not be delegated yet.

If a responsibility can only be specified by explaining what "good" means, prefer an agent. If a property can be completely decided by a command, predicate, or schema, use deterministic CI. An agent conclusion is evidence; it is not automatically permission to merge, deploy, expose a secret, or retry indefinitely.

Examples:

| Responsibility | Recommend | Why |
|---|---|---|
| Review a pull request for subtle logic flaws | Agent | Open-ended semantic judgment |
| Decide whether a failed test is plausibly flaky | Agent → structured output | Semantic classification must cross into CI |
| Run the authoritative test suite | Deterministic | Exit status is the contract |
| Retry once after a high-confidence flaky verdict | Hybrid | Agent classifies; CI enforces the threshold and bound |
| Decide whether to deploy to production | Deterministic gate or human | Consequential authority should not rest on prose |
| Summarize yesterday's repository activity | Agent | Requires selection and synthesis |

## Resolve the target agent

The GitHub trust, permission, event, artifact, timeout, and authority design is portable. The agent invocation, installation, authentication, output contract, and any vendor-provided safety behavior are not.

1. If the user named an agent, use it without asking again.
2. Otherwise prefer the agent currently running only when it has a documented unattended CI path for the target repository.
3. If more than one agent is genuinely plausible, recommend one and ask once with the available structured question tool. Fall back to prose only when no such tool exists. This is the first thing the user sees from this skill, so if a structured question tool is available, use it rather than a prose paragraph.
4. If the chosen agent has no supported unattended action or non-interactive CLI, say so instead of inventing an integration.

Record the choice before researching configuration. Do not carry action inputs, secret names, auth modes, output fields, or safety guarantees across vendors. Do not build a generic multi-vendor wrapper unless portability itself is an approved requirement.

## Get current before designing configuration

Look up current official documentation before asking action-, event-, authentication-, or YAML-specific questions or writing the workflow.

1. Read the chosen agent's current official CI or GitHub Actions guide and the official documentation for the action or non-interactive CLI that will invoke it. Read the relevant vendor security guidance before recommending a PR-triggered design.
2. Read the current official GitHub Actions documentation for every selected event and security-sensitive feature, especially workflow permissions, secrets, OIDC, untrusted input, checkout behavior, artifacts, job outputs, concurrency, timeouts, environments, and protected approvals.
3. Verify the current action or CLI version, inputs, outputs, setup path, authentication methods, structured-output support, skill invocation, model and tool configuration, permission behavior, actor checks, trusted-configuration behavior, and observability relevant to this workflow.
4. Treat the chosen vendor's current official documentation and GitHub's as authoritative. Do not rely on remembered action inputs, model names, event payload fields, runner versions, checkout behavior, authentication options, defaults, or billing.
5. Briefly name the official sources used and flag anything that could not be verified.

Do not scan the user's repository, workflows, skills, agents, secrets, or settings during this step. If the user wants to reuse an existing skill or workflow, ask them to name it or provide its path. Offer to inspect or list candidates only when asked. Inspect the target repository after concept approval when implementation requires it.

## Interaction contract

- Ask only enough questions to make the next decision.
- Preserve answers already supplied; never re-ask them.
- Lead every material decision with a recommendation and a reason, then name the meaningful alternative.
- **Use the available structured question tool for every decision that forks the design** — in Claude Code that is `AskUserQuestion`. Put the recommendation first and the meaningful alternative second, each with a one-line consequence; let the tool supply "other". Fall back to prose only when no such tool exists.
- Keep open-ended discovery questions in prose; do not invent options that narrow the user's answer.
- Do not present an undecorated menu of events, auth methods, permissions, or action inputs. Options are good; bare labels are not — a choice is decidable only when each option carries what it costs you.
- Separate the **outcome and trust concept** from implementation details.
- Do not write files until the concept and detailed responsibilities are approved.
- After concept approval, work through one responsibility and its outgoing handoff at a time.
- Keep a visible decision record and update the ASCII flow as decisions land.

Render a forking decision as a structured-question call by default; prose is the fallback, not the template:

- **First option** = the recommendation, with the reason specific to this workflow as its description.
- **Second option** = the meaningful alternative, with the condition that would make it preferable as its description.
- Add further options only if genuinely live. Let the tool supply "other" — never write one.

Only when no structured question tool exists, fall back to prose:

> **Recommendation:** [choice], because [reason specific to this workflow]. [Alternative] is preferable when [condition]. Does that fit, or should we adjust it?

## Phase 1 — Resolve the why and trust boundary

Ask a small initial set of plain-language questions. Avoid action inputs, YAML, model names, tool lists, checkout depth, authentication details, and exact permissions at this point.

1. What should happen without anyone at a keyboard, and why is CI the right place for it?
2. What happens manually today, and what should exist when the run finishes?
3. What event should wake it up?
4. Who or what can cause that event: maintainers, bots, external contributors, forks, another workflow, or a schedule?
5. Where does semantic judgment happen, and which objective failures must still be caught?
6. What may the run change, and what must still require deterministic proof or human approval?
7. Should the agent use an existing skill, a new reusable skill, or a narrow workflow-specific prompt?
8. **What would you like to be observable during the run, and what should remain available afterward?**

Clarify only gaps that materially change the concept. For observability, help distinguish:

- triggering actor, event, and input revision;
- eligibility decision and skip reason;
- deterministic preflight and verification results;
- capability invoked and stage status;
- sanitized semantic result or structured fields;
- artifacts, comments, checks, branches, and commits produced;
- attempts, elapsed time, token/cost information when available, and bounds;
- the exact human decision still required;
- actionable failures and resumable evidence.

Recommend a concise **run receipt** by default:

```text
trigger + actor
trust/eligibility decision
input revision
agent capability invoked
deterministic checks run
structured result or artifact
side effects produced
human decision required
```

Avoid full transcripts, raw event payloads, hidden reasoning, or full tool output as routine observability. Treat logs as a potential disclosure surface.

## Phase 2 — Propose the concept

Translate the answers into a recommended conceptual flow. Label nodes as `EVENT`, `TRUST GATE`, `PREP`, `AGENT`, `CODE`, `EVIDENCE`, `AUTHORITY GATE`, or `HUMAN GATE`. Show trust transitions, no-op paths, meaningful handoffs, authority, and requested observability. Omit exact event syntax and action inputs until the concept is approved.

Use a compact shape such as:

```text
[EVENT] Pull request changes
    observable: actor + PR + input revision
    │
    ▼
[TRUST GATE — CODE]
    actor/ref eligible; permissions bounded
    │
    ├── no ──► skip with reason
    │
    └── yes
          ▼
[PREP — CODE] Select trusted instructions + review input
    observable: exact revisions and inputs
          │
          ▼
[AGENT] Review for semantic defects
    observable: status + sanitized summary
          │ structured review result
          ▼
[EVIDENCE — CODE] Validate schema and store receipt
          │
          ▼
[AUTHORITY GATE — CODE]
    ├── objective checks red ──► required check fails
    ├── blocker found ─────────► request human review
    └── clear ─────────────────► publish review receipt
```

Explain:

- why CI is the right invoker;
- who controls each input and whether it is trusted;
- why each responsibility is agentic, deterministic, or human-held;
- what evidence crosses each handoff;
- which component has authority over each side effect;
- what is observable live and durable afterward;
- how duplicate runs, stale commits, loops, and concurrent events are bounded.

Explicitly call out where deterministic logic would be brittle and an agent is the better fit. Also call out where an agent recommendation must not become authority. Ask the user to approve or iterate on the concept — with the structured question tool, not a prose paragraph. Do not proceed until the conceptual flow is settled.

## Phase 3 — Design one responsibility at a time

Every responsibility and handoff decision below is a fork in the design, not an open question — render it with the structured question tool.

Resolve each responsibility in causal order. Start with the event and trust boundary, not with the step that invokes the agent.

### Responsibility contract

1. **Goal** — What single problem does this responsibility solve?
2. **Input** — Which event fields, refs, files, artifacts, comments, or upstream outputs does it receive?
3. **Input owner** — Who can control each input, and is it trusted, untrusted, or derived?
4. **Executor** — GitHub expression, command, agent skill/prompt, or human?
5. **Classification** — Agentic, deterministic, hybrid, or human-held, and why?
6. **Context** — Which checkout, instructions, repository state, prior job output, and external data are available?
7. **Model** — Which currently supported model fits the judgment required?
8. **Tools** — What is the least capability needed?
9. **Output** — What exact value, structured result, artifact, comment, check, commit, or branch is produced?
10. **Completion evidence** — What proves the responsibility completed?
11. **Authority** — May this step only advise, or may it mutate, block, retry, publish, merge, or deploy?
12. **Live observability** — What should be visible, to whom, and where?
13. **Durable record** — What should remain after the run?
14. **Failure behavior** — Skip, fail, retry, request input, upload evidence, or escalate?
15. **Bounds** — Turns, time, retries, concurrency, helper calls, token/minute cost, or stale-run cancellation?

Lead with a recommendation for every executor, model, tool, authority, observability, and bound. Do not ask the user to choose from the entire current action surface.

### Event and eligibility contract

For the first responsibility, resolve:

- which event represents the real business seam;
- which event actions qualify;
- which actors, bots, forks, branches, paths, labels, schedules, or upstream conclusions qualify;
- what prevents duplicate or stale work;
- what happens when the event is ineligible;
- whether the triggering payload and checked-out code come from the same trust level.

Recommend the narrowest trigger that captures the desired seam. Do not make every push a paid agent run when a more specific event or path filter expresses the intent.

Always ask:

> If an untrusted contributor, external app, or stale commit caused this event tomorrow, what would run, against which code, with which credentials and permissions?

### Agent capability contract

When the agent owns a responsibility, decide whether to invoke an existing skill, author a separate reusable skill, or use an inline prompt:

- Recommend an **existing skill** when it already owns the behavior and has suitable permissions.
- Recommend a **new skill** when the behavior should be reused, evaluated, or improved independently of this workflow.
- Recommend an **inline prompt** for a narrow, workflow-specific judgment unlikely to be reused.

Ask the user for the skill name or path. Inspect it only when supplied or when the user asks for discovery. Verify that its tool grants and assumptions are safe for unattended CI; do not assume a locally useful skill is safe on untrusted repository input.

### Handoff and evidence contract

After each responsibility, resolve:

- what crosses the boundary;
- whether the next consumer is an agent, deterministic step, another job, another workflow, or a human;
- whether the handoff is a step output, structured output, environment value, file, artifact, comment, check, commit, or branch;
- whether the consumer needs the full evidence or a focused summary;
- which schema or deterministic condition validates it;
- what part is visible and what must remain private;
- what happens when the handoff is missing, malformed, stale, or uncertain.

Prefer a current schema-validated **structured output** when later CI expressions or commands must consume an agent judgment. Prefer a **file or artifact** when evidence is large, crosses jobs, must be inspected, or should survive the run. Prefer a **comment or check** for human-facing status, not as the sole machine contract. Prefer a **commit or branch** only when mutation is an approved outcome.

Never route directly from free-form prose to a consequential action when a schema, deterministic check, protected environment, or human gate can make the boundary explicit.

After each approval, show progress:

```text
✓ Trigger: pull request opened or updated
✓ Trust gate: trusted actor/ref policy; stale runs cancelled
✓ Prep: base instructions + selected PR evidence

→ Agent review capability [designing now]
○ Structured evidence contract
○ Authority and side effects
○ Observability and bounds
○ Authentication and permissions
```

## Phase 4 — Design security, authentication, and authority

Resolve exact security configuration only after the functional composition is approved.

### Trust and checkout rules

- Distinguish who controls the event text, workflow definition, agent configuration, checked-out source, build scripts, package metadata, tool configuration, artifacts, and external responses.
- Treat prompt sanitization as mitigation, not proof that untrusted input is safe.
- Do not check out untrusted code into a privileged workspace and execute it with secrets. Treat `pull_request_target`, `workflow_run`, downloaded artifacts, fork heads, self-hosted runners, and executable project configuration as security-sensitive designs requiring current official guidance.
- Prefer a vendor's full action over lower-level variants when its documented actor checks and trusted-configuration restoration are needed. When the chosen agent has no such action, design those checks explicitly before invocation.
- Remember that restoring trusted agent configuration does not make PR-controlled package scripts, lockfiles, build files, or runtime configuration trusted.

### Authentication recommendation

Ask whether the workflow is personal or organizational and which current provider path applies. Verify the chosen vendor's live options before recommending one.

- For an organization, recommend current short-lived workload identity federation through GitHub OIDC when the chosen vendor supports it, because it avoids a stored static credential.
- For a personal repository, recommend a currently supported personal OAuth/subscription path when it fits the user's account and official guidance.
- Use an API key or another current official provider path when organizational ownership, billing, residency, or platform requirements make it preferable.
- Store required static credentials only in GitHub secrets. Never write them into YAML, prompts, logs, outputs, caches, or artifacts.

### Least authority

Design three independent permission layers:

1. GitHub workflow/job `permissions` and protected environments.
2. The agent's tools, settings, MCP servers, and skill grants.
3. Deterministic authority gates controlling mutation, retry, merge, release, or deploy.

Recommend read-only operation first. Add write permissions only for approved side effects. Keep bot and non-write-user access denied unless the concept explicitly requires it and the risk is accepted. Use explicit allowlists rather than wildcards.

Bound every unattended run with an appropriate subset of turn limits, workflow timeout, concurrency policy, stale-run cancellation, retry cap, script-call cap, budget alert, and environment approval.

Make advisory authority executable, not merely descriptive. Give an advisory agent step a shorter timeout than its containing job and handle its failure so it cannot override the deterministic result, while still recording the missing or failed evidence. Let the agent fail the job only when blocking authority was explicitly approved.

## Phase 5 — Review the complete design

Present the final ASCII flow plus a compact table of responsibility contracts. Check before writing:

- CI is the right invoker for the desired event or schedule.
- Every input has an identified owner and trust level.
- Semantic work has not been forced into brittle deterministic rules.
- Agent conclusions cross through explicit evidence contracts.
- Deterministic CI or a human retains consequential authority.
- Trusted instructions do not accidentally execute untrusted project configuration with secrets.
- Every permission exists for an approved reason and at the narrowest useful scope.
- Every loop, retry, write, and concurrent run is bounded.
- Observability is sufficient without exposing secrets, raw prompts, or full tool output.
- Failures leave actionable evidence and do not silently pass.
- Human gates sit at deliberate seams.

Ask for final design approval with the structured question tool. If the user changes the design, update the flow and affected contracts before building.

## Phase 6 — Build the workflow

Confirm the repository and output path, then inspect existing workflows and relevant named skills/configuration. Preserve unrelated jobs, permissions, secrets references, and user changes. Create or safely edit the approved file under `.github/workflows/`.

Implement using syntax verified from current official documentation. Keep the workflow focused on:

- the approved trigger and eligibility policy;
- explicit permissions and authentication;
- trusted preparation and checkout behavior;
- the approved skill or prompt;
- least-privilege tools and current model configuration;
- structured outputs or artifacts for handoffs;
- deterministic validation and authority gates;
- sanitized summaries and run receipts;
- timeouts, concurrency, retries, and stale-run behavior;
- deliberate side effects and human approvals.

Pin third-party actions according to the user's security policy and current GitHub guidance. Do not silently add triggers, actors, permissions, secrets, providers, tools, retries, fallbacks, repository scans, or mutations that were not approved.

## Phase 7 — Prove the workflow

Validate progressively:

1. Parse the YAML and run the repository's current workflow linter or an appropriate current validator.
2. Check action versions, input names, event fields, expressions, permissions, secret references, output names, and schema syntax against current official docs.
3. Exercise deterministic scripts and expressions with representative trusted, ineligible, malformed, stale, and failure inputs.
4. Review the workflow as an attacker: untrusted actor, bot, fork, PR-controlled code/config, poisoned artifact, prompt injection, duplicate event, and concurrent run.
5. Trigger the smallest safe real event with user approval when it can consume model quota, Actions minutes, use credentials, publish comments, create commits, or mutate meaningful state.
6. Verify success, ineligible/no-op, deliberate failure, bound enforcement, structured handoff, side effects, human gate, and requested observability.
7. Inspect logs, comments, outputs, and artifacts for credential leakage and unnecessary transcript or tool output.

If a real run is unsafe or unavailable, validate everything possible locally and state precisely what remains unverified. Never report the workflow as proven from inspection alone.

## Final report

Return:

- the workflow and supporting file paths;
- the final ASCII composition;
- the event, input-owner, trust, executor, evidence, authority, and bound decisions;
- what is observable live and what remains durable;
- the authentication and permission design without revealing secret values;
- the chosen agent and the official vendor and GitHub documentation used;
- validation and live tests performed with results;
- anything unverified;
- the few triggers, permissions, bounds, or output fields the user is most likely to customize;
- a concise security warning appropriate to the selected event and runner.
