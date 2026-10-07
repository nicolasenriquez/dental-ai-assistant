# Slice8 evidence

Date: 2026-10-07. Tasks: 1.8, 2.8, 3.8. Requirements: W6, W4, P1–P6, T3–T5.

## Implementation

- Diagnosis offers explicit creation and a paged, owner-scoped draft selector. Choosing a saved draft opens its UUID without creating another plan. Creating a plan first opens the editable authoring form; the chart CTA does not claim diagnosis completion.
- PatientDetail publishes the selected plan in the URL. Reload opens that patient-bound aggregate. Planificación and Planes show only that plan's procedures on their chart, including performed work in terminal states. Diagnosis shows observed/performed procedures and preserved error history, excluding future planned work.
- Treatment links open the exact saved-record modal with read retry. Activity links for plan-owned procedures open their owning plan, focus the corresponding item and load its history. Dental-note links show the authorized note and bounded revision history, including logically deleted records.
- The existing transition guard owns dirty mode and link departures. Plan navigation also feeds browser Back into the same confirmation through the incumbent router blocker. Discard/save continuations wait for the dirty-state render before navigation, avoiding a second confirmation.
- Activity reads persisted treatment, plan/session and dental-note revisions alongside incumbent sources. Queries scope every source and owning-plan join by owner and patient. Category filters, totals, deterministic ordering and filter-bound pagination remain server-backed. Activity responses contain no clinical note body, acceptance note or internal plan text.
- Storage uses the existing additive schema through0028. This slice adds no migration or clinical write endpoint.

## Fail-first evidence

- New rendered query-plan tests failed because the chosen plan and unavailable state were absent.
- New authenticated activity proof returned422 for the unsupported `treatments` filter.
- The integrated browser test ran against the cached pre-Slice8 Docker image. It saved one synthetic finding and observed bracket, then failed at the missing `Crear nuevo plan` CTA.

## Final validation

| Command / proof | Result |
|---|---|
| `bun run build` | Passed, including TypeScript check |
| `bun x biome check src` | Passed |
| `bun run test` |793 passed,91 files |
| `uv run ruff check .` | Passed |
| `uv run ruff format --check .` |233 files passed |
| `uv run mypy .` |233 source files passed |
| `uv run pytest tests/test_patient_activity.py tests/test_patient_clinical_plans.py tests/test_patient_dental_notes.py tests/test_patient_treatments.py -xq --disable-warnings` with isolated `TREATMENT_TEST_DATABASE_URL` |44 passed |
| `bun x playwright test tests/patient-clinical-journey.spec.ts --project=workspace --no-deps` |1 integrated journey passed on final Docker build |

The new PostgreSQL activity proof opts out of the default pool stub. It verifies eight distinct persisted revisions across plan, treatment and note sources; two-record pages; exact owning-plan links; stable chronology; category totals; rejected cross-filter cursors; absent private clinical text; and foreign-owner404. Existing plan/treatment/note transaction, concurrency, receipt and correction proofs pass in the same44-test run.

Host pytest used Python3.14.7. The browser exercised the cached dependency image's Python3.11 Docker runtime with final backend source and production-built frontend. Dependencies were unchanged.

## Integrated browser proof

Owned app: `http://localhost:8018`. Owned pgvector16 database: port5518. Synthetic patients and two isolated owner accounts only.

The journey saves Pulpitis on16 and an observed bracket on17. It creates a second draft alongside an existing unused draft, adds a bracket on16 with two sessions, guards dirty mode navigation, verifies the selected-plan P marker and absence of observed17 in that chart, reloads the exact plan, then returns through the diagnosis draft selector without duplicating it.

After confirmation and recorded acceptance, two browser pages read plan revision4. The first completes only Preparación, yielding1/2 sessions and revision5. The stale page's completion fails; explicit review preserves its local note. A new confirmation completes Colocación, producing a performed procedure and automatically completed plan at revision6. Reload verifies both completed stages.

Activity has14 persisted events, including7 plan events. The test checks absence of the two private synthetic note bodies, follows the completion event to plan history, follows a plan-owned treatment event to its focused item, and opens an exact note and observed-treatment link. A plan UUID under the second patient's route is unavailable without exposing a create substitute. Dirty browser Back and patient-directory departure both offer remain/discard protection; the second patient's authoring form has no inherited plan UUID or text. A separate owner receives404 for activity, plan and treatment reads.

## Retained evidence

- [Selected plan at1440px](evidence/slice8-selected-plan-1440.png).
- [Completed sessions and history at390px](evidence/slice8-history-390.png). The sidebar is fully dismissed before capture; document-width assertion passes.
- [Persisted synthetic IDs, revisions and safe activity response](evidence/slice8-persisted.json). Final selected plan is `6828bb6d-d67e-460b-be51-acba1cd1ad48`, revision6. Both screenshots were inspected.
- Browser source: `app/frontend/tests/patient-clinical-journey.spec.ts`.

For reproduction, use an owned disposable app on8018 with the current code and schema. Set `E2E_BASE_URL=http://localhost:8018`, `E2E_PROOF_USER`, `E2E_PROOF_PASSWORD`, `E2E_FOREIGN_USER` and `E2E_FOREIGN_PASSWORD`. Bootstrap both disposable accounts before the run, respecting the per-IP signup limit; the test logs into the foreign account rather than relaxing that limit. Real-DB tests use `TREATMENT_TEST_DATABASE_URL` pointing only to the owned fixture database. Verify the existing `evidence/` directory before captures.

After verification, `dental-slice8-app`, `dental-slice8-db` and its anonymous fixture volume, and `dental-slice8-proof` network were removed. Captures and JSON remain; the local proof image remains cached.

Slice10 legacy retirement and subsequent release/rollback/documentation gates remain in the execution order. Gate3.9 is not completed by this scoped run.
