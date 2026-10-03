## Why

Dental AI Assistant already opens at the patient directory. DentalPin's strongest transferable patient patterns are compact finding/selection, a stable ficha, manual tooth-level diagnosis, and an activity trail. The current target directory has no table, filter, sort, phone search or partial-RUT match; its ficha has approved evolutions but no basic contact, general notes, odontogram or patient activity view. The existing dark sidebar and three-route hierarchy are preferred and remain the visual/navigation basis.

## Investigation / Current State

- `dentalpin-patients-e2e-2026-10-02.md` records the authenticated browser journey from DentalPin Home through the directory, create modal, search/filter/sort, patient header, Summary/Info/Clinical/Activity and source files. The six user-annotated browser screenshots are referenced there. No source patient was written.
- `live-baseline-2026-10-02.md` and `codebase-prime.md` record the target's current routes, visual contract and owning seams. `/` redirects to `/patients`; `SidebarNavigation.tsx` has Pacientes, Asistente and Chat. `SidebarHeader.tsx` renders a noninteractive tooth brand. Desktop Patients keeps a 56px collapsed rail, while Assistant/Chat may hide it entirely.
- `Patients.tsx` debounces body-only search. `routes/patients.py` tries a complete valid `normalize_rut`; partial numeric input falls into name-only SQL in `db/patients_repo.py`. No phone column exists. `PatientDetail.tsx` owns the ficha and focused evolution route.
- The existing pending-work projection and approval flow already own clinical drafts, approvals and failed Drive exports. Human approval, identifier masking and owner isolation must remain intact.
- `patient-clinical-contract.md` records the chosen resource schemas, API shapes, FDI/catalog validation, optimistic revisions, Activity projection and precise source measurements. Three target-only HTML references show the directory/create, ficha and current anatomical diagnosis layouts.
- `clinical-visual-review-2026-10-02.md` records a fresh headed Playwright CLI diagnosis pass at desktop/tablet/mobile and authenticated target directory/ficha/contextual-Assistant/focused-evolution comparison after manual login. Anatomical chart-first composition, illustrated tools and linked conditions define the requested professional fidelity; the generic diagnostic sketch is superseded. A source mobile Notes/IA collision was reproduced and becomes a target regression case. Target context-panel geometry confirms that diagnosis must reflow by available width.

## What Changes

- Keep `/` redirecting to `/patients`. Retain the current 260px dark sidebar, 56px compact rail, existing Pacientes/Asistente/Chat order, mark and icons. Make the brand in expanded and compact modes link to `/patients`; keep those three destinations directly selectable in the compact desktop rail. The collapse toggle remains separate. Mobile keeps its existing drawer behavior.
- Improve the patient directory with a compact search/filter/sort toolbar, actual result count, semantic desktop table, linked mobile cards and distinct empty/no-match/error states. Use only the supported evolution-presence filter and sort fields from current patient data. Preserve sensitive search text in authenticated memory and the POST body, with safe sort/filter in URL state.
- Repair the existing owner-scoped search to find names, normalized phone fragments, complete valid RUT and partial RUT bodies. Keep masked summary output and the current request-race/privacy protections.
- Reuse `PatientFormModal` for creation/editing. First/last name and valid RUT remain required. Add optional phone/email to the patient identity record, preserve duplicate recovery and dirty-close behavior, and route successful creation to the exact ficha.
- Hide RUT in directory rows/cards while retaining private RUT search and its planned correction. Show registered phone/email and masked RUT through header icons with hover/focus/tap disclosure; preserve sidebar appearance, actions and local tabs.
- Give the ficha four local sections: Resumen, Información, Clínica and Actividad. Resumen prioritizes approval/draft and separates Drive recovery, preserving exact links and the primary Nueva evolución action. Información shows identity/contact and separate editable general notes. Clínica has manually editable tooth-level Diagnóstico with a chart/list/legend and a read-only Evoluciones subtab. Actividad lists only persisted approved evolutions, note revisions and condition revisions with filters and exact context links.
- Keep the supported Assistant starter and direct pending-work route refinements. They prefill or navigate without automatic sending, saving, thread acquisition on pending open, or approval bypass.

## Capabilities

### Modified Capabilities

- Patient directory/navigation, patient identity/contact, patient ficha/clinical context, patient-owned notes and tooth conditions, patient activity, and Assistant pending entry.

## Change Profile

- Profile: runtime-change
- Why: authenticated navigation, search, persistence/API contracts and visible clinical interaction change.

## Ownership and Test Seam

- Highest existing seam: authenticated React Router/AppShell plus owner-scoped patient, pending-work and evolution APIs.
- Frontend owners: `SidebarHeader.tsx`/`SidebarNavigation.tsx`/`Sidebar.tsx` for existing navigation; `Patients.tsx`/`PatientFormModal.tsx` for directory and create; `PatientDetail.tsx` and patient-domain components for ficha; existing ClinicalAssistant components for starter/pending behavior.
- Backend owners: `routes/patients.py` and `db/patients_repo.py` for identity/search; dedicated patient note/condition/activity routes and `db/` modules for new resources; existing pending projection for kind-filtered reads. SQL remains in `db/`; typed calls remain in `lib/api.ts`.
- Highest proof seam: two-owner API/repository contracts plus route/component and real-browser flows. `patient-clinical-contract.md` supplies exact 404/409/422, schema and state boundaries.

## Out Of Scope

- A standalone Inicio dashboard, new global route group, DentalPin's sidebar palette/density, appointments, recalls, financial modules, treatment plans, communications or patient document library.
- AI-generated coded diagnosis, automated chart writes, imported DentalPin patient data, generic event bus, or clinical notes silently entering model prompts.
- Invented visits, balances, patient status, outreach controls or activity kinds without a target data source.

## Impact

- Frontend sidebar behavior, directory, form, ficha, Assistant entry and focused tests.
- Owner-scoped patient search/contact, note/condition revisions and Activity read projection, with Alembic migrations and typed clients.
- Existing auth, clinical approval, RUT masking, rate limit, Drive, Chat and RAG remain authoritative.

## Verification Policy

- Write fail-first proof at each owning seam before runtime edits. Verify the reproduced partial-RUT symptom and compact-sidebar navigation directly.
- Cover contact round-trip, note/condition history and optimistic conflict, chart save/cancel/accessibility, Activity count/filter/cursor, route privacy and two-owner isolation.
- Validate the target-only HTML at desktop and narrow widths with synthetic data, then use focused tests and the repository validation suite during implementation. This planning change edits documentation/wireframes only.

## Notes

- User clarification on 2026-10-02: preserve the present main sidebar and make its logo lead to the main patient page. `/patients` therefore remains the authenticated entry; the earlier proposed separate Inicio page, fourth nav item, bounded recent-patient dashboard read and Home-only preview are removed from this change.
- The source-to-target comparative HTML was removed because it duplicated the prose browser audit and showed unsupported source-only controls. The three current target references are clinical-workspace.html, patient-detail.html and diagnosis.html. The obsolete embedded clinical sketch and its JavaScript were removed from patient-detail.html; its Clínica tab opens diagnosis.html. Audit-2026-10-03 captures supersede earlier directory/ficha/shell PNGs as visual references.
- The explicit user decisions to add manually editable conditions per tooth and general patient notes supersede the earlier read-only-only Clínica scope. Evolutions remain read-only in the ficha until their existing approval/save workflow is invoked.
- Source evidence is descriptive; `specs/clinical-workspace-discovery/spec.md`, `design.md`, `patient-clinical-contract.md` and `tasks.md` are the target contract.
- User direction in this review: mirror DentalPin's clinical/diagnostic professionalism while preserving Dental AI Assistant identity. This means anatomical chart fidelity and information hierarchy, not copying its palette, practice-management modules or mutation semantics. Current scope and resource/API contracts remain as already selected.
- User authorized closing the six readiness findings with the proposed recommendations. Ordered search grammar, exact DTO/pagination/error/catalogue contracts, retry UUIDs, immutable condition identity/recurrence and draft guards are normative in the two patient contracts. The current diagnosis.html reference replaces generic clinical glyphs. tasks.md separates notes, manual condition-list flow, anatomical chart and Activity; no implementation task has been completed by this planning pass.

- `audit-2026-10-03/report.md` records the current single-context Product Design/UI critique,15 source fichas ×4 scoped sections, target comparison and captured states. `implementation-blueprint.md` UI-01…UI-09 fixes shell/directory/header/modal/panel/icon acceptance. Preserve the sidebar's appearance; add a separate compact brand row rather than hiding the mark or merging it with the collapse toggle. The source runtime memory interruption was recovered before final traversal. No patient data was persisted by the audit.
