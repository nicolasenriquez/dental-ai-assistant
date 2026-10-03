## 0. Investigation and Scope Lock

- [ ] 0.1 Re-read AGENTS.md, PRODUCT.md, DESIGN.md, UX principles and patient/Assistant briefs; use diagnosis.html as current clinical visual reference and the two patient contracts as API/interaction authority.
  Traceability: clinical safety/visual continuity and professional chart-first composition; implementation-time drift check.
- [ ] 0.2 Reconfirm source/target seams using codebase-prime.md, both browser audits and readiness-review.md; record any new runtime drift without widening scope.
  Traceability: investigation evidence and highest owning route/API seam; source-only modules remain excluded.
- [ ] 0.3 Confirm current patient/search, pending projection, patient form, transition guards and Postgres migration head; inspect existing test prior art before creating new files.
  Traceability: ownership contract and safe expand-only schema extension; no runtime migration has run during planning.

## 1. Contract Coverage (Failing First)

- [ ] 1.1 Add route/component proof for guarded brand destination, 56px compact rail, current route order/active marker and mobile drawer without losing active clinical work.
  Traceability: patient entry and DentalPin-informed sidebar requirements; Sidebar.test.tsx/AppShell.test.tsx prior art.
- [ ] 1.2 Add contact API/form proof for create/detail/edit, null clearing versus PATCH omission, owner404, validation, duplicate-RUT recovery and exact created-ficha route.
  Traceability: existing patient creation/basic contact; Patients.test.tsx and test_patients_contract.py.
- [ ] 1.3 Add search/directory proof for every ordered classification fixture, accent normalization, escaped wildcards, collision/exact precedence, owner isolation, no URL/storage/log query, safe sort/filter/back-forward and stale recovery.
  Traceability: context-preserving directory/search requirements and patient-clinical-contract classification table; existing patient tests.
- [ ] 1.4 Add ficha/pending proof for exact kind totals before cursor, four sections, clinical priority versus newer Drive failure, exact evolution route and zero auto-acquired threads in direct pending mode.
  Traceability: kind-filtered pending, owned summary and supported Assistant; PatientDetail.test.tsx, ClinicalPendingWork.test.tsx and clinical workspace backend tests.
- [ ] 1.5 Add note API/editor proof for UUID retry after response loss, expected_revision/409, transaction+revisions, owner/parent404, bounded cursor, deep-link record outside page1 and dirty navigation.
  Traceability: editable notes, stable API and retry-safe mutation requirements; new proof at existing patient route/API seam.
- [ ] 1.6 Add conditions API/list proof for catalogue, FDI/surfaces, immutable fields, duplicate race, recurrence, resolve only through Guardar, response-lost retry and conflicts.
  Traceability: manual diagnosis, fixed identity, stable API and draft continuity; patient-api-contract and patient-clinical-contract.
- [ ] 1.7 Add chart component/browser proof for anatomical families/order, symbol/surface agreement, multiple active/resolved marks, highlight independent of draft, both dentitions and available-width reflow with Assistant.
  Traceability: professional chart-first composition; diagnosis.html verified synthetic geometry, not a persistence proof.
- [ ] 1.8 Add Activity proof for revision event_id versus resource_id, persistence timestamps, filter/count/cursor ties, exact deep links and error versus empty/end.
  Traceability: backed activity/stable API requirements; two-owner API proof and typed component interactions.

## 2. Implementation

### Slice 1: Existing navigation

- [ ] 2.1 Keep current route tree/brand/tokens; make expanded/compact brand a guarded /patients link and retain selectable compact global icons in Assistant/Chat. Preserve drawer and runtime guards.
  Traceability: entry/navigation and proof1.1. Observable checkpoint: root/brand/compact links work without expansion.

### Slice 2: Contact, search and directory

- [ ] 2.2 Add nullable phone/email via new Alembic migration, owner-scoped detail/create/update and typed client; extend existing PatientFormModal with optional validated fields.
  Traceability: contact and proof1.2; includes legacy omission/null, duplicate/dirty-close/focus behavior.
- [ ] 2.3 Implement ordered search classification, escaped/normalized owner queries and documented query-plan evidence; preserve complete contact-free summary response.
  Traceability: search and proof1.3; depends on2.2 phone persistence, uses patient-clinical-contract fixtures.
- [ ] 2.4 Adapt directory toolbar/table/mobile cards, authenticated-memory query, safe URL sort/filter, count and recovery; preserve in-app return without sensitive history.
  Traceability: directory and proof1.3; no pagination or silent result cap added.

### Slice 3: Ficha and Assistant context

- [ ] 2.5 Extend current pending-work route/repository with kind/limit before cursor/total and typed client; preserve omitted-kind behavior and owner404.
  Traceability: kind-filtered pending and proof1.4; one authoritative projection.
- [ ] 2.6 Refine PatientDetail/PatientOverview into four local sections with exact links, clinical-first pending, separate Drive status, conditional contact and unchanged focused evolution route.
  Traceability: ficha/summary and proof1.4; consumes2.2 and2.5; tabs precede selected section content.
- [ ] 2.7 Add unsent supported Assistant starters and direct read-only pending route; skip thread acquisition on pending open, preserve active composer/runtime and narrow-pane access.
  Traceability: supported Assistant/direct pending requirements and proof1.4.

### Slice 4: Notes and revisions

- [ ] 2.8 Add note/revision migration, dedicated SQL/domain validation, bounded reads including exact-record GET, transactional create/PATCH/retry and routes/typed clients.
  Traceability: editable notes/stable API/retry-safe mutations and proof1.5. Observable checkpoint: two-owner note API lifecycle and response-lost retry pass.
- [ ] 2.9 Integrate Información note list/editor/revisions and deep-link focus; enforce explicit save, conflict rebase, dirty guards and refresh-after-write without leaking note text.
  Traceability: notes/draft continuity and proof1.5; depends on2.6 and2.8, not chart work.

### Slice 5: Manual conditions and accessible list

- [ ] 2.10 Add condition/revision migration with canonical surfaces and active partial uniqueness; implement catalogue, FDI/immutability validation, bounded/exact reads, transactional mutation/retry, routes and typed clients.
  Traceability: manual diagnosis/fixed identity/stable API and proof1.6. Observable checkpoint: valid/invalid API lifecycle, concurrent duplicate and recurrence pass.
- [ ] 2.11 Build condition-list-first clinical editor with named FDI selector, supported tool/surfaces, draft state machine, edit/resolve/history and deep links. Chart is not required to complete manual clinical flow in this slice.
  Traceability: manual diagnosis/draft continuity and proof1.6; depends on2.6 and2.10; resolved records read-only.

### Slice 6: Anatomical odontogram

- [ ] 2.12 Add patient-domain SVG geometry for incisor/canine/premolar/molar families and permanent/primary order; implement fixed symbol/surface/status mapping with text equivalents using existing semantic tokens.
  Traceability: anatomical chart/orientation/tool recognition and proof1.7; independently authored geometry, no new package or imported patient content.
- [ ] 2.13 Integrate chart-first tools/list/legend with existing condition draft; load all saved-condition pages, distinguish incomplete reads, bind hover/focus without mutation and compose inspector by available width. Narrow overview has enlarged tooth editor/44px selector, no competing floating controls.
  Traceability: chart linkage/available-width/pointer access and proof1.7; depends on2.11 and2.12; diagnosis.html is composition reference, production behavior uses typed state.

### Slice 7: Persisted activity

- [ ] 2.14 Implement bounded Activity SQL read projection and typed route/client over approved evolution saves and note/condition revisions; preserve event/resource distinction and deterministic cursor/totals.
  Traceability: backed activity/stable API and proof1.8; depends on2.8 and2.10 revisions, not chart rendering.
- [ ] 2.15 Render day-grouped Activity with Todos/Evoluciones/Notas/Diagnósticos, source-backed metadata, exact context links and reset/retry/end states.
  Traceability: backed activity and proof1.8; depends on2.6,2.9,2.11 and2.14 for exact resource UI focus.

## 3. Verification

- [ ] 3.1 Verify guarded navigation/compact rail and mobile drawer with focused tests and ordinary keyboard/pointer use.
  Traceability: proof1.1 and slice1 checkpoint.
- [ ] 3.2 Verify contact round-trip, search classification/collisions/query plan, private return, sort/filter and directory/create recovery.
  Traceability: proofs1.2–1.3 and slice2 checkpoint; owner-scoped fixtures.
- [ ] 3.3 Verify ficha exact links, clinical-first pending, focused evolution and direct/reloaded pending zero acquisition; context panel preserves work.
  Traceability: proof1.4 and slice3 checkpoint.
- [ ] 3.4 Verify notes end to end with two owners, revision pagination, response-lost retry, conflict and Activity-target deep links outside page1.
  Traceability: proof1.5 and slice4 checkpoint; no chart dependency.
- [ ] 3.5 Verify manual conditions from accessible list with no chart: catalogue/FDI/surfaces, immutable correction, duplicates/races, resolve/cancel, recurrence, retry and history.
  Traceability: proof1.6 and slice5 checkpoint; Guardar is sole write action.
- [ ] 3.6 Verify chart geometry/marks/text equivalence and ordinary interactions at1440×900,1024×768,375×667 plus320px. Include selected/saved/resolved/empty/loading/error/conflict and context-panel reflow; source DP-C1 overlap must not recur.
  Traceability: proof1.7 and slice6 checkpoint; production screenshots with synthetic records, not wireframe substitution.
- [ ] 3.7 Verify Activity event/cursor/filter/count/deep-link behavior across multiple revisions of the same resource, same timestamps and backdated evolution.
  Traceability: proof1.8 and slice7 checkpoint; source failure is never empty.
- [ ] 3.8 Run integrated patient→notes/conditions/chart/activity→exact evolution flow; keyboard/44px/reduced-motion/privacy/dirty guards, including Assistant open/close while drafting.
  Traceability: integrated clinical safety/continuity and all slice checkpoints.
- [ ] 3.9 Run repository backend/frontend lint, format/typecheck/tests; inspect production visual/ARIA results against DESIGN and the current diagnosis reference.
  Traceability: AGENTS.md full validation and final regression gate.

## 4. Release Hygiene and Closeout

- [ ] 4.1 Update PRODUCT, DESIGN, affected surface briefs, README and API docs only for verified shipped behavior, including manual-save versus evolution approval and compact-rail change.
  Traceability: durable operational/visual truth after integration.
- [ ] 4.2 Update CHANGELOG if ready to ship.
  Traceability: release history follows verified implementation.
- [ ] 4.3 Reconcile OpenSpec with shipped code, record verification evidence and prepare sync/archive readiness.
  Traceability: OpenSpec closeout; planning alone never marks runtime delivered.

## Execution Order

### Common investigation
- Tasks: `0.1 → 0.2 → 0.3`
- Checkpoint: current seams match scoped contracts or drift is resolved before implementation.

### Slice 1: Navigation
- Tasks: `1.1 → 2.1 → 3.1`
- Blocked by: common investigation.
- Checkpoint: guarded expanded/compact navigation demonstrated.

### Slice 2: Contact/search/directory
- Tasks: `1.2 → 1.3 → 2.2 → 2.3 → 2.4 → 3.2`
- Blocked by: common investigation; no schema dependency on slice1.
- Checkpoint: complete owned search results/private navigation and contact validated.

### Slice 3: Ficha/context
- Tasks: `1.4 → 2.5 → 2.6 → 2.7 → 3.3`
- Blocked by: slice2 contact2.2; pending2.5 can start after investigation.
- Checkpoint: sections/exact links/pending-mode work without implicit writes.

### Slice 4: Notes
- Tasks: `1.5 → 2.8 → 2.9 → 3.4`
- Blocked by: slice3 ficha2.6 for UI; API2.8 can start after investigation.
- Checkpoint: complete note/revision lifecycle and retry-safe recovery.

### Slice 5: Conditions/list
- Tasks: `1.6 → 2.10 → 2.11 → 3.5`
- Blocked by: slice3 ficha2.6 for UI; API2.10 can start after investigation.
- Checkpoint: manual condition lifecycle works without anatomical chart.

### Slice 6: Odontogram
- Tasks: `1.7 → 2.12 → 2.13 → 3.6`
- Blocked by: slice5 editor/list2.11 for integration; SVG2.12 can start after investigation.
- Checkpoint: chart and list represent identical persisted data across widths.

### Slice 7: Activity
- Tasks: `1.8 → 2.14 → 2.15 → 3.7`
- Blocked by: slice4 revisions/API2.8 and UI2.9; slice5 revisions/API2.10 and UI2.11. No chart dependency.
- Checkpoint: revision events distinct, exact destinations focus real resources.

### Integrated release gate
- Tasks: `3.8 → 3.9 → 4.1 → 4.2 → 4.3`
- Blocked by: slice1–7 verified checkpoints.
- Checkpoint: integrated behavior, repository validation and release documentation agree.

Task IDs were normalized before any runtime implementation began. Each task appears once in this execution block. These edges describe dependencies, not permission to spawn agents or start implementation.
