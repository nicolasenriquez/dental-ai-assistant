# Execution through task 1.4

Executed 2026-10-03 on `feat/ai-assisted-evolutions`, HEAD `bac9ba9`.
User selected `0.3–1.4` and authorized prerequisite runtime/checkpoint tasks so the serial execution policy could hold.

## Prime

Dental AI Assistant is a Spanish authenticated clinical workspace with patient records, approved evolutions, persistent clinical threads and optional Drive export. React18/TypeScript/Vite/Bun owns routes and UI; FastAPI/Python/asyncpg/Postgres owns API and persistence. SQL stays in `db/`, HTTP clients in `lib/api.ts`, and evolution approval retains its current boundary.

Read repository rules, README, product/design/UX contracts, patient/Assistant briefs, OpenSpec apply context, patient API/interaction contracts, blueprint, source/target audits and readiness review. Inspected route entry, patient/search/pending SQL, modal, transition guard and existing tests. Source and local Postgres Alembic head were both0019. The initial working tree already contained specification, audit and verification-skill edits. No issue map or group/acceptance IDs are supplied; tasks trace requirements by name.

## Completed scope

| Slice | Tasks | Result |
| --- | --- | --- |
| Investigation | 0.3 | Current owners, tests and migration head confirmed |
| Navigation | 1.1, 2.1, 3.1 | Guarded brand link, separate compact brand row and accessible56px rail on Patients/Assistant/Chat |
| Contact/search/directory | 1.2, 1.3, 2.2, 2.3, 2.4, 3.2 | Nullable contact, ordered private search, safe sort/filter/history, table/cards and recovery |
| Ficha/pending | 1.4 | Failing proof added and expected gaps reproduced |

All completed tasks have adjacent evidence in tasks.md. Task1.4 is complete as a failing-proof task. Its runtime tasks2.5–2.7 and checkpoint3.3 remain pending.

## Files written

- Backend: new `alembic/versions/0020_patient_contact.py`, `patients/contact.py`, `patients/search.py`; existing `routes/patients.py`, `db/patients_repo.py` and patient/workspace tests extended.
- Frontend: existing App/AppShell, SidebarHeader, globals.css, PatientFormModal, Patients, PatientDetail and lib/api.ts extended. New `hooks/usePatientDirectory.tsx`, `components/patients/PatientDirectoryResults.tsx`, `lib/clinicalPendingApi.test.ts`.
- Tests: existing Sidebar/AppShell, PatientFormModal, Patients, PatientDetail, NewEvolution, ClinicalAssistant Drive and patient/evolution source contracts adjusted or extended.
- OpenSpec: tasks.md evidence and this execution report.

No dependency added. No issue synchronization requested.

## Schema

0020 adds nullable `phone VARCHAR(40)` and `email VARCHAR(254)` plus PostgreSQL `unaccent`. Existing rows retain null contact. Application rollback keeps the expanded columns/data; downgrade does not delete them. Migration ran only in the isolated E2E database on localhost:8001. The user's local database at localhost:8000 was not migrated by this run.

Existing owner-first indexes suffice for the measured fixture. The production search SQL was explained against10,000 inserted synthetic patients,1,000 owned and9,000 another owner, then rolled back. Exact RUT used `uq_patients_owner_rut` with owner/RUT index conditions; fragment, phone and name used owner bitmap scans before normalized expression filters. Example execution times were0.054/1.246/1.272/1.129ms respectively. These are observations, not latency gates. No speculative expression/trigram index added.

## Verification

| Command/check | Result |
| --- | --- |
| `uv --project backend run alembic --config backend/alembic.ini heads` from app | 0019 before migration |
| Local Postgres `alembic_version` | 0019 before migration |
| Navigation focused Vitest | 45 passed |
| Patient contracts pytest | 46 passed |
| Directory Vitest | 22 passed |
| Isolated real Postgres workspace tests before1.4 | 6 passed |
| Frontend full Vitest before1.4 | 601 passed,71 files |
| Backend full pytest before1.4 | 891 passed,104 skipped,one existing failure |
| Backend Ruff lint/format and mypy | Passed |
| Frontend TypeScript and Biome | Passed, including new failing-proof files |
| Final affected frontend regression run excluding explicit1.4 red cases | 52 passed,7 intentionally filtered |
| `openspec validate dentalpin-inspired-clinical-workspace --strict` | Passed |
| Whitespace check against HEAD | Existing staged critique file has trailing whitespace on line5; this run did not edit it |

The existing backend failure is `test_generation_constants_and_fail_closed_gate`: config.py contains `dots-studio/dots-3-note-preview:free`, while the test expects `anthropic/claude-sonnet-4.6`. config.py was not modified in this run.

### Production browser

Used a separate Docker E2E app and synthetic local account. No external model calls. Playwright CLI was used because agent-browser was unavailable.

- Compact navigation: ordinary Chat/Assistant clicks; settled1440×900 rail56px and brand44×44; keyboard Enter on brand returns /patients. Mobile drawer route click/Escape and focus restoration checked.
- Creation: valid names/RUT/contact opened the exact generated ficha; duplicate RUT recovered to that ficha. Edit/reopen retained contact; saved clearing returned empty edit fields.
- Directory: query123 restored after in-app ficha return; URL retained only safe sort/filter. Back/forward reflected direction; reload cleared the query. URL/history state/browser storage contained no entered search term.
- Ready, no-match, filter-empty, invalid modal, duplicate, dirty-discard and stale-error/retry states exercised. Stale failure was injected at the HTTP boundary. Unknown age and long names rendered without page overflow.
- Actual CSS widths320/713/1024/1440, height900 for measurements. Semantic table starts1024; search width333px at1024 and480px at1440. Mobile capture uses320×667. Drawer transition was allowed to settle before the final mobile screenshot.

Synthetic screenshots retained under `.playwright-cli/`: `clinical-directory-1440.png`, `clinical-directory-320.png`, `clinical-directory-stale.png`, `clinical-directory-long-name.png`, `clinical-modal-invalid.png`. These are local proof artifacts, not updated regression baselines. The create-button duplicate plus was subsequently removed; its old screenshot is not an exact final text baseline.

## Expected red proof for1.4

- Frontend ficha: five failures for absent tabs/disclosures/clearing and Drive-first summary priority.
- Frontend direct/remounted pending route: two failures because opening still acquires a thread.
- Typed pending client: one failure because kind/limit are not sent yet.
- Backend route: one failure because unknown kind is ignored, returning200 rather than422.
- Backend real projection: one failure at the missing kind argument. The fixture creates separate threads for concurrent pending approvals, respecting the existing uniqueness invariant; assertions retain per-kind totals before cursor, two owners and mixed-call compatibility.

These tests remain active and failing. This checkout is not ready for a green-test commit. Next task is2.5, followed by2.6,2.7 and3.3. The requested execution stops at1.4.

## Execution notes

Supplemental live/race tests were added during verification after the initial fail-first contracts. First browser scripts needed locator and wait corrections; successful checks above followed those corrections. The isolated app required root only to install its existing locked dev test dependencies. No production configuration was changed.

The named proof browser and isolated E2E containers/network were closed after verification. The E2E database volume was preserved, including synthetic browser fixtures. Existing local app/database services remain running.
