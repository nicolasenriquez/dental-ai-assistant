# Evidence and finding disposition

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
