# Slice6 execution and recovery

Completed 2026-10-07. Tasks 1.6, 2.6, 3.6; P3/P5/T4/T5. No linked tracker issue or SDLC map.

## Delivered

- Active-plan pending sessions support explicit completion/cancellation. Server derives actor/time,
  therapeutic/item state and aggregate revisions. Completed/cancelled sessions cannot execute again.
- Completing one of two sessions leaves the procedure planned. Once none remain pending, an item
  with completed work becomes completed/performed; all-cancelled work becomes cancelled. Cancelled
  items stay in the denominator and prevent automatic plan completion. Every completed item completes
  the active plan automatically, without another lifecycle command or a fabricated partial status.
- The item shortcut advances only the next pending session. Multi-session UI says
  `Completar siguiente sesión`; its frozen command captures the stage UUID, aggregate revision and
  entered note. Each action requires explicit confirmation. Unconfirmed execution/correction protects
  navigation with discard/remain, and preserves text through conflict review.
- Migration0027 adds cancellation metadata and the treatment-only portion of clinical note storage.
  Optional `clinical_note_body` up to4000 characters commits with execution, note revision, treatment
  revision, plan history and receipt. Empty text creates no note. The session read displays the saved
  note; `changed_resources` returns its identity. General notes and stage notes stay distinct.
- Corrections of linked treatments require both revisions and lock the plan before its treatment.
  Original becomes entered in error; optional replacement retains provenance/state and source linkage.
  Session evidence, item status and plan state remain unchanged. Both therapeutic correction snapshots
  and optional replacement history retain execution evidence. Receipt returns the committed plan.
  Completed plans cannot reopen to draft; closed reactivation retains partial work.
- Every new execution/correction write commits its clinical changes and durable receipt atomically.
  Exact replay returns before current-revision validation; a changed operation payload fails409.
  Observed-treatment receipts omit the new null plan-revision field from hashing for compatibility.
- Spanish session/item completed-total labels, actor/time disclosure, cancellation reasons, optional
  note and plan history remain readable at390px. PRODUCT.md, docs/API.md and the patient brief describe
  this shipped slice. The wider dental-note composer/feed and activity integration keep their later gates.

## Verification

Host tests use an isolated pgvector/PostgreSQL16 container on127.0.0.1:5546 with synthetic owners and
patients. The `plan_db` fixture replaces both plan and treatment repository pools explicitly. External
providers remain mocked. Host Python is3.14; Docker runtime and its browser proof use Python3.11.
Fresh migrations0001–0026 passed before the fail-first test;0026→0027 passed before execution proofs.
Application rollback retains all new tables and columns; the final cross-slice rollback gate is3.9.

| Command | Result |
| --- | --- |
| `uv run pytest tests/test_patient_clinical_plans.py -k execution_partial -xq --disable-warnings` before implementation | Expected failure: absent completion endpoint returned405 instead of200 |
| `bun run test src/components/patients/PatientClinicalPlans.test.tsx -t "advances only"` before UI implementation | Expected failure: no next-session action |
| `uv run pytest tests/test_patient_clinical_plans.py tests/test_patient_treatments.py -xq --disable-warnings` | 33 passed against PostgreSQL |
| Final supplementary auth/correction-history assertions | 3 passed |
| Focused plan/dialog/typed-client Vitest | 15 passed |
| `bun run tsc --noEmit` | Passed |
| `bun x biome check src` | 240 files passed |
| `bun run test` | 88 files,781 tests passed |
| `uv run ruff check .` | Passed |
| `uv run ruff format --check .` | 228 files passed |
| `uv run mypy .` | 228 files passed |
| `uv run pytest tests -xvs` | Known bundled catalog CRLF/LF byte comparison failure;239 passed,41 skipped before stop |
| `uv run pytest tests -q --disable-warnings --deselect tests/test_clinical_catalog_build.py::test_bundled_workspace_reproduces_reviewed_catalog` | 989 passed,134 skipped, one deselected |
| `just e2e-local-up` from root | Docker production build and migrated isolated application healthy |
| `bun x playwright test --project=workspace -g "mirror slice1\|mirror slice2\|mirror slice3\|mirror slice4\|mirror slice5\|mirror slice6"` | Final setup plus seven journeys:8 passed |
| `openspec validate mirror-dental-diagnosis-workspace --strict` | Passed |
| `git diff --check` | Passed |

Real-PostgreSQL proofs cover two-session completion, partial/all cancellation, a cancelled item beside
completed work, immutable sessions, automatic completion, empty-note omission, exact concurrent replay,
strict/auth/owner rejection, concurrent closure/execution and correction/execution. Injected failure
after note insertion rolls back note/revision and execution; injected linked correction history failure
rolls back the treatment and aggregate. Source and replacement revisions retain the performed evidence.

Browser target is the isolated Docker application at localhost:8001. Agent-browser is unavailable;
installed Playwright drives the real application. One journey authors/accepts a plan in UI, drops the
committed first-session response, retries its exact request, recovers a second-client stale cancellation,
then proves automatic completion, correction and persisted reload. Another uses API-created synthetic
plans and UI actions to cancel all work with keyboard Enter at390px/reduced motion, then complete one
session of another plan, close/reload/reactivate and compare unchanged session evidence.

## Persisted synthetic evidence

Final browser run recorded:

- Patient `168ec36d-546a-440c-9ff8-120475fb8ffb`; plan
  `aed09ccc-1972-4f0b-98c8-d369415cdd9b` completed at revision6 and corrected at revision7.
  Treatment `c59fc394-e31f-49e2-b797-63008142547b` performed at revision3, then entered in error
  at revision4. Note `8ffa3e22-d9dc-4dfb-ac5f-f9c8f3defc7d` remained revision1 across retry/reload.
  Sessions retained their completed/cancelled identities and actor/time after correction.
- Patient `11243d2c-9171-42c0-98ea-1202c5387d0b`; all-cancelled plan
  `77730deb-cfa9-42ae-8547-e814524879dd` stayed active at revision6, with zero completed sessions.
  The second plan's partial evidence survived clinical closure and reactivation to draft at revision7.

Screenshots and JSON under `%TEMP%/ai-tutor-playwright/test-results/` were inspected:

- `patient-plans-mirror-slice-a45ac-etained-correction-evidence-workspace/`:
  `slice6-partial-desktop.png`, `slice6-corrected-narrow.png`, `slice6-persisted.json`.
- `patient-plans-mirror-slice-efa17-vation-retains-partial-work-workspace/`:
  `slice6-cancelled-narrow.png`, `slice6-cancellation-reactivation.json`.

JSON is also attached to the corresponding Playwright result. Browser evidence proves target
interaction/persistence; screenshots do not prove source artwork parity, database locks or rollback.

## Remaining release gate

The unrestricted backend suite still fails the pre-existing catalog byte comparison because checked-out
CRLF differs from generated LF. The remainder passes, including OAuth. Task3.9 remains unchecked for
that failure and later integrated/rollback checks. This run does not sync/archive specs or commit.
