# Patient clinical slice: implementation contract

This document fixes the expanded 2026-10-02 scope. It supplements the scenarios in `specs/clinical-workspace-discovery/spec.md`; runtime code is not changed by this proposal. DentalPin is a behavioral and structural reference. All target copy is Spanish, and the production palette, 260px shell, tokens and approved-evolution boundary remain Dental AI Assistant's.

## Verified seams and root cause

| Concern | DentalPin source/observed UI | Current target | Planned seam |
| --- | --- | --- | --- |
| Sidebar | Collapsed 64px icon rail; expanded 240px light rail with logo/wordmark and route groups; logo navigates `/`. | `sidebar/SidebarHeader.tsx` currently renders a noninteractive brand `div`; `SidebarNavigation.tsx` already owns Pacientes/Asistente/Chat links with collapsed labels/tooltips; `Sidebar.tsx` uses 260px expanded and 56px compact width, but Assistant/Chat can hide the compact rail entirely. | Preserve target appearance and three-route hierarchy. Link the existing `DentalToothIcon` brand container to `/patients` in both states; keep route icons selectable at 56px on desktop, including Assistant/Chat, with no mandatory expand/scroll. Preserve separate collapse toggle and transition guard. |
| Directory | Rounded list panel, row-wide links; avatar/name/phone left, finance/status/chevron right; search, staged filters, sort field/direction. | `Patients.tsx`, owner-scoped `POST /api/patients/search`; no sort/filter or phone. | Semantic table at >=1024px and linked cards below; only existing evolution filter. Search name/phone/RUT. |
| Partial RUT | DentalPin searches name/phone, no Chilean RUT. | `routes/patients.py:search_patients` calls `normalize_rut(term)`; failure sends query to name-only `db/patients_repo.py:search_patients`. | Split identifier classification from create-time DV validation. Search normalized RUT numeric fragment and phone digits; valid complete RUT exact. |
| Patient creation | Centered dialog ~514px in observed 782px viewport; paired name fields, optional phone/email/ID/DOB and Notes, required-name Save state. | `PatientFormModal.tsx` already requires first/last name and valid RUT, handles duplicate and dirty close. | Retain target RUT requirement; add optional phone/email and grouped layout; notes are separate saved resources after creation. |
| Ficha | Header with back, initials, name, age, status dot, contact shortcuts, Edit/Actions; tabs Summary/Info/Clinical/Administration/Gallery/Activity. | `PatientDetail.tsx`, `PatientIdentity.tsx`, `PatientOverview.tsx`, evolution route. | Four tabs Resumen/Información/Clínica/Actividad. Age only from birth date; contact link only when present. No status dot unless a real status field exists. |
| Diagnosis | `DiagnosisMode.vue` composes chart, tool bar, condition list and legend; 32 permanent or 20 primary FDI teeth. | No chart, condition DB or route. Existing evolution draft assessment is free text and approval-gated. | Separate manual tooth-condition resource with revision history. Existing approved evolutions remain separate read-only subtab. |
| Activity | `patient_timeline/frontend/components/patient/PatientTimeline.vue` renders category chips, grouped vertical rule, icons and metadata cards; source Python persists module events. | No patient timeline source. | Bounded server read projection over approved evolutions, note revisions and condition revisions. No invented source categories. |

## Source visual measurements and target interpretation

Measured in logged-in Codex native browser at approximately 796×792 CSS px with DentalPin sidebar expanded: rail 240px (`rgb(244,242,239)`), top bar 56px white, main padding 24px. Directory heading uses Inter Variable 28px/700; search input was 320×32px with 6px radius, list panel 12px radius/about 20px inset, row links about 52px tall with 28px avatar, 14px medium name, 12px secondary phone and thin dividers. Patient detail heading measured 22px/700; the six-tab strip occupied 494×36px with 8px outer radius and 2px inset; each tab used 14px/500, 6px vertical and 12px horizontal padding and 6px radius. At this width Summary cards formed two columns; the first measured 241×132px with 12px radius. The attached six browser comments show full-width reference screens and annotated target zones. These values describe the source only. Target geometry is fixed by `DESIGN.md`/tokens: 260px dark sidebar, existing max-width, 44px coarse-pointer targets, semantic borders and surface colors. Preserve rhythm and alignment, not the light palette or undersized 32px search control.

Source icon semantics to adapt inside patient surfaces: people=Pacientes; stethoscope=Clínica; person=Información; clock/activity=timeline; tooth=diagnostic chart; pencil=edit; magnifier=search; sliders=filter; arrows=sort; chevron=row opens detail. Preserve the existing global Pacientes/Asistente/Chat icon system and tooth logo; use named buttons and text for non-obvious status.

## Directory search contract

`POST /api/patients/search` remains body-only and owner-scoped, max 200 input characters and existing 250ms UI debounce. Return the existing unpaginated `PatientSummary[]`, never phone/email. Sort/filter the complete returned set client-side; do not silently cap results or add pagination in this slice. Preserve request-race protection and stale-result recovery. Normalize whitespace, case and accents for names; match the normalized full query against concatenated first/last name. Literal `%`, `_` and backslash are escaped for LIKE. No search text enters logs. Use the following ordered classification, independent of create-time RUT validation:

| Priority | Input after trimming/collapsing whitespace | Classification and result |
| --- | --- | --- |
| 1 | Empty | Existing full owner-scoped list |
| 2 | Leading `+`, or parentheses around phone digits; remaining characters only digits, spaces, parentheses and hyphens | Phone only; normalize digits and match stored phone fragment |
| 3 | RUT with exactly one hyphen immediately before one numeric/K DV; body contains 1–8 digits with optional dots; or digits ending in K/k, with optional body dots | Explicit RUT; valid → exact RUT only; invalid → empty, no numeric fallback |
| 4 | Exactly nine ASCII digits | Compact full RUT candidate; valid → exact RUT only; invalid → phone fragment only |
| 5 | 1–8 ASCII digits | Numeric fragment; union owned RUT-body and phone matches, deduplicated by patient ID; never interpret final digit as DV |
| 6 | Other digit-only telephone formatting using spaces or hyphens, or >=10 ASCII digits | Phone only; normalize digits |
| 7 | Anything else | Normalized name query; numeric text is not silently extracted from a mixed name |

All phone classifications require at least one digit; punctuation-only input does not generate an empty LIKE fragment and falls through to literal name search. An explicit valid RUT with no owned match returns empty, without broadening to phone. Malformed would-be identifiers fall through to name search unless they matched explicit-RUT grammar. Short complete RUTs must include the hyphen; this search policy does not alter create-time valid-RUT support. Helper text: `Nombre, teléfono o RUT. Para un RUT completo, incluye guion y DV.`

Synthetic classification fixtures: `123` → fragment; `12345678` → fragment; `12.345.678-5` and `123456785` → exact valid RUT; `12.345.678-0` → invalid explicit/empty; `123456780` → invalid compact/phone only; `+56 9 1234 5678` and `(09) 1234-5678` → phone; `1234567890` → phone; `Ana María` → name; `Ana 123` → name. Fixture data must include a RUT-body/phone collision and an exact valid RUT colliding with another patient's phone. Query-plan proof uses owner-first indexes and normalized phone/RUT expressions with a documented representative dataset; choose index implementation after inspecting Postgres query plans, not by guessing an arbitrary latency threshold.

## New persistence and API

One or more new Alembic revisions may add nullable `patients.phone VARCHAR(40)` and `patients.email VARCHAR(254)` and these separate resources. `patients` itself is not a free-text notes store.

### Notes

`patient_notes`: UUID PK supplied by client, `owner_user_id`, `patient_id`, `body` (1–4000 trimmed characters), `created_by_user_id`, `created_at`, `updated_at`, `revision` (positive integer). FK and index `(owner_user_id, patient_id, updated_at DESC, id DESC)`. `patient_note_revisions`: UUID PK, note FK, patient/owner FK context, revision number, previous_body (nullable for creation), new_body, actor ID, changed_at, action (`created`/`edited`); unique `(note_id, revision)`. No hard delete in this slice. All timestamps are TIMESTAMPTZ. Timeline titles/metadata exclude body text. Endpoints, DTOs and retry rules are fixed in `patient-api-contract.md`. Explicit Save with unsaved-close guard; no automatic model context or Drive export.

### Tooth conditions

`patient_tooth_conditions`: client-supplied UUID PK, owner/patient/creator IDs, `dentition` (`permanent`/`primary`), `tooth_fdi` smallint, `condition_code`, `surfaces TEXT[] NOT NULL DEFAULT '{}'` in canonical `M,D,O,V,L` order without duplicates, nullable `note` (max 1000 trimmed characters), `status` (`active`/`resolved`), `revision`, TIMESTAMPTZ timestamps. `patient_tooth_condition_revisions`: UUID PK, condition/owner/patient references, revision, before/after JSONB snapshots, actor ID, changed_at, action (`created`/`edited`/`resolved`). Never overwrite history. Index `(owner_user_id, patient_id, tooth_fdi, status, created_at DESC, id DESC)`, history unique `(condition_id, revision)`.

Active identity is `(owner_user_id, patient_id, dentition, tooth_fdi, condition_code, surfaces)`. Enforce a partial UNIQUE index for `status='active'`, with canonical surfaces validated by domain and database constraints. Same active identity with a new UUID returns 409 `active_condition_exists` and the owned existing record. Different surface sets may coexist, including overlapping sets; no automatic clinical merge. A new recurrence after resolution uses a new UUID and record. Revision is history, never duplicate identity. Tooth, dentition and code are immutable after creation. Correcting those fields requires resolving the incorrect record and explicitly creating the corrected one. PATCH may edit surfaces/note on active records or resolve an active record; resolved records are read-only and cannot be reopened in this slice.

Permanent FDI: upper `18..11`, `21..28`; lower `48..41`, `31..38` (32 total). Primary FDI: upper `55..51`, `61..65`; lower `85..81`, `71..75` (20 total). Reject all other tooth numbers and a dentition/tooth mismatch with 422. Supported diagnostic code catalog at first release, mapped to Spanish labels: `pulpitis`/Pulpitis, `caries`/Caries, `incipient_caries`/Caries incipiente, `pigmentation`/Pigmentación, `fracture`/Fractura, `missing`/Ausente, `periapical_lt_2mm`/Lesión periapical <2 mm, `periapical_2_4mm`/Lesión periapical 2–4 mm, `periapical_gt_4mm`/Lesión periapical >4 mm, `rotated`/Rotado, `displaced`/Desplazado, `unerupted`/No erupcionado. Optional surfaces use only `M,D,O,V,L` (mesial, distal, oclusal, vestibular, lingual). They are enabled only for `caries`, `incipient_caries`, `pigmentation` and `fracture`; for all other codes surfaces must be empty and the UI disables that selector. A code/label is an observation entered by a clinician, not an automated diagnostic claim. Version the fixed catalog in backend domain constants and share its typed response with frontend; no editable taxonomy or treatment/plan engine.

API: `GET /api/patients/{patient_id}/conditions?dentition=...`, explicit single-record GET, POST, PATCH and revisions as fixed in `patient-api-contract.md`. PATCH uses `note`, never `description`, and `expected_revision`. Create/edit+history commit in one transaction with ownership checked in SQL; inaccessible parent/record returns 404. Use `routes/patient_conditions.py`, `db/patient_conditions_repo.py`, patient-domain validation helper and `lib/api.ts`; mount `/condition-catalog` before `/{patient_id}`. No SQL in routes/components. No record is created by merely clicking a tooth or by AI approval.

### Activity read projection

`GET /api/patients/{patient_id}/activity?kind=all|evolutions|notes|diagnoses&limit=20&cursor=...` returns `{items,next_cursor,total}`. `event_id` is the revision UUID for notes/conditions and evolution UUID for evolutions; `resource_id` is the owning note/condition/evolution UUID. Event identity is `(kind,event_id)`, not resource ID. Union approved evolution persistence (`created_at`, not the clinician-editable evolution date), note revisions and condition revisions in `db/patient_activity_repo.py`, owner predicate on every branch. Sort `occurred_at DESC, kind ASC, event_id DESC`; cursor carries all three keys. Count matching records before cursor. Filters apply before count/page. See exact DTO/cursor examples in `patient-api-contract.md`. No note body, raw RUT, contact or evolution text in activity. Deep links use existing evolution route or safe tab/resource UUID query. Explicit single-record reads let Activity focus notes outside the first list page. No generic event bus or mirrored timeline table.

## Interaction/state matrix

| Surface | Ready action | Pending/empty | Error/conflict | Save effect |
| --- | --- | --- | --- | --- |
| Header | Back, Edit, Nueva evolución, conditional contact links | No DOB → age not shown; no contact → shortcuts hidden | Patient fetch retry | Existing form only |
| Información notes | Nueva nota, Editar, revision history | `Sin notas` + CTA; unsaved draft guarded | Retry/409 reload-or-keep-draft | Note + revision transaction; activity entry |
| Clínica > Diagnóstico | Permanent/Temporal, type selector, chart/list tooth selector, optional surfaces, Guardar | Tool/tooth/surface draft visible; no conditions → text empty state | 422 field errors, 409 refresh choice, retry without losing draft | Condition + revision transaction; chart/list/activity refresh |
| Clínica > Evoluciones | Exact approved evolution link | `Sin evoluciones aprobadas` | Retry | None; original approval flow unchanged |
| Actividad | All/Evoluciones/Notas/Diagnósticos filters, exact entry link, next page | `Sin eventos en esta categoría` + Mostrar todo | Retry, no false empty | None |

Keyboard sequence for chart: choose condition → choose Permanent/Temporal → choose named FDI tooth button or equivalent text-list row → choose optional named surfaces → review → Guardar. Escape/cancel removes only draft selection. Focus returns to source control after close; success announcement includes tooth and condition. Color has no exclusive meaning; legend and list spell out type/status. The chart uses scalable anatomical tooth families, lateral outlines and readable occlusal/surface geometry as specified in `clinical-visual-review-2026-10-02.md`; a repeated generic tooth icon is insufficient. Exact DentalPin SVG paths are not required. Condition symbol/pattern and text must agree across palette, chart and list. Hover/focus highlight is separate from draft selection and never changes a draft tooth implicitly.

## Acceptance and boundaries

### Draft state and transitions

`idle → drafting → saving → saved`; failure returns to editable `drafting` with an error; revision conflict retains local draft alongside current server metadata. Draft includes client resource UUID, condition/tooth/surfaces/note or edited record+expected revision. Hover/focus highlight is independent. A draft is dirty once a tool/tooth selection or editable value changes from its initial state. No localStorage/sessionStorage persistence. In-app close/tab/patient/navigation guards preserve in-memory draft unless explicitly discarded; browser refresh/close uses beforeunload when dirty, without promising recovery after a confirmed reload.

| Action | Fixed behavior |
| --- | --- |
| Change tool during new condition | Keep tooth and note; preserve compatible surfaces, otherwise clear surfaces and announce; tool change disabled while editing immutable code |
| Change tooth during new condition | Keep tool/note and surfaces; review summary updates; tooth/dentition changes disabled while editing |
| Change dentition while dirty | Confirm discard or remain; discard clears entire draft and highlights; no cross-dentition carry |
| Tab/patient/record change while dirty | Offer Guardar / Descartar / Seguir editando; Guardar proceeds with navigation only after success |
| Contextual Assistant open/close or resize | Preserve draft, focus state and runtime; opening Assistant never submits a condition |
| Save failed / response timeout | Preserve UUID and payload for identical retry; disable content changes until explicit retry or abandon uncertain attempt |
| Revision conflict | Keep local draft; show latest server revision; user may reload/discard or explicitly rebase retained changes onto latest revision and Guardar; no force overwrite |
| Resolver | Load persisted active record as resolve draft; show consequence; only Guardar commits; resolved records read-only |
| Cancel | Explicitly discard draft, never saved records; restore initiating control |

An uncertain create abandoned to start different content gets a new UUID. Refresh owning list first to expose a possibly committed original; duplicate constraint still prevents identical active conditions. Mutation retry behavior, including response-lost PATCH, is in `patient-api-contract.md`.

Fail-first API/repository/component tests cover owner isolation, valid/invalid FDI, primary/permanent mismatch, condition catalog and surfaces, create/edit/resolve revisions, optimistic 409, note create/edit history, cancel/no write, activity count/filter/cursor/tie ordering, partial-RUT/phone/name search, privacy and tab deep links. Browser proof uses synthetic data and 320/713/1024px plus desktop widths, keyboard and pointer. No tests are run while writing this proposal. This slice does not add scheduling, financial data, messaging, chart-driven treatment plans, general document uploads or AI diagnosis.
