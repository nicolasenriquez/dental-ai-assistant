## 0. Investigation and Scope Lock

- [x] 0.1 Trace the target and reference UI events, persistent boundaries, owner scope and highest test seam.
  Traceability: W1–W10, T1–T5, P1–P6,N1–N5; investigation.md; design.md Boundary and Ownership.
  Notes: Native-browser/source audits completed; existing PatientDetail→PatientDiagnosis is the highest UI seam. New therapeutic/plan resources require authenticated HTTP and real-Postgres proofs. Focused incumbent tests passed46; no reference clinical write UAT is claimed.
- [x] 0.2 Resolve scope through grilling and freeze inventory, lifecycle, ownership and commercial exclusions.
  Traceability: clinical-workspace-discovery modified manual diagnosis/activity/composition; proposal.md D01–D04; catalog.md; design.md Decisions and adaptation ledger/Persistence and API contracts; mirror-audit.md; notes-contract.md.
  Notes: D01/D02 selected clinical plans without commercial integration; D03 selected reference click-to-apply; D04 selected editable dental notes/templates/links without attachments. mirror-audit.md records corrected source behavior and visual contracts.

- [x] 0.3 Compare current native tabs category-by-category, measure icons/colors and notes interactions, trace source plan shortcut and verify incumbent protections against disposable PostgreSQL.
  Traceability: W10,P3,N5; visual-parity-contract.md; live-parity-audit.md; artifacts/diagnosis-parity-live-20261006.
  Notes:72 live options/8 categories,8 icon overrides, source Notas/IA overlap reproduced, note draft/template/unbind cancelled.28 selected backend tests passed against migrated disposable DB where live fixtures apply;46 frontend tests passed. Owned container removed; future mirror UI/resources remain unimplemented.

## 1. Contract Coverage (Failing First)

- [x] 1.1 Add rendered PatientDiagnosis regression: no-tool tooth activation opens a contextual popover without writes; active-tool whole/occlusal click applies directly; lateral surface activation confirms through its compact modal. No unknown-condition draft or lower-form focus.
  Traceability: W1,W3; prior art PatientDiagnosis.test.tsx, PatientOdontogram.test.tsx and PatientDetail.test.tsx. First failing external behavior crosses the existing UI seam.
  Notes: 2026-10-06 fail-first run of four new rendered PatientDiagnosis cases failed on missing tooth popover, tool-created textarea, missing surface modal and missing occlusal activation. Command: bun run test src/components/patients/PatientDiagnosis.test.tsx -t "tooth-first|whole-tooth activation|lateral surface selection|occlusal surface activation".
- [ ] 1.2 Add catalog/HTTP therapeutic proofs for unique Spanish variants, complete registry metadata, observed bracket save, owner denial, idempotency and stale-revision recovery.
  Traceability: T1,T3,T4,T5; prior art app/backend/tests/test_patient_conditions_contract.py and test_patient_activity.py; frontend typed-client boundary tests.
- [ ] 1.3 Add scope proofs for atomic bridge with roles, valid FDI/dentition, supported surface codes without inferred veneer/pediatric restrictions and whole-arch appliance with no FDI.
  Traceability: T2,W3,W4; PatientOdontogram.test.tsx anatomy prior art; HTTP and opt-out real-Postgres fixtures for failed transaction rollback.
- [ ] 1.4 Add HTTP and rendered Planificación proofs for draft create/resume, atomic planned item+stage and reload-preserved ordering.
  Traceability: P1,P6,T3; incumbent condition contract and patient clinical route test seams.
- [ ] 1.5 Add transition proofs for confirm/accept/reopen/close/reactivate/archive, illegal states, missing reason and foreign-plan denial.
  Traceability: P2,P4,P5; authenticated HTTP boundary, no commercial side effects.
- [ ] 1.6 Add real-Postgres staged-execution proofs: concurrent closure, replayed completion, partial/all cancellation, source automatic plan completion and linked correction evidence without invented lifecycle transitions.
  Traceability: P3,P5,T4,T5; next-pending shortcut and optional clinical-note atomic rollback/replay; design.md lock order and command receipts. Default stubbed pytest alone cannot prove these invariants.
- [ ] 1.7 Add rendered palette/legend/grouping/accessibility regressions and browser preview assertions across desktop/narrow/reduced-motion states.
  Traceability: W2,W4,W5,W7,W10; visual-parity-contract.md icon/role-color/hit-test matrix; odontogramPresentation.test.ts, PatientOdontogram.test.tsx, drivePrimitiveAllowlist.test.ts; no screenshots treated as persistence proof.
- [ ] 1.8 Add patient-route/activity integrated browser contracts using isolated synthetic fixtures, including dirty mode/patient switching and observed-versus-planned separation.
  Traceability: W6,P6,P5,T3; tests/patient-diagnosis.spec.ts and tests/clinical-workspace.spec.ts. Replace stale conflict/rebase expectations with current explicit recovery choices.

- [ ] 1.9 Add fail-first dental-note UI/HTTP proofs for bound/unbound create, Spanish template append, source hover candidate, body-only edit,20-item pages, logical deletion and exact retry/conflict.
  Traceability: N1–N5; notes-contract.md; source NoteComposer/DiagnosisNotesSidebar/NoteCard; target PatientNotes/API contract prior art; use isolated patient fixtures.

- [ ] 1.10 Add public-Seam preservation fixtures using pre-change finding/correction/general-note IDs and new records; assert one command per gesture, one composer across rail/Sheet, exact candidate-vs-highlight behavior and rollback-compatible reads. Record removal consumer baseline.
  Traceability: W8,W9,N5; architecture-cleanup.md; PatientDetail/PatientDiagnosis rendered prior art, authenticated HTTP and isolated browser replay. Tests prove user behavior/data, not Module line counts.

## 2. Implementation

### Contextual inspection and reference application

- [x] 2.1 Separate hover, popover context and active tool in PatientDiagnosis; implement no-tool popover, direct whole/occlusal application, compact lateral surface modal and saved-record edit modal following native domain patterns. Preserve stable retry/conflict/correction paths, add logical Deshacer, integrate dentition controls and remove focus scroll displacement.
  Traceability: W1,W3,W5,W8; architecture-cleanup.md workspace Module; Slice1. Demo: inspect16, apply Pulpitis directly, apply occlusal Caries M directly, lateral Caries M/O through Confirmar, then edit/undo with existing safeguards. No backend condition-schema change.
  Notes: 2026-10-06 implemented chart-command ownership in useDentalWorkspace, tooth-anchored inspection, anatomical pointer hit-testing and named keyboard surface controls, cropped 160px selector, saved-record domain modal, frozen create/correction retry and audited Deshacer. Dentition controls live inside Odontograma. Focused rendered suites passed78; tsc and full-src Biome passed. PRODUCT.md now records the D03 boundary. Existing correction/edit recovery remains behind the public PatientDiagnosis seam.

### Variant-aware observed procedures

- [ ] 2.2 Ship the fixed catalog registry and single-tooth existing-treatment path end to end: additive treatment/member/revision/receipt tables, owner-scoped repo/service/routes, typed client, Spanish category cards and direct-apply command/receipt plus saved-record edit modal. Use the next unused Alembic revision; initially disable unsupported multi/arch scopes with explanation until2.3.
  Traceability: T1,T3,T4,T5,W2,W3,W8; architecture-cleanup.md registry/transport Seams; Slice2. Demo: save/reload an existing bracket and distinguish two crown variants; corrections retain original evidence.

### Anatomical scopes

- [ ] 2.3 Enable complete catalog scope validation and chart selection for multi-tooth bridge/splint and whole-arch appliances; persist one atomic record with members/roles or arch, implement surfaces/dentition restrictions and grouped read identity.
  Traceability: T2,W3,W4; Slice3. Demo: bridge with abutment/pontic and upper-arch appliance, failed invalid anatomy leaves no partial row.

### Draft clinical plans

- [ ] 2.4 Add additive plan/item/stage/plan-revision storage and owner-scoped domain/HTTP/typed-client path; expose Planificación and draft list/detail, create/resume, add planned variants atomically, order items and edit draft stages with guarded dirty navigation.
  Traceability: P1,P6,T3,W8; architecture-cleanup.md plan Module; Slice4. Demo: draft two-item plan with two-stage procedure survives reload; existing observations remain separate.

### Clinical lifecycle

- [ ] 2.5 Implement revision-checked confirm/accept/reopen/close/reactivate/archive commands and Spanish confirmation UI with actor/time/reasons, recorded acceptance and explicit read-only states. No budget, agenda, payment or consent-signature side effects.
  Traceability: P2,P4,P5; Slice5. Demo: confirm, record acceptance, reopen a pending plan, close and reactivate the same plan with intact history.

### Staged execution and recovery

- [ ] 2.6 Implement active-plan stage completion/cancellation, source session evidence/completed-total progress, automatic plan completion, next-pending-session item shortcut with clear label, atomic optional treatment-owned execution note and history-preserving linked correction transactions; durable command replay and plan/treatment locks; history UI preserves completed evidence.
  Traceability: P3,P5,T4,T5; Slice6. Demo: complete/cancel stages, replay lost-response command once, recover two-client conflict and reactivate a closed plan with historical execution retained; completed plans do not reopen to draft.

### Dental presentation and context

- [ ] 2.7 Finish eight independently authored anatomical profiles/anchors, lateral/occlusal layers and illustrated registry for all variants/findings; source previews, glows/pulses/timings/backgrounds, variant-specific bridge/splint icons, separate palette/layer colors, unobstructed Notas/Asistente hit areas, surface dot without invented usage counts, source five-group legend and FDI-linked list. Implement320/384px rail and floating Notas/Sheet placement for the editable composer from Slice9.
  Traceability: W2–W5,W7,W8,W10,N5,T1,T2; visual-parity-contract.md; architecture-cleanup.md presentation Module; notes-contract.md layout; Slice7. Demo: existing crown+root-canal+caries overlay remains inspectable; keyboard/narrow workflow preserves drafts and truthful states.

### Patient-local integrated journey

- [ ] 2.8 Connect diagnosis create/continue-plan CTA, selected-plan chart overlays, authorized query deep links and owner-scoped patient activity revisions; complete diagnosis→planning→execution→history journey with one transition guard and safe unavailable states.
  Traceability: W6,P6,P5,W4; Slice8. Demo: full clinical workflow in the same patient workspace, no cross-patient IDs or commercial actions.

### Editable dental notes

- [ ] 2.9 Add typed diagnosis/treatment/plan notes end to end: additive note/revision tables, owner-scoped service/repo/routes, typed clients, independently authored Spanish templates, editable compositor, card feed/link-hover, body-only edit and soft-delete receipts. Keep general notes distinct; do not add attachment uploader.
  Traceability: N1–N5,W5,W6,W8; architecture-cleanup.md notes Module; Slice9. Demo: bound/unbound/template notes, edit/delete/load-more/reload in diagnosis and procedure/plan context.

### Contract cleanup after consumer migration

- [ ] 2.10 Complete bounded expand→migrate→contract retirement: update actual consumer inventory, migrate remaining consumers and remove superseded lower create-editor/focus refs/handlers, generic geometry and parallel palette/rail branches. Preserve historical aliases/APIs/data and retry/conflict/correction/accessibility; keep one active interaction owner and no permanent legacy toggle. Record each deletion with replacement proof; no historical schema drops.
  Traceability: W8,W9,N5; Slice10; architecture-cleanup.md. Demo: same public patient journey and pre-change IDs survive cleanup; removed symbols have zero active consumers.

## 3. Verification

- [x] 3.1 Run the focused finding/inspection regressions and browser no-write/no-focus-jump replay; preserve incumbent condition history/correction tests.
  Traceability: Slice1; W1,W3,W5.
  Notes: 2026-10-06 focused UI78 passed; full frontend757 passed; incumbent condition HTTP contract4 passed. Isolated Docker localhost:8001 Playwright setup+journey2 passed, including unchanged scroll/no writes on tooth-first inspection, direct Pulpitis, logical undo with two revisions, actual chart-path Caries M with lost-response replay and one revision, lateral M/O confirmation, edit/reload,390px inspector and Temporal. See slice1-evidence.md for commands and evidence limits.
- [ ] 3.2 Prove catalog coverage and existing-treatment save/reload, ownership, duplicate/replay and conflict recovery at HTTP plus real DB where transactional.
  Traceability: Slice2; T1,T3–T5,W2.
- [ ] 3.3 Verify multi/arch valid and invalid fixtures, canonical surfaces/roles and atomic rollback through real DB and chart UI.
  Traceability: Slice3; T2,W3,W4.
- [ ] 3.4 Verify draft-plan create/resume/order/stage changes and reload through HTTP and browser.
  Traceability: Slice4; P1,P6.
- [ ] 3.5 Verify every allowed/denied lifecycle edge, acceptance metadata and absence of commercial integrations.
  Traceability: Slice5; P2,P4,P5.
- [ ] 3.6 Verify execution, partial/all cancellation, correction/reopen history, concurrent closure and exact receipt replay through real PostgreSQL and browser.
  Traceability: Slice6; P3,P5,T4,T5.
- [ ] 3.7 Capture desktop and390px narrow UI, 200% zoom, keyboard, reduced motion and all visual-family snapshots; inspect labels/counts and primitive allowlist.
  Traceability: Slice7; W2,W4,W5,W7,W10,T1; visual-parity-contract.md acceptance matrix.
- [ ] 3.8 Run isolated synthetic end-to-end clinical journey with fresh page reload, two sessions and dirty navigation; record truthful persisted IDs/revisions and safe activity/deep-link results.
  Traceability: Slice8; W6,P1–P6,T3–T5. Use Docker runtime and repo clinical baseline fixture harness, never real patient mutations.
- [ ] 3.9 Run frontend typecheck/Biome/full Vitest and backend ruff/format/mypy/full pytest required by AGENTS.md; validate migration upgrade and application rollback compatibility on an isolated DB.
  Traceability: all requirements; repository release gates. Real-DB tests must opt out of conftest pool stub explicitly; external APIs remain mocked.

- [ ] 3.10 Verify note create/template/binding/edit/delete/feed/reload, author ownership, body-only linkage, dirty composer, retry/conflict and rail-to-Sheet state retention through browser/HTTP/real DB as appropriate.
  Traceability: Slice9; N1–N5,W5. Attachments are source-audited but not claimed implemented.

- [ ] 3.11 Verify Slice10 consumer searches, public journey before/after removal, existing history/deep links, general-note reads and application rollback compatibility; rerun affected rendered/HTTP/browser proofs after deletion. Capture exact deleted paths/symbols and confirm unrelated changes are preserved.
  Traceability: Slice10; W8,W9,N5; architecture-cleanup.md contract gate. Full suite follows in3.9.

## 4. Release Hygiene and Closeout

- [ ] 4.1 Update PRODUCT.md chart-create boundary, patient surface brief, API/user docs, clinical verification feature inventory and changelog around final shipped behavior; retain evidence limits and scope decisions.
  Traceability: W1–W10,T1–T5,P1–P6,N1–N5; docs reflect implementation only after verification, no premature shipped claims.
- [ ] 4.2 Audit spec-to-code coverage, migration retention and test evidence, resolve predecessor sync ordering before applying this change delta, then prepare spec sync/archive readiness only after explicit later workflow authorization and completed implementation.
  Traceability: complete requirement matrix including modified clinical-workspace-discovery; opsx-spec-workflow stop contract. This planning request performs neither sync nor archive.

## Execution Order

### Scope lock
- Tasks: `0.1 -> 0.2 -> 0.3`
- Checkpoint: D01/D02 and catalog/lifecycle boundaries documented.
- Blocks: all slices.

### Slice1 — Finding inspection
- Tasks: `1.1 -> 2.1 -> 3.1`
- Blocked by: Scope lock.
- Checkpoint: tooth-first inspection sends no write and keeps chart context.
- Blocks: Slice7 and Slice8.

### Slice2 — Existing therapeutic records
- Tasks: `1.2 -> 2.2 -> 3.2`
- Blocked by: Scope lock.
- Checkpoint: authorized bracket save/reload and variant identity/replay proof.
- Blocks: Slice3 and Slice4.

### Slice3 — Anatomical scopes
- Tasks: `1.3 -> 2.3 -> 3.3`
- Blocked by: Slice2.
- Checkpoint: atomic multi-tooth and whole-arch recording with server validation.
- Blocks: Slice7 and Slice8.

### Slice4 — Draft plans
- Tasks: `1.4 -> 2.4 -> 3.4`
- Blocked by: Slice2.
- Checkpoint: draft authoring/reload through a real plan aggregate; additions to editable pending/active plans follow the source. Multi/arch plan coverage waits for Slice3 at integration gate.
- Blocks: Slice5.

### Slice5 — Clinical lifecycle
- Tasks: `1.5 -> 2.5 -> 3.5`
- Blocked by: Slice4.
- Checkpoint: explicit confirmation, acceptance, closure, pending reopening and closed reactivation history.
- Blocks: Slice6.

### Slice6 — Execution and recovery
- Tasks: `1.6 -> 2.6 -> 3.6`
- Blocked by: Slice5.
- Checkpoint: atomic staged execution, automatic completion, correction and conflict/replay evidence.
- Blocks: Slice8.

### Slice7 — Dental presentation
- Tasks: `1.7 -> 2.7 -> 3.7`
- Blocked by: Slice1 and Slice3.
- Checkpoint: eight-profile anatomy, source palette/legend/layers and measured source motion/preview parity.
- Blocks: Slice8.

### Slice9 — Editable dental notes
- Tasks: `1.9 -> 2.9 -> 3.10`
- Blocked by: Slice1 and Slice4.
- Checkpoint: editable bound/unbound/template notes, linked cards and history survive reload.
- Blocks: Slice8.

### Slice8 — Integrated clinical journey
- Tasks: `1.8 -> 2.8 -> 3.8`
- Blocked by: Slice6, Slice7 and Slice9.
- Checkpoint: diagnosis→plan→execution→history browser proof in one patient workspace.
- Blocks: Slice10.

### Slice10 — Verified legacy retirement
- Tasks: `1.10 -> 2.10 -> 3.11`
- Blocked by: Slice8.
- Checkpoint: zero live consumers of retired paths, one interaction owner, existing IDs/history and new clinical data survive public replay and compatible application rollback.
- Blocks: Release gates.

### Release gates
- Tasks: `3.9 -> 4.1 -> 4.2`
- Blocked by: Slice10.
- Checkpoint: full validation and final documentation; sync/archive still require their future workflow.
- Blocks: None.
