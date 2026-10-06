# Specification readiness review

Status: **Implementation Ready at specification level / GO**, score93/100 after G01–G09, the2026-10-06 correction closure and the approved D-04 extensibility refinement below. D-01/D-02/D-03/D-04 are recorded. This is artifact readiness, not runtime delivery; implementation is deferred.

## Subsequent review before closure, 2026-10-05

The authenticated Diagnosis/surface popup and current Assistant were inspected again, without clinical writes. Code confirms per-record persistence in the reviewed DentalPin flow. Source comparison found proposed clinicalView versus established clinical query state, missing explicit post-save state and an incomplete visual/selection contract. Strict OpenSpec validation still passes; validator completion does not resolve these gaps. See reference-gap-review.md for evidence, requirements/slice mapping and source locations. No normative design/spec/task edits were made during that audit; the later closure below updates them.

## Decisions and scope

- D-01 accepted: human flow, separate IA roadmap.
- D-02 explicitly accepted: entered-in-error original, mandatory reason, optional linked atomic replacement.
- D-03 accepted via `proceed`: a correction conflicting with concurrent resolution preserves its proposal and requires source review plus explicit confirmation of a new attempt against current active/resolved revision. Terminal edit/resolve remains forbidden.
- Investigated default: no verified account name exists; stable actual UUID label replaces missing-author text without expanding auth/profile scope.
- Clinical taxonomy, mandatory surfaces, simultaneous mixed view, examinations, procedures/plans and tools are explicit deferrals. No material unresolved decision blocks the requirements actually included.
- D-04 accepted: minimal backend-owned catalog consolidation and additive diagnosis grouping/applicability hints, shared presentation and defensive extension/failure proofs. Only the original twelve Condition codes ship; future families/entities remain deferred.

## Created artifacts and compatibility

README, investigation, proposal, design, top-level spec index, capability delta, tasks, evidence and this readiness review. Existing completed changes were not rewritten. `.openspec.yaml` uses client date2026-10-05; CLI initially supplied host date2026-10-06.

Proposal contains Notes, Capabilities, profile, ownership/test seam and first proof. Runtime phase1 is present. Tasks use canonical phases0–4, sequential numeric IDs, adjacent Traceability and explicit Execution Order. Capability requirements use SHALL and WHEN/THEN scenarios. Top-level spec links to authoritative delta to avoid diverging copies.

## Checks actually performed

- `openspec validate harden-odontogram-human-workflow --strict`: passed.
- `openspec status --change harden-odontogram-human-workflow --json`: proposal/design/specs/tasks all done; this is preparation status.
- Task ledger check:29 unique tasks,29 Execution Order entries, all tasks appear exactly once, all adjacent traceability lines present, phases0–4 present, dependency references resolve and graph is acyclic.
- Zero runtime checkboxes completed; no trailing whitespace in newly created Markdown.
- Manual review: source/replacement atomicity, active duplicate rollback, same-operation/source and cross-source receipt races, expected_revision, terminal states, legacy-data/status-aware rollout boundary, privacy/actor, exact deep link, guarded navigation, responsive targets, clinical/IA exclusions and finding coverage agree across artifacts.
- No runtime tests/browser writes were executed while preparing the spec. Prior audit tests are labeled baseline, not proof that proposed behavior exists.

## Actual dependency order

```text
S1 Correction API --> S2 Correction UI ------------------+
                 --> S3 Reads/actor/catalog --> S4 -------+--> Integrated proof --> Closeout
                 --> S5 Conflict review -----------------+
S6 URL continuity --------------------------------------+
```

All implementation branches remain unchecked. Validation and preparation stop here; no execute, spec sync, archive, commit, push or tool registration was performed.

## Subsequent closure checks

R9 preserves existing clinical URLs. R13–R15 plus visual-contract.md close post-save, selection, visual and reference gaps. Existing29 unchecked tasks retain their IDs and slice gates with expanded traceability. Synthetic Playwright reference:96 cases passed, no page overflow or page errors; visual review prompted mobile editor placement before long records. This does not certify production accessibility or backend behavior. Strict validation, status and ledger checks were repeated after closure.

Working-tree note: unrelated clinical-grounding archive/spec changes were present at final inspection and were left untouched. This preparation edits only this change directory.

## Audit closure, 2026-10-06

The prior unconditional readiness statement omitted a canonical contract conflict and correction-specific recovery. Those blockers are closed in the change artifacts, not in production:

| Audit gap | Closure | Future proof |
|---|---|---|
| Canonical resolve-and-create and resolved read-only contradict new correction | MODIFIED clinical-workspace-discovery delta; proposal lists modified capability; canonical sync remains a separate later workflow | S1/S2 + task4.2 sync checklist |
| Generic terminal conflict handling blocks permitted correction of resolved original | Approved D-03; command-specific matrix in design; R8 review/new-attempt/repeated-conflict scenarios | S2/S5 correction vs resolution, terminal edit/resolve and receipt retry |
| Read metadata and exact revision retrieval underspecified | Named nullable DTO fields/examples; command_snapshot internal; existing owned revision pagination locates receipt UUID and retries failed cursor | S1/S2/S3 old/new DTOs, later replacement edits and target outside first page |
| Correction reference lacked optional replacement/destination and confirmed-write/failed-read composition | Original context, required reason, optional replacement controls and separate new FDI/dentition; confirmed receipt with read-only retry | S2 runtime commands; synthetic reference only during preparation |
| Personal browser path and silently skipped real DB proof | Default Playwright Chromium with optional executable override; cwd-aware disposable migration/live-test recipe; R10 gate rejects skipped required live cases | S1 executed live cases and integrated validation |

Preparation checks actually executed in this closure: strict OpenSpec validation and complete artifact status; synthetic Playwright/Chromium108 cases with zero page errors; git diff whitespace check. A temporary read-only artifact checker also verified29 unique unchecked tasks with adjacent traceability, exact Execution Order coverage, acyclic dependencies, matching canonical requirement name and four parseable JSON examples. The108 cases comprise the prior96 composition cases and12 additional correction fixtures across six sizes. The revised correction screenshots were inspected; reference includes explicit stale-view labeling so prior chart marks cannot imply a confirmed current state. Agent-browser CLI was unavailable; the existing installed Playwright checker provided this synthetic browser evidence.

Task IDs remain the same29 unchecked tasks; traceability and checkpoints were refined for D-03, DTOs and live gates. No required runtime gate is marked complete. Canonical synchronization must apply the MODIFIED requirement as replacement, retaining uniqueness/recurrence scenarios, rather than merely adding the new capability alongside old correction wording.

## Extensibility refinement and final gate, 2026-10-06

Source/spec comparison at Assistant a12812a and local DentalPin fc36a71b found H01–H04: split definition/applicability ownership, no category/extension consumer contract, runtime-vocabulary versus SQL-constraint drift, and catalog-failure/optional-empty-surface ambiguity. No new P0 was established. DentalPin establishes useful organization patterns but does not determine our clinical semantics or transactional safety.

Human chose `A. Catálogo mínimo (Recommended)` after a one-question/three-option clarification. D-04 closes these gaps in design decision9, R16–R17, visual-contract.md and expanded existing S3/S4 tasks. Source findings, weighted scores86→93/100 and capability/taxonomy/readiness matrices are in extensibility-audit.md. No new code, entities, families, family tabs, assets or clinical meaning are authorized by this refinement.

S3 owns the small backend/typed-client catalog and frontend resolver; S4 consumes it after3.3. Six slices and29 task IDs remain. This actual dependency replaces the former independent-S4 assumption everywhere governing current execution. S2 replacement/catalog-failure behavior is checked again during integrated verification. Current code/surface SQL CHECKs remain intact; a future approved vocabulary change requires an additive migration and its own proof.

Checks actually executed after refinement:

- `openspec validate harden-odontogram-human-workflow --strict`: passed.
- `openspec status --change harden-odontogram-human-workflow --json`: all four artifacts done, isComplete true (artifact preparation only).
- Read-only temporary checker executed with `uv run python`:29 unique unchecked tasks,29 exact Execution Order entries, all adjacent traceability present, dependency graph acyclic including S3→S4,17 sequential requirements R1–R17, four parseable JSON examples and changes confined to this directory.
- `git diff --check`: passed. Git reports Windows LF/CRLF normalization notices; no whitespace errors.
- No runtime tests, browser checks, API writes or database proof executed in this pass. Previous108 synthetic cases do not cover the new extension contract. All required production/live/accessibility gates remain future tasks.

**Final gate: GO / Implementation Ready at specification level.** All ten requested readiness claims have explicit requirements and future proof owners in extensibility-audit.md. There is no remaining material clarification for the bounded scope. Clinical validation of future families, whole-chart replay, mixed view and Procedure/appliance/multi-tooth domains remain separate future work; none is falsely represented as a catalog-only extension.
