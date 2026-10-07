# Slice5 clinical plan lifecycle

Completed 2026-10-07. Tasks 1.5, 2.5, 3.5; P2/P4/P5. No linked tracker issue or SDLC map.

## Delivered

- Six server-controlled transitions: draft→pending confirmation, pending→active recorded
  acceptance, pending→draft reopening, draft/pending/active→closed reasoned closure,
  closed→draft reactivation and completed→archived archival.
- Confirmation rejects empty/ineligible plans. Closed/completed/archived authoring and every
  other lifecycle edge fail409. Closure reasons include expired. Actor/time and acceptance
  notes derive from authenticated commands, not client state/actor fields.
- Every command serializes through the plan revision and atomically appends history and a durable
  receipt. Exact replay precedes current-revision validation; changed payload is409. Reopening
  and reactivation clear current lifecycle metadata while keeping earlier snapshots and sessions.
- Spanish confirmations explain clinical acceptance, closure, reopening/reactivation and archival.
  Current events and history disclose stored actor IDs through PatientActorLabel. Completed and
  archived plans stay read-only; no completed→draft action is exposed.
- Local metadata and planned-procedure drafts remain visible on conflict review, including when
  the saved plan is now closed. Uncertain authoring fields are frozen for exact retry. Dirty
  authoring supports save/discard/remain; lifecycle actions keep their separate confirmation.
- Plan authoring/lifecycle imports only authenticated patient, catalog and persistence boundaries.
  No commercial/agenda models, payment/message clients, consent-signature fields or outgoing
  requests are added. Stage execution, automatic completion, linked corrections and Activity
  integration retain their later slice gates.
- PRODUCT.md, docs/API.md and the local patient surface brief describe the implemented scope.

## Verification

Commands run from app/backend or app/frontend unless noted. Real tests use an isolated migrated
`TREATMENT_TEST_DATABASE_URL`; plan/treatment fixtures explicitly replace their repository pools.
External APIs remain at existing mocked boundaries. Only synthetic patients are mutated.

| Command | Result |
| --- | --- |
| `uv run pytest tests/test_patient_clinical_plans.py -k lifecycle -xq --disable-warnings` before implementation | Expected failure: absent confirmation route returned405 instead of409 |
| `uv run pytest tests/test_patient_clinical_plans.py tests/test_patient_treatments.py -xq --disable-warnings` | 22 passed against PostgreSQL |
| Focused plan/dialog/typed-client Vitest | 11 passed |
| `bun run tsc --noEmit` | Passed |
| `bun x biome check src` | 238 files passed |
| `bun run test` | 88 files,777 tests passed |
| `uv run ruff check .` | Passed |
| `uv run ruff format --check .` | 227 files passed |
| `uv run mypy .` | 227 files passed |
| `uv run pytest tests -xvs` | Stopped at unchanged bundled catalog CRLF/LF byte comparison:239 passed,41 skipped, one failure |
| `uv run pytest tests -q --disable-warnings --deselect tests/test_clinical_catalog_build.py::test_bundled_workspace_reproduces_reviewed_catalog` | Final run978 passed,134 skipped, one deselected |
| `just e2e-local-up` from root | Docker production bundle and isolated application healthy |
| `bun x playwright test --project=workspace -g "mirror slice1\|mirror slice2\|mirror slice3\|mirror slice4\|mirror slice5"` | Final setup plus five journeys:6 passed |

PostgreSQL proofs cover all36 state/action combinations, empty confirmation, required reasons,
acceptance metadata, replay after later transitions, changed-payload rejection, foreign commands,
bound cursors, valid bridge/arch planning and immutable completed sessions. A concurrent close/edit
race commits once and returns one409. Injected revision failures roll back authoring/lifecycle.
Concurrent same-item UUID insertion across plans returns201/404 without an orphan treatment or
extra receipt. Completed states/sessions are seeded explicitly for immutable/archival checks;
these fixtures do not claim implementation of staged execution.

Browser proof on localhost:8001 creates a synthetic plan, confirms/reopens/reconfirms it, records
acceptance with commit-response loss and exact retry, closes with expired reason, denies an edit,
reloads closed state, and reactivates at390px/reduced motion using keyboard Enter. History retains
the acceptance note and previous closure. The Slice4 replay also saves a third item before leaving
to Información, with no observed procedure or finding fabricated.

Browser screenshots inspected under `%TEMP%/ai-tutor-playwright/test-results/`:

- `patient-plans-mirror-slice-9bd67-ordered-sessions-and-reload-workspace/`:
  slice4-draft-desktop.png and slice4-draft-narrow.png.
- `patient-plans-mirror-slice-7f72c-re-reactivation-and-history-workspace/`:
  slice5-accepted-desktop.png and slice5-reactivation-narrow.png.

Persisted IDs/snapshots are attached as slice4-persisted and slice5-persisted in Playwright output.
Agent-browser is unavailable, so installed Playwright drives the real Docker application.
Snapshots prove target rendering, not licensed-art/reference pixel parity or transactional locks.

## Remaining gate

The unrestricted backend suite still fails
`test_bundled_workspace_reproduces_reviewed_catalog` because generated LF bytes differ from the
existing checked-out CRLF catalog. Earlier slice evidence already records this failure. No catalog
or unrelated OAuth changes were made; the final remainder run passes OAuth tests. Release task3.9
stays unchecked, also pending later slices and their rollback/integration proofs. This run neither
syncs/archives specs nor creates a commit.
