---
type: reference
title: "Opsx House Style"
description: "Reference documentation for Opsx House Style."
okf_version: "0.1"
---
# Opsx House Style

Use this reference when authoring or normalizing an OpenSpec change.

## Canonical Phase Order

Use this order in `tasks.md`:

- `## 0. Investigation and Scope Lock`
- `## 1. Contract Coverage (Failing First)`
- `## 2. Implementation`
- `## 3. Verification`
- `## 4. Release Hygiene and Closeout`

Rules:

- `0` always exists
- `1` is mandatory when runtime behavior, contract, persistence, integration, UI behavior, or regression risk changes
- `1` may be omitted only for docs-only, governance-only, or structural changes with no runtime effect
- when `1` is omitted, `proposal.md` must justify the omission explicitly
- `2` contains execution-ready implementation slices only
- `3` proves implementation and reproduced symptom
- `4` contains final changelog, docs, diagrams, sync, and archive readiness

This phase order governs authoring quality. It does not by itself authorize
implementation.

## Change Profiles

Classify each change as one of:

- `runtime-change`
- `docs-or-governance-change`
- `mixed-change`

Profile expectations:

- `runtime-change`
  - phase `1` normally remains mandatory
  - verification must prove the changed behavior directly
- `docs-or-governance-change`
  - phase `1` may be omitted with explicit justification
  - verification should prove contradiction removal, policy alignment, or documentation coherence
- `mixed-change`
  - keep runtime proof strict for runtime slices
  - keep documentation and governance work in final closeout unless earlier clarification is required

## Task ID Rules

Use numeric task IDs only:

- `0.1`
- `1.1`
- `2.1`
- `2.2`
- `3.1`

Do not use mixed numeric and alphabetic identifiers such as:

- `2A`
- `2B`
- `2C`

Use semantic headings for grouping only, for example:

- `### Schema and Persistence`
- `### Backend Service`
- `### API Contract`
- `### Client Integration`
- `### UI Contract`

## Traceability and Notes

Every task must carry:

- `Traceability:`

Completed persisted tasks should also carry:

- `Notes:`

Use them this way:

- `Traceability:` explains why the task exists
- `Notes:` records concise execution evidence or outcome

When task source includes `implementation-sdlc-map.md`, preserve this additive
notation in the same `Traceability:` line:

```text
Traceability: Group G1; Slice S1; Issue 18; Acceptance AC 18.1, AC 18.2.
```

`Group`, `Slice`, and `Issue` identify the handoff. `Acceptance` identifies
criteria by ordinal within the source issue. Use `Scope` instead of
`Acceptance` for investigation or other tasks that do not own an acceptance
criterion.

Do not use diary-style progress logs.
Do not paste long command output into task notes.

## Implementation Slice Heuristics

Prefer more small, well-bounded tasks over fewer broad tasks.

Split tasks when:

- ownership changes
- test type changes
- blast radius becomes unclear
- one seam can be validated without another

Typical seams:

- schema or migration
- repository or persistence
- service orchestration
- API or transport contract
- client integration
- UI rendering or interaction

Avoid both extremes:

- one giant end-to-end implementation task
- micro-fragmentation that creates meaningless ceremony

`implementation-ready slices` describes task quality, not permission to start
implementation.

## Clarification Policy

If repo docs, artifacts, and user intent do not yet form a polished shared
understanding:

- stop before implementation planning
- use `grill-with-docs`
- ask one focused question
- present exactly three alternatives
- recommend one
- wait for the human answer
- record the decision in `proposal.md` or `design.md`

## Implementation-Ready Exit Gate

A spec is `Implementation Ready` only when:

- the scope is locked
- no material ambiguity remains
- the active change profile is explicit
- the required artifacts, including `spec.md`, are created or normalized and
  pass artifact validation
- the canonical phase order is present
- every task has `Traceability:`
- when an implementation SDLC map is used, every mapped implementation issue is
  represented in task traceability and every acceptance identifier resolves to
  its source issue
- phase `1` is present when runtime behavior, contract, persistence, integration, UI behavior, or regression risk changes
- if phase `1` is omitted, `proposal.md` explicitly justifies why fail-first coverage is not required
- implementation tasks are minimal safe slices
- release hygiene work stays in final closeout
- the workflow can stop without assuming implementation starts immediately

This gate ends planning and hands control back to the human. It does not
transition into an implementation workflow.

## Closeout Policy

Keep final documentation and release work in `## 4. Release Hygiene and Closeout`:

- `CHANGELOG.md`
- user docs
- operational docs
- diagrams
- spec sync
- archive readiness

Allow earlier doc edits only when they close a design ambiguity before
implementation begins.
## Execution Order

Numeric order is sufficient for a simple change with one implementation slice
and no real dependency edge. Add this section when there is more than one slice,
a dependency between phases, parallel work, or a wide refactor that could be
misread as numeric order.

Use this shape:

### Slice 1 — <name>
- Tasks: `0.1 -> 1.1 -> 2.1 -> 3.1`
- Checkpoint: <observable proof or evidence>
- Blocks: <another slice or None>

If a slice has an incoming dependency, add only the real edge:

- Blocked by: <existing task IDs or slice names>

Rules:

- Every task ID in the tasks file appears exactly once in this block.
- Every referenced task ID exists.
- Blocked by: appears only for a genuine dependency.
- The dependency graph is acyclic.
- Checkpoints are observable, demoable, or otherwise verifiable.
- Layer headings such as Schema, Backend, and API are grouping only.
- Vertical slices cross the complete relevant path.
- Wide refactors use expand -> migrate -> contract; the contract step is
  blocked by every migration batch.
- OpenSpec remains the sole source of truth; do not mirror the graph into a
  tracker or tickets.md.

Numeric task IDs remain stable after implementation begins. New tasks keep
Traceability: as the canonical line. Historical Footnote: lines remain
compatible and are not migrated automatically.

## Matt Skill Integration

Use grilling / grill-with-docs for one-question clarification, codebase-design
for Module, Interface, Seam, Adapter, Depth, Locality, and Leverage, to-spec for
the highest existing Seam and external-behavior prior art, and to-tickets for
vertical slices, real blockers, and expand-contract. These skills do not publish
tracker work or create parallel OpenSpec artifacts during normal authoring.
