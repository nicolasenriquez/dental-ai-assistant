# Execution baseline, tasks 0.1–0.6

Baseline commit `4c34e6a`, branch `feat/ai-assisted-evolutions`, 2026-10-06.
The working tree was clean at entry. This pass investigates existing behavior;
it does not implement S1–S6 or satisfy their future verification gates.
Traceability uses OD/R/G/H/D identifiers. No tracker issue or SDLC group exists.

## Codebase prime

Dental AI Assistant is an authenticated patient workspace with manual notes and
diagnoses, human-approved AI evolutions, Drive export and secondary video RAG.
FastAPI/Python, asyncpg/Postgres/pgvector and Alembic serve a React 18/Vite/
TypeScript/Tailwind frontend. Backend packages use uv; frontend uses Bun.
Both package manifests report version 0.1.0. Host pytest used Python 3.14.7;
the isolated app used its Docker Python 3.11 runtime.

`main.py` authenticates/mounts resource routers and applies migrations at startup.
`App.tsx` owns the data router and authenticated provider tree. Domain folders
hold clinical behavior, `db/` owns SQL/transactions, and typed `lib/api.ts`
owns frontend HTTP. pytest normally stubs the pool; explicit live fixtures
replace that pool with disposable Postgres. Vitest covers components/hooks;
Playwright drives browser behavior. Recent commits prepared D-03/D-04 and
correction/navigation specs; preceding fixes addressed stale clinical drafts
and Google signup pool handling.

## 0.1 S1, owned command/read/schema seams

- `routes/patient_conditions.py:81–138,149–164,236–304` validates commands,
  authenticates owner context and maps repository failures. Create/PATCH delegate
  directly to `db/patient_conditions_repo.py`; no application service exists yet.
- Repository `_parent` plus `_record` scope by owner and patient. Update locks
  the source, compares revision, recognizes exact latest PATCH retry before
  terminal rejection and commits resource/history together. Create compares
  original revision 1 for UUID retry. Active uniqueness and overlapping extents
  remain separate policies.
- Live schema head is `0023`. Migration `0022:24,62,67–68` admits only
  active/resolved and created/edited/resolved. Both
  `patient_tooth_condition_revisions_action_check` and
  `patient_tooth_condition_revisions_check` need additive expansion for corrected.
  Expanding action alone cannot insert a correction at revision >1.
- Current response/snapshot/client unions have no entered_in_error, linkage,
  correction metadata or receipt. Future design decision 2 preserves snapshots
  except status, adds nullable top-level metadata, keeps command_snapshot private,
  and locates an exact receipt revision through owned paged revision GETs.
- Canonical `clinical-workspace-discovery/spec.md:333–346` still specifies
  resolve-and-create/read-only resolution. This change's MODIFIED requirement
  has the same requirement name and replaces that policy under D-02/D-03;
  canonical synchronization belongs to explicit closeout, not this pass.

## 0.2 S2, editor/confirmation reuse

`PatientDiagnosis.tsx:174–227,267–367,487–689,796–847` already provides in-memory
drafts, explicit submit, frozen uncertain attempt, save/discard/remain dialog,
focus return and beforeunload. `PatientNoteNavigationGuard.tsx` uses router
`useBlocker`; `useTransitionGuard.tsx` guards local actions and same-origin links.
The existing Radix alert-dialog and Button cover correction confirmation.
Opening Resolver currently drafts a consequence and writes only on Guardar.
Correction should reuse these patterns, with separate reason/replacement and
reviewed Guardar corrección. No correction editor exists to verify yet.
The patient-workspace brief agrees with these existing guards.

## 0.3 S3, status/cursor/actor/catalog baseline

- API defaults to all. Route status and `ConditionsCursor` accept all/active/
  resolved; cursor binds patient, dentition, status, timezone and paging tuple.
  UI defaults to all, loads all pages and filters locally. Historical exact GET
  selects dentition/all. Future active UI default must not change API default.
- Activity selects revision UUID as event_id and condition UUID as resource_id
  directly from revision rows. It projects no notes/snapshots; actor is persisted
  user UUID with null display_name. UI currently omits null names on records/
  history and says Autor no disponible in Activity. Future UUID fallback needs
  no auth/profile schema change.
- `patients/conditions.py:15–45` has twelve ordered labels plus a separate
  four-code surface set: caries, incipient_caries, pigmentation, fracture.
  Every code accepts []; both dentitions use existing FDI checks. Nonempty
  canonical M,D,O,V,L subsets require one of those four codes.
- `0022:17–21,32–40` independently constrains both dentitions, exact codes,
  canonical arrays and surface-capable membership. Keep those historical SQL
  guards. D-04 consolidates runtime definitions, not migration imports.
- Version 1 catalog exposes code/label_es/surface_codes only. Sole production
  catalog consumer is PatientDiagnosis through the typed client. Additive
  categories/category_key/allowed_dentitions must retain these fields/order;
  new consumers normalize absent metadata from legacy responses.
- Catalog success currently gates condition reads (`PatientDiagnosis:104–129`).
  Records, chart and history repeat label/surface/status fallback logic.
  D-04 requires independent evidence reads and one presentation resolver.

## 0.4 S4, rendered widths and presentation consumers

Owned production build measured at 1280×800 and 390×844. See
`execution-baseline.json` and `execution-baseline-{1280,390}.png`.
At both sizes visible chart tooth buttons = 0, two FDI selectors render for
the same draft and selected-tooth preview exceeds the future 96px mobile cap.
Page horizontal overflow was absent. Actual chart widths, not viewport guesses,
are recorded in JSON. Cause: 960px inspector split leaves the desktop chart
below its separate 720px interactive-button threshold; narrow chart also falls
below that threshold (`PatientOdontogram:161–179`).

Palette and editor consume catalog directly in PatientDiagnosis; chart consumes
labels plus ConditionSymbol; list uses the same symbol directly; history gets
labels but separately formats status/surfaces. Existing symbol geometry is in
ConditionSymbol; surface/anatomy geometry stays in ToothDrawing/toothGeometry.
S3's resolver must feed palette/chart/editor/list/legend/history. No existing
shared concept legend or presentation resolver exists. Empty surfaces on a
surface-capable code mean unspecified extent, not whole-tooth scope. Current
generic Sin superficies text loses that distinction; whole-tooth editor still
renders five disabled checks.

## 0.5 S5, real two-page race reproduction

Two browser pages read the same owned condition and edit independently.
Both stale saves returned revision conflict and retained local notes.

| Case | Base | First save | Generic rebase + second save |
|---|---|---|---|
| Disjoint | rev1, M, Base | rev2, M/O, Base | rev3, M, Local disjoint |
| Same note | rev3, M, Local disjoint | rev4, M, Remote same-field | rev5, M, Local same-field |

Disjoint recovery demonstrably deletes remotely added O. Same-field recovery
has no field-specific choice. `PatientDiagnosis:637–653` changes expectedRevision
and serialized baseline while preserving the entire stale draft;
`267–292` always sends both note and surfaces. Serialized baseline detects
dirty state but is not a retained typed base/current comparison. Repository
locks and expected_revision work correctly; loss occurs after deliberate generic
UI rebase sends stale untouched fields against the fresh revision.
Terminal resolved rebase is disabled; failed current GET keeps recovery pending.
D-03 correction source/replacement recovery remains distinct future work.

Direct disposable DB read reconciled all five revision UUIDs with HTTP Activity
event IDs and final revision 5/M/Local same-field. No extra revision arose from
navigation or initial stale attempts. Exact IDs are in the JSON fixture.

| DB revision | Persisted after surfaces | Persisted after note | Revision/event UUID |
|---|---|---|---|
| 1 | M | Base | 113135bb-447e-4ee6-bf0c-ff9fb930b1d4 |
| 2 | M,O | Base | a1b56971-9caa-4caf-bec7-20912cedf0d2 |
| 3 | M | Local disjoint | 87225519-bb7d-4dd3-8c0a-4cfd5b572284 |
| 4 | M | Remote same-field | 0e148485-9df7-484e-ab3b-82762378cb52 |
| 5 | M | Local same-field | fcec641f-2b38-474c-9e38-8b5c2e4bb1c2 |

## 0.6 S6, URL and guarded navigation reproduction

Bare ficha → Clínica leaves search empty; reload selects Resumen. Clinical
subview buttons also keep local state unless leaving an evolution path.
`PatientDetail:304–310,367–385` explains the missing committed query state.
Existing clinical=evolutions parsing and evolution-path precedence remain.
Malformed focused UUID already fails locally before GET in PatientDiagnosis.

SPA browser back and forward each demonstrated cancel (URL/draft retained)
and accepted discard. Patient navigation through Pacientes demonstrated
cancel, discard and opening the other synthetic patient. Final condition count
remained one. Navigation proof intentionally uses real in-app links; initial
full-document page.goto history did not test React Router blocking and was
replaced with SPA history setup. Persisted location and dirty guards are separate.

## Commands, environment and proof limits

- `openspec status --change "harden-odontogram-human-workflow" --json` and
  `openspec instructions apply --change "harden-odontogram-human-workflow" --json`
  resolved the context and explicit dependency order. Requested 0.x scope
  inspects each slice's baseline; implementation checkpoint dependencies remain.
- Focused backend HTTP/cursor/Activity suites: 20 passed, no skips.
- Existing live condition/Activity suites: 5 passed, 10 deselected, no skips,
  using WORKSPACE_LIVE_TEST_DSN on owned migrated Postgres.
- Focused PatientDiagnosis/Odontogram/Activity/PatientDetail Vitest: 29 passed.
  Existing React Router, act and Python deprecation warnings remain.
- `check-execution-baseline.cjs` uses installed Playwright from frontend and
  requires ODONTOGRAM_BASELINE_DISPOSABLE=1. Run with Bun from repo root against
  the owned localhost:8001 environment; it writes this change's JSON/screenshots.
  These assertions reproduce baseline defects, not future regression expectations.
- agent-browser was unavailable; installed Playwright API provided browser proof.
- Dedicated Docker network/app/database were created for this pass, without
  shared mounts or application credentials. App image was built from baseline.
  Signup limiter blocked a rerun; only disposable signup audit rows were cleared
  before creating a new synthetic owner. Runtime security behavior was unchanged.
- Cleanup verified the app had no mounts and Postgres used only its own anonymous
  volume on odontogram-scope-lock-20261006. Both owned containers, that volume,
  the network and the dedicated image tag were removed. Shared containers stayed
  running. No browser auth state or fixture password was saved.
- Strict OpenSpec validation, JavaScript syntax check and git diff --check passed.
  Only baseline artifacts/task evidence changed; no full runtime release gate
  or commit was requested.
- New correction atomicity, D-04 extension/failure fixtures, all-code live SQL
  matrix, six-size layout gates, real assistive technology, contrast and virtual
  keyboard remain future proofs. Existing live cases are baseline evidence only.

Focused commands, using repository working directories:

```powershell
# app/backend; WORKSPACE_LIVE_TEST_DSN points only to the owned disposable database.
uv run pytest tests/test_patient_conditions_contract.py tests/test_patient_cursor_transport.py tests/test_patient_activity.py -xvs -ra
uv run pytest tests/test_clinical_workspace_live.py -k 'condition or activity_revision' -xvs -ra

# app/frontend
bun run test src/components/patients/PatientDiagnosis.test.tsx src/components/patients/PatientOdontogram.test.tsx src/pages/PatientDetail.test.tsx src/components/patients/PatientActivity.test.tsx

# repo root; owned disposable app on localhost:8001, migrations already applied.
$env:ODONTOGRAM_BASELINE_DISPOSABLE='1'
bun openspec/changes/harden-odontogram-human-workflow/check-execution-baseline.cjs
```
