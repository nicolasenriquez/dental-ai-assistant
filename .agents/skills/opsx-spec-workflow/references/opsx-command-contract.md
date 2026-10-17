---
type: reference
title: "Opsx Command Contract"
description: "Reference documentation for Opsx Command Contract."
okf_version: "0.1"
---
# Opsx Command Contract

Use this reference to keep OpenSpec artifacts compatible with local slash
commands.

## Command Roles

- `/prime source=openspec change=<change-name>`
  - inspect legacy OpenSpec state and recommend the next move
- `/plan source=openspec <change-name>`
  - create or refine artifacts without touching production code
- `/grill-with-docs <change-name|proposal-path> source=openspec mode=grill`
  - resolve ambiguity before implementation planning continues

Implementation, verification of implemented code, synchronization, and
archiving are separate workflows and are not command roles for this skill.

## Required Artifact Compatibility

Use [opsx-house-style.md](opsx-house-style.md) for authoring quality, phase
order, and slice-shaping rules. This file defines command compatibility and
output behavior only.

`proposal.md`

- must include `## Notes`

`tasks.md`

- every checkbox task must include a directly adjacent `Traceability:` line
- completed tasks should also include a directly adjacent `Notes:` line
- task IDs must remain sequential and numeric only
- phase `1` must exist when runtime behavior, contract, persistence, integration, UI behavior, or regression risk changes
- if phase `1` is omitted, `proposal.md` must justify the omission explicitly

`spec.md`

- keep requirement and scenario structure explicit
- avoid redesigning stable contracts unless the change really modifies them

## Execution Boundary

This workflow prepares artifacts for future implementation, not for immediate
execution.

It should:

- normalize artifacts
- close design ambiguities
- shape tasks into implementation-ready slices
- create or normalize the complete specification only after material gaps are
  closed
- validate it and stop at `Implementation Ready`

It should not:

- perform production code changes itself
- substitute for `/execute`
- hand off to or recommend an implementation command
- hide unresolved ambiguity

## Output Contract

Use this contract instead of redistributing the same exit rules across multiple
sections:

- `blocked`
  - return one exact next command
- `in-progress`
  - return one exact next command
- `implementation-ready`
  - report `Implementation Ready`
  - stop cleanly without a next command or implementation handoff
  - include concise ASCII diagrams for the skill sequence and actual slice
    order

## Recommended Next Commands

Use one exact next command only while the spec is incomplete or blocked:

- `/opsx-new <change-name>` when the change does not exist yet
- `/opsx-continue <change-name>` when the change exists but artifacts are partial or stale
- `/grill-with-docs <change-name|proposal-path> source=openspec mode=grill` when ambiguity blocks implementation planning
- `/plan source=openspec <change-name>` when the change is clear enough for artifact authoring but not yet `Implementation Ready`

When the spec is already `Implementation Ready`, do not recommend an automatic
next command or implementation command.
## Quality-Gate Compatibility

Execution Order is required only when the house-style dependency rule applies:
more than one slice, a real dependency between phases, parallel work, or a wide
refactor that could be misread as numeric order. A simple single-slice change
remains compatible without it.

Traceability: remains the canonical line for new or materially edited tasks.
Blocked by: is optional, must point to existing task or slice IDs, and is valid
only for a genuine dependency in an acyclic graph. Historical changes are not
invalidated solely because they lack Execution Order, and historical Footnote:
lines remain compatible.

OpenSpec remains the only source of truth. Normal authoring does not invoke
to-spec or to-tickets to publish tracker work and does not create a parallel
tickets.md.
