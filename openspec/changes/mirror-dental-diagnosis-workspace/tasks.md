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
- [x] 1.2 Add catalog/HTTP therapeutic proofs for unique Spanish variants, complete registry metadata, observed bracket save, owner denial, idempotency and stale-revision recovery.
  Traceability: T1,T3,T4,T5; prior art app/backend/tests/test_patient_conditions_contract.py and test_patient_activity.py; frontend typed-client boundary tests.
  Notes: 2026-10-06 added test_patient_treatments.py catalog/auth and opt-in real-Postgres HTTP journey for bracket/reload/owner/replay/stale edit/correction, plus treatmentApi.test.ts frozen transport/conflict proofs. Fail-first catalog request returned422 (route absent); both client proofs failed on missing exports. Persistence proofs require migrated isolated DB; completion evidence follows in3.2.
- [x] 1.3 Add scope proofs for atomic bridge with roles, valid FDI/dentition, supported surface codes without inferred veneer/pediatric restrictions and whole-arch appliance with no FDI.
  Traceability: T2,W3,W4; PatientOdontogram.test.tsx anatomy prior art; HTTP and opt-out real-Postgres fixtures for failed transaction rollback.
  Notes: 2026-10-06 added authenticated scope/role validation, real-Postgres multi/arch rollback/replay/read proofs and rendered range/role/arch/retry/shared-identity cases. Fail-first HTTP rejected valid bridge with max_length=1; two rendered cases failed on premature single-tooth bridge write and absent arch picker. Existing canonical veneer/pediatric surface proof retained; persistence verification follows in3.3.
- [x] 1.4 Add HTTP and rendered Planificación proofs for draft create/resume, atomic planned item+stage and reload-preserved ordering.
  Traceability: P1,P6,T3; incumbent condition contract and patient clinical route test seams.
  Notes: 2026-10-06 fail-first HTTP returned404 instead of401 for absent plan endpoint; rendered authoring suite failed on absent PatientClinicalPlans. Added isolated real-Postgres aggregate/replay/order/stage/rollback/owner proof; persistence run follows in3.4.
- [x] 1.5 Add transition proofs for confirm/accept/reopen/close/reactivate/archive, illegal states, missing reason and foreign-plan denial.
  Traceability: P2,P4,P5; authenticated HTTP boundary, no commercial side effects.
  Notes: 2026-10-06 added real-Postgres HTTP matrix for36 state/action edges, empty confirmation, acceptance actor/time, expired closure, history-preserving reactivation, exact replay and foreign commands. Fail-first lifecycle run returned405 instead of409 at absent confirm endpoint. Completed state is explicitly seeded for archival proof, not claimed as staged execution.
- [x] 1.6 Add real-Postgres staged-execution proofs: concurrent closure, replayed completion, partial/all cancellation, source automatic plan completion and linked correction evidence without invented lifecycle transitions.
  Traceability: P3,P5,T4,T5; next-pending shortcut and optional clinical-note atomic rollback/replay; design.md lock order and command receipts. Default stubbed pytest alone cannot prove these invariants.
  Notes: 2026-10-07 added isolated PostgreSQL HTTP proofs for staged completion/partial and all cancellation, atomic optional note, receipt replay, linked reasoned correction, retained execution and concurrent close/execute. Fail-first execution_partial run returned405 instead of200 at the absent completion endpoint against fresh migrations0001–0026. Final proof follows in3.6.
- [x] 1.7 Add rendered palette/legend/grouping/accessibility regressions and browser preview assertions across desktop/narrow/reduced-motion states.
  Traceability: W2,W4,W5,W7,W10; visual-parity-contract.md icon/role-color/hit-test matrix; odontogramPresentation.test.ts, PatientOdontogram.test.tsx, drivePrimitiveAllowlist.test.ts; no screenshots treated as persistence proof.
  Notes: 2026-10-07 rendered eight-profile proof first failed on absent anatomical scaling. Existing public diagnosis/treatment/chart regressions remain passing; browser contracts now assert all twelve findings, anatomical/pulp/surface/pattern/lateral families, bridge/pontic and implant root suppression, collapsed five-group legend, violet palette versus blue pulp,1s preview, actual occlusal pointer application, planned0.7/P separation,20 primary teeth, keyboard inspection and reduced-motion ring suppression. Browser assertions use owned synthetic data and exact viewport sizes; screenshots supplement the HTTP and PostgreSQL proofs.
- [x] 1.8 Add patient-route/activity integrated browser contracts using isolated synthetic fixtures, including dirty mode/patient switching and observed-versus-planned separation.
  Traceability: W6,P6,P5,T3; tests/patient-diagnosis.spec.ts and tests/clinical-workspace.spec.ts. Replace stale conflict/rebase expectations with current explicit recovery choices.
  Notes: 2026-10-07 added patient-clinical-journey.spec.ts against an owned disposable Docker app on localhost:8018, with real API snapshots, selected-plan reload, two sessions/clients, dirty mode/patient departure, observed/planned separation and safe exact activity links. First browser run against the pre-Slice8 image reached saved finding/bracket then failed on missing Crear nuevo plan. New rendered query-plan proofs first failed on absent selection/unavailable handling; new authenticated activity proof first returned422 for treatments. Final passing integration evidence follows3.8.

- [x] 1.9 Add fail-first dental-note UI/HTTP proofs for bound/unbound create, Spanish template append, source hover candidate, body-only edit,20-item pages, logical deletion and exact retry/conflict.
  Traceability: N1–N5; notes-contract.md; source NoteComposer/DiagnosisNotesSidebar/NoteCard; target PatientNotes/API contract prior art; use isolated patient fixtures.
  Notes: 2026-10-07 first HTTP proof failed404 instead of401 at absent clinical-notes route. Added real-Postgres bound/unbound create, body-only edit, stale snapshot, exact replay, logical deletion/history and21-record paging proofs; rendered composer/card and hook proofs cover blank-template append, candidate unbinding/reentry/change, member highlights,280-character expansion and frozen retry. Focused new frontend6 passed; real-Postgres note/plan/treatment37 passed. Browser note/retry/conflict/rail-to-Sheet journey passed on owned disposable Docker localhost:8009.

- [x] 1.10 Add public-Seam preservation fixtures using pre-change finding/correction/general-note IDs and new records; assert one command per gesture, one composer across rail/Sheet, exact candidate-vs-highlight behavior and rollback-compatible reads. Record removal consumer baseline.
  Traceability: W8,W9,N5; architecture-cleanup.md; PatientDetail/PatientDiagnosis rendered prior art, authenticated HTTP and isolated browser replay. Tests prove user behavior/data, not Module line counts.
  Notes: 2026-10-07 recorded exact consumer inventory in slice10-evidence.md. New rendered modal-local replacement proof first failed on missing FDI control. Pre-mirror deb8878 source/schema0024 seeded retained finding revision2, corrected original/replacement and general-note revision2; eight HTTP snapshots persisted in evidence/slice10-legacy.json. Pre-removal cached Slice8 Docker browser preservation replay passed, including exact links/legacy fracture surfaces, zero hover/inspection writes, candidate unbind/reentry/change, one retained rail/Sheet composer and one note command. Existing rendered one-command/retry/conflict/history proofs pass; post-removal/rollback evidence follows3.11.

## 2. Implementation

### Contextual inspection and reference application

- [x] 2.1 Separate hover, popover context and active tool in PatientDiagnosis; implement no-tool popover, direct whole/occlusal application, compact lateral surface modal and saved-record edit modal following native domain patterns. Preserve stable retry/conflict/correction paths, add logical Deshacer, integrate dentition controls and remove focus scroll displacement.
  Traceability: W1,W3,W5,W8; architecture-cleanup.md workspace Module; Slice1. Demo: inspect16, apply Pulpitis directly, apply occlusal Caries M directly, lateral Caries M/O through Confirmar, then edit/undo with existing safeguards. No backend condition-schema change.
  Notes: 2026-10-06 implemented chart-command ownership in useDentalWorkspace, tooth-anchored inspection, anatomical pointer hit-testing and named keyboard surface controls, cropped 160px selector, saved-record domain modal, frozen create/correction retry and audited Deshacer. Dentition controls live inside Odontograma. Focused rendered suites passed78; tsc and full-src Biome passed. PRODUCT.md now records the D03 boundary. Existing correction/edit recovery remains behind the public PatientDiagnosis seam.

### Variant-aware observed procedures

- [x] 2.2 Ship the fixed catalog registry and single-tooth existing-treatment path end to end: additive treatment/member/revision/receipt tables, owner-scoped repo/service/routes, typed client, Spanish category cards and direct-apply command/receipt plus saved-record edit modal. Use the next unused Alembic revision; initially disable unsupported multi/arch scopes with explanation until2.3.
  Traceability: T1,T3,T4,T5,W2,W3,W8; architecture-cleanup.md registry/transport Seams; Slice2. Demo: save/reload an existing bracket and distinguish two crown variants; corrections retain original evidence.
  Notes: 2026-10-06 added registry63+12/eight categories, migration0025, owner-scoped commands with durable snapshot receipts/locks, append-only history and atomic reasoned replacement. Existing typed transport/useDentalWorkspace owns application/retry/undo and reads; diagnosis shares categories/FDI list/chart/inspector with procedures and a guarded edit/history/correction modal. Multi/arch cards disabled with explanation. Real-Postgres proofs5 passed before added auth/payload proof; rendered/client48 passed and full Vitest764 passed; tsc/ruff/mypy passed. Browser and final evidence follow in3.2.

### Anatomical scopes

- [x] 2.3 Enable complete catalog scope validation and chart selection for multi-tooth bridge/splint and whole-arch appliances; persist one atomic record with members/roles or arch, implement surfaces/dentition restrictions and grouped read identity.
  Traceability: T2,W3,W4; Slice3. Demo: bridge with abutment/pontic and upper-arch appliance, failed invalid anatomy leaves no partial row.
  Notes: 2026-10-06 enabled63 variants with catalog-driven cardinality/FDI/unique-member/same-arch/role validation, canonical members/surfaces and persisted arch. Bridge requires source pillar/pontic roles and at least one pillar. Existing0025 already supports all scopes; no schema change required. useDentalWorkspace owns range/free chart selection and frozen commands; domain confirmation/picker, shared-ID connectors/inspectors, unique counts, arch groups and scope-preserving edit/correction history shipped. Historical single-tooth receipt hashes preserved. Focused UI/client61 passed; therapeutic HTTP/real-Postgres10 passed; Slice3 Docker browser journey passed. Final proof in3.3.

### Draft clinical plans

- [x] 2.4 Add additive plan/item/stage/plan-revision storage and owner-scoped domain/HTTP/typed-client path; expose Planificación and draft list/detail, create/resume, add planned variants atomically, order items and edit draft stages with guarded dirty navigation.
  Traceability: P1,P6,T3,W8; architecture-cleanup.md plan Module; Slice4. Demo: draft two-item plan with two-stage procedure survives reload; existing observations remain separate.
  Notes: 2026-10-06 added0026 aggregate/member/session/history storage, injectable owner-scoped commands, durable receipts, typed clients, plan hook and patient-local authoring UI. Catalog anatomy reused for tooth/bridge/arch plans.12 real-Postgres plan+treatment proofs and40 focused rendered proofs passed; tsc/ruff/format/mypy passed. Browser draft authoring/order/session/replay/reload passed;3.4 records proof.

### Clinical lifecycle

- [x] 2.5 Implement revision-checked confirm/accept/reopen/close/reactivate/archive commands and Spanish confirmation UI with actor/time/reasons, recorded acceptance and explicit read-only states. No budget, agenda, payment or consent-signature side effects.
  Traceability: P2,P4,P5; Slice5. Demo: confirm, record acceptance, reopen a pending plan, close and reactivate the same plan with intact history.
  Notes: 2026-10-06 implemented six revision-checked lifecycle commands, source closure reasons, server-derived actor/time, manual acceptance, read-only terminal states and history-preserving draft reopening/reactivation. Spanish domain confirmations and account disclosure reuse existing patient controls.22 focused real-Postgres plan/treatment proofs and11 focused rendered/transport/dialog proofs passed; tsc/Biome/ruff/format/mypy passed. Dirty draft navigation now supports explicit save/discard/remain; closed-plan conflict review retains local procedure text. Final browser and broad validation evidence follow in3.5.

### Staged execution and recovery

- [x] 2.6 Implement active-plan stage completion/cancellation, source session evidence/completed-total progress, automatic plan completion, next-pending-session item shortcut with clear label, atomic optional treatment-owned execution note and history-preserving linked correction transactions; durable command replay and plan/treatment locks; history UI preserves completed evidence.
  Traceability: P3,P5,T4,T5; Slice6. Demo: complete/cancel stages, replay lost-response command once, recover two-client conflict and reactivate a closed plan with historical execution retained; completed plans do not reopen to draft.
  Notes: 2026-10-07 added migration0027 for cancellation metadata and treatment-owned execution notes/revisions, active-only session commands, automatic truthful item/plan completion and plan-first linked corrections with retained stages. Plan hook freezes selected session/revisions/text for replay; Spanish execution/correction confirmations, actor/time, session/item totals and historical evidence shipped.33 real-Postgres plan/treatment proofs and15 rendered/transport/dialog proofs passed; tsc/ruff passed. Browser and broad checks follow in3.6.

### Dental presentation and context

- [x] 2.7 Finish eight independently authored anatomical profiles/anchors, lateral/occlusal layers and illustrated registry for all variants/findings; source previews, glows/pulses/timings/backgrounds, variant-specific bridge/splint icons, separate palette/layer colors, unobstructed Notas/Asistente hit areas, surface dot without invented usage counts, source five-group legend and FDI-linked list. Implement320/384px rail and floating Notas/Sheet placement for the editable composer from Slice9.
  Traceability: W2–W5,W7,W8,W10,N5,T1,T2; visual-parity-contract.md; architecture-cleanup.md presentation Module; notes-contract.md layout; Slice7. Demo: existing crown+root-canal+caries overlay remains inspectable; keyboard/narrow workflow preserves drafts and truthful states.
  Notes: 2026-10-07 authored eight lateral/occlusal profiles, position widths,110px lateral composition and shared mirrored transforms/anchors. Added independent clinical layers for pulp/surfaces/patterns/lateral marks, missing attenuation/replacement-root rules, variant bridge/splint/provisional motifs, scoped clinical colors and source preview/ring/highlight timings with reduced-motion opt-out. Palette cards use104px minimum grid,72px minimum height,2px borders and6px cyan support dots; legend has five base groups and explicit Existing/Planned labels. FDI list headings, member highlights, local chart scrolling and one retained notes compositor across320/384px rail/Sheet shipped. Focused and full frontend proofs pass; final browser captures and evidence follow3.7.

### Patient-local integrated journey

- [x] 2.8 Connect diagnosis create/continue-plan CTA, selected-plan chart overlays, authorized query deep links and owner-scoped patient activity revisions; complete diagnosis→planning→execution→history journey with one transition guard and safe unavailable states.
  Traceability: W6,P6,P5,W4; Slice8. Demo: full clinical workflow in the same patient workspace, no cross-patient IDs or commercial actions.
  Notes: 2026-10-07 added explicit new-plan/authorized paged draft continuation, URL-selected plan reload and selected-plan chart in all lifecycle states. Diagnosis excludes future planned work. Exact patient-bound plan/history, treatment and dental-note/history query links use typed clients; unavailable plan links do not create a substitute. Activity projects owner/patient-scoped treatment, plan/session and dental-note revisions without clinical text, with bound pagination and category filters. Existing transition guard owns departure decisions. Full Vitest791 and isolated PostgreSQL activity/plan/note/treatment44 passed; tsc/build/ruff/mypy passed. Final browser and evidence follow3.8.

### Editable dental notes

- [x] 2.9 Add typed diagnosis/treatment/plan notes end to end: additive note/revision tables, owner-scoped service/repo/routes, typed clients, independently authored Spanish templates, editable compositor, card feed/link-hover, body-only edit and soft-delete receipts. Keep general notes distinct; do not add attachment uploader.
  Traceability: N1–N5,W5,W6,W8; architecture-cleanup.md notes Module; Slice9. Demo: bound/unbound/template notes, edit/delete/load-more/reload in diagnosis and procedure/plan context.
  Notes: 2026-10-07 migration0028 extends existing0027 execution notes without rewriting rows/receipts; adds owner/patient/plan links and anatomical checks. Injectable command boundary, body-only edit, atomic revision/receipt, combined general/dental feed and bounded cursors shipped. One useDentalClinicalNotes draft/feed instance survives rail/Sheet and guards patient/mode changes. Diagnosis, observed procedure and plan contexts share editable composer/cards/templates. Five real-Postgres note proofs pass, including foreign typed links and injected transaction rollback; preserved plan/treatment suite33 passed. New frontend6 pass; full Vitest787 and typecheck passed before Slice7 presentation changes. Final cross-slice browser proof follows3.10.

### Contract cleanup after consumer migration

- [x] 2.10 Complete bounded expand→migrate→contract retirement: update actual consumer inventory, migrate remaining consumers and remove superseded lower create-editor/focus refs/handlers, generic geometry and parallel palette/rail branches. Preserve historical aliases/APIs/data and retry/conflict/correction/accessibility; keep one active interaction owner and no permanent legacy toggle. Record each deletion with replacement proof; no historical schema drops.
  Traceability: W8,W9,N5; Slice10; architecture-cleanup.md. Demo: same public patient journey and pre-change IDs survive cleanup; removed symbols have zero active consumers.
  Notes: 2026-10-07 migrated correction replacement FDI/concept selection into its trapped modal; chart/tool handlers no longer mutate editor drafts. Removed pieceButtonRef/firstSurfaceRef/Cambiar pieza/Elegir pieza, unreachable ConditionAttempt.create/save create path/Nueva condición/duplicate-create UI, unused four-family toothProfiles and obsolete lower-layout/future-scope copy. Chart creates remain owned by useDentalWorkspace; one useDentalClinicalNotes owns the mutually exclusive rail/Sheet. Source search finds retired labels only in negative tests. Full Vitest794, typecheck/build/Biome passed; no backend/API/schema changes. Exact inventory and preservation rationale in slice10-evidence.md; final browser/rollback proof follows3.11.

## 3. Verification

- [x] 3.1 Run the focused finding/inspection regressions and browser no-write/no-focus-jump replay; preserve incumbent condition history/correction tests.
  Traceability: Slice1; W1,W3,W5.
  Notes: 2026-10-06 focused UI78 passed; full frontend757 passed; incumbent condition HTTP contract4 passed. Isolated Docker localhost:8001 Playwright setup+journey2 passed, including unchanged scroll/no writes on tooth-first inspection, direct Pulpitis, logical undo with two revisions, actual chart-path Caries M with lost-response replay and one revision, lateral M/O confirmation, edit/reload,390px inspector and Temporal. See slice1-evidence.md for commands and evidence limits.
- [x] 3.2 Prove catalog coverage and existing-treatment save/reload, ownership, duplicate/replay and conflict recovery at HTTP plus real DB where transactional.
  Traceability: Slice2; T1,T3–T5,W2.
  Notes: 2026-10-06 seven catalog/HTTP/real-Postgres proofs passed, including concurrent replay/edit, transaction rollback, linked correction, variant snapshots and bound paging. Full frontend766 passed; tsc/Biome/ruff/format/mypy passed. Final isolated Docker Playwright setup+Slice1+Slice2 journeys3 passed with bracket commit-response loss/reload/stale recovery/correction, eight categories and390px inspector. Fresh DB migration0001→0025 passed. Unrestricted backend suite hit unchanged clinical catalog CRLF/LF comparison; remaining run958 passed/138 skipped/one deselected at that run. See slice2-evidence.md; gate3.9 remains unchecked.
- [x] 3.3 Verify multi/arch valid and invalid fixtures, canonical surfaces/roles and atomic rollback through real DB and chart UI.
  Traceability: Slice3; T2,W3,W4.
  Notes: 2026-10-06 treatment HTTP/real-Postgres10 passed, including invalid anatomy with zero rows/members/revisions/receipts, canonical member replay, whole-arch owner/read proof and injected aggregate rollback. Focused rendered/client61 and full Vitest769 passed; tsc/Biome/ruff/format/mypy passed. Fresh DB0001→0025 and final isolated Docker Playwright setup+Slice1+Slice2+Slice3 four passed, including shared bridge identity, lost-response arch retry/edit/history and keyboard/dirty primary splint at390px. Broader backend catalog line-ending failure and isolated-passing OAuth failure recorded in slice3-evidence.md; gate3.9 remains unchecked.
- [x] 3.4 Verify draft-plan create/resume/order/stage changes and reload through HTTP and browser.
  Traceability: Slice4; P1,P6.
  Notes: 2026-10-06 isolated PostgreSQL migration0001→0026 passed; plan+treatment suite12 passed, focused rendered40 passed. Docker setup+Slice4 journey2 passed with one plan, two ordered procedures, bridge roles, two bracket sessions, revised label, exact lost-response retry, zero observed-procedure count and persisted reload. Evidence in slice4-evidence.md; final cross-slice validation follows Slice5.
- [x] 3.5 Verify every allowed/denied lifecycle edge, acceptance metadata and absence of commercial integrations.
  Traceability: Slice5; P2,P4,P5.
  Notes: 2026-10-07 final real-Postgres plan/treatment suite22 passed; lifecycle matrix covers36 state/action edges, missing reasons, owner denial, actor/time, exact receipts, concurrent close/edit and rollback. Full frontend777 passed; tsc/Biome/ruff/format/mypy passed. Final isolated Docker setup+Slices1–5 six browser proofs passed, including acceptance response loss, closed read-only reload, narrow keyboard reactivation, retained history and save-before-navigation. Backend remainder978 passed/134 skipped with only the known catalog CRLF/LF test deselected; unrestricted run still fails there. See slice5-evidence.md; release3.9 remains unchecked.
- [x] 3.6 Verify execution, partial/all cancellation, correction/reopen history, concurrent closure and exact receipt replay through real PostgreSQL and browser.
  Traceability: Slice6; P3,P5,T4,T5.
  Notes: 2026-10-07 isolated PostgreSQL plan/treatment33 passed, including concurrent close/execute and correction/execute, same-command replay, note/history rollback, denied states/owners, cancellation denominator and immutable corrected/replacement evidence. Focused frontend15 and full Vitest781 passed; tsc/Biome/ruff/format/mypy passed. Final Docker setup+Slices1–6 eight browser proofs passed, with two Slice6 journeys covering atomic note response loss, two-client recovery, partial/all cancellation, correction/reload and390px keyboard/reduced-motion reactivation. Backend remainder989 passed/134 skipped with known catalog CRLF/LF test deselected; unrestricted run still fails there. See slice6-evidence.md; release3.9 remains unchecked.
- [x] 3.7 Capture desktop and390px narrow UI, 200% zoom, keyboard, reduced motion and all visual-family snapshots; inspect labels/counts and primitive allowlist.
  Traceability: Slice7; W2,W4,W5,W7,W10,T1; visual-parity-contract.md acceptance matrix.
  Notes: 2026-10-07 final owned Docker browser proofs2 passed. Captured1440×900,1280×800,1024×768,768×1024,430×932,390×844, primary dentition, planned marker and200% equivalent reflow (720×450 CSS viewport at DPR2,1440×900 CDP capture). Checked viewport width, no page overflow, Notes center hit-test, keyboard inspection/close, reduced-motion suppression, actual M-surface pointer commit and observed/planned separation. Images inspected and retained in evidence/. Frontend typecheck/Biome and full Vitest789, including primitive allowlist, passed. Independent artwork is not asserted pixel-identical to licensed source; native browser chrome zoom and real-device hardware are not claimed. See slice7-evidence.md; release3.9 remains unchecked.
- [x] 3.8 Run isolated synthetic end-to-end clinical journey with fresh page reload, two sessions and dirty navigation; record truthful persisted IDs/revisions and safe activity/deep-link results.
  Traceability: Slice8; W6,P1–P6,T3–T5. Use Docker runtime and repo clinical baseline fixture harness, never real patient mutations.
  Notes: 2026-10-07 final owned Docker localhost:8018 integrated browser proof passed. Synthetic finding/observed bracket→chosen draft→confirmation/acceptance→two-client two-session execution→automatic completed revision6→safe14-event activity/exact plan, procedure and note links survived reload. Dirty mode, browser Back and directory departure preserved text; wrong-patient plan links and foreign-owner reads were denied. Captured1440px selected-plan chart and390px history with inspected screenshots and persisted IDs/revisions in evidence/slice8-persisted.json. Full Vitest793, PostgreSQL activity/plan/note/treatment44, build/typecheck/Biome/ruff/format/mypy passed. See slice8-evidence.md; release3.9 remains unchecked.
- [x] 3.9 Run frontend typecheck/Biome/full Vitest and backend ruff/format/mypy/full pytest required by AGENTS.md; validate migration upgrade and application rollback compatibility on an isolated DB.
  Traceability: all requirements; repository release gates. Real-DB tests must opt out of conftest pool stub explicitly; external APIs remain mocked.
  Notes: 2026-10-07 release-gate run passed. Frontend: `bun run tsc --noEmit`, `bun x biome check src` (251 files), `bun run test` 794 passed in 91 files. Backend: `uv run ruff check .`, `uv run ruff format --check .` (233 files), `uv run mypy .` (233 files), `uv run pytest tests -xvs` 966 passed/167 skipped/0 failed. The previously recorded catalog CRLF/LF failure was a Windows-checkout artifact: `app/backend/data/dental_ai_glossary_es_cl_v1.*` were not covered by `.gitattributes`, so the worktree had CRLF while generated bytes are LF. Added `text eol=lf` rules for the catalog, manifest and checksum; renormalized the worktree; the byte-comparison test and full suite now pass unrestricted. Isolated proof used a disposable pgvector/pg16 container named `dental-slice10-db`: pre-mirror `deb8878` migrated an empty DB to schema0024, seeded finding/correction/general-note fixtures through archived HTTP routes (8 snapshots in evidence/gate39-legacy.json), current migrations upgraded the populated DB 0024→0028, current source read all 8 snapshots unchanged, then archived pre-mirror source (with current Alembic files retained) read the same 8 snapshots unchanged against schema0028. Single Alembic head `0028`; no down migration, schema rewrite or row cleanup ran. Container, network, volume and temp archive removed after the proof.

- [x] 3.10 Verify note create/template/binding/edit/delete/feed/reload, author ownership, body-only linkage, dirty composer, retry/conflict and rail-to-Sheet state retention through browser/HTTP/real DB as appropriate.
  Traceability: Slice9; N1–N5,W5. Attachments are source-audited but not claimed implemented.
  Notes: 2026-10-07 final isolated PostgreSQL note/plan/treatment38 passed, including generalized note contexts, retained general-note reads, owner denial, history/receipt rollback and21-note paging. New note UI/hook7 and full Vitest789 passed; frontend typecheck/Biome and backend ruff/format/mypy passed. Owned Docker localhost:8009 browser proof covers editable templates, no-write inspection with dirty notes, unbound candidate preserved across rail/Sheet, blocked mode navigation, exact committed-response-loss retry, explicit two-client edit recovery and deletion/reload with four revisions. A separate rendered proof covers stale deletion review and exact deletion replay. Evidence in slice9-evidence.md; all-resource integration and release gates remain scheduled later.

- [x] 3.11 Verify Slice10 consumer searches, public journey before/after removal, existing history/deep links, general-note reads and application rollback compatibility; rerun affected rendered/HTTP/browser proofs after deletion. Capture exact deleted paths/symbols and confirm unrelated changes are preserved.
  Traceability: Slice10; W8,W9,N5; architecture-cleanup.md contract gate. Full suite follows in3.9.
  Notes: 2026-10-07 before/after preservation browser passed against cached Slice8 and final Slice10 frontend; integrated final journey2 passed. Eight pre-mirror deb8878/schema0024 HTTP snapshots retain exact UUIDs/revisions/history/general notes after0028 upgrade. Archived backend booted with retained forward-only migrations on localhost8020; rollback HTTP proof1 passed and clinical-table data hash stayed fcac09cdd505f572a02fb63c08d32e8edc6184873cea4d52f860f04051d080f4. Zero production consumers of retired names; one hook owns chart creation and one retained notes draft across rail/Sheet. PostgreSQL/HTTP48 and full Vitest794 passed; build/typecheck/Biome/ruff/format/mypy passed. Unrestricted backend still fails unchanged catalog CRLF/LF comparison; remainder965 passed/167 skipped/one deselected, so3.9 stays open. Exact removals, synthetic IDs and inspected captures in slice10-evidence.md; unrelated files and earlier captures preserved.

## 4. Release Hygiene and Closeout

- [x] 4.1 Update PRODUCT.md chart-create boundary, patient surface brief, API/user docs, clinical verification feature inventory and changelog around final shipped behavior; retain evidence limits and scope decisions.
  Traceability: W1–W10,T1–T5,P1–P6,N1–N5; docs reflect implementation only after verification, no premature shipped claims.
  Notes: 2026-10-07 updated all five documentation surfaces after the passing release gate. `PRODUCT.md` records the inspection-first chart boundary with anatomy/palette/legend, adds the dental-clinical-notes capability, expands Activity to treatment/plan/clinical-note revisions, and states the documented limits (no attachments/billing/appointments/AI diagnoses, independently authored artwork, no native-zoom/real-device/reference-write-UAT claims). `.impeccable/surfaces/patient-workspace.md` adds the measured palette/profile/preview behavior, the shared note composer across the320/384px rail and Sheet, canonical `planning|plans` plus resource query state, and no-substitute handling for unavailable plan links. `docs/API.md` gains the full Dental clinical notes section (templates, commands, receipts, soft delete, read shape, combined feed ordering) and updates plan rollback wording, Activity kinds/hrefs and cursor rows. `.agents/skills/verify-dental-assistant/features/README.md` and `odontogram-human-workflow.md` map ODO-MIRROR entry points and mark the mirror evidence as current shipped-behavior proof while retaining the harden UAT R7/R8/R9 limits. `CHANGELOG.md` records the diagnosis workspace, procedures, plans, notes and the LF catalog fix. `README.md` updates the patient-workspace summary. No premature sync/archive claim.
- [x] 4.2 Audit spec-to-code coverage, migration retention and test evidence, resolve predecessor sync ordering before applying this change delta, then prepare spec sync/archive readiness only after explicit later workflow authorization and completed implementation.
  Traceability: complete requirement matrix including modified clinical-workspace-discovery; opsx-spec-workflow stop contract. This planning request performs neither sync nor archive.
  Notes: 2026-10-07 audit written to release-gate-audit.md. Coverage matrix maps all four new capabilities (W1–W10, T1–T5, P1–P6, N1–N5) and the three modified discovery requirements to implementation anchors and slice evidence; no requirement lacks a code anchor or verification path. Migration retention verified: 0025–0028 additive (0028 widens note contexts only; `downgrade()` intentionally no-op), single `0028` head, populated 0024→0028 upgrade and pre-mirror rollback read proven in3.9. Predecessor ordering resolved: sync/archive harden-odontogram-human-workflow first (its `Fixed tooth-condition identity and recurrence` delta is the base canonical wording), then sync this change's three MODIFIED requirements and four ADDED capabilities; no requirement-level conflict, but reversing the order would leave canonical correction wording stale. Strict validation passes (`openspec validate mirror-dental-diagnosis-workspace --strict`). Sync and archive were not performed; both still require explicit later workflow authorization per the opsx stop contract.

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
