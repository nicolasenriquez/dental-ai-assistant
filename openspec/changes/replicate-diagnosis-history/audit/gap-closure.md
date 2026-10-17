# Five-gap closure and planning verdict

Date: 2026-10-17. Current verdict: **Implementation Ready** for specification; implementation remains deferred. Revised planning score: **95/100**. This replaces the prior 78/100 review after the user clarified that the dental records are demo data and asked to remove error-removal semantics with minimal compatibility work.

## Decisions

| Finding | Smallest complete resolution | Normative coverage | Implementation proof |
|---|---|---|---|
| F1: legacy/new receipt ambiguity | Retire all owned correction POST calls with 410, including previous operations. Keep legacy read evidence only. New delete identity uses the existing active command table, exact hash and namespace; no receipt bridge, conversion or reset. | X3,X6; deletion-design.md demo cutover/hash/error rules | 1.5,2.8,3.6,3.8; A15,A20 |
| F2: lock order and capability race | Operation advisory lock before source row lock; reject plan associations without taking plan locks. Existing add-item only creates new planned UUIDs, so no current command can attach an observed deletion target. Hold procedure KEY SHARE before contextual note writes. | X3,X5; deletion-design.md procedure/note protocol | 1.5,2.7,2.5,3.6; A21 |
| F3: impossible green checkpoints | Move backend retirement into 1.5/2.8/3.6; keep 1.6/2.6 UI-only. Make complete History UI (3.2) a prerequisite of the deletion browser slice containing 3.7. Validate prerequisite reachability and a missing-edge regression. | Task execution graph; X6,H4,D1 | audit/validate_plan.py,3.7,3.8; A24 |
| F4: selected-day changes incomplete | Add optional day to the existing event GET. Separate selected-day cursor/total, strict scope/epoch binding and empty/failed/unloaded states; no unrelated-page scan or extra endpoint. | H2,H3,H5; history-read-contract.md | 1.1,2.1,3.1,3.2; A22 |
| F5: snapshot/count ambiguity | Publish one state table. Planned History marks are chart eligible and counted. Exclude tombstones from snapshot items, count them separately, retain deletion events. Supply synthetic count/response examples. | H5,X4; history-read-contract.md | 1.1,2.1,3.1; A23 |

Keeping old demo rows readable is smaller and safer than resetting the live database or relabelling its history. The old correction API is intentionally incompatible. All active command types keep their existing receipt serialization; the new delete hash is versioned explicitly. No bridge is needed for retired operation bodies.

## Reconciled reach

- Callers: PatientDetail, Diagnosis saved editors/after-create actions, useDentalWorkspace, procedure note composer/context reads, Activity, new History reader and typed api.ts clients. History never mounts commands.
- Backend: existing condition/treatment resource routers/services/repos, clinical note parent guards and exact/read DTOs; new two-endpoint History route/domain/repo; one forward deletion migration plus temporal indexes after the actual current head.
- Tests/fixtures: replace active correction-command assertions with owned 410; retain synthetic legacy revision read fixtures; add exact hash/lock/constraint tests, date/count response fixtures, routed/browser tests and real scratch Postgres proof.
- Configuration/exports: mount only the History router in main.py, keep new commands on existing resource routers, extend Playwright workspace test matching and public TypeScript types. No dependency, environment variable, state library, provider or reset command is added.
- Risk boundary: patient ownership, auth and history remain enforced. Demo permission does not authorize wiping unrelated auth/chat/Drive data or using demo cutover on clinical production records. An unexpected real-data/live-client baseline stops task 0.2 for a new decision.

## Source evidence behind F2

Repository search found one plan-item INSERT in patient_clinical_plans_repo._author(add_item), which calls treatments._insert(..., planned=True) before insertion and therefore allocates its own UUID. No incumbent SQL changes item.treatment_id to attach an observed existing UUID. The new protocol reads associations under the source row lock, applies the declared error precedence and never waits for a plan lock. The existing plan-first writer order remains unchanged. New public attach-existing behavior is out of scope and must not bypass this invariant.

Procedure note creation currently uses FOR KEY SHARE for reference existence. The plan extends that existing lock to tombstone checks and edit/delete context, so deletion cannot pass a note write through a stale eligibility check. It does not add a patient-wide mutex or modify plan commands.

## Current score

| Dimension | Earned / maximum |
|---|---:|
| Scope and product behavior | 19/20 |
| API/projection contracts | 19/20 |
| Integrity and compatibility | 19/20 |
| UX/modals/motion | 14/15 |
| Executable dependency plan | 15/15 |
| Verification and traceability | 9/10 |
| Total | 95/100 |

The score is a planning judgment, not a probability of successful deployment. No material product/integrity/integration choice remains within this declared scope. Private helper names and code decomposition remain ordinary implementation decisions. Future tests and runtime proof must still pass; this review does not claim they already do.

## Validation and limits

Run `openspec validate replicate-diagnosis-history --strict` and the bundled audit/validate_plan.py. The latter checks 26 task IDs, 27 requirement entries, all links, consolidated-spec parity, semantic prerequisites, a regression that removes the History prerequisite and synthetic state/count examples. No target app, migration, destructive reset or browser clinical command was run during gap closure. Existing reference screenshots were not reclassified as fresh target evidence.

Historical review and recovery files remain provenance, not competing requirements. Current authority is proposal/design, deletion-design, history-read-contract, five capability deltas and tasks. Main specs are neither synchronized nor archived here.
