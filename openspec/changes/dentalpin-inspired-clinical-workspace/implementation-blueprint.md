# Implementation blueprint and measurable UI contract

The normative scenarios are in `specs/clinical-workspace-discovery/spec.md`. `patient-clinical-contract.md` fixes schema/identity/search/draft rules; `patient-api-contract.md` fixes DTOs/routes/cursors/errors/retry. `wireframes/diagnosis.html` is the current diagnostic reference; clinical-workspace.html and patient-detail.html retain directory/other-ficha references with synthetic data. Production uses existing components/tokens, not wireframe CSS.

## Source-to-target map

| DentalPin pattern | Current owner | Target boundary |
| --- | --- | --- |
| Light 240px navigation, source brand routes `/`, collapsed module icons | Dark 260px/56px `SidebarHeader.tsx`, `SidebarNavigation.tsx`, `Sidebar.tsx`; brand currently a `div` | Retain current three links/colors/mark; brand routes `/patients`; compact desktop rail permits direct Pacientes/Asistente/Chat selection. |
| Search/filter/sort and row-wide ficha links | `Patients.tsx`, `POST /api/patients/search` | Body-only name/phone/RUT search; supported evolution filter and three sort fields; semantic desktop table and linked mobile cards. |
| Centered create modal, required/optional fields | `PatientFormModal.tsx` | Reuse names + valid RUT required; optional birth date/phone/email; exact ficha after create. General notes live after creation. |
| Patient identity header and owner-linked summary cards | `PatientDetail.tsx`, `PatientOverview.tsx`, `PatientWorkspace.tsx` | Four ficha tabs; only approved evolution, pending work, notes, tooth conditions and real activity. |
| Diagnosis chart, condition list and legend | No target resource | Separate manual patient-owned condition/revision model, accessible FDI chart and text path; explicit Guardar. |
| Anatomical chart-first workspace and contextual rail | Existing ficha with optional contextual Assistant | Anatomical lateral/occlusal tooth families, illustrated tools, linked grouped conditions and an available-width draft inspector. General notes stay in Información. See clinical-visual-review-2026-10-02.md. |
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
| Desktop directory | At >=1024 CSS px, semantic Paciente/Edad/Última evolución table with exact ficha links | Source row hierarchy + target accessibility. |
| Narrow directory | Below 1024 CSS px, full-card links with same four fields; no horizontal page scroll at 320/713px | Target shell contract. |
| Search privacy | Zero raw terms in URL, navigation state, browser storage, analytics or logs; result contains masked RUT and no phone/email | Existing POST contract + new normalized search. |
| Create | One existing modal; required first/last name and DV-valid RUT; optional birth date/phone/email | Current form plus contact migration. |
| Ficha | Four local sections; Clínica has manual Diagnóstico and approved Evoluciones; no unsupported tabs | User comments and product scope. |
| Chart | 32 permanent/20 primary FDI teeth, twelve diagnostic codes, five supported surface codes only where applicable, zero writes before explicit Guardar | DentalPin source + patient-clinical-contract.md. |
| Diagnostic geometry | Chart first; distinct tooth families, upper/lower and midline; max900px drawing; available width >=960px uses280–320px inspector/gap16–24px, otherwise stack; mobile overview + enlarged tooth editor and44px selector | Current diagnosis.html and chart-first requirement. |
| Diagnostic interaction | Symbols/text agree across tools/chart/list; hover/focus highlights without changing draft; ordinary pointer access without colliding fixed controls | clinical-visual-review-2026-10-02.md, including observed source mobile collision. |
| Activity | Four filters Todos/Evoluciones/Notas/Diagnósticos; 20 persisted entries per page; no fabricated source | New bounded API projection. |
| Accessibility | 44px coarse-pointer targets, named icons, visible focus, non-color legend/text list, reduced motion | PRODUCT.md, DESIGN.md, UX principles. |

## Patient composition contract, audit 2026-10-03

This section supplies the missing directory/header/form detail. See audit-2026-10-03/report.md for descriptive evidence. Numbers below are target decisions, not claimed DentalPin measurements. Use existing semantic tokens and Inter; dimensions are CSS px and must be read after transitions finish. Fixed dimensions allow ±2px rounding; content may grow vertically. No new global top banner is added to AppShell. The synthetic-reference banner is documentation chrome only.

| ID | Component | Implementation acceptance |
| --- | --- | --- |
| UI-01 | Incumbent sidebar | Preserve existing 260/56 widths, palette, gradient tooth mark, typography, 3 links, active indicator and account footer. Brand becomes an accessible guarded link to /patients. Expanded header retains its present48px geometry. Compact brand gets its own44px row above the separate collapse button; do not squeeze both into56px width or hide the brand. Compact selection/tooltip works by hover and focus without expansion. Mobile uses current drawer. |
| UI-02 | Directory header | One h1 Pacientes with existing text-2xl/semibold scale, one short description and Nuevo paciente at upper right. At insufficient width, wrap the action below. Header/toolbar gap24, toolbar/results gap16, main gutters follow existing p6/md:p8. Remove duplicate PACIENTES heading; table caption may be screen-reader-only. |
| UI-03 | Toolbar | Name/phone/RUT search first at left; desktop width320–480, flex shrink allowed, narrow width100%. Search icon16–18 at leading edge, labelled clear action when nonempty. Group supported Evoluciones filter, sort field and direction; labels remain visible. Controls min44 effective hit area, gap8–12. Count announces true displayed count; empty status reservation must not create a permanent blank band. Filter/sort state stays visible on narrow layouts. |
| UI-04 | Directory rows | Semantic table at>=1024, columns Paciente/Edad/Última evolución plus decorative terminal ChevronRight16–18. Avatar32–36, identity gap12, cell padding12–16; target row minimum64px, grows for long name/metadata. One real owned ficha link per row; stretch its hit area without nested interactive elements, focus outlines entire row. Paciente text14–16/600; secondary12–14/muted. RUT is absent from visible table rows and compact cards, while private search and the compatible masked summary DTO remain. Compact full-card link below1024 retains same displayed fields; no required truncation of the name and no contact/balance/status inventions. |
| UI-05 | Ficha header | Back link with ArrowLeft and Pacientes; avatar44 with initials derived from names, not status. h1 uses existing text-3xl scale and wraps full name; age or Sin fecha de nacimiento and optional birth date below. Add Phone/Mail icons only when their values exist, and IdCard for masked RUT; icon18–20, effective target44 and gap8. Hover/focus reveals labelled value; click/tap toggles the same disclosure, Escape/outside dismissal and focus return are supported. No automatic copy, call, email or raw RUT reveal. Editar paciente (Pencil), primary Nueva evolución (Plus), Asistente (Stethoscope). Gap8–12 between actions,16 between identity and actions,24 before sections. Wrap/stack by available content width including Assistant, not viewport alone. No fictitious green status dot or allergy badge. Contact remains editable/copyable in Información; no communication-provider integration. |
| UI-06 | Sections and panels | Resumen/LayoutDashboard, Información/UserRound, Clínica/Stethoscope, Actividad/History, icons18–20 and text labels. Four accessible tabs with aria-selected, tabpanel relationship, roving focus and arrow/Home/End keyboard behavior. Min44 effective area; narrow layouts wrap without truncating labels. Clínica subselects only Diagnóstico/Evoluciones. Panel header icon/text/action,16–20 padding and16–24 section gaps; use existing border/radius tokens, one panel boundary without nested decorative cards. |
| UI-07 | Alta/edición | Reuse PatientFormModal. Nombres/Apellidos first pair, RUT/Fecha de nacimiento second, optional Teléfono/Correo third at usable width; below560 available width stack. Keep existing date picker, masked edit RUT/reveal action, DV validation and duplicate recovery. Label required fields and Opcional explicitly; initial focus Nombres. Footer Cancelar then Crear paciente/Guardar cambios. Close named button44 effective area; dirty Escape/backdrop/cancel guards and restore focus retained. General notes are created in Información after patient creation. |
| UI-08 | Summary, information, activity | Resumen uses source-backed latest evolution and clinical pending links, with Drive recovery separately labelled. Do not mount the full empty evolution-detail pane on default Resumen; preserve it on exact evolution routes. Información groups identity/contact and general notes. Phone/email use labelled Copy controls (Copy16), absent fields No registrado; failures preserve value and show retry. Activity uses four existing contract filters, day headings, one continuous1px guide, icon by kind and cards with title/date/available author/context link. Never show fabricated authors, communications or finances. |
| UI-09 | State/accessibility evidence | Capture ready, loading, empty-directory, no-match, filter-empty, stale-error, modal-invalid/duplicate/dirty-close, unknown-age/contact and long-name states. Keep inputs/drafts on error and links usable in stale results. Verify computed layout at320,713,1024,1440 CSS widths, compact rail and Assistant open. Record actual innerWidth/innerHeight, not requested viewport. At coarse pointer every action has44px area; contrast/focus/keyboard require production proof. |

Icon owner is existing lucide-react and DentalToothIcon. New patient-domain controls use Search, X, ChevronRight, ArrowLeft, Plus, Pencil, ArrowUp/ArrowDown, Copy, Phone, Mail, IdCard, LayoutDashboard, UserRound, Stethoscope, History and FileText as applicable. Retain existing sidebar UsersRound/Stethoscope/MessageCircle and PanelLeftOpen/Close at16px/stroke1.7. Other UI icons use16–20px/stroke1.7–1.8, aria-hidden when beside text. Icon-only controls require a name and hover/focus tooltip; chart illustrations remain independent authored SVG. Do not use glyph characters as icons.

## Required fixtures for future implementation proof

- Two owners; patient with/without birth date, contact and approved evolutions; another owner's matching search data.
- Search terms: accented name, phone punctuation, valid complete RUT, partial RUT, complete invalid DV, literal LIKE wildcard, no match and stale failure.
- Directory sort/filter/back-forward and in-app return, logout/reload privacy, create valid/invalid/duplicate/dirty cancel and exact created ficha.
- Pending approval/draft/Drive failure with a newer export than an older approval; kind totals, patient isolation and direct/reloaded pending route.
- Notes create/edit revision and 409 conflict; conditions with valid permanent/primary teeth, invalid mismatch, active/resolved revision, optional surfaces and failed save draft; Activity filter/cursor/tie and exact owned links.
- Browser/ARIA views at 320, 713, 1024 CSS px and desktop, including compact rail route selection without expansion.

The three HTML files are implementation aids. clinical-workspace.html covers directory/create; patient-detail.html covers other ficha sections and routes its Clínica tab to diagnosis.html. diagnosis.html demonstrates permanent/primary anatomical families, illustrated tools, active/resolved records, surface selection, explicit save/cancel/resolve, context-panel reflow and synthetic state controls. Old patient-detail diagnostic PNG/glyphs are historical and not acceptance baselines. Diagram geometry is independently authored. Production preserves target logo/global icons and mobile drawer rather than copying prototype navigation links. Wireframe save is local simulation, not API proof. readiness-review.md records browser assertions and remaining implementation gates.
