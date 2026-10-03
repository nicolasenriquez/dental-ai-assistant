## AI Implementation Guardrails

1. Authority
   Follow the canonical document precedence defined in README.
   On contradiction, stop the affected slice; never infer a winner.

2. Scope
   Implement one slice at a time.
   Never widen scope to source DentalPin features.

3. Tests first
   Each 1.x proof must fail for the expected reason before its
   corresponding 2.x runtime implementation begins.

4. Checkpoint
   A dependent slice cannot start until its 3.x verification is green.

5. Persistence
   Migrations are expand-only.
   Verify current Alembic head before creating one.
   Never destroy or rewrite existing clinical records.
   Application rollback must remain possible with the expanded schema.

6. Privacy
   Never put raw name, RUT or phone search text into URL,
   browser storage, navigation state, analytics or logs.

7. Clinical writes
   UI selection never writes.
   Only explicit Guardar writes notes/conditions.
   Evolution persistence continues through the existing approval flow.

8. Existing behavior
   Never bypass auth, owner scoping, transition guards, RUT masking,
   approval, Drive separation or request-race protections.

9. No speculative abstractions
   Do not add a generic event bus, global clinical store,
   new design system, new route hierarchy or unsupported DentalPin model.

10. Slice report
    After each slice report:
    - files changed
    - schema changes
    - tests added
    - verification performed
    - screenshots/states checked
    - deviations
    - next unlocked slice

## 0. Investigation and Scope Lock

- [x] 0.1 Re-read AGENTS.md, PRODUCT.md, DESIGN.md, UX principles and patient/Assistant briefs; use diagnosis.html as current clinical visual reference and the two patient contracts as API/interaction authority.
  Traceability: clinical safety/visual continuity and professional chart-first composition; implementation-time drift check.
  Notes: 2026-10-03 reread repository rules, product/design/UX contracts, both surface briefs, all OpenSpec apply context, both patient contracts, diagnosis.html and blueprint UI-01–UI-09. Current product/design/briefs describe shipped behavior; this change explicitly proposes compact navigation, local sections and manual saves. Production documentation updates remain gated by 4.1. Synthetic HTML is composition evidence only.
- [x] 0.2 Reconfirm source/target seams using codebase-prime.md, both browser audits and readiness-review.md; record any new runtime drift without widening scope.
  Traceability: investigation evidence and highest owning route/API seam; source-only modules remain excluded.
  Notes: 2026-10-03 compared codebase-prime, target/source browser audits, clinical visual review, current audit and readiness review against App.tsx, AppShell, SidebarHeader, Patients, PatientDetail, ClinicalAssistant and patient/pending route SQL. HEAD bac9ba9 follows prime snapshot 299da98 with documentation/preview commits; recorded runtime gaps remain. Pending route already validates limit=1–50 (default 20); add kind and expose existing limit in typed client rather than duplicate pagination. No fresh browser or persistence claim; source-only modules remain excluded.
- [x] 0.3 Confirm current patient/search, pending projection, patient form, transition guards and Postgres migration head; inspect existing test prior art before creating new files.
  Traceability: ownership contract and safe expand-only schema extension; no runtime migration has run during planning.
  Notes: 2026-10-03 inspected patient routes/repository, pending route/projection, PatientFormModal, Patients, AppShell/Sidebar and capture-phase transition guard plus existing patient/sidebar/shell tests. `uv --project backend run alembic --config backend/alembic.ini heads` and local Postgres alembic_version both report0019. Search currently falls back to names; contact absent; compact brand hidden and Assistant/Chat hide rail. User authorized prerequisite slices2.1/3.1 and2.2–2.4/3.2 before proof1.4; serial gates remain in force.

## 1. Contract Coverage (Failing First)

- [x] 1.1 Add route/component proof for guarded brand destination, 56px compact rail, current route order/active marker and mobile drawer without losing active clinical work.
  Traceability: patient entry and DentalPin-informed sidebar requirements; UI-01 compact brand in its own row, separate toggle, keyboard/hover tooltip; Sidebar.test.tsx/AppShell.test.tsx prior art.
  Notes: 2026-10-03 fail-first run reproduced four expected failures (brand not a link in both modes; Chat/Assistant compact sidebar inert). Extended existing Sidebar/AppShell tests; guard proof preserves unsent text and queues one navigation. Existing route-order/active-marker/mobile-focus tests retained.
- [x] 1.2 Add contact API/form proof for create/detail/edit, null clearing versus PATCH omission, owner404, validation, duplicate-RUT recovery and exact created-ficha route.
  Traceability: existing patient creation/basic contact; Patients.test.tsx and test_patients_contract.py.
  Notes: 2026-10-03 fail-first contact tests exposed ignored invalid contact(201 instead of422), absent detail fields and absent form inputs. Existing contract/form tests extended; real two-owner API round-trip, atomic validation/no write, legacy omission, null clearing and masked duplicate recovery pass in test_clinical_workspace_live.py. Browser creation opened exact generated ficha and edit retained contact. Additional integration checks followed initial red proof.
- [x] 1.3 Add search/directory proof for every ordered classification fixture, accent normalization, escaped wildcards, collision/exact precedence, owner isolation, no URL/storage/log query, safe sort/filter/back-forward and stale recovery.
  Traceability: context-preserving directory/search requirements and patient-clinical-contract classification table; existing patient tests.
  Notes: 2026-10-03 initial classification/directory proof failed before runtime changes.17 grammar fixtures plus live accent/literal-wildcard/collision/exact/foreign-owner API checks pass.22 directory tests cover six sorts, ID ties/null-last, invalid URL defaults, private return/refetch/session reset, back/forward, clear retaining controls, debounce races and stale retry. Browser safe return/history passed. Supplemental integration/race proofs added during verification.
- [x] 1.4 Add ficha/pending proof for exact kind totals before cursor, four sections, header contact icons with absent/cleared values, keyboard/touch reveal and masked RUT, clinical priority versus newer Drive failure, exact evolution route and zero auto-acquired threads in direct pending mode.
  Traceability: kind-filtered pending, owned summary and supported Assistant; PatientDetail.test.tsx, ClinicalPendingWork.test.tsx and clinical workspace backend tests.
  Notes: 2026-10-03 fail-first proof complete, runtime2.5–2.7 not started. Eight frontend failures expected: five ficha tests, two direct/remounted pending tests and additive kind/limit client test. Unknown-kind API returns200 instead of422; live two-owner mixed-kind/cursor fixture reaches missing kind parameter after respecting one-pending-action-per-thread constraint. Assertions cover counts before cursor, owned parent404, unchanged mixed read, four keyboard sections, focus/hover/tap/Escape contact and masked RUT, absent/saved-cleared contact, approval priority versus newer Drive failure, exact summary evolution link and zero acquisition. Existing focused-evolution route proof remains. TypeScript/Biome and backend Ruff/format/mypy pass. Next scoped runtime task2.5; full report in execution-2026-10-03.md.
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

- [x] 2.1 Keep current route tree/brand/tokens; make expanded/compact brand a guarded /patients link and retain selectable compact global icons in Assistant/Chat. Preserve drawer and runtime guards.
  Traceability: entry/navigation and proof1.1. Observable checkpoint: root/brand/compact links work without expansion.
  Notes: 2026-10-03 SidebarHeader uses existing Router Link and capture-phase guard; compact brand44px row, separate toggle, existing palette/mark. AppShell retains rail across routes.45 focused tests and TypeScript pass; Docker production build passes. No schema change.

### Slice 2: Contact, search and directory

- [x] 2.2 Add nullable phone/email via new Alembic migration, owner-scoped detail/create/update and typed client; extend existing PatientFormModal with optional validated fields.
  Traceability: contact and proof1.2; includes legacy omission/null, duplicate/dirty-close/focus behavior.
  Notes: 2026-10-03 new0020 adds nullable VARCHAR40/254 and unaccent; downgrade keeps expanded data for application rollback. Existing route/repository/client/modal extended; POST remains contact-free summary201, detail includes nullable contact, PATCH omission uses explicit update flags. Contact is not added to public_patient/model identity. Focused checks pass; isolated Docker migration applied, local user's database remains0019.
- [x] 2.3 Implement ordered search classification, escaped/normalized owner queries and documented query-plan evidence; preserve complete contact-free summary response.
  Traceability: search and proof1.3; depends on2.2 phone persistence, uses patient-clinical-contract fixtures.
  Notes: 2026-10-03 stdlib grammar helper plus parameterized owner SQL; names use lower/unaccent, phone digits/RUT-body union deduplicates through one patient row, LIKE literals escaped. Existing unpaginated summary retained. Production-SQL EXPLAIN on10,000 synthetic patients(1,000 owned/9,000 other) uses existing uq_patients_owner_rut exact/owner bitmap scans before expression filters. Observed exact0.054ms, fragment1.246ms, phone1.272ms, name1.129ms; measurements are fixture evidence, not thresholds. No speculative search index added.
- [x] 2.4 Adapt directory toolbar/table/mobile cards, authenticated-memory query, safe URL sort/filter, count and recovery; preserve in-app return without sensitive history.
  Traceability: directory and proof1.3; UI-02…UI-04/09 search placement, semantic columns without visible RUT on desktop/mobile, avatar/chevron, single link/focus, long names and measurable spacing; no pagination or silent result cap added. UI-07 governs existing modal field grouping and protections.
  Notes: 2026-10-03 authenticated provider holds query/safe return controls only in React memory; PatientDetail back links preserve safe URL. Existing page retains debounce/stale/modal behavior, native selects, visible count, result component with semantic desktop table/mobile cards and one ficha link per row. Search invalidates immediately during debounce/unmount.22 directory tests pass; browser320/713/1024/1440 has no page overflow, table starts1024, desktop search333/480px. No data cap, dependency or browser storage added.

### Slice 3: Ficha and Assistant context

- [ ] 2.5 Extend current pending-work route/repository with kind/limit before cursor/total and typed client; preserve omitted-kind behavior and owner404.
  Traceability: kind-filtered pending and proof1.4; one authoritative projection.
- [ ] 2.6 Refine PatientDetail/PatientOverview into four local sections with exact links, clinical-first pending, separate Drive status, conditional contact and unchanged focused evolution route.
  Traceability: ficha/summary and proof1.4; UI-05/06/08 header/metadata/icons/keyboard tabs, no empty evolution pane on default Resumen; consumes2.2 and2.5; tabs precede selected section content. Header Phone/Mail/IdCard reveal on hover/focus/tap, masked RUT only; contact display/copy in Información. Keep action buttons and four tabs; no new communication integration.
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

- [x] 3.1 Verify guarded navigation/compact rail and mobile drawer with focused tests and ordinary keyboard/pointer use.
  Traceability: proof1.1 and slice1 checkpoint.
  Notes: 2026-10-03 isolated Docker app localhost:8001, synthetic local account. Playwright CLI ordinary clicks selected Chat/Assistant from compact rail; settled1440×900 rail56px on both, brand44×44; Enter on brand returned /patients.375×667 mobile drawer opened, route selected, Escape closed; focus restoration also covered by existing component proof.45 focused tests pass. Slice2 unlocked; no screenshot or schema change claimed.
- [x] 3.2 Verify contact round-trip, search classification/collisions/query plan, private return, sort/filter and directory/create recovery.
  Traceability: proofs1.2–1.3 and slice2 checkpoint; owner-scoped fixtures.
  Notes: 2026-10-03 isolated Postgres/API6 live tests pass, including10k query plan; host46 patient contracts and22 directory tests pass. Production browser proved creation/exact ficha, masked duplicate opening, contact edit/reopen/clearing, safe private return, back/forward, reload reset, no-match/filter-empty, dirty-discard, stale retry and long-name reflow. Actual320/713/1024/1440 CSS widths have no overflow; desktop table starts1024. Screenshots retained in .playwright-cli/clinical-directory-{1440,320,stale,long-name}.png and clinical-modal-invalid.png;320 capture retaken after drawer transition settled. Frontend full suite601 passes, Biome/TypeScript and backend Ruff/format/mypy pass. Full backend891 passes/104 skips/one pre-existing CHAT_MODEL mismatch; final gate3.9 remains pending. Slice3 proof1.4 unlocked.
- [ ] 3.3 Verify header hover/focus/tap/Escape behavior, absent-contact icons, masked RUT and unchanged tabs/actions; ficha exact links, clinical-first pending, focused evolution and direct/reloaded pending zero acquisition; context panel preserves work.
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
  Traceability: integrated clinical safety/continuity and all slice checkpoints; UI-01…UI-09, actual CSS viewport and transition-settled measurements, real/synthetic distinction in audit-2026-10-03/report.md. Include ready/loading/empty/no-match/filter-empty/stale-error, unknown metadata, long name and modal duplicate/descarte states.
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

Execute one slice at a time in order 1 → 2 → 3 → 4 → 5 → 6 → 7. Finish each 3.x checkpoint before opening the next slice, including its 1.x proof. This serial execution policy adds no new schema dependencies.

### Common investigation
- Tasks: `0.1 → 0.2 → 0.3`
- Checkpoint: current seams match scoped contracts or drift is resolved before implementation.

### Slice 1: Navigation
- Tasks: `1.1 → 2.1 → 3.1`
- Blocked by: common investigation.
- Checkpoint: guarded expanded/compact navigation demonstrated.

### Slice 2: Contact/search/directory
- Tasks: `1.2 → 1.3 → 2.2 → 2.3 → 2.4 → 3.2`
- Blocked by: common investigation and slice1 checkpoint3.1 under the serial policy; no schema dependency on slice1.
- Checkpoint: complete owned search results/private navigation and contact validated.

### Slice 3: Ficha/context
- Tasks: `1.4 → 2.5 → 2.6 → 2.7 → 3.3`
- Blocked by: slice2 verified checkpoint3.2.
- Checkpoint: sections/exact links/pending-mode work without implicit writes.

### Slice 4: Notes
- Tasks: `1.5 → 2.8 → 2.9 → 3.4`
- Blocked by: slice3 verified checkpoint3.3.
- Checkpoint: complete note/revision lifecycle and retry-safe recovery.

### Slice 5: Conditions/list
- Tasks: `1.6 → 2.10 → 2.11 → 3.5`
- Blocked by: slice3 verified checkpoint3.3; serial policy also requires slice4 checkpoint3.4.
- Checkpoint: manual condition lifecycle works without anatomical chart.

### Slice 6: Odontogram
- Tasks: `1.7 → 2.12 → 2.13 → 3.6`
- Blocked by: slice5 verified checkpoint3.5.
- Checkpoint: chart and list represent identical persisted data across widths.

### Slice 7: Activity
- Tasks: `1.8 → 2.14 → 2.15 → 3.7`
- Blocked by: slice4 verified checkpoint3.4 and slice5 verified checkpoint3.5. Serial policy also requires slice6 checkpoint3.6; there is no chart data dependency.
- Checkpoint: revision events distinct, exact destinations focus real resources.

### Integrated release gate
- Tasks: `3.8 → 3.9 → 4.1 → 4.2 → 4.3`
- Blocked by: slice1–7 verified checkpoints.
- Checkpoint: integrated behavior, repository validation and release documentation agree.

Task IDs were normalized before any runtime implementation began. Each task appears once in this execution block. These edges describe dependencies, not permission to spawn agents or start implementation.
