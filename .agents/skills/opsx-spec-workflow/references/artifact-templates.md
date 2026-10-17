---
type: reference
title: "Artifact Templates"
description: "Reference documentation for Artifact Templates."
okf_version: "0.1"
---
# Artifact Templates

Use these as compact defaults. Keep them lean and adapt only when the change is
truly narrower.

## README.md

```md
# <change-slug>

<one-line executive intent>
```

## proposal.md

```md
## Why

<symptom, gap, or business risk>

## Investigation / Current State

- <confirmed fact>
- <confirmed fact>

## What Changes

- <smallest safe change>
- <what stays unchanged>

## Change Profile

- Profile: <runtime-change|docs-or-governance-change|mixed-change>
- Why this profile fits: <one sentence>

## Out Of Scope

- <explicit exclusion>
- <explicit exclusion>

## Impact

- Affects <runtime surface>.
- Affects <tests>.
- Does not affect <other areas>.

## Verification Policy

- Add fail-first coverage at the owning boundary.
- Verify the reproduced symptom directly.
- Do not substitute generic broad-suite proof for contract proof.
- If phase `1` is omitted, justify why runtime fail-first coverage is not required.

## Notes

- Context: <concise context>
- Assumptions: <concise assumptions>
- Boundaries: <concise boundaries>
```

## design.md

```md
## Context

<why this seam is correct>

## Goals / Non-Goals

**Goals**
- <goal>

**Non-Goals**
- <non-goal>

## Boundary and Ownership

### <boundary>
<owner and responsibility>

## Decisions

1. <decision>

   Rationale: <why>

   Alternatives considered:
   - <alternative>
     - Rejected because <reason>

## Blast Radius

### Touched runtime areas
- <area>

### Untouched runtime areas
- <area>

## Verification Strategy

- <proof requirement>
```

## tasks.md

```md
## 0. Investigation and Scope Lock

- [ ] 0.1 Review `<files>` to confirm the ownership boundary.
  Traceability: closes the first investigative gap before implementation planning begins.

## 1. Contract Coverage (Failing First)

- [ ] 1.1 Add a fail-first regression in `<test file>` proving `<contract>`.
  Traceability: this is the first proof of the bug and must fail before production changes.

If phase `1` is intentionally omitted:

- document the justification in `proposal.md`
- keep the omission limited to docs-only, governance-only, or structural non-runtime work

## 2. Implementation

### Schema and Persistence

- [ ] 2.1 Add the minimal schema change required for `<behavior>`.
  Traceability: isolates the data-shape change before widening into service or API logic.

- [ ] 2.2 Update repository persistence behavior for the new shape only.
  Traceability: keeps storage truth changes local to the persistence boundary.

### Backend Service

- [ ] 2.3 Update the service orchestration to use the new persistence behavior.
  Traceability: preserves service ownership without widening into transport concerns.

### API Contract

- [ ] 2.4 Wire the API request/response surface to the service change.
  Traceability: keeps transport adaptation separate from service logic.

### Client Integration

- [ ] 2.5 Update the client data/service layer for the contract change.
  Traceability: isolates client transport adaptation before touching UI rendering.

### UI Contract

- [ ] 2.6 Update the UI rendering and interaction contract only where the changed data is consumed.
  Traceability: keeps reviewer-visible behavior isolated from transport and storage concerns.

## 3. Verification

- [ ] 3.1 Run focused tests for the changed boundaries.
  Traceability: proves the touched seams directly instead of substituting generic suite breadth.

- [ ] 3.2 Re-run the original reproduction path and confirm the symptom is gone.
  Traceability: closes the real failure, not a proxy for it.

## 4. Release Hygiene and Closeout

- [ ] 4.1 Update `CHANGELOG.md` only if the slice is ready to ship.
  Traceability: release traceability belongs after implementation and verification are complete.

- [ ] 4.2 Update docs only where shipped behavior changed.
  Traceability: documentation must reflect implemented and verified behavior, not planning-only intent.

- [ ] 4.3 Run `openspec validate <change-name>`.
  Traceability: final artifact-level proof that proposal, design, tasks, and spec remain aligned.

When tasks are sourced from an implementation SDLC map, keep issue mapping in
the same adjacent `Traceability:` line:

```md
Traceability: Group G1; Slice S1; Issue 18; Acceptance AC 18.1, AC 18.2.
```
```

## docs-or-governance-change task shape

```md
## 0. Investigation and Scope Lock

- [ ] 0.1 Review `<docs, ADRs, diagrams>` to confirm the contradiction or policy gap.
  Traceability: closes the investigative gap before proposing the smallest safe documentation change.

## 2. Implementation

- [ ] 2.1 Update the governing document or ADR at the source-of-truth location.
  Traceability: fixes the authoritative statement before touching derived documentation.

- [ ] 2.2 Update adjacent documentation only where the same rule is repeated.
  Traceability: removes cross-document contradiction without widening the scope.

## 3. Verification

- [ ] 3.1 Re-read the touched artifacts and confirm the guidance is coherent and non-contradictory.
  Traceability: proves the change closed the real policy or documentation gap.

## 4. Release Hygiene and Closeout

- [ ] 4.1 Update `CHANGELOG.md` only if the change is ready to ship.
  Traceability: release traceability still belongs at the end.
```

## spec.md

```md
## ADDED Requirements

### Requirement: <capability outcome>
The system SHALL <behavior>.

#### Scenario: <positive scenario>
- **WHEN** <condition>
- **THEN** <required behavior>

#### Scenario: <guarded scenario>
- **WHEN** <condition>
- **THEN** <boundary-preserving behavior>
```
## Quality-Gated Additions

Add these fields to proposal.md without removing its existing sections:

`## Ownership and Test Seam`

- Highest existing Seam: <where behavior can be observed>
- Owning Module: <Module responsible for the behavior>
- Interface: <what callers and tests must know>
- Highest test Seam: <the seam crossed by the first proof>
- Adapter: <concrete adapter at the Seam, or None>
- Depth / Leverage / Locality: <why this seam is valuable>

`## Prior Art and First Proof`

- Prior art: <similar external-behavior test or artifact>
- First failing behavior or contract proof: <what would fail before the change>
- If no fail-first proof is required: <explicit docs/governance justification>

`## Execution Order Decision`

- Required: <yes|no>
- Why: <dependency, parallelism, slice count, or wide-refactor reason>

Enrich design.md with ownership expressed using Module, Interface, Seam,
Adapter, Depth, Leverage, and Locality; a behavior-first verification strategy;
and the relationship between slices and their real dependencies.

When tasks.md has multiple slices, dependencies, parallel work, or a wide
refactor, add:

`## Execution Order`

### Slice 1 — <name>
- Tasks: `0.1 -> 2.1 -> 3.1`
- Checkpoint: <observable proof or evidence>
- Blocks: None

### Slice 2 — <name>
- Tasks: 2.2 -> 3.2
- Checkpoint: <observable proof or evidence>
- Blocked by: 2.1
- Blocks: <another slice or None>

For a wide refactor, show expand, migrate batches, and contract. Keep each
task's Traceability: line adjacent. Existing historical Footnote: lines are
accepted; new tasks use Traceability:.
