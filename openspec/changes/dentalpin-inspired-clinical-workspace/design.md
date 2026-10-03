## Context

Dental AI Assistant is a Spanish, dark clinical workspace with a patient-first entry. The source audit shows useful DentalPin interaction patterns in finding patients, opening a ficha, registering tooth conditions and reading activity. The target already has a strong evolution/Assistant owner and a three-destination sidebar. The change adopts those patterns in existing route and component seams. `dentalpin-patients-e2e-2026-10-02.md` records observed behavior; `patient-clinical-contract.md` is the detailed target data/API/UI contract.

## Goals / Non-Goals

**Goals**

- Preserve the existing sidebar appearance and Pacientes/Asistente/Chat hierarchy while making the brand a `/patients` link and all three route icons directly selectable in a compact desktop rail.
- Make patient discovery predictable: name/phone/full or partial RUT search, one supported filter, deterministic sort, semantic desktop table, mobile linked cards and return continuity.
- Make the ficha a stable four-section clinical workspace with supported personal/contact data, manual general notes, editable tooth diagnosis, approved evolutions and source-backed Activity.
- Preserve exact links, owner scoping, clinical approval and explicit-save behavior.

**Non-Goals**

- A standalone Inicio dashboard or fourth sidebar item, DentalPin styling, scheduling, finance, outreach, document library, treatment planning, AI diagnosis or generic event infrastructure.

## Boundary and Ownership

### Existing navigation

`App.tsx` retains its authenticated `/` → `/patients` redirect. `SidebarHeader.tsx` converts only the existing `.sidebar-brand` container to a link targeting `/patients`, using the current `DentalToothIcon` in expanded and compact states. The separate collapse button remains. `SidebarNavigation.tsx` keeps the existing Pacientes/Asistente/Chat order, icons, selected indicator and collapsed names/tooltips. `Sidebar.tsx`/`AppShell.tsx` keep 260px expanded and 56px compact desktop widths. Where Assistant/Chat currently use `hideCollapsed` to make width zero, retain a navigable compact rail for these three global links; secondary thread/search content may remain hidden until expansion. Desktop route selection therefore does not require expanding or scrolling. The mobile drawer retains its current open/close, focus and inert behavior. Brand navigation must pass through the existing transition guard so unsent or active work is protected.

### Directory and search

`Patients.tsx` owns the toolbar and presentation. The safe URL sort parameter accepts `last_evolution_desc`, `last_evolution_asc`, `last_name_asc`, `last_name_desc`, `first_name_asc`, `first_name_desc`; invalid values normalize to `last_name_asc`. `evolutions=all|with|without` filters existing `last_evolution_at`, invalid/missing normalizes to all. Sorting is client-side on the currently returned owner-scoped list with patient ID tie-breaker and null last-evolution timestamps last in either direction. The search string stays in authenticated route memory, not URL/navigation state/storage/analytics; logout or reload clears it. In-app ficha return restores query and refetches. The POST body retains the 250ms debounce, request-race guard and distinct stale-error state.

`routes/patients.py` currently treats only complete DV-valid RUT text as a RUT. Partial numeric text falls into a name-only query. `db/patients_repo.py` must search normalized names, phone digits and RUT-body fragments under the owner predicate. Complete valid RUT takes exact precedence; a complete-looking invalid-DV string cannot obtain an exact RUT match. SQL LIKE wildcards are literal-escaped. `PatientSummary` remains masked and does not reveal matched phone/email. The exact classification, indexing and proof are in `patient-clinical-contract.md`.

At >=1024 CSS px, use a semantic table with Paciente, RUT, Edad and Última evolución columns; below that, full-card patient links show the same facts without horizontal page scroll. DentalPin's source is visually table-like but implemented as a row-link list. The target uses semantic headers for keyboard/screen-reader access while retaining the avatar/name/secondary detail, thin separators and exact row destination. No unsupported balance, visit or status column appears. Empty-directory and filtered-no-match states differ; result count is the displayed record count.

### Patient identity and creation

The existing `PatientFormModal.tsx` remains the single creation/edit form. First/last name and DV-valid RUT remain required; birth date, phone and email are optional. Add nullable phone/email columns to `patients` through Alembic and expose them in owner-scoped detail/create/update, never list/search summaries. Trim values, map blank to null, validate email/length and preserve legacy PATCH omission versus explicit null clearing. Reuse duplicate 409 recovery, dirty-close confirmation, focus return and post-success exact ficha route. General notes are separate resources after creation, not a field in this modal.

### Ficha, notes and diagnosis

`PatientDetail.tsx` remains the ficha route owner. Resumen is the default of four local tabs: Resumen, Información, Clínica and Actividad. Deep `/patients/:patientId/evolutions/:evolutionId` remains focused on that evolution. The header keeps masked identity and birth-date-derived age if present, existing primary Nueva evolución and secondary contextual Assistant; phone/email links appear only when data exists. No artificial active-status dot is introduced.

`PatientOverview.tsx` prioritizes approval, then recoverable draft, while failed Drive export has a separate synchronization line and exact owning link. The existing pending-work endpoint gains optional exact kind filtering and bounded limit; filter applies before total/cursor. No Home-only aggregate is needed. A failed kind says unavailable/retry, not zero. Assistant's direct `/assistant?view=pending` mode skips automatic thread acquisition, keeps its URL on reload and shows work in the main pane at narrow widths. Starter actions prefill without sending or changing the active patient silently.

Información groups current personal identity, basic contact and separate general notes. `patient_notes` and append-only revisions support explicit create/edit Save, cancel/dirty guard and 409 optimistic conflict. Clínica has Diagnóstico (manual FDI chart, condition selector, surface controls where applicable, text list and legend) and Evoluciones (approved read-only list). Tooth/condition selection creates a draft only; explicit Guardar writes the condition and its revision transactionally. Edit/resolve preserve prior state in history. The chart and text list must be equivalent for keyboard users, with no color-only status. No diagnosis is inferred from evolution text or model output.

Actividad is a bounded read projection over approved evolution creation, general-note revisions and tooth-condition revisions. It offers Todos/Evoluciones/Notas/Diagnósticos, deterministic newest-first cursor, day groups, type icon/text, actor when known and exact context links. It excludes absent DentalPin event sources. `patient-clinical-contract.md` fixes table fields, API routes, FDI lists, twelve diagnostic codes, 404/409/422 behavior, pagination and URL-safe deep links.

## Decisions

1. Keep Pacientes as the root destination. The user prefers the existing navigation. A separate Inicio page would add a fourth global destination and duplicate patient entry.
2. Preserve visual language. `DESIGN.md` and `globals.css` own the 260px dark sidebar and semantic tokens. DentalPin contributes interaction sequence and information hierarchy, not its light palette or unsupported modules.
3. Use patient-owned manual resources for notes and chart conditions. Approved evolutions keep their separate human-approval boundary; manual Save is explicit and recorded in revision history.
4. Project Activity from persisted sources, without a mirrored event table or fabricated categories. Note/condition revisions themselves supply a durable timeline.
5. Keep search text private in POST body and authenticated memory. Safe sort/filter state may live in the URL; no raw name/phone/RUT term enters browser history.

## Module, Interface, Seam, Adapter

- Module: existing authenticated patient route assembly and new patient-domain resources.
- Interface: patient create/detail/update contact extension, existing POST search extension, note and condition CRUD/revision reads, activity page read, optional pending-work kind/limit read.
- Seam: route selection and typed owner-scoped API responses.
- Adapter: `lib/api.ts` for ordinary fetch; SQL in `db/`; FastAPI Pydantic routes; React components under `components/patients/`.

## Blast Radius

### Touched runtime areas

- SidebarHeader/Sidebar/AppShell compact behavior, Patients, PatientFormModal, PatientDetail/PatientOverview and Assistant pending/starter affordances.
- Patient/search route/repository, new notes/conditions/activity domain and migration, typed client.

### Untouched runtime areas

- Auth mechanism, model grounding/tools, SSE, rate limit, voice transcription, evolution approval/save, Drive export, Chat and RAG behavior.

## Verification Strategy

- Fail-first sidebar/router proof: `/` reaches patients; expanded/compact brand reaches `/patients`; 56px rail selects each existing route without expanding; active indication, accessible name, tooltip, transition guard and mobile drawer behavior persist.
- Fail-first directory/search proof: name/accent/phone/full and partial RUT, invalid DV, wildcard escaping, owner isolation, body-only privacy, sort/filter/back-forward, result count, table/mobile cards, empty/error/stale states and create form behavior.
- Fail-first notes/condition/activity proof: owner 404, validation 422, optimistic 409, transactional revisions, draft-only selection, explicit Save, cancel/retry, keyboard text path, activity filters/count/cursor/deep links and no fabricated events.
- Ficha/Assistant proof: exact latest-evolution/pending destinations, clinical priority and separate Drive status; direct/reloaded pending route acquires zero threads until explicit consultation; existing approval remains necessary for evolutions.
- During implementation, run focused tests, browser checks at 320/713/1024px and desktop, then repository validation. The current OpenSpec edit does not change runtime.

## Slice dependencies

Directory/contact and sidebar work can proceed independently. Ficha sections consume contact and pending-kind reads. Notes/condition persistence precedes their UI; Activity consumes revisions and approved evolutions. Integrated browser proof composes all slices.
