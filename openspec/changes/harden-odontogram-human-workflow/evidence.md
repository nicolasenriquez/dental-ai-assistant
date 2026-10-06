# Evidence and finding disposition

## Integrated verification and closeout, 2026-10-06

Executed `3.7 -> 3.8 -> 4.1 -> 4.2 -> 4.3` after all six slices completed.
Traceability is R10/R12–R17, H01–H04 and OD06/OD09/OD10/OD11/OD13/DP01–DP03.
No tracker sync, archive, commit or push was performed.

- CODE: shipped strings reviewed end to end (see tasks4.1/3.8). Docs updated:
  `docs/API.md` (correction endpoint/receipt, entered_in_error, additive
  catalog, nullable DTO fields, actor disclosure, canonical ficha URL state,
  rollback boundary), `.impeccable/surfaces/patient-workspace.md`
  (field-aware conflict review, actor labels, current/history defaults, URL
  state), `.agents/skills/verify-dental-assistant/features/patients.md`
  (correction/actors/views/navigation manual checks), `CHANGELOG.md`
  entry. `design.md`'s Deferred Research and IA Roadmap retained unchanged.
- TEST: new live `test_pagination_complete_reads_at_50_51_500` proves
  complete paged reads at50/51/500 records with zero truncation/duplicates
  (the1-record case is covered by existing live reads). Live recipe53
  passed with zero skips. Full backend956passed/134skipped/1failed — the
  single failure is the pre-existing unrelated glossary CRLF
  byte-comparison (`test_clinical_catalog_build.py`), unchanged by this
  change and recorded as a proof limit. ruff/format/mypy214files,
  tsc, Biome222files, frontend746tests/84files and the production Docker
  build pass. S2's frozen-replacement-retry and category-navigation cases
  still pass unchanged: the shared catalog alters neither frozen retries
  nor atomicity.
- API/DB: owned disposable pgvector Postgres (loopback, migrated0024) ran
  the live recipe including the catalog-to-domain-to-SQL matrix, legacy
  v1/unknown-code CHECK probes, ownership/receipt races and the new
  pagination fixtures; teardown removed the container/volume.
- BROWSER: all five slice checkers (S2/S4/S5/S6 + baseline) were run on
  owned disposable apps at localhost:8001 across the session; integrated
  pass reruns the suites and adds `check-integrated-a11y.cjs`.

### A–M regression matrix disposition

| Case | Executed proof |
|---|---|
| A E2E+DB empty patient,16 CariesO save/reload | S4 checker (1440 create, focus, DB reconcile) |
| B E2E+contract O→M,O canonical | S4/S5 checkers + contract suite |
| C E2E+contract whole-tooth compact no-surfaces | S4 checker + live SQL CHECK probes |
| D E2E+DB exact active duplicate | component tests (duplicate → open existing) + contract suite |
| E E2E+DB edit/no-op/increment | S5 checker (merged edits r2/r3/r4) + contract suite |
| F E2E+liveDB two-tab disjoint/same-field | S5 checker (two real tabs, second409, no lost fields) |
| G E2E+liveDB resolve vs correct | S5 checker (correction vs resolution renewed review) + S2 checker |
| H E2E+DB recurrence/linked replacement | S1/S3 live suites (replacement linkage, supersedes) |
| I E2E bare URL/back/reload/dirty switch | S6 checker (canonical URL, reload, cancel/discard, zero writes) |
| J API+liveDB foreign access | live suites (foreign UUID/source404 without disclosure) |
| K E2E+contract permanent+primary | S3 live catalog matrix (12 codes × both dentitions) + S4 checker |
| L E2E6sizes visual selection | S4 checker (all six sizes, 44px, quadrants, no reselection) |
| M component/E2E/manual a11y | S4 keyboard + integrated contrast/keyboard checker; AT/virtual keyboard NOT COVERED (see below) |

### Unsupported checks and proof limits

- Real assistive technology (screen readers) and device virtual keyboards
  were NOT exercised: this environment has neither. `s8-a11y.json` records
  that explicitly; accessible-name/snapshot assertions and measured
  keyboard remain the coverage.
- Contrast was measured from actual rendered styles on the disposable app:
  eight pairs, all ≥5.17:1 (minimum = primary button white/blue5.17,
  muted text7.7, headings18.03).
- Full backend run stops at the pre-existing glossary CRLF byte-comparison
  failure; it is unrelated to this change and needs its own issue.
- No clinical taxonomy certification, performance SLA or agent-ready claim
  is made. OD06/09/10/13 and the IA roadmap remain explicitly deferred in
  `design.md`.

### Cleanup

All owned disposable resources created during this change were removed:
five app/DB container pairs (S2/S4/S5/S6/integrated), the S3 loopback
Postgres, associated anonymous volumes and networks, and all verification
image tags. Shared `dynachat-*`/`dentalpin-*` containers were never
touched. `sync-archive-checklist.md` holds the human-gated sync/archive
steps; strict OpenSpec validation passes and the change is complete but
not archived.

## S6 safe navigation continuity, 2026-10-06

Executed `1.6 -> 2.6 -> 3.6` from the S5 working tree (uncommitted, per
slice convention); the `0.6` baseline reproduction (bare ficha→Clínica
retaining an empty query, reload returning Resumen, guarded
back/forward/patient navigation) closed with this slice. Traceability is
OD08, R9/R15 and G01/G08, without tracker groups or issues.

- CODE: `PatientDetail` now writes canonical query state on every committed
  view change via one `sectionSearch` helper: tab clicks always navigate
  (replace) from bare ficha or existing query state, switching away from
  clinical drops `clinical`/`condition` while preserving unrelated safe
  parameters (`note`), and returning to clinical restores the remembered
  subview. Diagnóstico/Evoluciones buttons write
  `tab=clinical&clinical=diagnosis|evolutions`, with Evoluciones dropping
  the condition focus. The evolution detail path keeps precedence over
  query state; unknown tab/clinical enums fall back deterministically to
  Resumen/diagnosis; a malformed condition UUID is never fetched (existing
  regex guard) and clinical text/name/RUT never enter the URL. The existing
  transition guard covers every tab/subview/directory switch, so canceled
  navigation restores the prior URL/UI and accepted discard navigates
  without writing.
- TEST: the first focused run recorded10 failing new S6 cases (no URL write
  from a bare ficha, subview switches never wrote `clinical=`, section
  switches replaced params). Ten component cases now pass: canonical
  tab/clinical pair from a bare ficha, fresh-load diagnosis/evolutions
  restoration, detail-path precedence, unknown enum defaults, malformed
  UUID never fetched, focused condition deep link inside diagnosis,
  section switches dropping clinical params while preserving `note`,
  subview switches dropping the condition focus, and canceled/accepted
  dirty navigation. Full frontend746passed/84files, tsc and
  Biome222files pass. Backend code did not change.
- BROWSER/API/DB: [runnable checker](check-s6-navigation.cjs) targets only
  the explicitly acknowledged disposable app at `http://localhost:8001`.
  [Results](s6-browser.json) plus [reload](s6-reload-diagnosis.png) and
  [dirty guard](s6-dirty-guard.png) screenshots. A bare ficha opens with no
  query; clicking Clínica writes `tab=clinical&clinical=diagnosis` and a
  reload restores diagnosis, not Resumen. A dirty diagnosis draft cancels a
  subview switch with URL/draft intact and discards into Evoluciones with
  zero writes; back/forward restore the committed evolutions and deep-link
  URLs; the focused condition deep link shows the exact record; a
  directory-mediated patient switch with a dirty draft cancels cleanly and
  discards to `/patients` without writing; unknown enums fall back
  deterministically and a malformed condition UUID is never fetched. Three
  URL states were inspected for clinical text, patient name and RUT — none
  leaked. Zero page errors. Owned disposable Postgres (loopback,
  `odontogram-s6-db-20261006`, anonymous volume, network
  `odontogram-s6-20261006`) migrated to0024; direct psql shows only the
  API-created condition/revision (UI drafts wrote nothing).

Commands, from repository root unless noted:

| Command | Result |
|---|---|
| `bun run test src/pages/PatientDetail.test.tsx` from `app/frontend/` |27passed; first run10 failed (fail-first) |
| `bun run tsc --noEmit` / `bun x biome check src` from `app/frontend/` |Pass;222 files checked by Biome |
| `bun run test` from `app/frontend/` |746passed,84files |
| `docker build -f deploy/Dockerfile -t odontogram-s6:20261006 .` |Pass; built current UI/backend |
| `$env:ODONTOGRAM_S6_DISPOSABLE='1'; bun openspec/changes/harden-odontogram-human-workflow/check-s6-navigation.cjs` |Eight navigation/privacy scenarios pass, zero page errors |
| `docker exec odontogram-s6-db-20261006 psql -U odontogram -d odontogram -c "…"` |0024; one condition/one revision reconcile with API fixture |

No new runtime dependency, auth change, agent write path or catalog
expansion. The signup limiter blocked reruns from the loopback IP; only
owned disposable `signup_attempts`/patient/condition rows were cleared
between runs. Cleanup removed both owned containers, the owned anonymous
volume, the owned network and the verification image tag; shared containers
stayed running. All six slices are now complete; integrated verification
and closeout (3.7–4.3) remain. No tracker sync, archive, commit or push was
performed.

## S5 deliberate conflict review, 2026-10-06

Executed `1.5 -> 2.5 -> 3.5` from baseline `8e92772` (S4 proof committed);
S1's completed `3.1` unblocked the slice. Traceability is OD05, R3/R8 and
D-03, without tracker groups or issues. The `0.5` baseline reproduction
(remote M,O→stale M loss after generic rebase, same-note overwrite) closed
with this slice.

- CODE: edit/resolve drafts snapshot their starting surfaces/note as base
  alongside the existing dirty baseline. On409 the editor loads the latest
  owned source and shows per-field comparison lines; fields changed by both
  sides require explicit `Mantener/Usar` choices, one-sided changes
  auto-merge, unmodified fields adopt current values, and the reviewed retry
  uses the latest expected_revision. The generic `Rebasar mis cambios`
  whole-payload rebase is gone. Resolve drafts must re-confirm resolution
  against the current active state. A current resolved/entered_in_error
  source blocks edit/rebasing with read/discard only; failed current reads
  block save and reload with GET only; a second409 refreshes the comparison
  and clears prior choices without losing the draft. Correction conflicts
  keep the D-03 review: reason/replacement retained, base/current source
  evidence and status shown, renewed confirmation freezes a new
  operation_id, and already-corrected sources block new correction.
- TEST: the first focused run recorded7 failing new/rewritten cases (the
  generic rebase button still existed). Nine S5 component cases now pass:
  disjoint-field auto-merge, same-field note/surface explicit choices,
  repeated409 refresh, failed-current-read blocking, terminal edit guards,
  resolve re-confirmation and the correction conflict matrix. Focused
  diagnosis suite35passed; full frontend736passed/84files, tsc and
  Biome222files pass. Backend code did not change.
- BROWSER/API/DB: [runnable checker](check-s5-conflict.cjs) targets only the
  explicitly acknowledged disposable app at `http://localhost:8001`.
  [Results](s5-browser.json) plus
  [disjoint](s5-disjoint-conflict.png)/[same-field](s5-samefield-conflict.png)/[repeat](s5-repeat-conflict.png)/[terminal edit](s5-terminal-edit.png)/[correction vs resolution](s5-correct-vs-resolve.png)/[terminal correction](s5-terminal-correct.png)
  screenshots. Two real tabs on one session: B changed surfaces while A
  changed only the note; A's retry committed revision3 with note `Nota local
  A` and surfaces `M,O` — neither field lost. A same-field note race forced
  an explicit `Mantener mi nota` choice, a second remote edit forced a
  second409 that refreshed the comparison, cleared the choice and retained
  the draft, then committed local note at revision4. Editing a source
  resolved in the other tab showed `Este registro ya está resuelto…` with
  read/discard only. A correction opened before a concurrent resolution
  retained its reason, showed the renewed review with `Fuente actual` and
  committed only after confirmation (revision6, entered_in_error). A
  correction against an already-corrected source blocked with reason
  retained. An aborted current read blocked renewed save and recovered
  through `Cargar versión actual` with GET only. Zero page errors. Owned
  disposable Postgres (loopback, `odontogram-s5-db-20261006`, anonymous
  volume, network `odontogram-s5-20261006`) migrated to0024; direct psql
  reconciles four conditions and fifteen revisions exactly (36:
  created/edited/edited/resolved; 46:
  created/edited/edited/edited/resolved/corrected; 11:
  created/corrected; 21: created/edited/corrected).

Commands, from repository root unless noted:

| Command | Result |
|---|---|
| `bun run test src/components/patients/PatientDiagnosis.test.tsx` from `app/frontend/` |35passed; first run7 failed (fail-first, generic rebase present) |
| `bun run tsc --noEmit` / `bun x biome check src` from `app/frontend/` |Pass;222 files checked by Biome |
| `bun run test` from `app/frontend/` |736passed,84files |
| `docker build -f deploy/Dockerfile -t odontogram-s5:20261006 .` |Pass; built current UI/backend |
| `$env:ODONTOGRAM_S5_DISPOSABLE='1'; bun openspec/changes/harden-odontogram-human-workflow/check-s5-conflict.cjs` |Six two-tab conflict/recovery scenarios pass, zero page errors |
| `docker exec odontogram-s5-db-20261006 psql -U odontogram -d odontogram -c "…"` |0024; four conditions/fifteen revisions reconcile with browser receipts |

No new runtime dependency, auth change, agent write path or catalog
expansion. The signup limiter blocked reruns from the loopback IP; only
owned disposable `signup_attempts`/patient/condition rows were cleared
between runs. Cleanup removed both owned containers, the owned anonymous
volume, the owned network and the verification image tag; shared containers
stayed running. S6 navigation continuity remains the final slice. No
tracker sync, archive, commit or push was performed.

## S4 spatial selection and compact editor, 2026-10-06

Executed `1.4 -> 2.4 -> 3.4` from clean baseline `47597ad`; S3's completed
`3.3` unblocked the slice. Traceability is OD02/OD07, R6–R7/R13–R17,
G02–G08, H02/H04 and D-04, without tracker groups or issues.

- CODE: `PatientOdontogram` measures its own container via ResizeObserver.
  Below720px the SVG becomes a non-interactive overview and four named44px
  quadrant controls (`Superior derecha/izquierda`, `Inferior
  derecha/izquierda`) page up to eight permanent/five primary teeth in a
  wrapping44px grid; wide layouts keep the existing aligned overlay.
  The active quadrant follows the selected FDI (upper patient-right by
  default) and viewport changes never reset it. `ConditionSymbol` gains an
  optional error slash outside the concept geometry; the chart caption names
  all three persisted statuses plus the draft. `PatientDiagnosis` now has one
  visible FDI context: the existing chart select plus an explicit
  `Elegir pieza`/`Cambiar pieza` editor affordance that focuses it.
  Whole-tooth codes render `Pieza completa, sin superficies` instead of five
  disabled checks; surface-capable empty drafts show `Sin superficies
  especificadas`; the preview is capped at96px on narrow containers; the note
  autosizes to about one-third viewport then scrolls; choosing a tooth
  focuses the applicable surface/note input. Palette renders one plain
  `Diagnóstico` heading for a single populated category and44px native
  category controls only for multiple populated server categories, without
  writes or draft loss. Successful create/edit/resolve focus the exact saved
  record.
- TEST: the first focused run recorded3 failing new odontogram cases (two
  ambiguous text queries colliding with SVG titles and one wrong no-surface
  premise); after correcting those tests the focused diagnosis/odontogram
  suite passes35/35. New coverage: quadrant paging and named controls, all32
  permanent and20 primary FDI reachable across four quadrants, no selection
  change on quadrant switch, selected-quadrant-first behavior, whole-tooth
  versus optional-empty accessible wording, entered_in_error slash marker,
  single FDI context, single/multi-category heading and navigation without
  writes, no-hover-mutation and create/edit/resolve post-save focus.
  Full frontend729tests/84files, tsc, Biome222files and the production Docker
  build pass. Backend code did not change.
- BROWSER/API/DB: [runnable checker](check-s4-odontogram.cjs) targets only the
  explicitly acknowledged disposable app at `http://localhost:8001`.
  [Results](s4-browser.json) plus
  [1440](s4-odontogram-1440.png)/[1280](s4-odontogram-1280.png)/[1024](s4-odontogram-1024.png)/[768](s4-odontogram-768.png)/[430](s4-odontogram-430.png)/[390](s4-odontogram-390.png)
  screenshots. All six sizes: no page overflow, exactly one FDI context, zero
  undersized44px targets; the1440 chart (801px) uses the aligned overlay
  while1280/1024/768/430/390 (641/704/448/385/345px) use quadrant paging with
  four named controls and every permanent/primary FDI reachable. Selected16
  survives quadrant switches and a390→1024 resize without reselection; hover
  never mutates the draft and Space selects a named piece. Whole-tooth shows
  the compact statement with no surface checks; a single Diagnóstico heading
  renders and no empty family tabs exist. A1440 create of piece16/CariesO
  focuses the exact saved record. Opening the Assistant at1440/1280/1024
  reflows the chart to quadrant mode (577/451/261px) with44px targets and no
  overflow; zero page errors. Owned disposable Postgres (loopback5546,
  `odontogram-s4-20261006`, anonymous volume) migrated to0024; direct psql
  reads match exactly one created condition/revision and the final count1.
  Geometry and behavior were asserted programmatically; screenshot pixel
  inspection by a human and real assistive-technology/contrast coverage
  remain3.8.

Commands, from repository root unless noted:

| Command | Result |
|---|---|
| `bun run test src/components/patients/PatientDiagnosis.test.tsx src/components/patients/PatientOdontogram.test.tsx` from `app/frontend/` |35passed; first run3 failed (new-test selector defects, fixed) |
| `bun run tsc --noEmit` / `bun x biome check src` from `app/frontend/` |Pass;222 files checked by Biome |
| `bun run test` from `app/frontend/` |729passed,84files |
| `docker build -f deploy/Dockerfile -t odontogram-s4:20261006 .` |Pass; built current UI/backend |
| `$env:ODONTOGRAM_S4_DISPOSABLE='1'; bun openspec/changes/harden-odontogram-human-workflow/check-s4-odontogram.cjs` |Six-viewport browser/API/layout cases pass, zero page errors |
| `docker exec odontogram-s4-db-20261006 psql -U odontogram -d odontogram -c "…"` |0024; one condition/one created revision reconcile with browser save |

No new runtime dependency, auth change, agent write path or catalog
expansion. Signup limiter blocked reruns from the loopback IP; only owned
disposable `signup_attempts`/patient rows were cleared between runs. S5
field-conflict recovery and S6 navigation remain future slices. Cleanup
removed both owned containers, the owned anonymous volume (identified by
creation time), the owned network and the verification image tag; shared
containers stayed running. No tracker sync, archive, commit or push was
performed.

## S3 current/history, actor and catalog, 2026-10-06

Executed `1.3 -> 2.3 -> 3.3` from clean baseline `b2711d4`; S1's completed
`3.1` unblocked the slice. Traceability is OD03/OD04, R4–R5/R14/R16–R17,
G02/G06/G07, H01–H04 and D-04, without tracker groups or issues. Uncommitted
partial S3 work existed at entry and was adopted by explicit user decision,
then repaired; no commit or tracker sync was performed.

- CODE: backend `CONDITION_DEFINITIONS` consolidates labels, `category_key`
  and applicability; `CATALOG`/`SURFACE_CODES`/validation derive from it and
  the version1 route now also returns `categories` plus per-entry
  `category_key`/`allowed_dentitions`. Repairs: `PatientOdontogram` and
  `PatientConditionHistory` accept an optional catalog and resolve
  labels/surfaces/symbols through `odontogramPresentation` with a labels
  fallback; history renders `PatientActorLabel`; the dead
  `selectedCatalogEntry` helper and ES2021 `replaceAll` use were removed.
  `PatientDiagnosis` defaults to Actuales while the API default stays all,
  keeps filter changes behind the draft transition guard, loads the catalog
  independently with GET-only retry, blocks unsupported authoring, shows
  `Condición no reconocida` fallbacks and marks incomplete counts.
- TEST: fail-first before repair recorded tsc5 errors and five failing focused
  frontend cases (three mock-ordering cases plus an error record hidden by the
  new active default and the new empty-current wording). Added
  entered_in_error cursor round-trip/binding rejection, additive catalog and
  extra-field contract asserts, SQL whole-tooth/unknown-code rejection probes,
  actor UUID fallback/collision/full-disclosure in records, Activity and
  history, synthetic entry/category list/palette/legend, unknown saved code,
  history catalog surfaces and incomplete-count assertions. Focused frontend33
  and mocked backend21 pass; final full frontend720tests/84files, tsc, Biome222
  files and production build pass; ruff/mypy214files pass.
- API/DB: owned disposable `pgvector/pgvector:pg16` container
  `odontogram-s3-db-20261006` on loopback5545 with network
  `odontogram-s3-20261006` and an anonymous volume; no shared mounts or
  credentials. An empty database migrated to0024. The focused recipe passed52
  cases with zero skips (4 contract,15 cursor,2 activity,31 live). The new live
  case proves catalog-to-domain-to-migrated-DB agreement for all12codes, both
  dentitions and every M,D,O,V,L subset including optional[], over HTTP and
  direct SQL, with CHECK rejection for nonempty surfaces on whole-tooth codes
  and unknown codes and422 for authority extras. Existing live Activity
  reconciliation (revision event IDs, pagination ties, ownership, corrected
  mapping) passed unchanged. Direct reads after teardown checks showed0024 and
  zero fixture patients/conditions/revisions.

Commands, from repository root unless noted:

| Command | Result |
|---|---|
| `bun run tsc --noEmit` / `bun x biome check src` from `app/frontend/` |Pass;222 files checked by Biome |
| `bun run test` from `app/frontend/` |720passed,84files |
| `bun run build` from `app/frontend/` |Pass (existing chunk-size warning) |
| `uv run ruff check .` / `uv run ruff format --check .` / `uv run mypy .` from `app/backend/` |Pass;214 files |
| `uv run pytest tests/test_patient_conditions_contract.py tests/test_patient_cursor_transport.py tests/test_patient_activity.py tests/test_clinical_workspace_live.py -q -ra` with `WORKSPACE_LIVE_TEST_DSN` |52passed, zero skips |
| `openspec validate harden-odontogram-human-workflow --strict` / scoped `git diff HEAD --check` |Pass |
| `docker exec odontogram-s3-db-20261006 psql -U odontogram -d odontogram -t -c "…"` |0024; zero fixture patients/conditions/revisions |

No new runtime dependency, auth change, agent write path or catalog expansion.
S3 did not add a browser checker (explicit user decision); filtered reads,
deep links and actor disclosure are proven at component/HTTP/DB level.
Assistive technology, contrast and virtual-keyboard coverage remain for3.8;
S4 owns six-viewport chart/editor ergonomics and consumes this presentation
boundary. The broader backend suite was not rerun; S1's recorded glossary
LF/CRLF failure and shared environment remain untouched. Existing build and
React test warnings remain. Cleanup removed the owned container, anonymous
volume and network and preserved shared containers.

## S2 explicit correction UI, 2026-10-06

Executed `1.2 -> 2.2 -> 3.2` from clean baseline `37402de`; S1's completed
`3.1` unblocked the slice. Traceability is OD01, R1/R4/R8/R13, D-03 and
G03/G09, without tracker groups or issues.

- CODE: `PatientDiagnosis` reuses the draft editor, transition/router guards and
  Radix confirmation. The review includes existing masked `PatientIdentity`,
  original identity/evidence, required reason, consequence and optional replacement
  from the existing catalog. Only the confirmed correction calls the typed POST;
  replacement is never created with a second command. Uncertain attempts retain
  operation ID and normalized body; definitive revision conflicts retain content,
  fetch the owned source and require a new confirmation/operation. Terminal or
  unreadable current sources block renewed correction. Patient-keyed lifetime
  checks prevent late responses from changing another patient's UI.
- TEST: four initial correction tests failed because `Corregir registro` did not
  exist; seven incumbent diagnosis tests passed. Ten added component cases cover
  cancellation/review, both replacement modes, frozen retry,404/409 retention,
  renewed review after concurrent resolution, failed-current-read/terminal guards,
  exact revision paging/failure/missing target/focus, confirmed-write/failed-GET
  recovery, persisted-link failed GET and late-patient response isolation. Focused
  diagnosis/chart/detail suite initially passed35tests; final diagnosis suite
  passed17tests after the additional persisted-link regression. Full frontend
  passed709tests in83files; Biome checked219files
  and tsc passed. Concurrent Assistant work appeared after the initial clean status;
  those changes were preserved. Full-suite totals describe the shared working tree.
- BROWSER/API: [runnable checker](check-s2-correction.cjs) targets only the explicitly
  acknowledged disposable app at `http://localhost:8001`. [Results](s2-browser.json)
  record zero page errors, zero correction writes on review/cancel, unchanged source
  revision after cancel, and reviewed replacement from16to26 at390×844. The first
  real POST committed201; the checker then aborted its browser response. The UI
  froze fields and explicitly retried the identical command, receiving200 and the
  same receipt. A later replacement edit did not replace its exact created snapshot
  in the receipt history. A resolved36original was corrected without replacement
  at1280×800; a failed subsequent owned GET displayed confirmed-save/stale-read
  feedback, and link retry issued GET only. Exact history targets received focus.
  [Mobile review](s2-review-390.png) and [desktop review](s2-review-1280.png) were
  inspected; masked identity, consequence and both actions remain visible.
  A long-reason review also fits390×844, with scroll-reachable44px save/cancel
  controls. [Long mobile review](s2-long-review-390.png) records the scrolled state;
  title/context remain available by scrolling upward, without clipping actions
  outside the viewport. Exact history starts after the owned condition GET succeeds.
- DB: owned `odontogram-s2-db-20261006`, pgvector PostgreSQL16, anonymous volume,
  isolated network `odontogram-s2-20261006`; no shared data or credentials. Startup
  migrated the empty database to0024. Direct psql reads matched every revision UUID
  in `s2-browser.json`, both operation IDs and replacement receipt linkage. Exactly
  three conditions and seven revisions exist for the fixture. Original16has
  created/corrected revisions1/2; replacement26has created/edited1/2 and immutable
  supersedes linkage; original36retains created/resolved/corrected1/2/3. The
  lost-response retry added neither a condition nor a revision.

Commands, from repository root unless noted:

| Command | Result |
|---|---|
| `bun run test src/components/patients/PatientDiagnosis.test.tsx src/components/patients/PatientOdontogram.test.tsx src/pages/PatientDetail.test.tsx` from `app/frontend/` |35passed |
| `bun run tsc --noEmit` / `bun x biome check src` from `app/frontend/` |Pass |
| `bun run test` from `app/frontend/` |709passed,83files |
| `docker build -f deploy/Dockerfile -t odontogram-s2:20261006 .` |Pass; built current UI/backend |
| `$env:ODONTOGRAM_S2_DISPOSABLE='1'; bun openspec/changes/harden-odontogram-human-workflow/check-s2-correction.cjs` |Five browser/API/layout cases pass, zero page errors |
| `docker exec odontogram-s2-db-20261006 psql -U odontogram -d odontogram -c "…"` |0024; three conditions/seven revisions reconcile with browser receipts |
| `openspec validate harden-odontogram-human-workflow --strict` / scoped `git diff --check` |Pass |

The direct DB reconciliation command reads only the owned disposable server:

```powershell
docker exec odontogram-s2-db-20261006 psql -U odontogram -d odontogram -c "SELECT version_num FROM alembic_version; SELECT id, tooth_fdi, status, revision, supersedes_condition_id FROM patient_tooth_conditions ORDER BY tooth_fdi; SELECT id, condition_id, revision, action, operation_id, replacement_condition_id, replacement_revision_id FROM patient_tooth_condition_revisions ORDER BY condition_id, revision;"
```

No new runtime dependency, auth change, agent write path or catalog expansion.
S3 still owns current/history defaults, actor labels and shared catalog presentation;
S4 owns six-viewport chart/editor ergonomics; S5 owns the general field-conflict
matrix. S2's browser proof covers the correction checkpoint, not those later gates.
Screen readers, device keyboards, contrast measurements, full baseline snapshots
and integrated/backend-full health were not verified in this slice. Existing build
and React test warnings remain. Backend code did not change; S1's recorded broader
backend failure remains unresolved. Both verification runs use a new isolated
database; the final artifacts record the second run, including long content.

Cleanup confirmed both owned app/DB containers and anonymous PostgreSQL volumes
removed, with no remaining final volume matching its inspected ID. The owned
network and verification image tag were removed. Shared application, PostgreSQL,
Whisper and DentalPin containers remain present and healthy. No tracker sync,
OpenSpec archive, staging, commit or push was performed.

## S1 correction API and persistence, 2026-10-06

Executed `1.1 -> 2.1 -> 3.1` from baseline `4c34e6a`, after the recorded
`0.1` investigation. Traceability remains OD01/OD12 and R1–R4/R11, with no
tracker group or issue. Existing uncommitted baseline evidence was preserved.

- CODE: additive migration `0024_condition_corrections.py`; shared Pydantic
  commands in `patients/conditions.py`; record/edit/resolve/correct application
  entry points in `patients/condition_service.py`; repository-owned atomic
  correction, source locks and normalized operation replay comparison.
- API: authenticated correction POST returns201 on commit and200 on identical
  replay, with exact original/replacement revision receipts. Conditions and
  revision pages expose nullable correction/linkage metadata; snapshots retain
  their original shape except the status union. Activity preserves revision event
  IDs and resource hrefs, adds `corrected`/`Condición corregida`, and exposes no
  reason, note or internal command snapshot. The typed client sends unchanged
  attempts and performs no automatic write retry.
- DB: standalone owned `pgvector/pgvector:pg16` container
  `odontogram-s1-20261006`, loopback-only port5544, anonymous volume, no shared
  application mounts or credentials. Migrated from empty to0023 for fail-first,
  then0024 for implementation proof. The migration regression creates its own
  UUID-named database on that server, applies0023, inserts created/edited/resolved
  evidence, applies0024 and compares all legacy fields/snapshots/timestamps. It
  proves both expanded revision CHECKs admit corrected revision4, rejects invalid
  revision/metadata/linkage writes, and confirms expand-only downgrade preserves
  correction status and replay receipts. That database is dropped in teardown.
- TEST: fail-first selected15 correction cases failed with zero skips (missing
  endpoint405 and missing additive DTO metadata). Final recipe below passes51
  checks with zero skips, including30 real workspace cases and15 new live
  correction/migration cases. Active/resolved originals, optional replacement,
  canonical surfaces/text, stable replay after replacement edits, changed replay,
  owner-scoped operation reuse, UUID/ownership404, duplicate rollback, overlapping
  identities, chained corrections and terminal edit/resolve guards are covered.
  Injected failures at corrected revision, real replacement insert and replacement
  revision roll back every write. Five race modes cover identical/distinct
  operations, synchronized same-operation/different-source unique-index collision,
  correction versus edit and correction versus resolution.
- BROWSER: no S1 browser claim. Existing component regressions remain intact;
  correction editor, status-aware presentation and conflict review belong to the
  remaining slices.

Commands and results, using repository working directories:

| Command | Result |
|---|---|
| `uv --project backend run alembic -c backend/alembic.ini upgrade head` from `app/`, temporary DATABASE_URL set to disposable DSN |0023→0024 succeeds |
| `uv run pytest tests/test_patient_conditions_contract.py tests/test_patient_cursor_transport.py tests/test_patient_activity.py tests/test_clinical_workspace_live.py -xvs -ra` from `app/backend/`, WORKSPACE_LIVE_TEST_DSN set |51 passed, zero skips |
| `uv run ruff check .` / `uv run ruff format --check .` / `uv run mypy .` |Pass;214 Python files formatted/typechecked |
| `bun run tsc --noEmit` / `bun x biome check src` from `app/frontend/` |Pass;217 files checked by Biome |
| `bun run test` |696 passed in81 files, including explicit lost-response correction client retry |
| `uv run pytest tests -xvs` with live DSN |Stops at unchanged `test_bundled_workspace_reproduces_reviewed_catalog`;239 passed,41 skipped,1 failed |
| `openspec validate harden-odontogram-human-workflow --strict` / `git diff HEAD --check` |Pass |

The broader backend failure compares compiler LF bytes to the Windows CRLF
checkout of `data/dental_ai_glossary_es_cl_v1.json`. `git ls-files --eol` confirms
index LF and worktree CRLF; S1 changes neither glossary nor compiler/test. The
full backend suite did not finish, so this is S1 checkpoint proof, not integrated
release health. Unconfigured non-workspace live suites skipped in that broader
run; required S1 live tests all executed. Existing Python/React/Vite warnings
remain. No browser/manual accessibility or production-size lock timing was
measured in S1.

Cleanup confirmed migration head0024 and zero fixture patients, conditions and
revisions, with no UUID-named migration databases remaining. The owned container
and its anonymous volume were removed. Existing shared containers were preserved.

## Execution scope lock, 2026-10-06

Tasks 0.1–0.6 were executed against baseline `4c34e6a`. See
[execution baseline](execution-baseline.md), its runnable
[browser checker](check-execution-baseline.cjs),
[measured results](execution-baseline.json) and
[1280px](execution-baseline-1280.png)/[390px](execution-baseline-390.png) screenshots.
This pass confirms the disjoint-field overwrite through two browser pages,
HTTP and direct disposable Postgres reads. Existing focused checks passed:
20 backend contracts, five required selected baseline live cases without skips,
and 29 frontend component tests. These prove current behavior, not correction
implementation or future S1–S6 gates. The earlier preparation evidence below
retains its original proof boundary.

## Baseline, not future implementation proof

Source: [audit report](C:/Users/nenri/.codex/visualizations/2026/10/05/01a10c97-3eb1-73c3-ab4b-6c9afab5a94a/auditoria-odontograma.md), [UI/API evidence](C:/Users/nenri/.codex/visualizations/2026/10/05/01a10c97-3eb1-73c3-ab4b-6c9afab5a94a/odontogram-evidence.json), [DB reconciliation](C:/Users/nenri/.codex/visualizations/2026/10/05/01a10c97-3eb1-73c3-ab4b-6c9afab5a94a/odontogram-db-evidence.json).

Previous audit: 11groups Playwright with real owned HTTP/Postgres,28 selected backend/12frontend tests. Four principal revisions and12Activity IDs reconciled. Six exact Assistant sizes. Piece controls measured32 at1440 and0 at1280/1024/768/430/390, with dropdown fallback. Environment removed; no shared clinical writes. This preparation phase runs artifact checks only.

| Finding | Disposition | Requirement/slice |
|---|---|---|
| OD01 | Approved correction≠resolution, required reason and optional atomic replacement | R1–R3/S1–S2 |
| OD02 | Visual controls restored across exact sizes | R6/S4 |
| OD03 | Safe actual actor UUID fallback; professional profile deferred | R5/S3 |
| OD04 | Active UI default, explicit history, no health inference | R4/S3 |
| OD05 | Field comparison required; suspected clobber awaits first proof | R8/S5 |
| OD06 | Taxonomy/procedure/examination research deferred | R12/closeout |
| OD07 | Applicable controls and selected FDI, compact mobile preview | R7/S4 |
| OD08 | Safe URL continuity/draft guards | R9/S6 |
| OD09 | Coexistence preserved; simultaneous mixed view deferred | R12/closeout |
| OD10 | Existing optional canonical surfaces preserved; clinical label changes deferred | R2/R12 |
| OD11 | Paging/incomplete-read fixtures1/50/51/500; no unmeasured speed promise | R10/integration |
| OD12 | Small shared condition application boundary, no framework/tool | R11/S1 |
| OD13 | IA approval/provenance roadmap only | R12/closeout |
| DP01 | Do not import ambiguous existing/performed taxonomy | R12 |
| DP02 | Shipped manual and verification-skill coverage | R10/closeout |
| DP03 | Preserve explicit commit and accessible controls | R1/R6–R7 |

## Future A–M Regression Matrix

Cleanup for every row: per-owner synthetic fixtures and teardown of verified own disposable project only; never shared volumes. UI/API/DB/audit assertions are independent.

| Case/layer | Precondition/action | UI expected | API expected | DB/audit expected |
|---|---|---|---|---|
| A E2E+DB | Empty patient;16CariesO, save/reload | Chosen piece, explicit saved |201/owned GET |1condition/rev1/actual actor; no draft write |
| B E2E+contract | O→M,O | Checks/drawing agree |200canonicalM,O |one revision |
| C E2E+contract | Whole-tooth code |Compact no-surfaces |[]valid; incompatible422 |created[]; no new obligations |
| D E2E+DB | Exact active duplicate |Retained draft/open owned existing |409duplicate |no duplicate/event; overlaps allowed |
| E E2E+DB |Edit note/surfaces;noop |Immutable identity/reload |expected_revision200 |increment once;noop/retry no event |
| F E2E+liveDB |Two-tab disjoint/same-field edits |Explicit base/local/current |409 then reviewed retry |remote untouched field retained |
| G E2E+liveDB |Resolve vs correct active/resolved |Distinct consequence/reason/cancel |Existing resolve/additive correction |Truthful status; optional replacement atomic |
| H E2E+DB |Recurrence/linked replacement |New identity/original accessible |newUUID201 |history conserved;supersedes link |
| I E2E |Bare URL/back/reload/dirty switch |Context preserved;cancel safe |owned exact-read |no navigation write |
| J API+liveDB |Actor2 uses actor1 IDs |No foreign data |404 tested paths |no mutation/disclosure |
| K E2E+contract |Permanent+primary51 |Correct per-piece dentition |invalidFDI/mismatch422 |coexistence;no mixed enum |
| L E2E6sizes |Every quadrant visual select |44px/no overflow/no reselection |reviewed piece saved |selection no write |
| M component/E2E/manual |Keyboard/focus/labels/contrast |Measured focus/state/a11y |none beforeSave |manual coverage labeled honestly |

Correction-specific proofs: replacement/revision failure rollback; duplicate rollback; identical operation retry stable receipt after replacement edits; frozen uncertain transport attempt; changed payload409; same-operation race one commit; distinct corrections/edit/resolve race; invalid reason/UUID/extra fields; foreign source/replacement UUID safe404; owner-scoped operation identity without disclosure of another owner's receipts; legacy null metadata/cursors; no automatic status migration.

Preserve explicit save, in-memory draft/guards, owner authorization, expected_revision, locks and atomic history, exact active uniqueness/overlap policy, no-op/retry policy, fresh recurrence identity, resolved readonly except distinct error annotation, Activity revision IDs and privacy. No auth/Drive/evolution/LLM expansion.

## Roadmap and proof limits

IA later requires shared application, minimal schemas/RBAC, immutable proposal, approval bound to patient/hash/revision, idempotency and attributable provenance. None is exposed as a tool here. Professional profile, taxonomy, combined mixed review, normal exam, plans/procedures and chart-wide replay need separate decisions. These are explicit deferrals rather than hidden unchecked tasks.

NOT VERIFIED in the audit: Pin writes/concurrency, large-volume speed, clinical nomenclature certification, real screen reader/contrast/virtual keyboard. Future verification must record actual coverage; spec validation cannot substitute for it.

## Subsequent reference closure and proof limits

G01–G09 map to R9/R13–R15 and existing S2/S3/S4/S6 in reference-gap-review.md. visual-contract.md defines the normative matrix; wireframes/odontogram-reference.html is synthetic composition only. wireframes/reference-check.json records96 rendered checks across six sizes, ten states, desktop panel open and primary fixtures. Screenshots review long names/notes, draft, conflict, correction and stale read. No production clinical write or runtime implementation was performed.

Future fail-first and integrated proofs must exercise all four command postconditions, confirmed-write/failed-GET versus uncertain-write feedback, exact result focus, stale patient responses, symbol/state separation, count units with incomplete paging, no hover mutation, anatomical quadrant order and existing clinical URL compatibility. Reference checks cannot replace these proofs. Real assistive technology and keyboard-on-device coverage must be reported explicitly.

## Reproducible verification recipes

These are future execution instructions, not a claim that runtime gates passed during preparation. Existing live tests patch the real pool after the default test stubs; see tests/test_clinical_workspace_live.py and .claude/references/testing.md.

1. Provision an owned disposable Postgres database with pgvector available. Use its plain postgresql:// DSN, not a shared application database. Record its isolation and current migration head without recording credentials.
2. Set WORKSPACE_LIVE_TEST_DSN to that DSN. From app/, apply migrations with DATABASE_URL temporarily pointing to the same disposable DSN; alembic.ini's script_location requires this cwd:

```powershell
# Environment WORKSPACE_LIVE_TEST_DSN must already point to the disposable database.
if (-not $env:WORKSPACE_LIVE_TEST_DSN) { throw 'WORKSPACE_LIVE_TEST_DSN required for live proof' }
$previousDatabaseUrl = $env:DATABASE_URL
try {
    $env:DATABASE_URL = $env:WORKSPACE_LIVE_TEST_DSN
    uv --project backend run alembic -c backend/alembic.ini upgrade head
    if ($LASTEXITCODE -ne 0) { throw 'Disposable database migration failed' }
} finally {
    $env:DATABASE_URL = $previousDatabaseUrl
}
```

3. From app/backend/, run focused HTTP/cursor/Activity contracts and real database tests. WORKSPACE_LIVE_TEST_DSN must remain set:

```powershell
if (-not $env:WORKSPACE_LIVE_TEST_DSN) { throw 'WORKSPACE_LIVE_TEST_DSN required for live proof' }
uv run pytest tests/test_patient_conditions_contract.py tests/test_patient_cursor_transport.py tests/test_patient_activity.py tests/test_clinical_workspace_live.py -xvs -ra
```

Required new correction cases must be included in these suites. S1 proof requires actual execution of those live cases without skips, not merely a zero exit code from the default mocked suite. Record executed tests, skips and migration coverage. Follow repository full-validation commands at integrated closeout. Teardown deletes only fixture-owned rows/environments.

For synthetic reference checks, from app/frontend/ with existing Bun dependencies installed:

```powershell
bun x playwright install chromium
bun ../../openspec/changes/harden-odontogram-human-workflow/wireframes/check-reference.cjs
```

The checker uses Playwright's installed Chromium by default. PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH optionally selects a local compatible binary; no personal path is embedded. The checker writes only this change's synthetic screenshots/reference-check.json. Layout results do not prove runtime commands, assistive technology or virtual-keyboard behavior.

## Preparation proof, 2026-10-06

The revised synthetic checker ran successfully using installed default Chromium:108 cases, zero page errors. Existing96 fixtures remain covered;12 added fixtures exercise correction without replacement and confirmed correction/failed-read at all six sizes. Screenshot inspection also verified the distinct original/replacement hierarchy and explicit outdated-chart label. No runtime app, API mutation or DB test ran in this closure. D-03, the canonical MODIFIED delta and DTO/revision-read defaults are traced in readiness-review.md.

## Extensibility preparation evidence and future proof

This later2026-10-06 pass inspected source/specs at Assistant a12812a and DentalPin fc36a71b; it did not repeat browser measurements or runtime tests. D-04 was explicitly selected through the one-question/three-option clarification. Source evidence and matrices are in extensibility-audit.md; normative closure is design decision9/R16–R17 and existing S3/S4 tasks. The previous108 synthetic checks do not exercise the new catalog contract or extension/failure fixtures.

| Gap | Source fact | Closure / required proof |
|---|---|---|
| H01 | conditions.py has CATALOG plus SURFACE_CODES;0022 separately constrains codes/surfaces | R16/S3 definitions drive API/service; real migrated DB agrees for all12codes, both dentitions, allowed surface subsets/[], rejects incompatible surfaces/unknown codes |
| H02 | API catalog has no category metadata; symbol/status presentation is separate and partly repeated | R17/S3/S4 single resolved presentation in palette/chart/editor/list/legend/history; synthetic new entry/category needs no component/status rewrite |
| H03 | SQL code CHECK prevents a newly added Python definition from persisting | R16/S3 current constraints unchanged; later vocabulary expansion explicitly requires additive migration and drift proof |
| H04 | PatientDiagnosis reads catalog before condition pages; optional[]/unknown category behavior lacks a complete contract | R17/S3/S4 independent evidence reads, catalog GET retry, safe unknown fallbacks and correct empty-surface text without inferred writes |

The extension fixture is frontend-only: use supported single-Condition applicability, a synthetic category descriptor and neutral geometry fallback. Assert presence/label/applicability/status across six views and keyboard category navigation without clinical selection/write. Keep production catalog exactly12. For domain/SQL drift, use the same disposable migrated-DB recipe above and test current domain definitions against externally observable HTTP/DB acceptance/rejection, not a test that merely copies lists or parses migration text. Required live catalog cases cannot be silently skipped.

Cross-feature failure proofs: catalog unavailable with saved/historical records available; legacy version1 missing additive fields; metadata refresh during a draft/frozen attempt; unknown persisted code versus known entry lacking geometry; unknown descriptor; surface-capable[] versus whole-tooth[]; categories must not change resolve/correct permissions, expected_revision, active uniqueness, idempotency or post-save read-only retry. Integrated proof includes correction replacements, both dentitions and actual Assistant open/closed reflow. Manual accessibility and clinical symbol review retain the existing explicit coverage limits.
