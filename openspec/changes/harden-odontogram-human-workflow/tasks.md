# Future tasks

Tasks 0.1–0.6 record baseline investigation only. S1 is implemented and verified; dependencies below gate remaining slices. No tracker work or parallel agents are authorized.

## 0. Investigation and Scope Lock

- [x] 0.1 Recheck owned condition HTTP/repository/schema seams, both revision checks, read DTO contract and canonical MODIFIED delta against the execution baseline.
  Traceability: OD01/OD12; R1–R4/R11; S1; D-02/D-03; clinical-workspace-discovery delta.
  Notes: 2026-10-06, baseline 4c34e6a; owned HTTP/repository/DTO seams and both live 0022 revision CHECKs rechecked at head0023. Canonical requirement and MODIFIED delta match by name; 20 focused contracts and five existing live cases pass without skips. See execution-baseline.md §0.1.
- [x] 0.2 Confirm correction editor uses existing dialog/draft guards and explicit confirmation pattern.
  Traceability: OD01; R1; S2; patient-workspace surface brief.
  Notes: 2026-10-06, existing draft/submit, Radix alert-dialog, transition/router blockers and focus-return patterns inspected; correction must reuse them, since no correction editor ships yet. Existing cancel/no-write and frozen-retry component checks pass. See execution-baseline.md §0.2.
- [x] 0.3 Confirm status-aware reads/cursors, Activity revision identity and actor fallback; recheck the backend catalog, four surface-capable codes, optional[], both dentitions,0022 CHECKs and legacy version1 consumers against D-04, without auth/profile expansion.
  Traceability: OD03/OD04; R4–R5/R14/R16–R17; G02/G06/G07; H01–H04; D-04; S3.
  Notes: 2026-10-06, source/live catalog retains12codes/four surface-capable codes/optional[]/both dentitions; existing status/cursor unions, SQL guards and sole production v1 consumer identified. Five browser revision IDs reconcile with Activity and direct DB reads; null-name fallback and catalog-gated reads confirmed. Full D-04 live matrix remains S3. See execution-baseline.md §0.3.
- [x] 0.4 Reproduce1280/390 missing visual controls and editor duplication at actual chart width; identify palette/chart/editor consumers of the S3 presentation contract and distinguish optional-empty surfaces from whole-tooth scope.
  Traceability: OD02/OD07; R6–R7/R13–R17; G02–G08; H02/H04; S4; audit viewport evidence.
  Notes: 2026-10-06, rendered chart widths641.25/345px at1280×800/390×844; zero visible piece controls, two FDI selectors and150px preview; no page overflow. Screenshots inspected after shell resize settled. Shared presentation consumers and optional[] versus whole-tooth scope identified in execution-baseline.md §0.4 and execution-baseline.json.
- [x] 0.5 Reproduce disjoint/same-field races and inspect base/local/current recovery boundaries.
  Traceability: OD05; R8; S5; current no-force-overwrite policy.
  Notes: 2026-10-06, real two-page/HTTP/Postgres races reproduce remoteM,O→staleM loss after generic rebase and same-note overwrite without field choices. Five saved revisions reconcile across HTTP Activity and direct DB snapshots. Base/local/current boundaries traced to PatientDiagnosis save/rebase. See execution-baseline.md §0.5 and executable checker.
- [x] 0.6 Reproduce bare ficha reload and guarded back/forward/patient navigation.
  Traceability: OD08; R9/R15; G01/G08; S6.
  Notes: 2026-10-06, bare ficha→Clínica retains empty query and reload returns Resumen. Real SPA back/forward each preserve draft/URL on cancel and navigate on discard; guarded directory-mediated patient switch writes nothing. URL/parser boundaries inspected. See execution-baseline.md §0.6 and execution-baseline.json.

## 1. Contract Coverage (Failing First)

- [x] 1.1 Add HTTP and real-Postgres correction proofs for optional replacement, reason, statuses, rollback, duplicates, same/different-operation races, retry receipt, legacy reads and ownership.
  Traceability: OD01/OD12; R1–R3/R11; S1; test_patient_conditions_contract.py and test_clinical_workspace_live.py prior art.
  Notes: 2026-10-06, fail-first run on owned disposable Postgres at0023:15 selected correction cases failed, zero skips. HTTP returned405; legacy DTOs lacked nullable metadata. Added optional replacement/active-resolved matrix, normalized receipt retry after replacement edit, terminal guards, ownership/UUID/duplicate/overlap, rollback at three stages and five race modes, including synchronized owner-operation collision across source locks. Authentication proof added to existing contract test. Passing implementation proof belongs to3.1.
- [x] 1.2 Add component tests for correction with/without replacement, no-write cancel, explicit reviewed save,404/409/retry retention, D-03 renewed source review and original/replacement links, exact revision paging/failure, post-save focus, confirmed-write/failed-GET feedback and late-patient response isolation.
  Traceability: OD01; R1/R4/R8/R13; D-03; G03/G09; S2; PatientDiagnosis.test.tsx.
  Notes: 2026-10-06, four fail-first correction cases failed on missing action while seven incumbent cases passed. Nine added component cases now pass, covering optional replacement/frozen replay, no-write cancel/review,404 retention, conflict with resolution/new operation, exact paging/failed-cursor retry/missing target/focus, confirmed-write failed GET/read-only retry and late-patient isolation. Focused diagnosis/odontogram/detail suite35passed; tsc passes. Real browser/API/DB proof remains3.2.
- [x] 1.3 Add reads/cursor/Activity and component tests for current default, exact historical target, safe actor abbreviation collisions, unchanged event IDs, stable concept/status cues and incomplete counts. Extend catalog HTTP tests and real migrated-DB proofs for all12codes/both dentitions, valid surface subsets/optional[], whole-tooth rejection, legacy v1/additive metadata and forbidden mutation extras. Add shared-presentation list/history/legend proofs for synthetic extra entry/category, unknown code/glyph/category, malformed metadata and catalog failure with successful independent condition reads.
  Traceability: OD03/OD04; R4–R5/R14/R16–R17; G02/G06/G07; H01–H04; D-04; S3; test_patient_conditions_contract.py/test_clinical_workspace_live.py, test_patient_activity.py/test_patient_cursor_transport.py and PatientDiagnosis/Activity/History tests.
  Notes: 2026-10-06, uncommitted partial S3 work pre-existed at entry; adopted per user decision. Fail-first recorded before repair: tsc5 errors (missing chart/history catalog props, dead helper, ES2020 replaceAll) and five failing focused frontend cases (three mock-ordering cases plus default-active filtering of an error record and the new empty-current wording). Added entered_in_error cursor round-trip/binding, additive contract asserts, SQL whole-tooth nonempty rejection and unknown-code probe, actor UUID fallback/collision/full-disclosure (records, Activity, history), synthetic entry/category list/legend/palette, unknown saved code fallback, history catalog surfaces, chart catalog resolution and incomplete-count assertions. 33 focused frontend and 21 mocked backend cases pass; live counts in3.3. See evidence.md S3.
- [x] 1.4 Add rendered viewport proofs of every FDI reachable visually,44px targets, keyboard, preserved draft and compact applicable editor; exercise no-hover-mutation, anatomical order and create/edit/resolve post-save state matrix. Supply synthetic catalog entry/category to palette/chart/editor without per-view rewrites; test known/unknown symbol consistency, category navigation without writes/draft loss, optional-empty surface wording and no empty future-family tabs.
  Traceability: OD02/OD07; R6–R7/R13–R17; G02–G08; H02/H04; D-04; S4; PatientOdontogram.test.tsx and patient diagnosis E2E.
  Notes: 2026-10-06, new focused cases first run recorded3 failures (two ambiguous text queries colliding with SVG titles and a wrong no-surface premise); after those test corrections35/35 pass. Component proofs cover quadrant paging with named Superior/Inferior derecha/izquierda controls, all32 permanent and20 primary FDI reachable across four quadrants, quadrant switch without selection change, selected-quadrant-first behavior, whole-tooth `Pieza completa, sin superficies` versus optional-empty `Sin superficies especificadas` in chart accessible names, entered_in_error slash marker outside concept geometry, one visible FDI context with `Elegir pieza`/`Cambiar pieza`, single diagnosis heading without empty family tabs, multi-category navigation that never writes or discards the draft, no-hover-mutation and create/edit/resolve post-save focus. Browser keyboard/focus/44px/viewport proof is3.4. See evidence.md S4.
- [x] 1.5 Add disjoint-field and same-field conflict tests plus repeated409, failed-current-read and command-specific terminal guards; include correction vs concurrent resolution and already-corrected receipt recovery.
  Traceability: OD05; R3/R8; D-03; S5; PatientDiagnosis.test.tsx and real two-tab E2E.
  Notes: 2026-10-06, fail-first run recorded7 failing new/rewritten cases (generic rebase button still present). Nine S5 component cases now pass: disjoint-field auto-merge (local note/current surfaces with latest revision), same-field note and surface explicit choices, repeated409 comparison refresh with retained content, failed current read blocking save with GET-only reload, terminal resolved/entered_in_error edit guards, resolve re-confirmation checkbox, and correction vs resolution/terminal/already-corrected flows (existing cases extended). Focused diagnosis suite35passed; full frontend736passed/84files, tsc and Biome pass.
- [x] 1.6 Add router/component/E2E proofs for bare/existing clinical query compatibility and detail-path precedence, focused historical UUID, reload, invalid enums/UUID and canceled/accepted dirty navigation.
  Traceability: OD08; R9/R15; G01/G08; S6; PatientDetail and existing patient E2E.
  Notes: 2026-10-06, fail-first run recorded10 failing new S6 cases (bare-ficha Clínica never wrote URL state, subview switches never wrote clinical=, section switches dropped/replaced params). Ten component cases now pass: canonical tab/clinical pair from a bare ficha, fresh-load diagnosis/evolutions restoration, detail-path precedence over query state, unknown enum defaults, malformed condition UUID never fetched, focused condition deep link fetched only inside diagnosis, section switches drop clinical params while preserving note, subview switches write canonical URL and drop condition on Evoluciones, canceled dirty navigation restores URL/draft and accepted discard navigates without writing. Full frontend746passed/84files, tsc and Biome pass.

## 2. Implementation

### S1 Correction API and persistence

- [x] 2.1 Deliver additive correction schema/revision receipt, both expanded revision checks and atomic repository transaction; introduce bounded condition_service entry points and additive endpoint/client/read DTO types, keeping command_snapshot internal and preserving existing commands.
  Traceability: OD01/OD12; R1–R4/R11; S1; design decisions1–3.
  Notes: 2026-10-06,0024 expands status and both revision checks, adds replacement linkage and owned operation receipts. Shared validated commands/service delegate existing writes; repository locks/rechecks/rollback cover optional replacement and cross-source operation races. Endpoint returns201/200 exact receipts; owned reads/cursors and Activity support correction without exposing command_snapshot. Typed client sends unchanged attempts. Execution recipe passed50 HTTP/cursor/Activity/live cases with zero skips;24 focused frontend transport/component regressions and tsc/mypy passed. Migration legacy-data/rollback validation remains3.1.

### S2 Explicit correction UI

- [x] 2.2 Deliver correction draft/review/save with required reason and optional replacement; handle error/retry safely and link exact original/result revisions and distinguish confirmed writes from failed refreshes without resending commands.
  Traceability: OD01; R1/R4/R13; G03/G09; S2.
  Notes: 2026-10-06, existing draft editor/guard and Radix confirmation reused; masked patient context, original evidence, required reason and optional catalog-based replacement reviewed before the sole correction POST. Frozen operation/body survives uncertainty; definitive conflicts load current source and require renewed confirmation/new operation. Exact receipt links use owned GET/history50pages with failed-cursor read-only retry; confirmed-save feedback survives failed reads. Patient-keyed workspace rejects late writes.35focused component tests, tsc, changed-file Biome and Docker production build pass; isolated browser/DB checkpoint remains3.2.
  Blocked by: 2.1.

### S3 Current/history, actor and catalog

- [x] 2.3 Deliver status-aware current/historical UI, owned exact target, correction metadata/Activity mapping and actor label/disclosure. Consolidate typed definitions in patients/conditions.py with derived legacy projections and service/catalog validation; expose additive version1 categories/category_key/allowed_dentitions through existing route and lib/api.ts. Deliver local lib/odontogramPresentation.ts resolution and presentation-only symbol registration consumed by list/history/concept legend, with independent evidence reads and safe fallbacks; preserve SQL guards, original12codes, grouped records and truthful counts.
  Traceability: OD03/OD04; R4–R5/R14/R16–R17; G02/G06/G07; H01–H04; D-04; S3; design decision9.
  Blocked by: 2.1.
  Notes: 2026-10-06, definitions consolidation, additive catalog route/api types and presentation helper pre-existed as adopted partial work; repaired broken wiring (chart/history now accept an optional catalog and resolve labels/surfaces/symbols through resolveCondition with labels fallback), rendered PatientActorLabel in revision history with collision-aware actors, removed the dead selectedCatalogEntry helper and kept SQL/12codes/order. UI defaults to Actuales while API default stays all; status/filter changes remain behind the draft transition guard. Catalog reads are independent with GET-only retry; counts distinguish records/pieces and mark incomplete reads; unknown codes show Condición no reconocida and unsupported authoring is blocked. tsc and Biome222files pass; proof in3.3.

### S4 Spatial selection and compact editor

- [x] 2.4 Deliver full/quadrant responsive piece controls, preserved FDI/draft, chart/list linking without hover mutation, truthful post-save states and applicable-field editor using existing anatomy/tokens/patterns. Consume S3's shared presentation in palette/chart/editor, render only populated catalog groups, retain single diagnosis heading and optional-empty surface semantics, and keep category organization independent of clinical selection/lifecycle.
  Traceability: OD02/OD07; R6–R7/R13–R17; G02–G08; H02/H04; D-04; S4.
  Blocked by: 3.3.
  Notes: 2026-10-06, `PatientOdontogram` measures its own container with ResizeObserver: below720px the SVG is a non-interactive overview and four named44px quadrant controls page up to eight/five teeth with wrapping44px targets; wide layouts keep the aligned overlay grid. Quadrant follows the selected FDI (upper patient-right by default) and resizes never reset it. `ConditionSymbol` gains an optional error slash; chart caption names all three persisted statuses plus draft. `PatientDiagnosis` now exposes one visible FDI context — the existing chart select plus an explicit `Elegir pieza`/`Cambiar pieza` affordance in the editor; whole-tooth codes render `Pieza completa, sin superficies` instead of five disabled checks, surface-capable empty drafts show `Sin superficies especificadas`, the preview is capped at96px on narrow containers, the note grows to about one-third viewport then scrolls, and tooth selection focuses the applicable surface/note input. Palette renders a single `Diagnóstico` heading for one populated category and44px native category controls only for multiple populated server categories, without touching drafts. Successful create/edit/resolve focus the exact saved record. See evidence.md S4.

### S5 Deliberate conflict review

- [x] 2.5 Deliver base/local/current comparison and explicit editable-field decisions; retain current untouched fields, forbid terminal edit/resolve rebase and provide D-03 correction-specific review/new-attempt confirmation against active/resolved sources; repeat recovery after another409.
  Traceability: OD05; R3/R8; D-03; S5.
  Blocked by: 2.1.
  Notes: 2026-10-06, edit/resolve drafts snapshot their starting surfaces/note as base. On409 the editor loads the latest owned source and shows per-field comparison lines; fields changed by both sides require explicit Mantener/Usar choices, one-sided changes auto-merge, unmodified fields adopt current values, and the retry uses the reviewed expected_revision with no generic rebase button. Resolve drafts must re-confirm resolution against the current active state. Terminal current (resolved/entered_in_error) blocks edit/rebasing with read/discard only; failed current reads block save and reload with GET only; a second409 refreshes the comparison and clears prior choices without losing the draft. Correction conflicts keep the D-03 review: reason/replacement retained, base/current source evidence shown, renewed confirmation freezes a new operation_id; already-corrected sources block new correction.

### S6 Safe navigation continuity

- [x] 2.6 Deliver canonical tab/clinical/focused UUID URL state with existing draft guard and deterministic invalid-value fallback.
  Traceability: OD08; R9/R15; G01/G08; S6.
  Notes: 2026-10-06, every committed view change now writes the canonical query through `sectionSearch` in PatientDetail: tab clicks always navigate (replace) and switching away from clinical drops clinical/condition while preserving unrelated params (note); clinical tab clicks restore the remembered subview. Diagnóstico/Evoluciones buttons write tab=clinical&clinical=diagnosis|evolutions, with Evoluciones dropping the condition focus. Detail path keeps precedence over query state; unknown tab/clinical enums fall back to Resumen/diagnosis and a malformed condition UUID is never fetched (existing regex guard). Draft dirty state keeps the existing transition guard on every tab/subview/directory switch.

## 3. Verification

- [x] 3.1 Pass S1 focused HTTP/real DB tests without skipped required live cases, migration legacy fixtures, receipt races/rollback and existing create/edit/resolve invariants using the execution recipe in evidence.md.
  Traceability: R1–R3/R11; S1; proof crosses HTTP and Postgres, not a repository stub only.
  Notes: 2026-10-06, evidence.md S1 section records51 focused passes, zero skips, including30 real workspace cases and15 new live correction/migration cases. Real0023 created/edited/resolved fixtures retain IDs/timestamps/snapshots at0024; corrected revision4 proves both expanded CHECKs, metadata/linkage guards reject invalid inserts, and downgrade retains correction/receipt. Ruff lint/format, mypy214files, tsc, Biome217files and696 frontend tests pass. Broader backend run stops at an unchanged glossary LF/CRLF byte comparison (239passed/41skipped/1failed); full repository health is not claimed. Disposable rows/databases cleaned; owned container/volume removed. S2/S3/S5 checkpoint unblocked; browser correction remains their scope.
- [x] 3.2 Pass S2 correction component and isolated browser flow, cancel and lost-response retry; compare API/DB/revision receipts.
  Traceability: R1/R4/R13; G03/G09; S2.
  Notes: 2026-10-06, isolated Docker app on loopback8001 and disposable Postgres0024 passed check-s2-correction.cjs. Real UI cancel causes zero writes; reviewed mobile replacement commits201 before response abort, identical frozen retry returns200/same receipt with no extra revision. Exact original/replacement history remains distinct after replacement edit. Resolved-original correction without replacement and confirmed-write/failed-GET recover with GET only; exact result receives focus. Direct Postgres matches both receipts, three conditions and seven revisions; screenshots1280/390 inspected, including long mobile review with reachable44px save. Final diagnosis17tests and full frontend709tests/83files, tsc, Biome219files and production Docker build pass. Strict OpenSpec/scoped diff checks pass. See evidence.md S2 for proof boundaries and cleanup.
- [x] 3.3 Pass S3 filtered reads/cursors/deep links/actor disclosure and DB Activity reconciliation without duplicates. Prove catalog-to-domain-to-migrated-DB applicability agreement with required live cases executed, legacy v1 compatibility, shared list/history/legend fallback, independent reads on catalog failure and synthetic entry/category composition without shipping a13thcode.
  Traceability: R4–R5/R14/R16–R17; G02/G06/G07; H01–H04; D-04; S3.
  Notes: 2026-10-06, owned disposable pgvector pg16 on loopback5545/network odontogram-s3-20261006, empty database migrated0024. Focused recipe passed52 cases with zero skips (4 contract,15 cursor,2 activity,31 live), including the migrated-DB catalog matrix: all12codes×both dentitions×all surface subsets/optional[] over HTTP plus direct SQL acceptance and CHECK rejection for nonempty surfaces on whole-tooth codes and unknown codes; mutation extras422; corrected Activity event IDs reconcile without duplicates; entered_in_error cursor binding rejects mismatched filters. Frontend full suite720tests/84files plus33 focused; tsc, Biome222files, ruff214files, mypy214files and production build pass; legacy v1 normalization, synthetic entry/category composition and catalog-failure independent reads proven. openspec strict validation and scoped diff check pass. Teardown verified zero fixture patients/conditions/revisions and removed the owned container, anonymous volume and network; no commit. Proof limits: no new browser checker, assistive-technology/contrast coverage deferred to3.8, S4 chart ergonomics untouched. See evidence.md S3.
- [x] 3.4 Pass S4 all six exact viewports, visual-contract state matrix and desktop Assistant open/closed, every permanent/primary quadrant, keyboard/focus/44px targets and selected FDI after resize. Reconcile the same entry across all six views, category keyboard/touch/no-write behavior, no empty future tabs and optional-empty surfaces; retain clinical glyph geometry across statuses.
  Traceability: R6–R7/R13–R17; G02–G08; H02/H04; D-04; S4; no page overflow or mandatory duplicate selection.
  Notes: 2026-10-06, owned disposable app on loopback8001 and Postgres0024 passed check-s4-odontogram.cjs. All six sizes: no page overflow, exactly one FDI context, zero undersized44px targets; wide chart at1440 (801px) uses the aligned overlay,1280/1024/768/430/390 use quadrant paging with four named quadrant controls and all32 permanent/20 primary FDI reachable. Selected16 survives quadrant switches and390→1024 resize without reselection; hover never mutates the draft and Space selects a named piece. Whole-tooth shows the compact statement with no surface checks; single Diagnóstico heading renders and no empty family tabs exist. Create at1440 saves piece16/CariesO and focus lands on the exact saved record. Assistant opened/closed at1440/1280/1024 reflows the chart to quadrant mode (577/451/261px) with44px targets and no overflow; zero page errors. Direct DB read matches one created condition/revision at0024. Screenshots and s4-browser.json recorded; geometry was asserted programmatically — visual pixel inspection and real assistive technology remain3.8. See evidence.md S4.
- [x] 3.5 Pass S5 real two-tab disjoint/same-field race, correction vs resolution and command-specific terminal/failed-read/repeated409 recovery without lost local or remote fields.
  Traceability: R3/R8; D-03; S5.
  Notes: 2026-10-06, owned disposable app on loopback8001 and Postgres0024 passed check-s5-conflict.cjs. Two real tabs: disjoint-field edit (B surfaces M→M,O, A note local) merged to revision3 with both fields intact; same-field note race required explicit choice, a second remote edit forced a second409 refresh that cleared choices and retained the draft, then committed local note at revision4; edit against a resolved current showed terminal read/discard only; correction conflicting with concurrent resolution retained reason and committed only after renewed review against the resolved source (revision6); correction against an already-corrected source blocked with reason retained; an aborted current read blocked renewed save and recovered via GET-only reload. Direct psql reconciles four conditions/fifteen revisions and zero page errors; screenshots and s5-browser.json recorded. See evidence.md S5.
- [x] 3.6 Pass S6 reload/back/forward/dirty-patient-switch and inspect URL for absence of clinical text/name/RUT.
  Traceability: R9/R15; G01/G08; S6.
  Notes: 2026-10-06, owned disposable app on loopback8001 and Postgres0024 passed check-s6-navigation.cjs. Bare ficha opens with no query; Clínica writes tab=clinical&clinical=diagnosis and reload restores diagnosis (not Resumen). A dirty diagnosis draft cancels a subview switch (URL/draft retained) and discards into Evoluciones with zero writes; back/forward restore the committed evolutions/deep-link URLs; the focused condition deep link shows the exact record; a directory-mediated patient switch with a dirty draft cancels cleanly and discards to /patients without writing; unknown enums fall back deterministically and a malformed condition UUID is never fetched. All checked URLs carry no clinical text, patient name or RUT. Zero page errors; direct psql shows only the API-created condition/revision. Screenshots and s6-browser.json recorded. See evidence.md S6.
- [x] 3.7 Run integrated A–M and catalog extension/failure regression matrices,1/50/51/500fixtures and appropriate full repository validations; verify S2 replacement review consumes the shared catalog without changing frozen retries/atomicity. Record proof limits and clean up only owned environments.
  Traceability: R10/R12–R17; H01–H04; evidence.md; preserves ownership, retry, transaction, active uniqueness, recurrence and privacy.
  Blocked by: 3.1,3.2,3.3,3.4,3.5,3.6.
  Notes: 2026-10-06, owned disposable pgvector Postgres migrated0024 ran the live recipe with a new `test_pagination_complete_reads_at_50_51_500` (complete paged reads at50/51/500 with zero truncation/duplicates; the1-record case is covered by existing live reads). Live recipe53passed zero skips (contract/cursor/activity/workspace-live incl. the catalog-to-domain-to-SQL matrix and legacy v1/unknown-code CHECK probes). Catalog extension/failure matrices rerun through the same suites plus S3/S4 component cases; S2's frozen replacement retry and category-navigation tests still pass unchanged, proving the shared catalog does not alter frozen retries/atomicity. Full backend956passed/134skipped/1failed (pre-existing unrelated glossary CRLF byte-comparison, recorded as proof limit); ruff/mypy214files, tsc, Biome222files and the production Docker build pass; frontend746tests/84files. A–M mapping and cleanup are recorded in evidence.md. See evidence.md integrated section.
- [x] 3.8 Review integrated clinical language/correction vs resolution and manual accessibility; report actual contrast/screen-reader/virtual-keyboard coverage instead of inferring it from source.
  Traceability: R1/R4/R6/R10/R12; no taxonomy or clinical certification claim.
  Blocked by: 3.7.
  Notes: 2026-10-06, shipped strings reviewed end to end: Corregir registro vs Resolver condición are distinct commands with distinct reviews (`Se marcará como registrado por error, no como resuelto. Su historial se conserva.`); entered_in_error never looks active. No taxonomy or clinical certification claimed. `check-integrated-a11y.cjs` measured actual rendered colors on the disposable app: eight text/control pairs all ≥5.17:1 (muted text7.7, primary button5.17, headings18.03), keyboard focus+Space measured on real controls. Real assistive technology and device virtual keyboards are NOT COVERED in this environment and are reported as such (s8-a11y.json), not inferred from source.

## 4. Release Hygiene and Closeout

- [x] 4.1 Update shipped API/product/surface docs and verification skill/manual for correction, actors, views and navigation; note status-aware rollback boundary and retain deferred research/IA roadmap.
  Traceability: OD06/OD09/OD10/OD11/OD13/DP01–DP03; R10/R12; release truth after verification.
  Notes: 2026-10-06, docs/API.md documents the correction endpoint/receipt, entered_in_error status, additive catalog metadata, nullable DTO/correction fields, actor disclosure, canonical ficha URL state and the status-aware rollback boundary (never roll back to a status-unaware binary after correction writes; DB downgrade preserves data). .impeccable/surfaces/patient-workspace.md now describes field-aware conflict review, actor labels, current/history defaults and canonical URL state. .agents/skills/verify-dental-assistant/features/patients.md gains correction/actors/views/navigation manual checks. design.md's Deferred Research and IA Roadmap (OD06/09/10/13) remain unchanged and explicit; no readiness claim added.
- [x] 4.2 Update changelog when ready and run strict OpenSpec validation/traceability review; prepare sync/archive checklist including replacement of canonical resolve-and-create/read-only wording through the MODIFIED delta, without auto-syncing or archiving.
  Traceability: clinical-workspace-discovery delta; artifact compatibility and skill execution boundary.
  Notes: 2026-10-06, CHANGELOG.md entry added. `openspec validate harden-odontogram-human-workflow --strict` passes and change status isComplete; all29 task IDs checked with adjacent traceability and every Execution Order entry covered. sync-archive-checklist.md records the exact canonical wording replacements (resolved read-only → correction annotation; resolve-and-create scenario → separate correction command; explicit reload/rebase → field-aware comparison), the spec-sync steps, shipped-doc sync, human-review points and the archive command. No sync or archive was executed by the agent.
- [x] 4.3 Summarize proof by CODE/BROWSER/API/DB/TEST, unsupported checks, owned cleanup and human readiness; no agent-ready claim.
  Traceability: R10/R12; audit evidence contract.
  Notes: 2026-10-06, evidence.md integrated section records the CODE/BROWSER/API/DB/TEST summary, the A–M row mapping to executed proofs, unsupported checks (real assistive technology, device virtual keyboard, the pre-existing glossary CRLF test failure, no clinical taxonomy/readiness claim), verified owned cleanup (all disposable containers/volumes/networks/images removed, shared containers untouched) and the human-review list. No agent-ready claim is made.
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

### S3 — Current/history, actor and catalog
- Tasks: `0.3 -> 1.3 -> 2.3 -> 3.3`.
- Blocked by: 3.1.
- Checkpoint: actual/error history and safe actor visible with unchanged event identity; additive catalog, live SQL agreement and shared resolution/fallback proved.
- Blocks: S4, Integrated verification.

### S4 — Spatial selection and compact editor
- Tasks: `0.4 -> 1.4 -> 2.4 -> 3.4`.
- Blocked by: 3.3.
- Checkpoint: visual selection on all six sizes,44px targets, no reselection/overflow; shared catalog drives all six views with no empty families or clinical reinterpretation.
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
