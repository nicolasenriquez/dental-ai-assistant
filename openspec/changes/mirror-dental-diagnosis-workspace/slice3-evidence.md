# Slice3 anatomical scopes

Implemented 2026-10-06. Tasks1.3,2.3,3.3; requirements T2/W3/W4.
No linked tracker issue or implementation SDLC map.

## Delivered behavior

- All63 therapeutic variants are enabled. Catalog scope controls single-tooth, multi-tooth and
  whole-arch validation; icon/type does not substitute for scope.
- Commands validate dentition/FDI, unique members, same-arch selection, supported unique surfaces
  and roles. Bridges use pillar/pontic with at least one pillar, matching the reference confirmation
  rule. Two pillars are valid; no pontic requirement is invented. Splints use tooth roles.
- Whole-arch appliances require upper/lower arch and no FDI. Both dentitions remain accepted;
  no pediatric-only or veneer-V-only restriction is introduced.
- The existing0025 schema already supports members/roles/arch. Repository insertion now persists
  arch, with treatment, all members, history and receipt in the same transaction. No new migration
  or historical schema rewrite was needed.
- Canonical member order makes reordered equivalent payloads replayable. Null arch is omitted from
  command hashing to retain pre-Slice3 single-tooth create/correction replay compatibility.
- `useDentalWorkspace` owns range/free selection and frozen writes. Chart selection never writes;
  multi-member confirmation exposes bridge roles, and the whole-arch picker records only the chosen
  arch. Failed responses preserve command identity and block fresh writes until retry/discard.
- Shared IDs appear at each chart member and in each inspector, with one procedure list entry,
  member/role text, connectors, unique totals and separate arch context. Saved edits/history and
  scope-preserving replacement corrections keep all members or arch rather than truncating to the
  first tooth. Dirty multi-selection uses the incumbent navigation guard.
- PRODUCT.md and docs/API.md describe the shipped anatomical-selection contract.

## Proof

Commands run from app/backend or app/frontend unless specified.

| Command | Result |
| --- | --- |
| `uv run pytest tests/test_patient_treatments.py -k anatomical_scope -xq` before implementation | Expected failure: valid bridge rejected by one-member limit |
| `bun run test src/components/patients/PatientDiagnosis.treatments.test.tsx -t "chart range\|whole-arch picker"` before implementation | Two expected failures: premature one-tooth write and absent arch picker |
| `uv run --project backend alembic --config backend/alembic.ini upgrade head` from app, isolated DATABASE_URL | Fresh PostgreSQL upgraded0001 through0025 |
| `uv run pytest tests/test_patient_treatments.py -xq --disable-warnings`, isolated TREATMENT_TEST_DATABASE_URL |10 passed |
| `bun run test src/components/patients/PatientDiagnosis.treatments.test.tsx src/components/patients/PatientDiagnosis.test.tsx src/components/patients/PatientOdontogram.test.tsx src/lib/treatmentApi.test.ts` |61 passed |
| `bun run test` |86 files,769 tests passed |
| `bun run tsc --noEmit` | Passed |
| `bun x biome check src` | Passed |
| `uv run ruff check .` | Passed |
| `uv run ruff format --check .` |221 files passed |
| `uv run mypy .` |221 source files passed |
| `just e2e-local-up` | Docker production bundle built; isolated application healthy |
| `$env:E2E_BASE_URL='http://localhost:8001'; $env:E2E_BOOTSTRAP_USER='1'; bun x playwright test --project=workspace -g "mirror slice1\|mirror slice2\|mirror slice3"` | Final run: authentication setup and three journeys passed |

Real-Postgres tests explicitly replace the treatment repository's default stub pool. They prove
valid bridge/arch reads, reordered member replay, owner denial, invalid anatomy leaving all four
tables empty, injected history-write failure rolling back the aggregate and a successful exact
retry after rollback. Incumbent surface, replay/concurrency, correction and snapshot proofs remain
green. The disposable mirror-slice3-postgres container uses synthetic fixtures only.

Browser proof creates a synthetic patient in the separate E2E database. It confirms14/15/16 bridge
roles, one shared ID/record after reload and inspection from every member; upper-arch commit-response
loss/exact retry, body edit/revision history with no FDI; primary51/61 free selection, dirty mode
navigation and keyboard Enter at390px/reduced motion. Exactly three procedures and zero fabricated
findings remain. Persisted IDs/revisions are attached as slice3-persisted-ids in Playwright output.

Screenshots inspected under `%TEMP%/ai-tutor-playwright/test-results/`:
`patient-diagnosis-mirror-s-0f919-plint-and-whole-arch-reload-workspace/`
contains slice3-bridge-roles.png, slice3-chart-desktop.png and slice3-primary-narrow.png.
Agent-browser was unavailable; installed Playwright drove the Docker application.

## Broader validation limits

The unrestricted backend suite stopped at the unchanged clinical catalog CRLF/LF byte comparison:
239 passed,41 skipped, one failure. A run excluding only that test completed with965 passed,
134 skipped and one OAuth callback failure (`test_callback_provider_error_param_returns_303_provider_error`,
400 instead of303). That OAuth test passed in an immediate isolated rerun. No unrelated source
changes were made for these failures; release gate3.9 stays unchecked.

An initial incumbent Slice1 browser replay encountered the existing guard-publication timing path;
a second exposed duplicated note text in both row and revision history. Its assertion now targets
the row's direct note paragraph. Final setup+Slice1+Slice2+Slice3 run passed. No condition-save
runtime changes were introduced to hide either result.

Screenshots prove target rendering, not pixel parity or database transactions. Final eight-profile
anatomy, illustrated connector/layer parity and integrated plan/note workflows retain their later
slice gates.
