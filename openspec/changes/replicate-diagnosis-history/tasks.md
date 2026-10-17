## 0. Investigation and Scope Lock

- [x] 0.1 Compare the source audit with PRODUCT/DESIGN/current dental specs, patient navigation, chart/notes owners and revision storage; identify existing caller and test Seams.
  Traceability: H1–H6, D1–D4, X1–X6; avoids rebuilding the existing diagnosis feature or silently reviving retired plans.
  Notes: Recorded ownership, source gaps, demo cutover, five-gap closure, lock/read contracts and test boundaries in proposal/design, deletion-design.md, history-read-contract.md and audit/gap-closure.md; no application changes or runtime proof in this planning request.

- [x] 0.2 At implementation start, reconcile relevant PatientDetail/shared-file edits from the active refine-clinical-assistant-ux change, confirm current migration head and capture source/build/runtime provenance of the isolated target. Confirm the user-declared dental demo scope; keep the running DB, use fresh isolated scratch fixtures for verification and plan a coordinated stop-old-writers/reload cutover. If real clinical data or live-client continuity is found, stop for a scope decision rather than reset it.
  Traceability: D1, D4; protects incumbent shared navigation and prevents verification against an unrelated served build.
  Notes: RECONCILIATION PASSED. SOURCE: HEAD `b07d853` (`docs(openspec): add replicate-diagnosis-history change`) on `feat/ai-assisted-evolutions`; the change tree is uncommitted because the planning pass at 10:49–10:56 on 2026-10-17 realigned `deletion-design.md`, `design.md`, `proposal.md`, `readiness.md`, `spec.md`, the five capability deltas, `audit/validate_plan.py` and `tasks.md` to the user-confirmed demo cutover and added `history-read-contract.md`, `audit/gap-closure.md` and `audit/history-examples.json`. SHARED-FILE RECONCILIATION (`refine-clinical-assistant-ux`, active; 45/45 delivery tasks checked, only 6.1–6.3 verification open with no source edits planned): since its C0 baseline `9286bd8`, the patient/dental/shared set changed only in `globals.css`, `ui/Button.tsx` (`clinicalDanger`), `patterns/EmptyState.tsx` (headingLevel 3), `lib/api.ts` (additive pending/discard clients), `patients/PatientOverview.tsx` (inline `ClinicalPendingWork`), `patients/PatientClinicalPlanHistory.tsx`, `components/PatientWorkspace.tsx` (evolution ordinals, `dc5c3d3`), `lib/clinicalDate.test.ts`, `PatientDetail.test.tsx`, clinical assistant/clinical components and backend clinical/discard routes plus migrations 0031/0032; `PatientDetail.tsx`, `PatientDiagnosis.tsx`, `PatientOdontogram.tsx`, `useDentalWorkspace`, `useDentalClinicalNotes`, `tests/conftest.py`, `main.py`, `playwright.config.ts` and `lib/clinicalDate.ts` are untouched, so the design's owners, route/query semantics and test seams hold — verified at HEAD that `?tab=clinical&clinical=history` still falls back to `diagnosis` and `history` is dropped when leaving clinical (`PatientDetail.tsx` ~142–185), and the `clinicalDanger`/`.clinical-danger-button` primitive Eliminar needs already exists. MIGRATION HEAD: single head `0032` (`0032_enable_pgvector.py`, down_revision `0031`) across 32 revisions; live dev DB `dynachat` at `alembic_version=0032`; `patient_clinical_commands` PK `(owner_user_id, operation_id)` matches the declared delete namespace. PROVENANCE: host `app/frontend/dist` (2026-10-17 00:46) `index-B6Y-aalG.js` sha256 `2a9a6e5c…`, `index-vbso2iR6.js` `b3014529…`, `index-CAXXT5uW.css` `15e34403…` is stale (predates `3ca0b76`); served `dynachat-app-blue` image `sha256:cd051b492218501b10f101632873caae1715f054f8f96ce961dcd3d7bcdc142d` built 2026-10-14T13:59:28Z (container started 13:59:41Z; `http://localhost:8000/api/health` 200, `video_count 10`, `chunk_count 28`) with assets `assets/index--lKm3Ugh.js` sha256 `12dec1cbb8704e8b175674ba09b4d2b2f3e2c32f8d774a80325afd025fda39b7` and `assets/index-ChxlocZM.css` `ae7276c88015308577442ab6a073079e3ba7e08c597cbb37ca447f665fb9a9b0`; the bundle contains PENDING-001 strings and the `dc5c3d3` ordinals but not `3ca0b76` Login strings (`hl=es`, Drive guidance), so the runtime matches the 2026-10-14 source — current for all dental/patient code and behind HEAD only by the unrelated Login commit; it still ships `Corregir registro`/`Deshacer registro`/`entered_in_error` callers, which the declared coordinated stop-old-writers/reload cutover retires. DEMO-SCOPE CHECK (read-only counts, no reset): `dynachat` holds 3 patients (2026-09-14→10-06), 7 conditions over 2 patients (3 entered_in_error), 18 condition revisions (7 created, 6 edited, 3 corrected, 2 resolved), 3 treatments, 1 dental note, 6 clinical commands (latest 2026-10-13) and 2 users — the developer's synthetic data with no evidence of real clinical data or a live-client continuity requirement, so the stop condition is not triggered and the running DB stays untouched. Validation: `openspec validate replicate-diagnosis-history --strict` valid; `audit/validate_plan.py` passes 26 tasks / 27 requirements, acyclic graph, semantic prerequisites, missing-history regression detection and contract examples. No application change, write, commit or spec sync performed.

## 1. Contract Coverage (Failing First)

- [ ] 1.1 Add HTTP and scratch-Postgres contract cases for owned temporal history/snapshots, date boundaries, legacy correction reads and new deletion events, day-filtered pagination outside loaded timeline pages, the state/count table, missing revisions, stale epochs and no GET side effects.
  Traceability: H1–H3, H5–H6; first red proof crosses the registered API; real Postgres proves snapshot ranking and coherent reads. Use test_patient_conditions_contract.py/test_patient_treatments.py and the opt-in live-test harness as prior art; patch the new pool import site in conftest.

- [ ] 1.2 Add routed PatientDetail/PatientDentalHistory tests for a historical deep link, refresh/back, date selection, zero write controls/requests, partial chart pages and cross-patient late responses.
  Traceability: H2–H5, D1; current routing has no History mode, which is the first failing external UI behavior.

- [ ] 1.3 Add Diagnosis journey cases for grouped accordion state, truthful complete/filtered counts, contextual note entry and one preserved rail/Sheet draft; retain existing direct-application regressions.
  Traceability: D2–D3; new summary/note interactions fail first while already-satisfied chart/catalog/write contracts remain regression coverage rather than fabricated failures.

- [ ] 1.4 Add overlay/style/browser cases for source-target timing, reduced motion, suspended nested traps, connected-trigger focus restoration and stable leaving-record identity.
  Traceability: D4; assert externally visible input/focus/state, not duplicated implementation details; baseline currently-missing entrance/exit behavior before changes.

- [ ] 1.5 Add deletion HTTP/live-Postgres red proofs for exact saved-ID scope, ownership, atomic tombstone/revision/receipt, stale/racing/replayed commands, active-key uniqueness, linked-note parent locks, plan-associated rejection without plan locks, add-item-new-UUID invariant and as-of deletion semantics. Include retirement stub 401/404/410/422 tests for prior/new/mismatched correction calls, without replay.
  Traceability: X1-X5, H1-H6; covers the new write contract before changes; prove no new entered_in_error transition.

- [ ] 1.6 Add routed/browser red proofs for Eliminar in the saved record modal, dirty-draft cancel/confirm, member scope, loss-of-response recovery and focus; assert zero active Registrar por error/replacement/error-undo callers. Backend retirement tests belong to 1.5 and do not gate this UI checkpoint.
  Traceability: X1-X6, D1-D4; correction UI/API retirement is intentional, not an unnoticed regression.

## 2. Implementation

### Historical read API

- [ ] 2.1 Implement the dental-history route/domain/repository and additive temporal-index migration; register the authenticated router, expose typed api.ts reads, and satisfy 1.1 through real-DB as-of and epoch/cursor tests.
  Traceability: H1–H3, H5–H6; design.md sections 3–4 define schema, date/epoch semantics, exact counts, ownership and rollback; no new snapshot store or command behavior.

### Read-only History journey

- [ ] 2.2 Add usePatientDentalHistory, PatientDentalHistory and DentalHistoryTimeline; wire guarded Historial routes, inspect-only shared chart/details, date changes, exact revisions, paginated events and complete/stale/error states; satisfy 1.2 without mounting command hooks.
  Traceability: H2–H5, D1; design.md sections 1 and 5 define route, state and read-only contract; preserve Evoluciones and legacy plan evidence links.

### Diagnosis summary and contextual notes

- [ ] 2.3 Adapt the existing grouped records area to an accessible accordion and context note entries; reuse the palette/chart/editors/one notes owner, preserve current filters, catalog IDs, historical corrections and operation receipts, and satisfy 1.3.
  Traceability: D2–D3; design.md sections 2, 5 and 6; finding notes remain patient/tooth scoped, procedure notes remain record scoped; no new note schema, upload or recall domain.

### Overlay and motion integration

- [ ] 2.4 Implement scoped dental overlay entrance/exit and measured control feedback, stable leaving identity, one active focus trap, reduced-motion overrides and responsive notes/action access across both readers; satisfy 1.4.
  Traceability: D4, H4; design.md sections 6–8; use existing tokens/primitives, avoid global timing/theme changes and decorative historical previews.

### Deletion persistence, UI and backend retirement

- [ ] 2.5 Implement finding/procedure delete commands through existing resource owners with expected revision, stable operation/receipt hash, transactional lock/recheck and deleted revision; expose typed clients and pass 1.5.
  Traceability: X1-X5; deletion-design.md defines exact request/receipt/errors and note/Activity/history implications; no physical delete or inferred clinical error.

- [ ] 2.6 Add the visible Eliminar action to eligible saved-record editors and one draft-safe confirmation; wire exact-ID deletion, busy/uncertain/read-failure recovery, current refresh/counts and focus; remove active recording-error/replacement/error-undo callers and pass all UI cases in 1.6. The backend 410 behavior is already green from 2.8/3.6.
  Traceability: X1-X5, D4; no deletion on creation/History/protected procedures; preserve unrelated tooth records and linked notes.

- [ ] 2.7 Expand deletion-aware DTO/read/write guards and paired deletion metadata/revision actions in a forward migration; extend the condition revision>1 check and DTO/action unions, keep legacy correction metadata null for deleted revisions and retain active receipt storage only in patient_clinical_commands; update active uniqueness, source-read completeness, exact tombstones, Activity/notes context and history compatibility before enabling delete writers.
  Traceability: X4-X5, H6; deletion-design.md expand-first and rollback-floor contract; legacy snapshots remain untouched.

- [ ] 2.8 Retire both legacy correction POST endpoints as authenticated/path/owner-checked 410 stubs without correction-body parsing, operation lookup or receipt replay; update their HTTP/service tests and remove unreferenced mutation helpers while retaining history reads. Prove the retirement subset of 1.5 before enabling delete writers.
  Traceability: X6; user-confirmed demo cutover removes command compatibility work; keep old read data/enums/references and never alias correction to delete. UI caller retirement is owned by 2.6.

## 3. Verification

- [ ] 3.1 Run the new API and real-Postgres history contract tests; inspect query plans on the 10,000-revision dataset and the timed request gate in history-read-contract.md and prove unchanged records/revisions/receipts after GETs, including an inter-page late-commit case.
  Traceability: H1–H3, H5–H6; validates the storage/HTTP Seam rather than relying on stubbed SQL calls.

- [ ] 3.2 Run routed History tests and extend the Playwright workspace project with patient-dental-history.spec.ts; verify reload/back/forward, loaded dates, day-boundary labels and inspection with a mutation-request trap.
  Traceability: H2–H5, D1; mocked browser evidence must remain labelled mocked; preserve current-link and evolution regressions.

- [ ] 3.3 Run Diagnosis/catalog/odontogram/notes/exit regression suites and affected browser specs; confirm unique counts, retained variants, direct and surface application, draft/context continuity, retries and legacy correction history.
  Traceability: D2–D3; reuse PatientDiagnosis.*, PatientOdontogram, useDentalClinicalNotes and diagnosis-detail/patient-diagnosis prior art.

- [ ] 3.4 Verify both modes at 390/768/1440px, available-width rail transition, expanded/collapsed shell, keyboard/Tab/Escape, reduced motion, 150/200ms style values, overlay focus and 200% zoom; inspect saved non-sensitive captures.
  Traceability: D4; record an explicit unverified gate if real native zoom/mobile cannot run, rather than equating viewport resize to hardware proof.

- [ ] 3.5 Run a disposable authenticated UI/HTTP/Postgres create/edit/delete/reload/as-of journey with synthetic records, then the full backend/frontend validation suite and production build; retain scoped proof and clean up only owned test data/runtime.
  Traceability: H1–H6, D1–D4, X1–X6; distinguishes real-system persistence from fixtures and closes combined regression risk before release.

- [ ] 3.6 Prove deletion schema/current-read/command behavior in scratch Postgres and HTTP: canonical hash and active-store cross-command collisions, old revision-store namespace independence, all correction POST calls 410 without replay, no-plan-lock rejection, distinct new planned UUID, note-versus-delete locking, duplicates/races, lost response, old-create replay, ownership and rollback-reader compatibility.
  Traceability: X1-X5; no mocked DB substitute for atomicity, no cascading audit/note loss and no resurrection through old readers.

- [ ] 3.7 Exercise exact tooth-to-modal-to-Eliminar with synthetic Caries and a multi-member procedure; cancel dirty edits, confirm, reload and check other marks, counts, notes, Activity and earlier/current History. Capture visual evidence of actual target behavior.
  Traceability: X1-X5, H1-H5, D4; reference captures only prove the reference; target deletion is an unexecuted release gate until this task passes.

- [ ] 3.8 Verify zero live UI callers create new recording-error removals, all owned correction POST calls get 410 regardless of prior/mismatched operation, no correction receipt replays, active delete receipts retain exact replay/mismatch behavior, and legacy error/replacement read history remains unchanged.
  Traceability: X6; compatibility contract and explicit active-client behavior change must pass before release.

## 4. Release Hygiene and Closeout

- [ ] 4.1 Update PRODUCT.md, patient-workspace brief, API/user docs and CHANGELOG.md only for shipped verified behavior; retain source audit as historical evidence and put History-specific design decisions in its brief.
  Traceability: H1–H6, D1–D4, X1–X6; documentation must describe the delivered boundaries, limitations and exact navigation without reviving unsupported domains.

- [ ] 4.2 Regenerate the consolidated spec.md reading copy, validate OpenSpec and task/requirement/dependency links, and prepare sync/archive readiness evidence without automatically synchronizing or archiving.
  Traceability: All requirements; closeout of the implemented change is separate from this planning request and does not authorize another workflow.

## Execution Order

### Shared investigation checkpoint
- Tasks: `0.1 -> 0.2`
- Checkpoint: ownership, demo scope, current head/shared files, isolated runtime and no-reset/coordinated-cutover plan identified.
- Blocks: all new contract coverage.

### Slice 1: deletion persistence and backend retirement
- Tasks: `1.5 -> 2.7 -> 2.8 -> 2.5 -> 3.6`
- Blocked by: 0.2.
- Checkpoint: deletion-aware readers/schema and retired correction POST contracts precede delete writers; canonical receipt/lock/notes contracts pass real-DB/HTTP proof.
- Blocks: Slice 2, Slice 5.

### Slice 2: historical and selected-day reads
- Tasks: `1.1 -> 2.1 -> 3.1`
- Blocked by: 3.6.
- Checkpoint: both owned read APIs implement exact dates/day pages, epochs, state/count table, coverage and bounded volume gate.
- Blocks: Slice 3.

### Slice 3: read-only History journey
- Tasks: `1.2 -> 2.2 -> 3.2`
- Blocked by: 3.1.
- Checkpoint: date deep links outside loaded timeline pages render a complete chart and separately paginated day events; no mutations.
- Blocks: Slice 5, Slice 6.

### Slice 4: Diagnosis summary and contextual notes
- Tasks: `1.3 -> 2.3 -> 3.3`
- Blocked by: 0.2.
- Checkpoint: grouped records and one context-bound draft survive filtering/layout changes and deleted procedure context stays read-only.
- Blocks: Slice 5.

### Slice 5: deletion UI and complete integrated journey
- Tasks: `1.6 -> 2.6 -> 3.7 -> 3.8`
- Blocked by: 3.6, 3.3, 3.2.
- Checkpoint: all deletion UI tests are green after 2.6; 3.7 can use the already-verified History UI; 3.8 proves backend retirement plus zero old UI callers.
- Blocks: Slice 6.

### Slice 6: overlay and motion integration
- Tasks: `1.4 -> 2.4 -> 3.4`
- Blocked by: 3.2, 3.8.
- Checkpoint: keyboard/focus/reduced-motion/available-width behavior works across both modes and the replacement deletion journey.
- Blocks: integrated release verification.

### Integrated release verification and closeout
- Tasks: `3.5 -> 4.1 -> 4.2`
- Blocked by: 3.4.
- Checkpoint: fresh synthetic UI/HTTP/Postgres journey, regression/build gates and shipped docs; no live database reset, automatic sync or archive.
- Blocks: None.

Each task appears once. Numeric task IDs identify work; this graph defines execution order. Backend retirement 2.8 intentionally precedes writers 2.5, while UI retirement is in 2.6. The two independent branches may be worked sequentially by one agent; no delegation is authorized or required. The structural validator also checks semantic prerequisite reachability.
