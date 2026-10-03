# Dental AI Assistant codebase prime for this change

Snapshot: current workspace on 2026-10-02, branch feat/ai-assisted-evolutions, head 299da98. This is a source map for the scoped OpenSpec change, not a replacement for AGENTS.md, PRODUCT.md or DESIGN.md.

The authenticated native-browser baseline is recorded in live-baseline-2026-10-02.md. Its fixture showed a single patient row, a patient summary with saved evolutions and mixed pending work, and an Assistant with a separate pending sidebar. These snapshot counts are evidence of layout/state behavior, not fixtures for future tests.

The separate focused DentalPin patient journey is in dentalpin-patients-e2e-2026-10-02.md. The reference list, create modal and ficha source are in `../references/dentalpin/backend/app/modules/patients/frontend/pages/patients/index.vue` and `[id].vue` at commit `fc36a71bdf1778d45e44ed7f72fbd0536d0be842`. Source search/filters/sort are URL-backed, but the observed ficha Back action resets to plain `/patients`; that behavior is not a target continuity contract.

## Product and runtime

- Authenticated web workspace for a treating dentist. The core flow is patient ficha → note/dictation → draft → human review/approval → saved evolution. Drive export is optional and separate. Legacy video Chat remains secondary.
- React 18 + TypeScript/Vite frontend; FastAPI/asyncpg/Postgres backend; Docker-first local runtime. Frontend API calls live in app/frontend/src/lib/api.ts. SQL lives only in app/backend/db/.
- PRODUCT.md requires Spanish clinical UI, masked identifiers, no fabricated metrics, preserved work and explicit approval. DESIGN.md sets the dark semantic palette and 260px desktop sidebar. docs/design/UX_PRINCIPLES.md governs action hierarchy, feedback, recovery, accessibility and continuity.

## Current route and component map

| User surface | Route/composition | Owning behavior |
| --- | --- | --- |
| Entry | app/frontend/src/App.tsx | RequireAuth wraps clinical routes; / currently redirects to /patients. |
| Shell | components/AppShell.tsx; components/sidebar/SidebarNavigation.tsx | Shared sidebar, mobile drawer, active link, optional workspace accessory. |
| Directory | pages/Patients.tsx; components/PatientFormModal.tsx | Name/RUT body-only search, owned list, create modal, loading/stale/error/empty states. PatientSummary has first/last name, masked RUT, optional birth date and `last_evolution_at`; no contact, debt, visit or archive field. The form requires valid RUT, handles duplicate 409 and confirms dirty close. Partial RUT is currently broken by the route's normalize_rut fallback to name-only search. |
| Ficha | pages/PatientDetail.tsx; components/patients/PatientOverview.tsx; components/PatientWorkspace.tsx | Masked identity, new evolution, patient pending preview, contextual Assistant, approved history and focused evolution URL. |
| Assistant | pages/ClinicalAssistant.tsx; components/clinical-assistant/ClinicalAssistantArea.tsx; ClinicalThreadList.tsx; ClinicalPendingWork.tsx | Patient picker, composer, thread runtime, pending sidebar, human approval and Drive accessory. |

## Backend read boundaries

- GET /api/patients and POST /api/patients/search are defined in app/backend/routes/patients.py. The latter deliberately uses a JSON body; app/backend/tests/test_patients_contract.py verifies that RUT search does not enter a query URL. app/backend/db/patients_repo.py owner-scopes every patient query and joins approved evolutions to supply last_evolution_at.
- At present `normalize_rut(term)` in search accepts only complete valid RUTs; invalid/partial numeric text is passed as `query` to `search_patients`, whose SQL matches only concatenated names. Phone is not stored or searched. This is the source of the reported partial-RUT gap, not a UI-only filtering issue.
- GET /api/clinical-pending-work is defined in app/backend/routes/clinical_pending_work.py. app/backend/clinical_assistant/pending_work.py turns owner-scoped repository rows into typed approval, recoverable draft and failed export actions, with total and cursor. The current repository orders all kinds together by updated_at; the optional kind read in this proposal is needed to make clinical priority and per-kind totals reliable. Frontend hooks/useClinicalPendingWork.ts handles refetch/focus and request races.
- Existing persisted evolutions are the approved canonical records. Clinical drafts and pending actions live in separate clinical structures. Any activity projection must derive from owned persisted records and never from model text.
- Patient public output passes through app/backend/patients/rut.py public_patient/mask_rut. Every new read must reuse that boundary and preserve 404/owner semantics.

## Existing test seams

- app/frontend/src/pages/Patients.test.tsx: dialog behavior, date/RUT normalization, list/search states.
- app/frontend/src/pages/PatientDetail.test.tsx: ficha overview, evolution deep links, mobile history return and error recovery.
- app/frontend/src/components/clinical-assistant/ClinicalPendingWork.test.tsx: pending failure vs empty, typed retry/link behavior.
- app/frontend/src/components/Sidebar.test.tsx and AppShell.test.tsx: navigation and shell behavior.
- app/backend/tests/test_patients_contract.py: auth, body-only search and patient repo ownership contract.
- app/backend/tests/test_clinical_workspace.py and test_clinical_workspace_live.py: clinical pending/runtime contracts and owner-scoped persistence.
- app/frontend/tests/__snapshots__/ and artifacts/clinical/: browser/visual baselines; inspect with privacy-safe fixtures before updating.

## Adjacent active change

openspec/changes/improve-clinical-grounding is complete by its task ledger but remains an active OpenSpec folder. It owns terminology/history grounding, model tool presentation and stream reconciliation. This change does not alter those behaviors or their requirements. If its code lands or changes concurrently, re-read current Assistant seams during task 0.2.

## Dependency direction for implementation

Page → patient/clinical domain components → patterns → primitives → semantic tokens. Client transport remains in lib/api.ts. The existing patient directory is the authenticated entry, and `/` keeps redirecting to `/patients`. Existing patient identity/contact/search SQL stays in db/patients_repo.py and routes/patients.py. Proposed new note, tooth-condition and activity SQL belongs in separate patient-scoped `db/` modules and routes as detailed in patient-clinical-contract.md; these files do not yet exist. Evolution approval retains its current owner and is not reused as a general clinical-note save path. This keeps the highest observable seam at route/API behavior and permits fail-first contract tests.
