## 0. Investigation and Scope Lock

- [x] 0.1 Confirm the domain vocabulary in root `CONTEXT.md`, the rule that AI drafts while the professional approves, and the v0.1 exclusions before touching runtime code.
  Traceability: patient-dental-evolutions requirements `Human review and non-destructive regeneration` and `Patient-first application shell`; locks the clinical authority boundary for Slice 1.
  Notes: Confirmed `Paciente`, `Evolucion`, `Borrador de IA`, `Evolucion aprobada`, and `Alerta de revision` in root `CONTEXT.md`; runtime remains untouched and the proposal exclusions remain authoritative.

- [x] 0.2 Inspect migrations, authenticated route registration, owner-scoped repository prior art, OpenRouter client ownership, logging, React routing, `App.tsx`, `Sidebar`, existing page containers, `AddVideoModal`, form inputs, toast, typography, spacing, radius, focus rings, responsive behavior, and test fixtures; record the concrete files for the new repositories, routes, service, pages, and tests without changing Chat internals or introducing a new visual system.
  Traceability: proposal `Ownership and Test Seam` plus design `Boundary and Ownership` and `Visual contract`; closes repository ownership, visual authority, logging boundary, and highest-test-seam investigation for Slice 1.
  Notes: Concrete extension points are `app/backend/alembic/versions/0006_add_patients_and_evolutions.py`, `db/patients_repo.py`, `db/evolutions_repo.py`, `routes/patients.py`, `routes/evolutions.py`, `services/clinical_evolutions.py`, `main.py`, `config.py`, `llm/openrouter.py`, `tests/test_*_contract.py`, `app/frontend/src/App.tsx`, `components/AppShell.tsx`, `components/Sidebar.tsx`, `components/AddVideoModal.tsx`, `components/ToastProvider.tsx`, `pages/Patients.tsx`, `pages/PatientDetail.tsx`, `pages/NewEvolution.tsx`, `pages/EvolutionDetail.tsx`, `lib/api.ts`, and `src/__tests__/patientDentalEvolutions.contract.test.tsx`; reuse existing CSS tokens, focus rings, modal, toast, and mobile drawer.

## 1. Contract Coverage (Failing First)

- [x] 1.1 Add failing backend HTTP and repository tests for authentication, owner isolation, accepted and invalid RUT forms, masked responses, owner-scoped duplicates, ordinary listing, name and RUT search through the `POST /api/patients/search` body, `MAX_PATIENT_SEARCH_LENGTH = 200` with over-limit `422`, absence of RUT from URLs/query strings and captured access/application/debug/error logs, minimal search/detail responses, and empty patient history; add failing frontend tests for the root redirect, `AppShell` navigation, conversation visibility, one-field patient search with loading/empty/error states, creation, duplicate recovery, and empty detail.
  Traceability: patient-dental-evolutions requirements `Authenticated patient directory`, `Chilean RUT normalization and privacy`, `Patient-first application shell`, and `Spanish accessible patient experience`; first external proof for Slice 1.
  Notes: Added failing-first patient HTTP, RUT, repository, masking, route/privacy, shell, search-state, creation, duplicate-recovery, and empty-detail contracts in `test_patients_contract.py` and `patientDentalEvolutions.contract.test.tsx`.

- [x] 1.2 Add failing unit and route tests for the `patient_id` plus `raw_note` generation body, `MAX_RAW_NOTE_LENGTH = 40_000`, inclusive 1-to-40,000 acceptance, blank and over-limit `422` before history or provider access, no silent truncation, omission of current `evolution_at`, RUT in every representation, patient names, birth date, and search data from the provider payload, fixed clinical prompt, hostile data delimiters, clinical prohibitions, a maximum of three owned approved histories sent oldest to newest, five optional clinical strings, the valid all-empty-fields plus flags response, the recoverable all-empty-fields plus empty-flags response, empty treatment without evidence, preserved suspicion, one non-streaming structured OpenRouter call, Pydantic validation, recoverable errors, no persistence, no Chat quota, the deterministic `CLINICAL_EXTERNAL_LLM_ENABLED` gate, and sanitized logs at every level; add failing frontend tests for no normal counter, near-limit feedback, preserved over-limit paste with generation disabled, client-local datetime capture and review-time editing without stale state, textarea autofocus, no generation on paste, `Ctrl/Cmd + Enter`, same-route state transitions, structured generation, centralized flags, flag-only review with save disabled, manual field completion enabling save, source correction, stale-save blocking, pre-provider human-edit confirmation, cancel with zero provider calls, confirm with exactly one call, retry, and non-destructive regeneration states.
  Traceability: patient-dental-evolutions requirements `Server-owned generation inputs`, `Guarded clinical drafting`, `Structured recoverable generation`, `Human review and non-destructive regeneration`, `Production clinical data gate`, and `Clinical data logging prohibition`; first external and security proof for Slice 2.
  Blocked by: 1.1.
  Notes: Added failing-first request-boundary, exact-length, structured-draft, prompt, ownership, history-limit, fail-closed gate, no-persistence/quota, and frontend generation/regeneration state contracts in `test_clinical_generation_contract.py` and the shared frontend contract file.

- [x] 1.3 Add failing backend tests for composite ownership, `evolution_at TIMESTAMPTZ`, separation from technical timestamps, explicit save, blank or over-limit `raw_note` `422`, blank `final_text` `422` without a row, UUID/content idempotency, conflicting retry, foreign-resource `404`, descending history order, previews, read-only detail, and latest-successful-baseline semantics; add failing frontend tests proving source edits mark the draft stale, save stays unavailable while stale, successful regeneration establishes the new `generated_text`, duplicate `409` recovery opens only the owned existing patient, labelled block composition omits empty sections, UUID reuse, ISO 8601 timestamp submission with offset, failed-save preservation, save state, return navigation, toast, local-time rendering, and newest-first ordering.
  Traceability: patient-dental-evolutions requirements `Owner-bound evolution persistence`, `Idempotent explicit save`, `Ordered approved history`, and `Spanish accessible patient experience`; first external proof for Slice 3.
  Blocked by: 1.2.
  Notes: Added failing-first composite ownership, migration timestamp/FK, save schema, ordering/preview, read-only route, UUID/ISO timestamp, stale baseline, retry preservation, toast, and local-history contracts in `test_evolution_persistence_contract.py` and the shared frontend contract file.

## 2. Implementation

### Patient directory

- [x] 2.1 Create Alembic migration `0006_add_patients_and_evolutions` with UUID ownership, `evolution_at TIMESTAMPTZ NOT NULL`, technical timestamps, and the composite patient/evolution key; implement backend RUT normalization, owner-scoped `GET /api/patients` listing and `POST /api/patients/search` body search with `MAX_PATIENT_SEARCH_LENGTH = 200` and no payload logging, patient creation with recoverable same-owner duplicate metadata, and detail routes; register the authenticated router; add typed patient API functions; extract `AppShell`; route `/` to `/patients`; preserve `/chat`, `/c/:conversationId`, and `/admin`; implement the Spanish one-field patient search, loading/empty/error states, creation and duplicate-recovery dialog, and empty patient detail by composing the inspected DynaChat containers, rows, forms, modal, tokens, focus rings, toast, and responsive behavior to match wireframes 01 through 03.
  Traceability: patient-dental-evolutions requirements `Authenticated patient directory`, `Chilean RUT normalization and privacy`, `Owner-bound evolution persistence`, `Patient-first application shell`, and `Spanish accessible patient experience`; completes Slice 1 without adding edit or delete contracts.
  Blocked by: 1.1.
  Notes: Implemented migration, owner-scoped patient repository/routes, backend RUT normalization and masking, typed API, shared shell, patient list/detail UI, and duplicate recovery. Focused backend contracts (7 passed), Ruff, format, mypy, Python compile, RUT self-check, and OpenSpec validation pass; frontend commands remain unrun because Bun is unavailable.

### Guided draft and refinement

- [ ] 2.2 Implement a fixed dental prompt and Pydantic models for `context`, `findings`, `assessment`, `treatment`, `follow_up`, and `review_flags`; accept only `patient_id` and `raw_note`; enforce `MAX_RAW_NOTE_LENGTH = 40_000` without truncation; select at most three owned approved `final_text` records with `CLINICAL_HISTORY_LIMIT = 3` and send that window oldest to newest; omit current `evolution_at`, RUT, demographics, and search data from the provider boundary; accept five empty clinical fields when flags justify them and reject the all-empty/no-flags result as recoverable; enforce `CLINICAL_EXTERNAL_LLM_ENABLED` before payload assembly with production default `false`; call the centralized OpenRouter client once with `CHAT_MODEL`, `stream=false`, and strict `json_schema`; sanitize all clinical logging; expose `POST /api/evolutions/generate` without persistence or Chat quota; implement the same-route fast path with stable client-local datetime editable through review without staling the draft, progressively disclosed native date/time inputs, textarea autofocus and paste microcopy, no normal counter, contextual feedback from 35,000 characters, preserved over-limit paste, no generation on paste, optional `Ctrl/Cmd + Enter`, structured review fields, one centralized flags region, flag-only review with save disabled until manual clinical content exists, the single `Corregir nota y regenerar` action, a repository-native stale marker, pre-provider human-edit confirmation through the existing dialog, cancel with no call or state loss, confirm with one call, blocked save while stale, and failure-safe regeneration to match wireframes 04 and 05 without a state library.
  Traceability: patient-dental-evolutions requirements `Server-owned generation inputs`, `Guarded clinical drafting`, `Structured recoverable generation`, `Human review and non-destructive regeneration`, `Production clinical data gate`, `Clinical data logging prohibition`, and `Spanish accessible patient experience`; completes Slice 2 while preserving Chat RAG, tools, SSE, citations, quota, and persistence.
  Blocked by: 2.1 and 1.2.

### Save and history

- [ ] 2.3 Implement owner-scoped evolution create/list/detail repository functions and routes, atomic client-UUID idempotency with `409` on changed content, backend enforcement of the 1-to-40,000-character `raw_note` boundary and rejection of blank `final_text` with `422` and no row, `evolution_at DESC, created_at DESC` history, intended-local-time rendering through existing browser or DynaChat behavior, `final_text` previews, typed client calls, labelled composition that omits empty sections, explicit save with one `crypto.randomUUID()` and ISO 8601 `evolution_at`, failed-save preservation, saved-state navigation, `Evolucion guardada` feedback, patient timeline, and read-only evolution detail matching wireframe 06; persist `raw_note` as the current user source, only the latest successful AI baseline as non-authoritative `generated_text`, and the approved non-empty record as `final_text`; never persist review flags or intermediate generations.
  Traceability: patient-dental-evolutions requirements `Owner-bound evolution persistence`, `Idempotent explicit save`, `Ordered approved history`, and `Spanish accessible patient experience`; completes Slice 3 and exposes no clinical `PATCH` or `DELETE`.
  Blocked by: 2.2 and 1.3.

## 3. Verification

- [ ] 3.1 Run the focused patient backend and frontend tests, inspect the applied migration constraints, and verify two authenticated owners cannot observe or associate each other's patients; name and synthetic-RUT searches use the request body, never place RUT in URLs or captured logs, and return only minimal masked results; confirm duplicate creation offers navigation to the same owner's existing patient without creating a row.
  Traceability: Slice 1 checkpoint; directly proves patient directory, privacy, ownership, navigation, and empty-detail contracts.
  Blocked by: 2.1.

- [ ] 3.2 Add synthetic clinical fixtures for uncertainty, attribution, inactive historical pain, explicit left-noise reference, literal `ROM leve` flagging, a fully ambiguous note, hostile instructions, and absent diagnosis, treatment, or follow-up; prove raw-note boundaries and no truncation, the three-record cap and oldest-to-newest window, absence of RUT, demographics, search data, and current clinical time from the provider boundary, acceptance of all-empty fields with flags, rejection of all-empty fields without flags, disabled save until manual content exists, stable client-owned `evolution_at` editable during review without regeneration, progressive controls, autofocus, explicit generate actions, same-route review, centralized flags, stale-save blocking, confirmation before the provider mock, zero calls on cancel, exactly one call on confirm, failure preservation, fail-closed boolean production gate with provider mock not called, and absence of clinical data in captured debug and error logs; implement a manual non-CI OpenRouter runner that prints synthetic input, bounded approved history, structured draft, and flags; run focused prompt, service, route, and UI refinement tests.
  Traceability: patient-dental-evolutions requirements `Synthetic clinical evaluation`, `Production clinical data gate`, and `Clinical data logging prohibition` plus the Slice 2 clinical safety checkpoint.
  Blocked by: 2.2.

- [ ] 3.3 Run focused idempotency, conflict, ownership, ordering, preview, detail, local-time rendering, save-state, latest-baseline provenance, toast, and navigation tests; verify blank `final_text` returns `422` and creates no row, manual clinical completion enables save after a flag-only generation, a changed source cannot save before successful regeneration, the new baseline replaces the prior one without storing generation history, a failed save or regeneration preserves user work, and an identical retry creates no duplicate.
  Traceability: Slice 3 checkpoint; directly proves the saved clinical record and non-destructive interaction contracts.
  Blocked by: 2.3.

## 4. Release Hygiene and Closeout

- [ ] 4.1 Run backend Ruff lint, Ruff format check, mypy, pytest, frontend TypeScript, Biome, and Vitest including Chat regressions; compare all six patient screens with the Markdown wireframes at 1440x900; exercise one narrow viewport and keyboard navigation; verify loading, empty, error, visible and `aria-live` states; confirm no new UI framework, ORM, state library, RAG, or logging framework entered the dependency graph; document the production clinical data gate in release guidance; run the requirement-to-proof audit and `openspec validate patients-dental-evolutions-mvp`; prepare spec sync and archive only after all evidence passes.
  Traceability: all patient-dental-evolutions requirements; final repository, browser, regression, accessibility, and OpenSpec proof.
  Blocked by: 3.1, 3.2, and 3.3.

## Execution Order

### Slice 1 - Patient directory

- Tasks: `0.1 -> 0.2 -> 1.1 -> 2.1 -> 3.1`
- Checkpoint: two authenticated owners can create, search by name or synthetic RUT through a body-only endpoint, and view only their own masked-RUT patients; no raw RUT enters a URL or log, duplicate recovery opens the owned patient, `/patients` is the post-login home, and Chat routes still open.
- Blocks: Slice 2.

### Slice 2 - Guided draft and refinement

- Tasks: `1.2 -> 2.2 -> 3.2`
- Checkpoint: paste or typing followed by one explicit action populates five optional clinical fields in the same route; raw notes enforce the 40,000-character boundary without truncation or a distracting normal-state counter; at most three owned approved histories reach the model while identity, search data and current `evolution_at` do not; fully ambiguous input yields flags without invented text and cannot save until the professional adds clinical content; flags are centralized; changing the source blocks save until regeneration; replacing human edits requires confirmation before the provider call; changing only `evolution_at` does not stale the draft; logs contain no clinical payload; the boolean production gate fails closed; and failed regeneration preserves current work and writes nothing.
- Blocked by: Slice 1.
- Blocks: Slice 3.

### Slice 3 - Save and history

- Tasks: `1.3 -> 2.3 -> 3.3 -> 4.1`
- Checkpoint: an explicit save rejects an empty approved record, then persists the current source, latest successful AI baseline, non-empty approved final text and clinical timestamp; it is idempotent, appears first with intended local time in owner-scoped history, opens read-only detail, and the full validation and browser checks pass without Chat regressions.
- Blocked by: Slice 2.
- Blocks: None.
