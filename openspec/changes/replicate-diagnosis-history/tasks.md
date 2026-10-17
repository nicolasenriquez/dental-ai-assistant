## 0. Investigation and Scope Lock

- [x] 0.1 Compare the source audit with PRODUCT/DESIGN/current dental specs, patient navigation, chart/notes owners and revision storage; identify existing caller and test Seams.
  Traceability: H1–H6, D1–D4; avoids rebuilding the existing diagnosis feature or silently reviving retired plans.
  Notes: Recorded ownership, source gaps, compatibility decisions and read/test boundaries in proposal.md and design.md; no application changes or runtime proof in this planning request.

- [ ] 0.2 At implementation start, reconcile relevant PatientDetail/shared-file edits from the active refine-clinical-assistant-ux change, confirm current migration head and capture source/build/runtime provenance of the isolated target.
  Traceability: D1, D4; protects incumbent shared navigation and prevents verification against an unrelated served build.

## 1. Contract Coverage (Failing First)

- [ ] 1.1 Add HTTP and scratch-Postgres contract cases for owned temporal history/snapshots, date boundaries, legacy corrections and new deletion events, scope counts, missing revisions, stale epochs and no GET side effects.
  Traceability: H1–H3, H5–H6; first red proof crosses the registered API; real Postgres proves snapshot ranking and coherent reads. Use test_patient_conditions_contract.py/test_patient_treatments.py and the opt-in live-test harness as prior art; patch the new pool import site in conftest.

- [ ] 1.2 Add routed PatientDetail/PatientDentalHistory tests for a historical deep link, refresh/back, date selection, zero write controls/requests, partial chart pages and cross-patient late responses.
  Traceability: H2–H5, D1; current routing has no History mode, which is the first failing external UI behavior.

- [ ] 1.3 Add Diagnosis journey cases for grouped accordion state, truthful complete/filtered counts, contextual note entry and one preserved rail/Sheet draft; retain existing direct-application regressions.
  Traceability: D2–D3; new summary/note interactions fail first while already-satisfied chart/catalog/write contracts remain regression coverage rather than fabricated failures.

- [ ] 1.4 Add overlay/style/browser cases for source-target timing, reduced motion, suspended nested traps, connected-trigger focus restoration and stable leaving-record identity.
  Traceability: D4; assert externally visible input/focus/state, not duplicated implementation details; baseline currently-missing entrance/exit behavior before changes.

- [ ] 1.5 Add deletion HTTP/live-Postgres red proofs for exact saved-ID scope, ownership, atomic tombstone/revision/receipt, stale/racing/replayed commands, active-key uniqueness, linked notes and as-of deletion semantics.
  Traceability: X1-X5, H1-H6; covers the new write contract before changes; prove no new entered_in_error transition.

- [ ] 1.6 Add routed/browser red proofs for Eliminar in the saved record modal, dirty-draft cancel/confirm, member scope, loss-of-response recovery and focus; add legacy new-operation 410 versus committed receipt replay tests.
  Traceability: X1-X6, D1-D4; correction UI/API retirement is intentional, not an unnoticed regression.

## 2. Implementation

### Slice 1: owned historical reads

- [ ] 2.1 Implement the dental-history route/domain/repository and additive temporal-index migration; register the authenticated router, expose typed api.ts reads, and satisfy 1.1 through real-DB as-of and epoch/cursor tests.
  Traceability: H1–H3, H5–H6; design.md sections 3–4 define schema, date/epoch semantics, exact counts, ownership and rollback; no new snapshot store or command behavior.

### Slice 2: read-only History journey

- [ ] 2.2 Add usePatientDentalHistory, PatientDentalHistory and DentalHistoryTimeline; wire guarded Historial routes, inspect-only shared chart/details, date changes, exact revisions, paginated events and complete/stale/error states; satisfy 1.2 without mounting command hooks.
  Traceability: H2–H5, D1; design.md sections 1 and 5 define route, state and read-only contract; preserve Evoluciones and legacy plan evidence links.

### Slice 3: Diagnosis summary and contextual notes

- [ ] 2.3 Adapt the existing grouped records area to an accessible accordion and context note entries; reuse the palette/chart/editors/one notes owner, preserve current filters, catalog IDs, historical corrections and operation receipts, and satisfy 1.3.
  Traceability: D2–D3; design.md sections 2, 5 and 6; finding notes remain patient/tooth scoped, procedure notes remain record scoped; no new note schema, upload or recall domain.

### Slice 4: overlay and motion integration

- [ ] 2.4 Implement scoped dental overlay entrance/exit and measured control feedback, stable leaving identity, one active focus trap, reduced-motion overrides and responsive notes/action access across both readers; satisfy 1.4.
  Traceability: D4, H4; design.md sections 6–8; use existing tokens/primitives, avoid global timing/theme changes and decorative historical previews.

### Additional slices: deletion persistence, UI and compatibility

- [ ] 2.5 Implement finding/procedure delete commands through existing resource owners with expected revision, stable operation/receipt hash, transactional lock/recheck and deleted revision; expose typed clients and pass 1.5.
  Traceability: X1-X5; deletion-design.md defines exact request/receipt/errors and note/Activity/history implications; no physical delete or inferred clinical error.

- [ ] 2.6 Add the visible Eliminar action to eligible saved-record editors and one draft-safe confirmation; wire exact-ID deletion, busy/uncertain/read-failure recovery, current refresh/counts and focus, then pass UI cases in 1.6.
  Traceability: X1-X5, D4; no deletion on creation/History/protected procedures; preserve unrelated tooth records and linked notes.

- [ ] 2.7 Expand deletion-aware DTO/read/write guards and paired deletion metadata/revision actions in a forward migration; update active uniqueness, source-read completeness, exact tombstones, Activity/notes context and history compatibility before enabling delete writers.
  Traceability: X4-X5, H6; deletion-design.md expand-first and rollback-floor contract; legacy snapshots remain untouched.

- [ ] 2.8 After replacement UI proof, retire active recording-error/replacement wizard and error-based undo callers; return 410 for new legacy correction operations while retaining exact committed receipt replay and historical reads.
  Traceability: X6; do not alias correction to deletion, relabel historical data or remove legacy enums/references.

## 3. Verification

- [ ] 3.1 Run the new API and real-Postgres history contract tests; inspect query plans on seeded volume and prove unchanged records/revisions/receipts after GETs, including an inter-page late-commit case.
  Traceability: H1–H3, H5–H6; validates the storage/HTTP Seam rather than relying on stubbed SQL calls.

- [ ] 3.2 Run routed History tests and extend the Playwright workspace project with patient-dental-history.spec.ts; verify reload/back/forward, loaded dates, day-boundary labels and inspection with a mutation-request trap.
  Traceability: H2–H5, D1; mocked browser evidence must remain labelled mocked; preserve current-link and evolution regressions.

- [ ] 3.3 Run Diagnosis/catalog/odontogram/notes/exit regression suites and affected browser specs; confirm unique counts, retained variants, direct and surface application, draft/context continuity, retries and legacy correction history.
  Traceability: D2–D3; reuse PatientDiagnosis.*, PatientOdontogram, useDentalClinicalNotes and diagnosis-detail/patient-diagnosis prior art.

- [ ] 3.4 Verify both modes at 390/768/1440px, available-width rail transition, expanded/collapsed shell, keyboard/Tab/Escape, reduced motion, 150/200ms style values, overlay focus and 200% zoom; inspect saved non-sensitive captures.
  Traceability: D4; record an explicit unverified gate if real native zoom/mobile cannot run, rather than equating viewport resize to hardware proof.

- [ ] 3.5 Run a disposable authenticated UI/HTTP/Postgres create/edit/delete/reload/as-of journey with synthetic records, then the full backend/frontend validation suite and production build; retain scoped proof and clean up only owned test data/runtime.
  Traceability: H1–H6, D1–D4; distinguishes real-system persistence from fixtures and closes combined regression risk before release.

- [ ] 3.6 Prove deletion schema/current-read/command behavior in scratch Postgres and HTTP, including duplicates/races, lost response, old-create replay, linked notes, owner checks and rollback-reader compatibility.
  Traceability: X1-X5; no mocked DB substitute for atomicity, no cascading audit/note loss and no resurrection through old readers.

- [ ] 3.7 Exercise exact tooth-to-modal-to-Eliminar with synthetic Caries and a multi-member procedure; cancel dirty edits, confirm, reload and check other marks, counts, notes, Activity and earlier/current History. Capture visual evidence of actual target behavior.
  Traceability: X1-X5, H1-H5, D4; reference captures only prove the reference; target deletion is an unexecuted release gate until this task passes.

- [ ] 3.8 Verify zero live UI callers create new recording-error removals, new legacy requests get 410, exact committed receipts reconcile, mismatched replay fails and legacy error/replacement history remains readable.
  Traceability: X6; compatibility contract and explicit active-client behavior change must pass before release.

## 4. Release Hygiene and Closeout

- [ ] 4.1 Update PRODUCT.md, patient-workspace brief, API/user docs and CHANGELOG.md only for shipped verified behavior; retain source audit as historical evidence and put History-specific design decisions in its brief.
  Traceability: H1–H6, D1–D4; documentation must describe the delivered boundaries, limitations and exact navigation without reviving unsupported domains.

- [ ] 4.2 Regenerate the consolidated spec.md reading copy, validate OpenSpec and task/requirement/dependency links, and prepare sync/archive readiness evidence without automatically synchronizing or archiving.
  Traceability: All requirements; closeout of the implemented change is separate from this planning request and does not authorize another workflow.

## Execution Order

### Shared investigation checkpoint
- Tasks: `0.1 -> 0.2`
- Checkpoint: source, current owners, latest deletion decision, active shared changes and build/runtime provenance reconciled.
- Blocks: all new contract coverage.

### Slice 1: deletion-aware persistence and commands
- Tasks: `1.5 -> 2.7 -> 2.5 -> 3.6`
- Blocked by: 0.2.
- Checkpoint: deletion-aware reads precede writes; one authorized deletion commits one tombstone/revision/receipt with safe related data.
- Blocks: Slice 2, Slice 5.

### Slice 2: owned historical reads
- Tasks: `1.1 -> 2.1 -> 3.1`
- Blocked by: 3.6.
- Checkpoint: exact as-of snapshots include historical deletion boundaries, coherent counts/epochs and no GET side effects.
- Blocks: Slice 3.

### Slice 3: read-only History journey
- Tasks: `1.2 -> 2.2 -> 3.2`
- Blocked by: 3.1.
- Checkpoint: reloadable historical chart and exact revision inspection with matching dates and no write callbacks.
- Blocks: Slice 6.

### Slice 4: Diagnosis summary and contextual notes
- Tasks: `1.3 -> 2.3 -> 3.3`
- Blocked by: 0.2.
- Checkpoint: grouped records and one scoped notes draft survive filtering and layout changes.
- Blocks: Slice 5.

### Slice 5: modal deletion and recording-error retirement
- Tasks: `1.6 -> 2.6 -> 3.7 -> 2.8 -> 3.8`
- Blocked by: 3.6, 3.3.
- Checkpoint: saved-modal deletion works end to end, then active legacy mutation paths retire with committed-receipt compatibility.
- Blocks: Slice 6.

### Slice 6: overlay and motion integration
- Tasks: `1.4 -> 2.4 -> 3.4`
- Blocked by: 3.2, 3.8.
- Checkpoint: pointer/keyboard/overlay/motion and available-width acceptance across both modes.
- Blocks: integrated release verification.

### Integrated release verification and closeout
- Tasks: `3.5 -> 4.1 -> 4.2`
- Blocked by: 3.4.
- Checkpoint: disposable real-system journey, full regression gates and shipped docs; sync/archive remains separate.
- Blocks: None.

Numeric task IDs are stable; 2.7 intentionally precedes 2.5 in the dependency graph. This order does not authorize implementation or delegation. The summary slice is independent of the temporal API; shared-file ownership still requires coordination.
