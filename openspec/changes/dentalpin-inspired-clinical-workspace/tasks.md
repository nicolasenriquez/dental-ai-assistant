## 0. Investigation and Scope Lock

- [ ] 0.1 Re-read `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`, UX principles and patient/Assistant surface briefs; compare the live target with the two retained target wireframes and `patient-clinical-contract.md`.
  Traceability: proposal investigation and visual continuity; prevents the earlier unsupported Inicio/sidebar redesign from returning.

- [ ] 0.2 Confirm DentalPin observations against `dentalpin-patients-e2e-2026-10-02.md` and source paths, including list, modal, header, diagnosis, Activity and Back reset; keep source-only modules out of target scope.
  Traceability: evidence annex and source-to-target mapping; preserves observed versus inferred distinctions.

- [ ] 0.3 Reconfirm current SidebarHeader/SidebarNavigation/Sidebar, patient search, form, ficha, pending-work and evolution owner seams before runtime edits.
  Traceability: codebase-prime.md and patient-clinical-contract.md; current code may drift after this proposal.

## 1. Contract Coverage (Failing First)

- [ ] 1.1 Add failing sidebar/router proof for `/` → `/patients`, expanded and compact brand → `/patients`, existing three-route order, 56px desktop rail selection without expansion, active marker, accessible tooltip/name, mobile drawer and active-work guard.
  Traceability: patient entry and DentalPin-informed navigation requirements; validates the explicit user correction.

- [ ] 1.2 Add failing directory/create proof for private query return/clear, safe sort/filter URL and history, actual count, semantic table/mobile cards, no-match/stale-error states, valid RUT and duplicate/dirty-close/success form behavior.
  Traceability: directory and existing creation requirements; preserves current privacy and recovery.

- [ ] 1.3 Add failing search API/repository proof for accent/name, formatted phone, complete valid RUT, partial RUT, invalid DV, literal wildcard escaping, masked result, body-only request, two-owner isolation and query-plan bound.
  Traceability: search-by-name-phone-RUT requirement; reproduces the verified partial-RUT fallback.

- [ ] 1.4 Add failing contact and ficha proof for optional phone/email create/detail/edit/null clearing/legacy omission, owner isolation, four tabs, focused evolution route, exact links and no invented status/contact data.
  Traceability: basic contact and patient summary requirements; uses current ficha owner.

- [ ] 1.5 Add failing notes and condition API/repository/UI proof for explicit save/cancel, note revisions, valid permanent/primary FDI sets, code/surface rules, 404/409/422, transactional edit/resolve history, chart/list equivalence and owner isolation.
  Traceability: editable notes and manually editable tooth diagnosis requirements; see patient-clinical-contract.md.

- [ ] 1.6 Add failing Assistant/pending proof for kind/limit semantics, clinical-first priority, separate Drive recovery, unsent starters and zero acquired threads on direct pending-route open.
  Traceability: kind-filtered pending read and Assistant starter requirements.

- [ ] 1.7 Add failing Activity proof for real source filters/count/cursor/deep links and empty/error states.
  Traceability: backed activity requirement and patient-clinical-contract.md.

## 2. Implementation

### Slice 1 — Existing shell and patient discovery

- [ ] 2.1 Keep the current route tree and sidebar styles; change only `SidebarHeader.tsx` brand to a guarded `/patients` link and retain a clickable 56px desktop rail in Assistant/Chat. Preserve `SidebarNavigation.tsx` order/icons/indicator and mobile drawer behavior.
  Traceability: patient entry/navigation requirement and proof 1.1; no fourth destination or new brand system.

- [ ] 2.2 Adapt `Patients.tsx` to the compact search/filter/sort toolbar, authenticated-memory query, safe URL sort/evolution filter, truthful count, semantic desktop table, mobile links and distinct empty/no-match/stale-error states.
  Traceability: context-preserving directory requirement and proof 1.2; align with target wireframe.

- [ ] 2.3 Add nullable phone/email patient columns in Alembic; extend owner-scoped repository, create/detail/update DTOs and typed client. Reuse `PatientFormModal.tsx` with optional validated fields and existing duplicate/dirty-close/focus/exact-ficha behavior.
  Traceability: basic contact requirement and proofs 1.2/1.4; detail/edit owns contact disclosure.

- [ ] 2.4 Repair `POST /api/patients/search` classification and `db/patients_repo.py` for owner-scoped name/phone/full-or-partial-RUT matching, literal escaping and an appropriate normalized index or documented bounded plan. Keep summary contact-free.
  Traceability: search requirement and proof 1.3; fixes a backend classification bug, not only UI filtering.

### Slice 2 — Ficha and supported Assistant context

- [ ] 2.5 Extend the existing pending-work route/repository with exact optional kind/limit filtering before total/cursor, preserving omitted-kind behavior and patient 404. Expose typed client parameters.
  Traceability: kind-filtered pending read requirement and proof 1.6; reuses one authoritative work projection.

- [ ] 2.6 Refine `PatientOverview.tsx` and `PatientDetail.tsx`: four local sections, existing identity/contact and exact evolution links, clinical-first approval/draft, separate Drive line, primary Nueva evolución and unchanged focused evolution route. Provide domain slots for notes, diagnosis and Activity without creating unsupported cards.
  Traceability: patient summary and ficha-section scenarios; depends on contact and pending reads.

- [ ] 2.7 Add supported Assistant unsent starters and a read-only `/assistant?view=pending` route mode; skip auto-acquisition on direct/reloaded pending open, show work in narrow main pane and preserve active composer/context guard.
  Traceability: Assistant starter/direct pending route scenarios and proof 1.6.

### Slice 3 — Patient-owned notes, tooth diagnosis and activity

- [ ] 2.8 Add Alembic tables for `patient_notes`, `patient_note_revisions`, `patient_tooth_conditions` and `patient_tooth_condition_revisions`; implement owner-scoped transactional SQL in dedicated `db/` modules, validation in patient domain helpers, nested routes and typed `lib/api.ts` clients.
  Traceability: notes/condition requirements and proof 1.5; schema/404/409/422 contract in patient-clinical-contract.md.

- [ ] 2.9 Build patient-domain note list/editor/history and diagnostic FDI chart/editor/list/legend with existing primitives and tokens. Enforce draft-only tool/tooth selection, explicit Guardar, accessible textual path, conflict/retry and unsaved-close behavior.
  Traceability: notes/manual diagnosis UI scenarios and proof 1.5; production code uses semantic tokens, not wireframe CSS.

- [ ] 2.10 Add the bounded owner-scoped Activity read projection over approved evolutions and note/condition revisions, then render day-grouped cards with Todos/Evoluciones/Notas/Diagnósticos, exact links and empty/error/end states.
  Traceability: backed activity requirement and proof 1.7; no generic event bus or copied source categories.

## 3. Verification

- [ ] 3.1 Run focused sidebar, route, directory, search, create/contact and two-owner API tests; directly prove partial RUT and collapsed route selection.
  Traceability: first-failing proofs 1.1–1.4 and reproduced user symptom.

- [ ] 3.2 Run focused note/condition/activity persistence and component tests for history, conflict, FDI/surface validation, explicit save/cancel and exact links.
  Traceability: first-failing proofs 1.5 and 1.7 and new clinical write boundary.

- [ ] 3.3 Run focused ficha/Assistant tests for approval priority, Drive separation, focused evolution route, no auto-send and zero thread acquisitions on direct pending-route load.
  Traceability: patient summary and supported Assistant scenarios.

- [ ] 3.4 Run authenticated browser flows with synthetic data at desktop and 320/713/1024 CSS px: `/` → directory → create/search/filter/sort → ficha → notes/diagnosis/activity → exact evolution; verify compact rail, keyboard/focus and no horizontal overflow.
  Traceability: both target HTML wireframes and patient-clinical-contract.md; product interaction proof.

- [ ] 3.5 Run repository backend/frontend lint, typecheck and tests after focused proof; inspect screenshots/ARIA against current `DESIGN.md` and surface briefs.
  Traceability: AGENTS.md validation and durable visual contract.

## 4. Release Hygiene and Closeout

- [ ] 4.1 Update PRODUCT.md, DESIGN.md, affected surface briefs, README/user guidance and API docs for behavior actually shipped.
  Traceability: durable documentation follows verified behavior.

- [ ] 4.2 Update CHANGELOG.md only if this change is ready to ship.
  Traceability: release history belongs after implementation proof.

- [ ] 4.3 Validate OpenSpec alignment with shipped code and prepare sync/archive readiness only after implementation evidence is recorded.
  Traceability: OpenSpec closeout policy; this specification remains active until implementation is verified.

## Execution Order

### Slice 1 — Existing shell and patient discovery
- Tasks: `0.1 → 0.2 → 0.3 → 1.1 → 1.2 → 1.3 → 1.4 → 2.1 → 2.2 → 2.3 → 2.4 → 3.1`
- Checkpoint: compact rail works from all three routes; partial-RUT search and contact round-trip pass owner-scoped tests.
- Blocks: Slice 2 ficha and Slice 3 ficha-integrated UI.

### Slice 2 — Ficha and supported Assistant context
- Tasks: `1.6 → 2.5 → 2.6 → 2.7 → 3.3`
- Blocked by: Slice 1 contact and directory route proof.
- Checkpoint: ficha summary points to exact owned work; direct pending mode acquires no thread.
- Blocks: Slice 3 ficha-integrated UI.

### Slice 3 — Patient-owned notes, tooth diagnosis and activity
- Tasks: `1.5 → 1.7 → 2.8 → 2.9 → 2.10 → 3.2 → 3.4 → 3.5 → 4.1 → 4.2 → 4.3`
- Blocked by: Slice 2 ficha section shell; Activity additionally depends on saved note/condition revisions.
- Checkpoint: saved clinical records and exact activity links pass two-owner, browser and repository validation; release docs reflect shipped behavior.

Only genuine ficha integration depends on earlier slices; schema/repository proof for Slice 3 can start after investigation. Runtime implementation begins in a separate future request.
