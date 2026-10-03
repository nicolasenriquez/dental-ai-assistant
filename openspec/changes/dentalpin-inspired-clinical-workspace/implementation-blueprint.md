# Implementation blueprint and measurable UI contract

The normative scenarios are in `specs/clinical-workspace-discovery/spec.md`. `patient-clinical-contract.md` specifies the new schema, API, FDI/catalog validation, revision and activity behavior. `dentalpin-patients-e2e-2026-10-02.md` is source evidence. `wireframes/clinical-workspace.html` and `wireframes/patient-detail.html` are target-only structural references with synthetic data; production components use current tokens and patterns.

## Source-to-target map

| DentalPin pattern | Current owner | Target boundary |
| --- | --- | --- |
| Light 240px navigation, source brand routes `/`, collapsed module icons | Dark 260px/56px `SidebarHeader.tsx`, `SidebarNavigation.tsx`, `Sidebar.tsx`; brand currently a `div` | Retain current three links/colors/mark; brand routes `/patients`; compact desktop rail permits direct Pacientes/Asistente/Chat selection. |
| Search/filter/sort and row-wide ficha links | `Patients.tsx`, `POST /api/patients/search` | Body-only name/phone/RUT search; supported evolution filter and three sort fields; semantic desktop table and linked mobile cards. |
| Centered create modal, required/optional fields | `PatientFormModal.tsx` | Reuse names + valid RUT required; optional birth date/phone/email; exact ficha after create. General notes live after creation. |
| Patient identity header and owner-linked summary cards | `PatientDetail.tsx`, `PatientOverview.tsx`, `PatientWorkspace.tsx` | Four ficha tabs; only approved evolution, pending work, notes, tooth conditions and real activity. |
| Diagnosis chart, condition list and legend | No target resource | Separate manual patient-owned condition/revision model, accessible FDI chart and text path; explicit Guardar. |
| Timeline with category chips and day-grouped cards | No target timeline | Bounded read projection over approved evolutions, note revisions and tooth-condition revisions. |
| Guided Copilot and pending work | Existing clinical Assistant and pending projection | Supported unsent starters; direct pending mode without automatic thread acquisition. |

## Component and data direction

    RequireAuth
      AppShell (current sidebar, `/` redirects to `/patients`)
        SidebarHeader brand → /patients; separate collapse toggle
        SidebarNavigation → Pacientes / Asistente / Chat
        Patients → search/filter/sort + table/cards + PatientFormModal
        PatientDetail → Resumen / Información / Clínica / Actividad
          PatientOverview → approved evolution + kind-filtered pending read
          PatientNotes → notes + revisions
          PatientDiagnosis → FDI chart + editor + condition list/legend
          PatientActivity → approved evolution/note/condition projection
          PatientWorkspace → existing selected evolution route
        ClinicalAssistant → existing picker/composer/runtime + pending route

Page → domain → pattern → primitive → token. Typed HTTP clients stay in `app/frontend/src/lib/api.ts`; SQL stays in `app/backend/db/`. The four patient sections do not create another patient route. Exact Activity destinations may use safe record UUID query keys to focus an owned note/condition; evolution keeps its existing focused route.

## Route and state contract

| Input/action | Result | Storage |
| --- | --- | --- |
| `/` | Existing auth guard and redirect to `/patients` | No new Home page. |
| Expanded or compact tooth brand | Opens `/patients` through guarded navigation | No patient mutation. |
| Compact global icon | Opens existing Pacientes/Asistente/Chat route without expanding desktop rail | Existing route state/active indicator. |
| `/patients?sort=...&evolutions=...` | Only allowed sort and evolution filter values; invalid normalizes to last_name_asc/all | Safe URL only. |
| Name, phone or RUT query | 250ms debounced, owner-scoped POST; private in-app return/restoration; reload/logout clears | Authenticated React memory and POST body only. |
| Directory Nuevo paciente | Existing modal; Save follows current duplicate/dirty-close/focus and exact ficha route | Patient API. |
| Plain patient URL | Resumen default; other local ficha tabs selectable | Local tab state; safe tab/record UUID query for Activity deep links. |
| Evolution URL | Focused approved evolution, no extra overview above it | Existing route. |
| `/assistant?view=pending` | Read-only work in narrow main pane; no auto thread acquisition | Safe URL view only. |

## Quantitative UI rules

| Rule | Acceptance | Evidence |
| --- | --- | --- |
| Sidebar | 260px expanded; 56px desktop compact rail; three existing destinations, order/icons/brand/current marker retained | DESIGN.md, SidebarHeader/Navigation/Sidebar source. |
| Brand | Both brand states lead to `/patients`; toggle remains separate; no mandatory expansion for compact route selection | User correction and DentalPin source click path. |
| Mobile navigation | Existing drawer/focus/inert behavior; no new fourth destination | AppShell/Sidebar source. |
| Directory controls | One `last_evolution_at` presence filter; three sort fields × two directions; visible count equals displayed records | Current PatientSummary. |
| Desktop directory | At >=1024 CSS px, semantic Paciente/RUT/Edad/Última evolución table with exact ficha links | Source row hierarchy + target accessibility. |
| Narrow directory | Below 1024 CSS px, full-card links with same four fields; no horizontal page scroll at 320/713px | Target shell contract. |
| Search privacy | Zero raw terms in URL, navigation state, browser storage, analytics or logs; result contains masked RUT and no phone/email | Existing POST contract + new normalized search. |
| Create | One existing modal; required first/last name and DV-valid RUT; optional birth date/phone/email | Current form plus contact migration. |
| Ficha | Four local sections; Clínica has manual Diagnóstico and approved Evoluciones; no unsupported tabs | User comments and product scope. |
| Chart | 32 permanent/20 primary FDI teeth, twelve diagnostic codes, five supported surface codes only where applicable, zero writes before explicit Guardar | DentalPin source + patient-clinical-contract.md. |
| Activity | Four filters Todos/Evoluciones/Notas/Diagnósticos; 20 persisted entries per page; no fabricated source | New bounded API projection. |
| Accessibility | 44px coarse-pointer targets, named icons, visible focus, non-color legend/text list, reduced motion | PRODUCT.md, DESIGN.md, UX principles. |

## Required fixtures for future implementation proof

- Two owners; patient with/without birth date, contact and approved evolutions; another owner's matching search data.
- Search terms: accented name, phone punctuation, valid complete RUT, partial RUT, complete invalid DV, literal LIKE wildcard, no match and stale failure.
- Directory sort/filter/back-forward and in-app return, logout/reload privacy, create valid/invalid/duplicate/dirty cancel and exact created ficha.
- Pending approval/draft/Drive failure with a newer export than an older approval; kind totals, patient isolation and direct/reloaded pending route.
- Notes create/edit revision and 409 conflict; conditions with valid permanent/primary teeth, invalid mismatch, active/resolved revision, optional surfaces and failed save draft; Activity filter/cursor/tie and exact owned links.
- Browser/ARIA views at 320, 713, 1024 CSS px and desktop, including compact rail route selection without expansion.

The two retained HTML files are implementation aids. `clinical-workspace.html` shows directory/create and compact route states; `patient-detail.html` shows ficha/notes/diagnosis/activity. Their custom HTML rows and icon glyphs illustrate layout only; production uses a semantic desktop table, existing Lucide route icons, the current mobile drawer and real typed components. The PNG previews are generated from synthetic target HTML. The prose audit is the source reference; no source-only interactive clone remains.
