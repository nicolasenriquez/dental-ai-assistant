# Execution: slices 3 and 4

2026-10-03, branch `feat/ai-assisted-evolutions`, starting HEAD `610fb93`.
User selected Ponytail, `/prime-codebase`, and `/execute` slices 3–4.

## Prime and scope

Dental AI Assistant uses authenticated React18/TypeScript/Vite/Bun routes and FastAPI/asyncpg/Postgres persistence. SQL belongs in `db/`; typed ordinary HTTP calls belong in `lib/api.ts`. Evolution approval, shared clinical runtime, owner scoping and masked identity remain the existing boundaries.

Read repository/product/design/UX rules, both surface briefs, OpenSpec apply context, patient API/interaction contracts, blueprint and readiness/source maps. Source Alembic head was0020. Slices1–2 and proof1.4 were already complete. Tasks use named requirement traceability; no group/issue/numbered acceptance map exists. No issue synchronization requested.

| Slice | Completed tasks | Checkpoint |
| --- | --- | --- |
| 3: Ficha/context | 2.5,2.6,2.7 | 3.3 verified |
| 4: Notes/revisions | 1.5,2.8,2.9 | 3.4 verified |

Each task has adjacent proof in `tasks.md`. Slice5 is now unlocked. Later diagnosis/chart/Activity and integrated release tasks remain outside this execution. Clínica/Actividad say unavailable until their implementation; they never fabricate clinical content.

## Slice 3

- Existing pending projection accepts exact kind/limit before total/cursor. Omitted kind retains mixed behavior. Supplemental exhausted-page proof fixed lost totals when the page is empty.
- Ficha has Resumen/Información/Clínica/Actividad with arrow/Home/End focus, labelled panels and existing actions. Default Resumen has no empty evolution-detail pane; exact evolution routes retain history/detail. Return-to-history opens Clínica/Evoluciones.
- Header uses conditional phone/email controls and masked-RUT disclosure, with hover/focus/tap/Escape/outside behavior. Información retains labelled contact/copy and explicit absent values.
- Summary loads three bounded kinds independently, prioritizes approval then draft, separates Drive recovery, retains exact evolution/thread links and category-specific unavailable/retry.
- Pending direct/reload route renders the existing projection in the narrow main pane with zero automatic thread acquisition. Explicit consultation may acquire. Supported starters prefill unsent editable text and cannot overwrite composer work or interrupt runtime.

### Files

Modified backend `clinical_assistant/pending_work.py`, `db/clinical_pending_work_repo.py`, `routes/clinical_pending_work.py` and workspace tests. Modified frontend `pages/PatientDetail.tsx`, `pages/ClinicalAssistant.tsx`, `components/patients/PatientOverview.tsx`, `components/clinical-assistant/ClinicalAssistantArea.tsx`, `hooks/useClinicalPendingWork.ts`, `lib/api.ts` and their existing tests. Added `components/patients/PatientHeaderDisclosure.tsx` and `PatientInformation.tsx`.

No slice3 schema change.

## Slice 4

- Migration0021 creates separate patient notes and append-only revisions, composite owner/parent FKs, constraints and owner/keyset indexes. Resource and revision commit together.
- Client UUID creation uses immutable revision1 snapshot for identical retry even after later edits. PK serialization handles concurrent retries. Foreign UUID/parent/owner returns404. PATCH locks one note, checks expected revision, supports identical response-lost retry, rejects newer/different conflicts and avoids no-op revisions.
- Bounded list/exact/history routes reject unknown request fields and malformed/mismatched cursors; totals are calculated before cursor. Actors come from authenticated owner. Current schema has no authorized display-name field, so display_name is null, never an email fallback.
- Información offers explicit Guardar, guarded cancel, retained conflict text/current version and explicit rebase, frozen uncertain UUID/payload, refetch/deduplicated pagination and exact-resource focus beyond page1. Revision history shows before/after, actor when known and persisted time; it refreshes after edits.
- Local tabs/links reuse the existing transition guard. Note-specific React Router blocker protects browser history; beforeunload protects reload. Mobile/resize contextual navigation uses the same guard. Desktop panel open/close retains note draft.

### Files

Added backend `alembic/versions/0021_patient_notes.py`, `patients/notes.py`, `db/patient_notes_repo.py`, `routes/patient_notes.py`. Modified `main.py`, `tests/conftest.py` and existing `tests/test_clinical_workspace_live.py`.

Added frontend `components/patients/PatientNotes.tsx`, `PatientNoteHistory.tsx`, `PatientNoteNavigationGuard.tsx` and `PatientNotes.test.tsx`. Modified `pages/PatientDetail.tsx`, `hooks/useContextualAssistant.ts` and `lib/api.ts`.

No new dependency, general event bus, clinical store or model tool. Notes do not enter prompts or Drive automatically.

## Verification

| Command/proof | Result |
| --- | --- |
| OpenSpec status/apply instructions | Context read; scoped serial tasks followed |
| Alembic heads before new migration | 0020 |
| Isolated Docker Alembic upgrade | 0021 applied |
| `uv run pytest tests/test_clinical_workspace.py -q` | 6 passed |
| Isolated `WORKSPACE_LIVE_TEST_DSN` workspace suite | 10 passed, real SQL/two owners |
| Note editor focused Vitest | Latest 5 passed |
| Ficha focused Vitest | 13 passed |
| Assistant-area focused Vitest | 12 passed, including 2 starter tests |
| Context/transition/Drive focused proofs | Passed |
| Full frontend `bun run test` | 614 passed before 2 supplemental note tests; targeted supplemental suite green |
| Full backend `uv run pytest tests -q --disable-warnings` | 892 passed,108 skipped,1 pre-existing failure |
| Ruff lint/format and mypy | Passed |
| Frontend TypeScript and Biome | Passed |
| Docker production build | Passed |
| Whitespace check | Passed |
| `openspec validate dentalpin-inspired-clinical-workspace --strict` | Passed |

Backend full-suite failure remains `test_generation_constants_and_fail_closed_gate`: config.CHAT_MODEL is `dots-studio/dots-3-note-preview:free`; test expects `anthropic/claude-sonnet-4.6`. It was recorded before this execution; config.py was not edited. Full release gate3.9 is not claimed green.

### Browser proof

Used isolated Docker localhost8001 and synthetic clinician/patient records. No external LLM/provider calls. Agent-browser unavailable; Playwright CLI used.

- Slice3: ordinary hover/focus/click/Escape, masked RUT, keyboard tabs, actual CSS1440/1024/713/320 with no main overflow; pending375×667 direct+reload acquired0, explicit consultation acquired1.
- Slice4: HTTP-boundary aborted response after committed create, identical UI retry and exactly1 creation revision; concurrent remote edit generated409 and retained draft until explicit rebase; opening/closing desktop Assistant and guarded tab changes retained note; Guardar y continuar committed before changing tab.
- Created22 synthetic notes and25 revisions to prove exact deep-link target outside first20, focus, deduplication and revision pagination. Activity-target URL was tested directly; Activity projection remains a later slice.
- Browser history back offered remain/discard;375 mobile Assistant navigation respected dirty note. Actual CSS1440/1024/713/320 had no main overflow.
- Final production check injected422 into Guardar y continuar: the dialog showed recovery, stayed in Información and retained text. Header tooltip remained hoverable; icon/text alignment and320 overflow passed after the final build.
- Local screenshots: `.playwright-cli/slice3-ficha-{1440,1024,713,320}.png`, `slice3-pending-375.png`, `slice4-conflict-1440.png`, `slice4-notes-{1440,1024,713,320}.png`, `slice4-editor-375.png`, `slice4-ready-320.png`. Captures use synthetic content, not wireframe substitution or new regression baselines.

## Execution notes

First Alembic attempt used multiple SQL commands in one prepared statement and rolled back; corrected to separate statements before successful migration. Initial UI proof lacked its planned component; later behavior tests pass. Old ficha tests were updated for the explicitly changed default summary; focused evolution behavior remains verified. Supplemental proof found/fixed exhausted pending totals and browser-history navigation; failed save now reports recovery in the guard dialog.

Migration ran only against isolated E2E Postgres. Existing local app/database services were not migrated. Rollback retains the expanded note schema/data. Changes are not committed by this execution; full-suite model mismatch remains the release-validation blocker.

Closed the named proof browser and stopped isolated E2E containers/network after verification. The synthetic E2E database volume and local screenshots remain. Existing local app/database services remain running.
