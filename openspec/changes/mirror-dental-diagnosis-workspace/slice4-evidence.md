# Slice4 draft clinical plans

Implemented 2026-10-06. Tasks 1.4, 2.4, 3.4; P1/P6/T3/W8. No linked issue map.

## Delivered

- Migration 0026 adds patient-owned plans, unique linked items, ordered sessions and append-only
  aggregate revisions. Application rollback retains these tables and receipts.
- Commands serialize through the plan revision and share durable clinical receipts. Planned
  treatment, members, item, initial sessions, history and receipt commit atomically. Existing
  treatment create hashes and observed records retain their contracts.
- Strict payloads reuse catalog anatomy for single tooth, bridge roles and global arch. Planned
  procedures are excluded from diagnosis list reads. Public treatment detail/history remains owned.
- Planificación/Planes expose draft create/resume, optional metadata, item ordering and pending
  session authoring. A patient-local hook owns requests, frozen retry and explicit conflict recovery.
  Dirty navigation and beforeunload protect unsaved forms; committed retry clears authoring state.

## Proof

| Command | Result |
| --- | --- |
| `uv run pytest tests/test_patient_clinical_plans.py -xq` before implementation | Expected failure: absent endpoint returned 404 rather than 401 |
| `bun run test src/components/patients/PatientClinicalPlans.test.tsx` before implementation | Expected failure: component absent |
| `uv run --project backend alembic --config backend/alembic.ini upgrade head` from app | Isolated PostgreSQL migrated 0001 through 0026 |
| `uv run pytest tests/test_patient_clinical_plans.py tests/test_patient_treatments.py -xq --disable-warnings` | 12 passed against isolated PostgreSQL |
| Focused plan/PatientDetail/treatment Vitest | 40 passed |
| `bun run tsc --noEmit` | Passed |
| `uv run ruff check .`; `uv run ruff format --check .`; `uv run mypy .` | Passed, 227 Python files |
| `just e2e-local-up` | Docker bundle and isolated app healthy |
| `bun x playwright test --project=workspace -g "mirror slice4"` | Setup and draft journey passed |

Browser uses synthetic patient on localhost:8001 and a separate E2E database. It proves bracket
with two sessions, bridge roles, item reordering, session-label edit, commit-response loss/exact
retry, dirty mode guard, one plan after reload and zero planned procedures in diagnosis reads.
Persisted snapshot is attached as `slice4-persisted`. Screenshot paths live under
`%TEMP%/ai-tutor-playwright/test-results/patient-plans-mirror-slice-9bd67-ordered-sessions-and-reload-workspace/`.

Agent-browser is unavailable; installed Playwright drives the Docker app. Screenshots describe
target rendering, not reference pixel parity. Lifecycle and staged execution retain later gates.
Full validation evidence follows Slice5; release gate 3.9 remains dependent on later slices.

Final cross-slice run 2026-10-07 passed setup plus all five implemented mirror journeys (6 tests).
The draft journey now also proves `Guardar y continuar`: a third planned bracket on17 commits once
before Información opens. The shared confirmation dialog exposes that additional action only for
an authoring draft, never to authorize an unreviewed clinical lifecycle transition. Frozen forms
remain disabled until receipt recovery; closed-plan conflict review keeps local procedure text.
Final full frontend777 and focused real-Postgres22 passed; broader results are in slice5-evidence.md.
