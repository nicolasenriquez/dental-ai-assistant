# Future tasks

All runtime tasks are unchecked. Artifact preparation does not execute them. Dependencies below gate future slices; no tracker work or parallel agents are authorized.

## 0. Investigation and Scope Lock

- [ ] 0.1 Recheck owned condition HTTP/repository/schema seams, both revision checks, read DTO contract and canonical MODIFIED delta against the execution baseline.
  Traceability: OD01/OD12; R1–R4/R11; S1; D-02/D-03; clinical-workspace-discovery delta.
- [ ] 0.2 Confirm correction editor uses existing dialog/draft guards and explicit confirmation pattern.
  Traceability: OD01; R1; S2; patient-workspace surface brief.
- [ ] 0.3 Confirm status-aware reads/cursors, Activity revision identity and actor fallback without auth/profile expansion.
  Traceability: OD03/OD04; R4–R5/R14; G02/G06/G07; S3.
- [ ] 0.4 Reproduce1280/390 missing visual controls and editor duplication at actual chart width.
  Traceability: OD02/OD07; R6–R7/R13–R15; G02–G08; S4; audit viewport evidence.
- [ ] 0.5 Reproduce disjoint/same-field races and inspect base/local/current recovery boundaries.
  Traceability: OD05; R8; S5; current no-force-overwrite policy.
- [ ] 0.6 Reproduce bare ficha reload and guarded back/forward/patient navigation.
  Traceability: OD08; R9/R15; G01/G08; S6.

## 1. Contract Coverage (Failing First)

- [ ] 1.1 Add HTTP and real-Postgres correction proofs for optional replacement, reason, statuses, rollback, duplicates, same/different-operation races, retry receipt, legacy reads and ownership.
  Traceability: OD01/OD12; R1–R3/R11; S1; test_patient_conditions_contract.py and test_clinical_workspace_live.py prior art.
- [ ] 1.2 Add component tests for correction with/without replacement, no-write cancel, explicit reviewed save,404/409/retry retention, D-03 renewed source review and original/replacement links, exact revision paging/failure, post-save focus, confirmed-write/failed-GET feedback and late-patient response isolation.
  Traceability: OD01; R1/R4/R8/R13; D-03; G03/G09; S2; PatientDiagnosis.test.tsx.
- [ ] 1.3 Add reads/cursor/Activity and component tests for current default, exact historical target, safe actor abbreviation collisions and unchanged revision event IDs, stable concept/status cues and explicit count units with incomplete reads.
  Traceability: OD03/OD04; R4–R5/R14; G02/G06/G07; S3; test_patient_activity.py/test_patient_cursor_transport.py and PatientActivity/History tests.
- [ ] 1.4 Add rendered viewport proofs of every FDI reachable visually,44px targets, keyboard, preserved draft and compact applicable editor; exercise no-hover-mutation, anatomical order and create/edit/resolve post-save state matrix.
  Traceability: OD02/OD07; R6–R7/R13–R15; G02–G08; S4; PatientOdontogram.test.tsx and patient diagnosis E2E.
- [ ] 1.5 Add disjoint-field and same-field conflict tests plus repeated409, failed-current-read and command-specific terminal guards; include correction vs concurrent resolution and already-corrected receipt recovery.
  Traceability: OD05; R3/R8; D-03; S5; PatientDiagnosis.test.tsx and real two-tab E2E.
- [ ] 1.6 Add router/component/E2E proofs for bare/existing clinical query compatibility and detail-path precedence, focused historical UUID, reload, invalid enums/UUID and canceled/accepted dirty navigation.
  Traceability: OD08; R9/R15; G01/G08; S6; PatientDetail and existing patient E2E.

## 2. Implementation

### S1 Correction API and persistence

- [ ] 2.1 Deliver additive correction schema/revision receipt, both expanded revision checks and atomic repository transaction; introduce bounded condition_service entry points and additive endpoint/client/read DTO types, keeping command_snapshot internal and preserving existing commands.
  Traceability: OD01/OD12; R1–R4/R11; S1; design decisions1–3.

### S2 Explicit correction UI

- [ ] 2.2 Deliver correction draft/review/save with required reason and optional replacement; handle error/retry safely and link exact original/result revisions and distinguish confirmed writes from failed refreshes without resending commands.
  Traceability: OD01; R1/R4/R13; G03/G09; S2.
  Blocked by: 2.1.

### S3 Current/history and actor

- [ ] 2.3 Deliver status-aware current/historical UI, owned exact target, correction metadata/Activity mapping and distinguishable actor label/disclosure without new profile fields; retain the catalog/status matrix, grouped records and truthful count units.
  Traceability: OD03/OD04; R4–R5/R14; G02/G06/G07; S3.
  Blocked by: 2.1.

### S4 Spatial selection and compact editor

- [ ] 2.4 Deliver full/quadrant responsive piece controls, preserved FDI/draft, chart/list linking without hover mutation, truthful post-save states and applicable-field editor using existing anatomy/tokens/patterns.
  Traceability: OD02/OD07; R6–R7/R13–R15; G02–G08; S4.

### S5 Deliberate conflict review

- [ ] 2.5 Deliver base/local/current comparison and explicit editable-field decisions; retain current untouched fields, forbid terminal edit/resolve rebase and provide D-03 correction-specific review/new-attempt confirmation against active/resolved sources; repeat recovery after another409.
  Traceability: OD05; R3/R8; D-03; S5.
  Blocked by: 2.1.

### S6 Safe navigation continuity

- [ ] 2.6 Deliver canonical tab/clinical/focused UUID URL state with existing draft guard and deterministic invalid-value fallback.
  Traceability: OD08; R9/R15; G01/G08; S6.

## 3. Verification

- [ ] 3.1 Pass S1 focused HTTP/real DB tests without skipped required live cases, migration legacy fixtures, receipt races/rollback and existing create/edit/resolve invariants using the execution recipe in evidence.md.
  Traceability: R1–R3/R11; S1; proof crosses HTTP and Postgres, not a repository stub only.
- [ ] 3.2 Pass S2 correction component and isolated browser flow, cancel and lost-response retry; compare API/DB/revision receipts.
  Traceability: R1/R4/R13; G03/G09; S2.
- [ ] 3.3 Pass S3 filtered reads/cursors/deep links/actor disclosure and DB Activity reconciliation without duplicate events.
  Traceability: R4–R5/R14; G02/G06/G07; S3.
- [ ] 3.4 Pass S4 all six exact viewports, visual-contract state matrix and desktop Assistant open/closed, every permanent/primary quadrant, keyboard/focus/44px targets and selected FDI after resize.
  Traceability: R6–R7/R13–R15; G02–G08; S4; no page overflow or mandatory duplicate selection.
- [ ] 3.5 Pass S5 real two-tab disjoint/same-field race, correction vs resolution and command-specific terminal/failed-read/repeated409 recovery without lost local or remote fields.
  Traceability: R3/R8; D-03; S5.
- [ ] 3.6 Pass S6 reload/back/forward/dirty-patient-switch and inspect URL for absence of clinical text/name/RUT.
  Traceability: R9/R15; G01/G08; S6.
- [ ] 3.7 Run integrated A–M regression matrix,1/50/51/500fixtures and appropriate full repository validations; record proof limits and clean up only owned environments.
  Traceability: R10/R12–R15; evidence.md; preserves ownership, retry, transaction, active uniqueness, recurrence and privacy.
  Blocked by: 3.1,3.2,3.3,3.4,3.5,3.6.
- [ ] 3.8 Review integrated clinical language/correction vs resolution and manual accessibility; report actual contrast/screen-reader/virtual-keyboard coverage instead of inferring it from source.
  Traceability: R1/R4/R6/R10/R12; no taxonomy or clinical certification claim.
  Blocked by: 3.7.

## 4. Release Hygiene and Closeout

- [ ] 4.1 Update shipped API/product/surface docs and verification skill/manual for correction, actors, views and navigation; note status-aware rollback boundary and retain deferred research/IA roadmap.
  Traceability: OD06/OD09/OD10/OD11/OD13/DP01–DP03; R10/R12; release truth after verification.
- [ ] 4.2 Update changelog when ready and run strict OpenSpec validation/traceability review; prepare sync/archive checklist including replacement of canonical resolve-and-create/read-only wording through the MODIFIED delta, without auto-syncing or archiving.
  Traceability: clinical-workspace-discovery delta; artifact compatibility and skill execution boundary.
- [ ] 4.3 Summarize proof by CODE/BROWSER/API/DB/TEST, unsupported checks, owned cleanup and human readiness; no agent-ready claim.
  Traceability: R10/R12; audit evidence contract.

## Execution Order

### S1 — Correction API and persistence
- Tasks: `0.1 -> 1.1 -> 2.1 -> 3.1`.
- Checkpoint: atomic correction/receipt/ownership proven over HTTP and real Postgres.
- Blocks: S2,S3,S5.

### S2 — Explicit correction UI
- Tasks: `0.2 -> 1.2 -> 2.2 -> 3.2`.
- Blocked by: 3.1.
- Checkpoint: reviewed correction, cancel and retry demonstrated on synthetic patient.
- Blocks: Integrated verification.

### S3 — Current/history and actor
- Tasks: `0.3 -> 1.3 -> 2.3 -> 3.3`.
- Blocked by: 3.1.
- Checkpoint: actual/error history and safe actor visible with unchanged event identity.
- Blocks: Integrated verification.

### S4 — Spatial selection and compact editor
- Tasks: `0.4 -> 1.4 -> 2.4 -> 3.4`.
- Checkpoint: visual selection on all six sizes,44px targets, no reselection/overflow.
- Blocks: Integrated verification.

### S5 — Deliberate conflict review
- Tasks: `0.5 -> 1.5 -> 2.5 -> 3.5`.
- Blocked by: 3.1.
- Checkpoint: two-tab disjoint fields preserved; terminal edit/resolve blocked; correction after resolution explicitly reviewed under D-03.
- Blocks: Integrated verification.

### S6 — Safe navigation continuity
- Tasks: `0.6 -> 1.6 -> 2.6 -> 3.6`.
- Checkpoint: safe URL restores diagnosis and dirty navigation remains guarded.
- Blocks: Integrated verification.

### Integrated verification and closeout
- Tasks: `3.7 -> 3.8 -> 4.1 -> 4.2 -> 4.3`.
- Blocked by: 3.1,3.2,3.3,3.4,3.5,3.6.
- Checkpoint: integrated proof and release documents agree; deferred IA remains explicit.
- Blocks: None.

Independent branches may be scheduled sequentially; these dependency edges do not authorize parallel agents or implementation.
