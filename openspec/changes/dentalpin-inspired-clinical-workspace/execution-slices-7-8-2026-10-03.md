# Slices 7–8 execution, 2026-10-03

## Context

Primed repository rules, README, entry points, dependencies, patient/notes/condition SQL,
typed clients, product/design/UX contracts, patient and Assistant briefs, the entire task
ledger and OpenSpec apply context. Branch `feat/ai-assisted-evolutions`, initial HEAD
`31453df`, clean tracked worktree. Existing slice6 checkpoint was complete.

`ponytail` full mode: use persisted sources, native filters and existing controls; no
new dependency, table, event bus or shared store. Execution is serial. No issue IDs or
SDLC group map exist in this plan; traceability uses the named contract requirements.
No issue synchronization, commit, push, sync or archive was requested. Slice8 means the
integrated release gate after the seven numbered implementation slices.

## Slice7

Tasks1.8,2.14,2.15 and3.7 complete. Fail-first host auth test returned404, real
Python3.11/Postgres HTTP fixture returned404, frontend component import was absent.

Added `patients/activity.py`, `db/patient_activity_repo.py`, `routes/patient_activity.py`,
`hooks/usePatientActivity.ts`, `components/patients/PatientActivity.tsx`, host cursor/auth
proof and Activity component/browser proofs. Extended `main.py`, `lib/api.ts`,
`PatientDetail.tsx`, live workspace test fixture and Playwright workspace project.

Schema unchanged. Activity unions approved evolution creation with note and condition
revisions. All branches are owner/parent scoped. The owned repeatable-read transaction
keeps projection/count coherent; a lateral page preserves total on an exhausted cursor.
Strict cursor carries timestamp, kind and event UUID, bound to patient/filter. Activity
returns no note, evolution or condition free text, RUT or contact. Actor IDs derive from
persisted revisions; display names stay null because the schema has no authorized name.
Evolution actor stays null rather than assuming owner means author.

Three component tests prove distinct revision events, overlap deduplication, same-cursor
page retry, initial failure versus empty, filter reset and stale response rejection.
Two host tests prove session requirement and strict cursor/query validation. Real SQL
fixture proves five tied events, deterministic kinds/event UUID order, totals before
cursor, filters, exhausted page, foreign patient404 and backdated evolution persistence
time. Production browser proves26 real synthetic events, latest-note exact focus outside
page1 with revision history, temporal/resolved condition exact focus, exact evolution,
page and initial failures/retry and empty-category recovery. Empty-category failure
states are response fixtures; the persistence and deep-link journey uses real APIs.

Inspected `.playwright-cli/slice7-activity-{1440,1024,375,320}.png`, page-error and
filter-empty captures. Actual settled viewport widths have no page overflow. Review
found indistinct filter selection; native semantic-token buttons now show fill/border
and font weight with `aria-pressed`. TypeScript/Biome and backend lint/format/mypy pass;
Docker production build and focused browser checkpoint pass.

## Slice8

Tasks3.8,3.9 and4.1–4.3 complete. Real UI flow saves a manual note and tooth condition,
checks identical chart/list data, reads fresh Activity and follows exact note focus.
Keyboard tab/filter activation, note save/discard/remain guard, desktop Assistant
open/close with intact draft, reduced motion, actual 320px/no overflow and 44px category
targets pass. Free text is absent from Activity, navigation state and browser storage.
ARIA snapshot is retained at `.playwright-cli/slice8-activity.aria.yml` and the narrow
capture at `slice8-activity-320.png` was inspected. Existing directory/contact tests
cover long names, unknown metadata, stale/no-match/empty, duplicate and dirty modal.

Browser verification exposed rem scaling reducing `min-h-11` to 41.25px; new Activity
filter/link targets now use explicit 44px lengths. The existing approval browser test
expected Confirmar guardado after the current UI had auto-opened its review dialog.
It now confirms Guardar evolución in that dialog and proves zero saves before that
click. Approval runtime code is unchanged. This was stale test behavior, not a new
approval bypass. Nine prior/Activity browser checks plus integrated manual flow pass;
the corrected approval/Drive journey also passes its separate rerun.

| Final validation | Result |
| --- | --- |
| Backend Ruff check / format | pass, 205 files |
| Backend mypy | pass, 205 sources |
| Full backend `uv run pytest tests -xvs` | 898 passed,113 skipped |
| Real isolated Python3.11/Postgres workspace tests | 15 passed |
| Frontend TypeScript / Biome | pass, 210 source files |
| Full frontend `bun run test` | 626 passed,76 files |
| Production Docker build/health | pass |
| Workspace Playwright checks | 10 pass across combined run and corrected approval rerun, plus login |
| OpenSpec strict validation / diff whitespace | pass |

Evidence logs are `.playwright-cli/slice8-backend-validation.log` and
`slice8-frontend-validation.log`. Host Python is 3.14.7; real SQL proof uses the supported
runtime Python 3.11.17. Skipped tests require their dedicated live environments; the
workspace's15 live proofs were run separately. Previous CHAT_MODEL test mismatch no
longer occurs because initial HEAD31453df already updated config and its expectation.
This work changes neither provider nor model. Existing deprecation and bundle-size
warnings remain informational; no validation failed in the final runs.

Updated PRODUCT, DESIGN, both surface briefs, root README, docs/API and Unreleased
CHANGELOG to describe verified behavior. OpenSpec README/API status now references
the completed execution; planning/source snapshots and wireframes remain historical.

## Reconciliation and handoff

| Contract requirement | Runtime seam | Evidence |
| --- | --- | --- |
| Guarded brand/compact navigation | SidebarHeader/Sidebar/AppShell | slice1 checkpoint and shell tests |
| Private directory/contact | Patients/PatientFormModal/patients routes/repository | slice2 checkpoint and full regression tests |
| Four sections/clinical-first pending | PatientDetail/PatientOverview/pending projection/Assistant | slice3 checkpoint, workspace browser and live pending proofs |
| Manual notes/retry/revisions | PatientNotes/patient_notes routes/repository | slice4 checkpoint and live notes proofs |
| Conditions/fixed identity/retry | PatientDiagnosis/patient_conditions routes/repository | slice5 checkpoint and live condition proofs |
| Anatomical chart/list equivalence | PatientOdontogram/ToothDrawing/shared symbols | slice6 checkpoint, chart/editor tests and browser widths/states |
| Backed Activity/exact links | PatientActivity/patient_activity routes/repository | slice7 component/cursor/auth/live/browser proofs |
| Integrated safety/visual contract | Existing guards/runtime plus patient-domain components | slice8 UI/browser, full suite and inspected screenshots/ARIA |

All38 task checkboxes have traceability and evidence. No schema migration or
dependency was added in slices7–8; prior expand-only0020–0022 are retained. The source
spec now agrees with implemented patient resources and their explicit boundaries.
Main-spec sync and change archive are ready for an explicit follow-up; neither was
executed. No deployment, commit or push was requested. E2E synthetic data/screenshots
remain reproducible; only isolated test services are stopped, with volumes preserved.
