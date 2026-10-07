# Slice1 finding inspection

Implemented 2026-10-06. Scope: tasks 1.1, 2.1 and 3.1, requirements W1/W3/W5/W8. No linked tracker or SDLC-map issue exists for this change.

## Implementation

- `useDentalWorkspace` owns active chart-tool intent, frozen create/undo commands, busy lock, exact retries and committed feedback. Stable condition UUIDs and correction operation UUIDs use the incumbent typed clients.
- Tooth activation without a tool opens a nonmodal anchored inspector. It shows FDI, tooth family, dentition, saved condition symbols/status/surfaces and explicit Editar/Historial/Registrar actions. Hover only highlights.
- Whole-tooth activation applies directly. Pointer activation in a drawn occlusal path resolves its FDI-oriented surface; named 44px occlusal controls provide equivalent keyboard access. Lateral activation opens the compact selector; Confirmar applies its selected surfaces once.
- Saved-record edit, resolve and correction forms use a patient-domain modal. Existing revision comparison, terminal-state blocking, explicit correction review, exact-history links and dirty navigation remain supported. Focus restoration uses the originating chart/list control without forced scrolling.
- Deshacer calls the correction API with `reason="Deshacer registro"` and no replacement. Original rows and revisions remain readable; it does not mark a condition clinically resolved.
- Dentition controls are inside the chart. PRODUCT.md describes the shipped D03 creation boundary.

## Verification

Commands run from `app/frontend` unless noted.

| Command | Result |
| --- | --- |
| `bun run test src/components/patients/PatientDiagnosis.test.tsx -t "tooth-first\|whole-tooth activation\|lateral surface selection\|occlusal surface activation"` before implementation | Four expected failures at the public rendered seam |
| Same command after implementation | Four passed |
| `bun run test` | 84 files, 757 tests passed |
| `bun run test src/components/patients/PatientDiagnosis.test.tsx src/components/patients/PatientOdontogram.test.tsx src/pages/PatientDetail.test.tsx` after final focus/anatomical-pointer refinements | Three files, 78 tests passed |
| `bun run tsc --noEmit` | Passed |
| `bun x biome check src` | 225 files passed |
| `uv run pytest tests/test_patient_conditions_contract.py -q` from `app/backend` | Four passed; default harness uses the DB stub |
| `just e2e-local-up` from repository root | Isolated Docker production frontend build and migrated E2E app healthy |
| `$env:E2E_BASE_URL='http://localhost:8001'; $env:E2E_BOOTSTRAP_USER='1'; bun x playwright test --project=workspace -g "mirror slice1"` | Authentication setup and synthetic patient journey passed |

The final browser journey proves:

1. Tooth16 opens inspection with no mutation request and unchanged document/main scroll position. Escape returns focus to its trigger.
2. Direct Pulpitis creates one condition with empty surfaces and null note. Deshacer changes it to `entered_in_error`; its history has two revisions.
3. Clicking the actual chart's Mesial path creates Caries M. The test commits then aborts the first response; retry recovers the same ID with exactly one revision.
4. Lateral tooth17 opens the surface selector. Confirmar M/O persists once and closes the selector; a fresh page reload shows the same record.
5. Explicit saved-record editing persists a synthetic note through the domain modal.
6. At390px, inspection fits without document overflow; Temporal displays its own dentition.

Browser screenshots were generated under `%TEMP%/ai-tutor-playwright/test-results/patient-diagnosis-mirror-s-a6644-retry-edit-and-logical-undo-workspace/`: `inspection-desktop.png`, `surface-desktop.png`, `inspection-narrow.png`. These were visually inspected. They are local test artifacts, not reference pixel-parity evidence.

## Evidence limits

Slice1 adds no condition-schema migration. New therapeutic resources, plans, dental-note rail, eight-profile illustration parity and final legacy retirement remain assigned to their later slices. Incumbent history/correction APIs and general notes remain compatible. The full backend/release/migration gate3.9 remains unchecked. Existing predecessor evidence/task edits were present before execution and were preserved.

Agent-browser CLI was unavailable. Installed Playwright tooling drove the isolated Docker app; no reference-app or real-patient write was performed.
