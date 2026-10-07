# Slice2 existing therapeutic records

Implemented 2026-10-06. Tasks1.2,2.2,3.2; requirements T1/T3/T4/T5/W2/W3/W8.
This change has no linked issue tracker or implementation SDLC map.

## Delivered behavior

- `patients/treatment_catalog.py` owns the fixed63-variant inventory and twelve preserved finding
  codes, eight Spanish categories, distinct variant labels, anatomy/surface permissions and visual
  metadata.57 single-tooth variants are enabled. Five multi-tooth variants and one whole-arch
  appliance remain visible with an explanation and reject writes until Slice3.
- Migration0025 adds treatment/member/revision tables and owner/operation command receipts.
  Existing findings and general notes keep their schema and APIs. Downgrade intentionally retains
  clinical evidence; application rollback does not drop these tables.
- `patients/treatment_service.py` accepts the persistence command adapter; typed commands validate
  FDI/dentition, supported canonical surfaces, note limits and unknown fields.
  `db/patient_treatments_repo.py` owns SQL, owner/patient checks, operation identity serialization,
  resource locks, repeatable-read snapshots and atomic rows/history/receipts.
- Exact operation replay returns its original committed snapshot, including after later edits.
  Changed command payload or resource-ID collision is rejected. Stale edits return only the latest
  authorized snapshot. Corrections retain original evidence, reason and replacement links.
- The existing typed API transport and `useDentalWorkspace` own procedure reads, application,
  frozen retries, logical undo, edits/corrections and history paging. Components emit intent.
- Diagnosis shows Spanish category cards, distinct crown variants, shared FDI-ordered findings
  and procedures, chart symbols and tooth inspection. Surface tools use the incumbent compact
  confirmation flow; whole-tooth tools apply directly. Existing procedures are observations, not
  findings or performed plan stages.
- Saved-procedure editing uses the existing domain modal with explicit Guardar, local draft
  preservation, authorized conflict comparison, renewed confirmation, correction review and
  history. Dirty navigation cannot save an unreviewed correction as an ordinary edit. Later-page
  failure keeps evidence visible and marks counts incomplete.
- PRODUCT.md, DESIGN.md and docs/API.md describe this shipped subset and its dental color roles.

## Proof

Commands run from `app/backend` or `app/frontend` as indicated.

| Command | Result |
| --- | --- |
| `uv run pytest tests/test_patient_treatments.py -xq` before implementation | Expected catalog failure: route absent, returned422 |
| `bun run test src/lib/treatmentApi.test.ts` before implementation | Two expected missing-client failures |
| `uv run --project backend alembic --config backend/alembic.ini upgrade head` from `app`, with isolated DATABASE_URL | Fresh PostgreSQL upgraded0001 through0025 |
| `uv run pytest tests/test_patient_treatments.py -xq --disable-warnings`, with TREATMENT_TEST_DATABASE_URL | Seven passed against isolated real PostgreSQL |
| `bun run test` |86 files,766 tests passed |
| `bun run tsc --noEmit` | Passed |
| `bun x biome check src` |229 files passed |
| `uv run ruff check .` | Passed |
| `uv run ruff format --check .` |221 files passed |
| `uv run mypy .` |221 source files passed |
| `uv run pytest tests -xq --disable-warnings` | Stopped at existing catalog CRLF/LF byte-comparison failure;239 passed,41 skipped before failure |
| `uv run pytest tests -q --disable-warnings -k "not test_bundled_workspace_reproduces_reviewed_catalog"` |958 passed,138 skipped, one known failure deselected at that run; subsequent added real-DB variant proof passed in the seven-test suite |
| `just e2e-local-up` | Docker production frontend build and migrated isolated E2E application healthy |
| `$env:E2E_BASE_URL='http://localhost:8001'; $env:E2E_BOOTSTRAP_USER='1'; bun x playwright test --project=workspace -g "mirror slice1\|mirror slice2"` | Authentication setup plus both synthetic browser journeys passed |

The real-Postgres fixture explicitly replaces the new repository pool with its isolated asyncpg
pool, bypassing the default test stub. It proves observed bracket/save/reload, ownership denial,
strict payload rejection, canonical surfaces, distinct persisted crown snapshots, exact replay,
four simultaneous creates producing one receipt, concurrent edits producing one success/one409,
injected history-write rollback, failed replacement rollback, history paging and cursor binding.
Fixtures clean up their own patient/users. The disposable `mirror-slice2-postgres` container is
removed after verification.

Browser proof uses a newly created synthetic patient in the separate E2E database. It commits then
aborts the bracket response, retries the exact ID/operation, reloads, edits against an independently
advanced revision, explicitly reconciles, corrects to the cemented-bracket variant and reads the
preserved original/replacement/history. It confirms zero fabricated findings, eight categories,
disabled bridge scope,390px inspection, keyboard Escape and reduced motion. Slice1 replay still
proves no-write inspection, direct findings, surface confirmation, retry/edit and logical undo.

Screenshots under `%TEMP%/ai-tutor-playwright/test-results/` were inspected:
`patient-diagnosis-mirror-s-2ff49-lict-and-correction-history-workspace/slice2-catalog-desktop.png`
and `slice2-inspector-narrow.png`. Browser inspection caught an oversized nested SVG viewport;
explicit24×24 dimensions fixed it. First replay failures came from stale narrow-tooth/label test
selectors; the final replay uses the rendered narrow control and combobox roles.

## Limits and remaining gate

The unrestricted backend suite is not green on this Windows checkout. Its unchanged bundled
clinical terminology JSON uses CRLF, while the deterministic compiler emits LF;
`test_bundled_workspace_reproduces_reviewed_catalog` compares raw bytes. This is separate from the
new treatment registry. Release gate3.9 remains unchecked.

Multi/arch selection, plans, activity/deep-link integration, typed dental notes, final anatomical
layer/visual parity and legacy retirement retain their later slice ownership. Screenshots prove
rendered behavior, not reference pixel parity or persistence. Agent-browser was unavailable;
installed Playwright drove the isolated Docker app. No reference-app or real-patient write was used.
