---
name: opsx-spec-workflow
description: Prepare legacy OpenSpec and `opsx-*` changes until their specification is Implementation Ready. Use only when the human explicitly selects the OpenSpec workflow, references `openspec/changes/**`, asks for `/plan source=openspec`, or invokes an `opsx-*` command. This skill never starts implementation.
---

# Opsx Spec Workflow

Use this skill only for repos that still actively use `openspec/` or when the
user explicitly requests the legacy OpenSpec workflow.

Read only what is needed:

- the active change folder under `openspec/changes/<change-name>/`
- `.scratch/<feature-slug>/implementation-sdlc-map.md` when the change was
  prepared from an implementation SDLC map
- `.agents/skills/grilling/SKILL.md`
- `.agents/skills/grill-with-docs/SKILL.md` when a decision must persist
- [references/opsx-command-contract.md](references/opsx-command-contract.md)
- [references/opsx-house-style.md](references/opsx-house-style.md)
- [references/artifact-templates.md](references/artifact-templates.md)
- [references/harness-compatibility.md](references/harness-compatibility.md)
- nearby archived changes only when style calibration is needed

Read the native harness adapter only when needed to resolve command
compatibility or repo-local workflow expectations.

## Core Rule

Treat slash commands as the workflow engine and this skill as the policy,
authoring, normalization, and proposal-readiness layer.

This workflow exists only to close design and produce an implementation-ready
specification. It does not authorize, start, delegate, or recommend
implementation.

Do not replace `/plan` or `/grill-with-docs`. `/execute`, `/opsx-verify`,
`/opsx-sync`, and `/opsx-archive` are outside this skill's scope.

Stop at `Implementation Ready`. Implementation is a separate future workflow
that begins only after an explicit user request outside this skill.

## Activation Gate

Use this skill only when at least one of these is true:

- the user explicitly chooses the OpenSpec workflow for the current plan
- the user references `openspec/changes/**`
- the user asks for `/plan source=openspec`
- the user references `opsx-*` commands
- the user explicitly asks for legacy OpenSpec workflow handling

Do not trigger this skill only because generic artifact names such as
`proposal.md`, `design.md`, `tasks.md`, or `spec.md` appear in the request.

If the user is already asking to implement tasks, state that this skill can
only prepare the specification. Do not start, hand off to, or recommend an
implementation command.

## Operating Sequence

1. Confirm that `openspec/` and `opsx-*` are the right workflow.
2. Resolve the active change name or path.
3. Investigate first, lock the ownership boundary, and identify every material
   gap before authoring the specification.
   When an implementation SDLC map is available, use it to preserve approved
   issue groups, slices, blockers, and retrospective evidence.
4. Classify each material gap. Resolve factual gaps from code, tests, active
   artifacts, repository docs, or authoritative external documentation. For a
   remaining decision gap, run `grilling` through `grill-with-docs`, record
   the answer, and return to investigation. Do not author or declare an
   implementation-ready specification while any material gap remains.
5. Once review confirms no material gaps, create or normalize the complete
   required artifact set, including `spec.md`.
6. Use the canonical phase order from
   [references/opsx-house-style.md](references/opsx-house-style.md).
7. Shape `## 2. Implementation` into implementation-ready slices with
   sequential numeric task IDs only.
8. Validate the completed artifacts and stop cleanly once they are
   `Implementation Ready`.
9. Report the final readiness state with concise ASCII diagrams for the skill
   sequence and the actual slice order.

## Authoring Rules

Keep the active change profile explicit:

- `runtime-change`
- `docs-or-governance-change`
- `mixed-change`

Keep artifacts compatible with local command expectations:

- `proposal.md` must include `## Notes`
- when a map is used, `## Notes` must identify its source map path and group
  identifier
- every checkbox task in `tasks.md` must include an adjacent `Traceability:` line
- when an implementation SDLC map exists, implementation task traceability must
  include `Group`, `Slice`, `Issue`, and applicable `Acceptance` identifiers
- completed tasks should also include an adjacent `Notes:` line
- use sequential numeric task IDs only such as `0.1`, `1.1`, `2.1`, `2.2`
- do not mix numeric task IDs with alphabetic subsection IDs
- use semantic headings for grouping, not for task identifiers

Use [references/opsx-house-style.md](references/opsx-house-style.md) as the
authoring source of truth for phase order, slice heuristics, and exit-gate
quality. Inside `## 2. Implementation`, plan only minimal implementation-ready
slices.

Keep changelog, docs, diagrams, sync, and archive-readiness in
`## 4. Release Hygiene and Closeout` unless they are needed earlier to resolve
an ambiguity.

## Clarification Protocol

Use this protocol only after investigation cannot resolve a material gap from
code, tests, active artifacts, repository docs, or authoritative documentation.
`grill-with-docs` is the persistent wrapper for the `grilling` interview.

1. Stop before implementation planning continues.
2. Use `/grill-with-docs <change-name|proposal-path> source=openspec mode=grill`.
3. Ask one focused decision question only.
4. Present exactly three alternatives.
5. Recommend one option as the safest and most professional default.
6. Wait for the human answer.
7. Record the decision in `proposal.md` or `design.md`.
8. Recheck affected scope, requirements, scenarios, design, and tasks.
9. Continue only after this gap is closed; repeat for each remaining material
   decision gap.

## Workflow States

Use this state machine as the exit contract:

- `blocked`
  - use when ownership, intent, or contract ambiguity still prevents safe planning
  - return one exact next command only
- `in-progress`
  - use when artifacts still need authoring or normalization
  - return one exact next command only
- `implementation-ready`
  - use only when the spec satisfies the exit gate in
    [references/opsx-house-style.md](references/opsx-house-style.md)
  - report `Implementation Ready`
  - stop without a next command or an implementation handoff

Use one exact next command only while the spec is incomplete or blocked:

- `/opsx-new <change-name>` when the change does not exist yet
- `/opsx-continue <change-name>` when the change exists but artifacts are
  partial or stale
- `/grill-with-docs <change-name|proposal-path> source=openspec mode=grill`
  when clarification is required
- `/plan source=openspec <change-name>` when the change is clear enough to
  author artifacts but is not yet `Implementation Ready`

## Validation

When `openspec/` exists, prefer these checks:

- `openspec list --json`
- `openspec status --change "<change-name>" --json`
- `openspec instructions proposal --change "<change-name>" --json` when
  artifact diagnosis is needed
- `openspec validate "<change-name>"`

Always report:

- whether this workflow is appropriate and which artifacts were created,
  refined, or normalized
- what compatibility fixes were applied and whether clarification through
  `grill-with-docs` is required
- whether the spec is blocked, in progress, or `Implementation Ready`
- the exact next command only when the spec is blocked or in progress
- when implementation-ready, that the complete specification was created or
  normalized and implementation remains deferred

When the state is `implementation-ready`, include these two concise ASCII
diagrams in the final report. They must reflect the actual change; do not
invent slices or dependencies.

```text
Skill sequence
[opsx-spec-workflow: investigate] --> [grilling via grill-with-docs: only if
                                       unresolved decision gap]
                                       |
                                       v
                          [opsx-spec-workflow: author + validate]
                                      |
                                      v
                         [Implementation Ready: stop]

Slice order
[Slice 1: <actual name>] --> [Slice 2: <actual name>] --> ...
```

Omit the optional `grill-with-docs` node when it was not used. Derive the
slice diagram from `## Execution Order` and show only genuine dependency
edges; a single slice is shown as one node.

## Stop Conditions

Stop and report a blocker when:

- OpenSpec was requested but `openspec/` does not exist
- the change requires a broader seam than declared
- tasks are too vague to implement safely
- artifact structure conflicts with slash-command expectations
- accounting, export, canon, schema, approval, or workflow behavior would widen
  silently
- human and artifact understanding are still materially misaligned
## Authoring Quality Gates

Before planning slices, Phase 0 must identify the highest existing Seam, its
owning Module and Interface, and the highest test Seam through which callers and
tests can observe the behavior. Prefer an existing Seam; explain why a lower
Seam is necessary when one is proposed.

When runtime, contract, persistence, integration, UI, or regression risk exists,
Phase 1 must name the first failing behavior or contract proof and relevant test
prior art. The proof crosses the chosen Seam and asserts external behavior.

Phase 2 tasks must be vertical, bounded, demoable or verifiable on their own,
and small enough for one fresh context when practical. Use real Blocked by edges
only when a dependency gates work. Use expand -> migrate -> contract for wide
refactors. Add Execution Order when there is more than one slice, a real
dependency between phases, parallel work, or a wide refactor that could be
misread as numeric order. Keep numeric IDs stable, list each task once in that
block, and reject missing IDs or cycles. Layer headings group tasks; they do not
define execution order.

When an implementation SDLC map is present, every mapped implementation issue
must appear in at least one task traceability line. Do not invent issue coverage.
Retrospective issues use existing evidence in adjacent `Notes:` lines instead of
new implementation claims.

Use the selected Matt rules as guidance only:

- grilling via grill-with-docs: close only decision gaps that investigation
  cannot resolve. Ask one question at a time; preserve exactly three
  alternatives and one recommendation. Record resolved decisions in change
  artifacts before resuming authoring.
- codebase-design: use Module, Interface, Seam, Adapter, Depth, Locality, and
  Leverage.
- to-spec: prefer the highest existing Seam, external behavior, and test prior
  art.
- to-tickets: use vertical tracer-bullet slices, genuine blockers, and
  expand-contract.

While an OpenSpec change is active and the user selected the OpenSpec workflow,
the change artifacts are the source of truth for that change. The implementation
SDLC map is input context only. Do not run Matt commands that publish tracker
work or create parallel artifacts during normal Opsx authoring; in particular,
do not invoke to-spec or to-tickets as authoring steps.
