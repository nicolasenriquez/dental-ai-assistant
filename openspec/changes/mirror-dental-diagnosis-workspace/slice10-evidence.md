# Slice10 evidence

Date: 2026-10-07. Tasks: 1.10, 2.10, 3.11. Requirements: W8, W9, N5.

## Removal baseline

Baseline commit: `7983400`. Working tree was clean. No tracker or issue map belongs to this change.

| File / symbol | Active consumer before removal | Replacement / preservation proof |
|---|---|---|
| `PatientDiagnosis.tsx` `pieceButtonRef`, `firstSurfaceRef`, `Cambiar pieza` / `Elegir pieza` | Saved-condition modal; correction replacement tries to focus the background selector | Modal-local replacement FDI/concept controls; rendered correction/retry tests |
| `PatientDiagnosis.tsx` `ConditionAttempt.create`, create branch in `save`, `Nueva condición`, duplicate-create editor UI | No caller creates a non-correction draft; `start` edits and `startCorrection` corrects | `useDentalWorkspace.apply` owns chart creation; rendered one-command/retry tests. Duplicate/replay recovery remains in that hook. |
| `PatientDiagnosis.tsx` draft mutation in `chooseTool` / `chooseTooth` | Correction replacement shares background chart/palette handlers | Correction modal owns replacement values; chart events only inspect/apply |
| `toothGeometry.ts` `toothProfiles` | Export only; no import or reference in application/tests | Eight `anatomicalProfiles`, `toothAnatomy`, `toothOcclusalProfile`; rendered anatomy and browser family proofs |
| Old general-note read-only rail / parallel palette | Already migrated by preceding slices; no remaining read-only rail owner found | `useDentalClinicalNotes` owns one draft/feed; rail and Sheet are mutually exclusive render locations. `dentalGroups` feeds one palette. |
| `PatientDiagnosis.tsx` old `col-start-1` lower-editor layout, disabled multi/arch "próxima etapa" copy | Grid placement has no grid parent; all catalog scopes already shipped | Current chart/list/rail composition and enabled catalog metadata; public scope and full frontend tests |

Preserve `PatientNotes`, condition/general-note APIs, historical codes and unknown-code reads,
condition correction receipts/history/deep links, `ConditionSymbol` status badges, accessible
chart FDI selector, exact retry/conflict recovery, additive migrations and all recorded rows.
No schema retirement or permanent legacy toggle is part of this slice.

## Fail-first and preservation fixtures

The new modal-local correction test first failed at the absent `Pieza FDI del reemplazo`
control. It now changes tooth and concept inside the trapped modal and asserts one
correction command with the original UUID/revision, with no separate create/edit call.
The existing lost-response tests still freeze both correction and replacement identity.

`verify-slice10-compatibility.py` ran against archived pre-mirror backend `deb8878`
and an owned PostgreSQL16 database on schema0024. It created:

- Finding `d55c4dd9-6954-45bb-b8f8-fc9b875817fb`, fracture on16, legacy M/O surfaces,
  revision2 with its original revision history.
- Corrected primary finding `86212970-f3cd-4a57-955d-3fbc39713b91` on51 and linked
  replacement `ccfa5194-664c-41a2-aa74-afd6792acad2` on52.
- General note `b0a2e9c2-b4ee-4bd0-b3ab-ba00d397c085`, revision2.

Patient `857bd39e-609c-4edd-8cd7-8205e533c7f9` and all records are synthetic.
Eight complete HTTP resource/history snapshots are retained in
[slice10-legacy.json](evidence/slice10-legacy.json). Original IDs, actors, timestamps,
revisions and correction links are compared by equality, not inferred from screenshots.

## Before/after public replay

The same preservation browser test passed first against cached pre-removal Slice8
image `32b0c7c25791`, then against the production-built Slice10 frontend.
Both use the actual PatientDetail route and authenticated APIs on owned localhost8018.

The replay verifies exact historical condition/general-note links, primary dentition,
legacy fracture surfaces, and the typed administrative note in the combined dental feed.
Chart16 binding stays unchecked after leave/reentry. A linked dental card highlights18
without changing candidate16; chart17 re-enables binding. The condition row highlights16
without replacing candidate17. No hover/inspection request writes. A dirty composer
survives1600px rail→390px Sheet with one rendered textarea and one explicit save command.
Reload reads the saved note and preserved linkage.

The post-removal integrated journey also passes: direct finding/observed bracket,
chosen draft, planned-only chart, confirmation/acceptance, two-client execution and
stale recovery, two completed sessions, automatically completed plan revision6,
14 truthful activity events, exact plan/treatment/note links and dirty mode/patient
navigation. Foreign-owner requests remain404. Final plan is
`68657e09-9a42-4174-802a-2c235067d364`; full snapshots are in
[slice10-persisted.json](evidence/slice10-persisted.json).

## Application rollback

With the new records retained, archived backend `deb8878` started as a real Docker
Uvicorn app on localhost8020 against schema0028. Current Alembic files were retained
as the forward-only migration runner; PATH points to the cached Python3.11 environment.
No down migration, schema rewrite or row cleanup ran. Rolling back runtime routes
does not mean replacing migration history with an old checkout that cannot recognize0028.

The rollback browser API test logs in through the old app and compares all eight legacy
HTTP snapshots unchanged. The standalone old-source ASGI read also passes. This proves
backend route/read compatibility; no pre-mirror frontend visual rollback is claimed.

With current app stopped and no fixture writers running, normalized data-only `pg_dump`
of `patient_dental*`, `patient_clinical*`, `patient_condition*` and `patient_note*` hashes
identically before and after rollback HTTP replay:

```text
fcac09cdd505f572a02fb63c08d32e8edc6184873cea4d52f860f04051d080f4
```

Normalization removes only pg_dump's random `\restrict`/`\unrestrict` lines and joins
captured lines with LF. The dump is a comparison, not a restore operation. It covers
new treatments, plans/items/sessions, notes, revisions and durable command receipts
alongside incumbent records. Neither application rollback nor login changes them.

## Validation results

| Command / proof | Result |
|---|---|
| `bun run tsc --noEmit` | Passed |
| `bun run build` | Passed |
| `bun x biome check src` |251 files passed |
| `bun run test` |794 passed in91 files, including public history/retry/conflict and primitive allowlist |
| `uv run ruff check .` | Passed |
| `uv run ruff format --check .` |233 files passed |
| `uv run mypy .` |233 source files passed |
| `uv run pytest tests/test_patient_activity.py tests/test_patient_clinical_plans.py tests/test_patient_dental_notes.py tests/test_patient_treatments.py tests/test_patient_conditions_contract.py -xq --disable-warnings` with isolated `TREATMENT_TEST_DATABASE_URL` |48 passed; transactional fixtures use their real pool instead of the default stub |
| `bun x playwright test tests/patient-clinical-journey.spec.ts --project=workspace --no-deps -g "diagnosis to selected plan\|preserves pre-mirror"` |2 passed against final Docker build |
| Same browser file with `-g "rollback"` on localhost8020 |1 passed against pre-mirror backend |
| Migration0001→0024, then0024→0028 with legacy data retained | Passed |
| Standalone proof script ruff/format and old-source `read` | Passed |
| `git diff --check` | Passed |
| `openspec validate mirror-dental-diagnosis-workspace --strict` | Passed |

Host pytest uses Python3.14.7; Docker runtime and compatibility proof use Python3.11.
The proof image reuses unchanged Slice8 backend/dependencies and copies the new built
frontend. No dependency or application-backend source change belongs to this slice.

Unrestricted `uv run pytest tests -xvs` still fails at
`tests/test_clinical_catalog_build.py::test_bundled_workspace_reproduces_reviewed_catalog`
because generated LF bytes differ from checked-out CRLF bytes at index1. Before that
failure,239 passed and41 skipped. The remainder run with only this test deselected
passes965, skips167, deselects1. The catalog file/test is unchanged; this is not a
passing full backend release gate. Task3.9 remains unchecked.

## Zero-consumer audit

Search in `app/frontend/src` for `pieceButtonRef`, `firstSurfaceRef`, `toothProfiles`,
`Nueva condición`, `Cambiar pieza`, `Elegir pieza`, `frozen.create` and
`ConditionAttempt.create` finds zero production consumers. Four retained negative
assertions mention the removed labels. `createPatientCondition` remains exported by
the typed client and invoked only by `useDentalWorkspace` in runtime code.
`resolveCondition`, status badges, FDI/dentition helpers, `PatientNotes` and all
incumbent APIs/migrations remain active. Historical docs retain their original audit
claims; this evidence is the current removal inventory.

No entire file was deleted. Exact removed symbols/branches are listed above.
The initial working tree was clean; final changes are limited to diagnosis/geometry,
their rendered/browser proofs and this OpenSpec's evidence/tasks. Prior Slice7–9
captures are preserved using `E2E_EVIDENCE_PREFIX=slice10` for new integrated captures.

## Retained captures and reproduction

- [Selected plan,1440×1000](evidence/slice10-selected-plan-1440.png).
- [Completed sessions/history,390×844](evidence/slice10-history-390.png).
- [Preserved note Sheet,390×844](evidence/slice10-preserved-notes-390.png).

All three captures were inspected. The mobile journey asserts no page overflow;
screenshots supplement real HTTP/PostgreSQL evidence.

Use an owned `dental-slice10-db` fixture with database/user `fixture` and synthetic
password `synthetic-only`. Archive `deb8878` backend outside the working tree and
apply its migrations through0024. From its `app/` directory and cached runtime,
run `verify-slice10-compatibility.py seed <evidence>/slice10-legacy.json`. Run
`foreign` with current backend to bootstrap the separate synthetic owner; fixture
IP identities use ordinary signup limits. The script refuses another database URL.
Start the cached baseline app to apply the additive0025–0028 upgrade and run the
preservation test. Replace only its frontend with the current production build and
run final journeys. Retain migration files when starting archived backend for rollback.

Browser env: `E2E_BASE_URL=http://localhost:8018`, `E2E_LEGACY_FIXTURE` points to
the retained JSON, `E2E_EVIDENCE_PREFIX=slice10`, owner
`slice10-owner@example.com` / `Synthetic-proof-10!`, foreign owner
`slice10-foreign@example.com` / `Synthetic-foreign-10!`. Rollback test uses
`E2E_BASE_URL=http://localhost:8020`. These credentials belong only to disposable fixtures.

Release documentation/spec sync/archive gates remain separate from requested Slice10.

After verification, owned `dental-slice10-baseline`, `dental-slice10-app`,
`dental-slice10-rollback`, `dental-slice10-db`, its anonymous fixture volume and
`dental-slice10-proof` network were removed. Proof image and repository evidence remain.
