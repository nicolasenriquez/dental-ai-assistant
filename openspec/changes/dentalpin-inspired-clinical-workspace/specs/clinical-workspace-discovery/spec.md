## ADDED Requirements

### Requirement: Patient directory remains the authenticated entry
The system SHALL retain `/` redirecting to `/patients` and the existing Pacientes, Asistente, Chat global navigation. The patient directory SHALL be the first authenticated surface, with its own Nuevo paciente action. The sidebar logo in either desktop state SHALL open `/patients`. No standalone Inicio route, fourth navigation item or new dashboard data source is introduced.

#### Scenario: Root and brand navigation
- **WHEN** an authenticated user opens `/` or activates the expanded/compact brand
- **THEN** `/patients` opens and Pacientes is the active destination

#### Scenario: Existing route order
- **WHEN** the clinician moves among Pacientes, Asistente and Chat
- **THEN** the three destinations retain their current order, icons and visual treatment, and a ficha or evolution route keeps Pacientes active

#### Scenario: Unauthenticated root
- **WHEN** an unauthenticated user opens `/`
- **THEN** the existing auth guard takes them to login without exposing patient data

### Requirement: Kind-filtered clinical pending read
The existing GET /api/clinical-pending-work SHALL accept optional kind and limit query parameters without changing the unfiltered response contract. kind SHALL accept exactly approval_required, recoverable_draft or drive_export_failed. The owner/patient/kind filter SHALL apply before pagination and total calculation.

#### Scenario: Exact kind and total
- **WHEN** the authenticated owner requests kind=recoverable_draft with limit=1
- **THEN** the response contains at most one matching item, retains a cursor if more matching items exist, and total equals all matching owned drafts rather than the page length

#### Scenario: Existing caller compatibility
- **WHEN** kind is omitted
- **THEN** the current mixed updated_at-descending list, default limit, typed actions, cursor and owner scope remain available

#### Scenario: Guarded filter
- **WHEN** kind is unknown or limit falls outside the existing 1–50 bounds
- **THEN** the endpoint returns 422 without broadening the query
- **WHEN** patient_id belongs to another owner
- **THEN** the endpoint preserves the existing 404 behavior


### Requirement: Context-preserving patient directory
The system SHALL preserve patient search in authenticated in-memory state during in-app navigation and keep only non-sensitive sort and evolution-presence filter in /patients URL state. Search text SHALL continue through the existing owner-scoped POST body and SHALL NOT be written to URL, navigation state, browser storage, or analytics. The directory SHALL retain creation, loading, stale-result and error recovery behavior, a semantic desktop table, compact mobile cards and a distinct no-match state.

#### Scenario: Query and return
- **WHEN** the clinician enters a name or RUT query
- **THEN** the directory debounces its existing body-only search and restores the same query with fresh results on in-app return from a ficha, without placing the query in the URL

#### Scenario: Sort choices
- **WHEN** the clinician selects last evolution, last name, or first name and toggles direction
- **THEN** the visible results sort deterministically by the selected existing field and direction with patient ID ascending as a tie-breaker; null last_evolution_at sorts last in either direction

#### Scenario: Supported filter and result count
- **WHEN** the clinician selects Todas, Con evoluciones, or Sin evoluciones
- **THEN** the visible owner-scoped results are filtered by the existing `last_evolution_at` presence, the displayed count equals the visible result length, and no appointment, debt, contact, or visit data is inferred
- **WHEN** the filter and query have no matching records
- **THEN** the directory shows a no-match state with clear/reset action rather than the new-account empty state

#### Scenario: Initial and invalid URL state
- **WHEN** /patients has no sort/filter or an unknown sort/filter value
- **THEN** the directory uses last_name_asc and evolutions=all, preserves any current in-memory search query, and remains operable

#### Scenario: Browser history and clear
- **WHEN** the clinician changes sort/filter or uses browser back/forward
- **THEN** the controls and visible result set reflect safe URL parameters while search text stays in authenticated memory
- **WHEN** the clinician clears search
- **THEN** the in-memory query is cleared without resetting the chosen sort/filter

#### Scenario: Patient row and return
- **WHEN** the clinician opens a patient from a directory row and returns to the directory
- **THEN** the exact ficha link is keyboard accessible, and the safe sort/filter plus private query are restored with fresh owner-scoped results

#### Scenario: Responsive patient results
- **WHEN** the viewport is at least 1024 CSS px wide
- **THEN** results form a semantic table with Paciente, RUT, Edad and Última evolución headers and exact ficha links
- **WHEN** the viewport is narrower than 1024 CSS px
- **THEN** the same values appear as compact full-card links without horizontal overflow; missing birth date or approved evolution has explicit text

#### Scenario: Session boundary
- **WHEN** the authenticated route tree unmounts or the page reloads
- **THEN** the search query is cleared; the URL still contains only the non-sensitive sort and evolution-presence filter

#### Scenario: Search failure
- **WHEN** search fails after earlier results were shown
- **THEN** those results remain visibly marked as stale with retry, never as a successful fresh match

### Requirement: Existing patient creation remains the single entry
The system SHALL route directory creation through the existing PatientFormModal and patient API. The form SHALL show first/last name and valid RUT as required, and birth date, phone and email as optional. The same owner-scoped patient record SHALL persist optional phone/email and expose them in detail/edit. It SHALL retain duplicate-patient recovery, unsaved-change confirmation, focus management, and navigation to the created ficha. Contact storage SHALL NOT imply messaging, outreach or billing workflows.

#### Scenario: Required fields and cancel
- **WHEN** the create dialog opens
- **THEN** required fields are visibly marked, invalid or incomplete RUT is explained, and closing a dirty dialog uses the existing confirmation before discarding values

#### Scenario: Duplicate and success
- **WHEN** the server reports an owned duplicate RUT
- **THEN** the existing duplicate patient is identified with masked RUT and can be opened without creating a second record
- **WHEN** valid creation succeeds
- **THEN** the user lands on the exact new patient ficha through the existing create API

#### Scenario: Basic contact round trip
- **WHEN** an owner creates or edits a patient with optional phone and email
- **THEN** trimmed contact values are saved and shown in Información and the edit form; omitted values on create and explicitly cleared values on edit are null and shown as "No registrado"
- **WHEN** a legacy PATCH omits either contact field
- **THEN** that field retains its previous value
- **WHEN** an invalid email or overlong contact value is submitted
- **THEN** the form shows a field-level error and no partial contact change is saved

#### Scenario: Contact privacy
- **WHEN** the directory, recent activity, another owner's detail request, URL or clinical model prompt is inspected
- **THEN** the new contact values are absent from recent activity, raw URLs, analytics and model prompts; a directory search by phone may match the patient without displaying the phone value, and another owner's patient remains inaccessible under the existing owner guard

### Requirement: Patient summary links to owned work
The patient ficha SHALL use its existing patient summary, pending-work projection, evolution history, and contextual Assistant as a compact next-action region. The ficha SHALL keep "+ Nueva evolución" primary and Assistant secondary.

#### Scenario: Ficha sections
- **WHEN** the clinician opens the patient ficha
- **THEN** Resumen is selected by default and Información, Clínica and Actividad are available as local, keyboard-accessible sections
- **WHEN** Información is selected
- **THEN** it shows existing personal identity plus optional phone/email with an Editar entry, without exposing raw RUT beyond the current authorized form behavior
- **WHEN** Clínica is selected
- **THEN** Diagnóstico shows the manual tooth-condition chart and Evoluciones lists only approved evolutions with date and exact detail links, or "Sin evoluciones aprobadas"; no condition is inferred from evolution free text

#### Scenario: Latest evolution
- **WHEN** a patient has an approved evolution
- **THEN** the summary links its date to /patients/:patientId/evolutions/:evolutionId
- **WHEN** no evolution exists
- **THEN** the summary says so without inventing a visit or date

#### Scenario: Pending work
- **WHEN** patient-scoped pending work exists
- **THEN** the summary presents the newest approval first, otherwise the newest draft, as clinical work; it presents failed Drive export separately with its owning thread or saved-evolution link and per-kind totals
- **WHEN** one pending-kind request fails
- **THEN** that category says "No disponible" and offers retry without replacing known category values with zero

#### Scenario: Focused evolution route
- **WHEN** the clinician opens a specific evolution URL
- **THEN** the selected evolution stays the focal content and no extra overview displaces it

### Requirement: Supported Assistant starters
The Assistant SHALL expose only starter actions supported by its current clinical capabilities. Starters SHALL open a picker, prefill editable unsent text, or switch to existing pending work; they SHALL not send a model turn, generate a draft, approve, save, or select a different patient without explicit user action.

#### Scenario: No active patient
- **WHEN** the Assistant has no selected patient
- **THEN** "Seleccionar paciente" opens the existing picker and a general consultation remains possible

#### Scenario: Active patient
- **WHEN** a patient is selected and the Assistant is idle
- **THEN** "Preparar evolución" and "Consultar evoluciones" prefill appropriate editable unsent text for that patient, and the patient identity remains visible

#### Scenario: Pending-work entry
- **WHEN** the clinician chooses "Ver pendientes"
- **THEN** /assistant?view=pending shows the existing pending-work projection without creating a duplicate work store

#### Scenario: Direct pending route
- **WHEN** the clinician opens or reloads /assistant?view=pending directly
- **THEN** the URL remains in pending mode, pending rows are available in the main pane on narrow screens, and no thread is acquired, created, or messaged merely by opening the route
- **WHEN** the clinician explicitly starts a consultation from pending mode
- **THEN** the existing thread acquisition and composer flow may begin

#### Scenario: Existing draft or active runtime
- **WHEN** the composer contains unsent work or a clinical turn is active
- **THEN** starter actions do not overwrite that work or interrupt the turn

### Requirement: Clinical safety and visual continuity
All new discovery surfaces SHALL follow PRODUCT.md, DESIGN.md, and docs/design/UX_PRINCIPLES.md: masked identifiers, Spanish clinical copy, semantic status text, keyboard-visible focus, existing responsive shell, reduced-motion behavior, and no invented clinical or operational metrics.

#### Scenario: Data and identity
- **WHEN** a discovery surface renders patient identity or counts
- **THEN** it uses only owner-scoped typed API data, masked RUT, and truthful available/unavailable states

#### Scenario: Clinical write boundary
- **WHEN** a user navigates from the directory, ficha, or an Assistant starter
- **THEN** existing explicit review and approval remain necessary before an evolution can be saved

#### Scenario: Keyboard and narrow screen
- **WHEN** controls are used with keyboard or coarse pointer on a narrow viewport
- **THEN** focus remains visible, icon actions have accessible names, touch targets satisfy the existing 44px contract, and the page has no horizontal overflow at 320, 713 or 1024 CSS px

#### Scenario: Structural wireframe
- **WHEN** the discovery UI is implemented
- **THEN** its directory/ficha section order, supported route mappings and ready/empty/error states match implementation-blueprint.md and the retained target wireframes while using production components and semantic tokens

### Requirement: Search by name, phone and RUT
The existing owner-scoped POST /api/patients/search SHALL match normalized names, stored phone digits, a complete valid RUT, and a partial numeric RUT body. It SHALL keep raw search text out of the URL, navigation state, storage, analytics and logs. Results SHALL expose masked RUT and the existing summary fields, not the matched phone value merely because it was searched.

#### Scenario: Partial and complete identifier
- **WHEN** an owner enters a valid complete RUT in formatted or compact form
- **THEN** the exact owned patient is returned
- **WHEN** the owner enters a partial numeric RUT body
- **THEN** owned patients with that numeric portion are returned without requiring a check digit
- **WHEN** a purported complete RUT has an invalid check digit
- **THEN** it is not treated as a verified exact RUT match

#### Scenario: Phone and privacy
- **WHEN** an owner enters a formatted or digits-only phone fragment
- **THEN** matching owned contact records appear without disclosing phones in the summary response
- **WHEN** another owner's phone, RUT or name matches
- **THEN** their patient remains absent

### Requirement: DentalPin-informed navigation behavior within the existing sidebar
The authenticated sidebar SHALL retain Dental AI Assistant's existing dark visual design, tooth mark, 260px expanded width, 56px compact rail, route iconography and Pacientes/Asistente/Chat hierarchy. It SHALL not copy DentalPin's light rail or add a new global menu group. The expanded logo/wordmark and compact tooth mark SHALL both link to `/patients`. The collapse toggle SHALL remain a separate control. On desktop, the compact rail SHALL keep Pacientes, Asistente and Chat directly selectable by icon, with accessible names, active-route indication, tooltip and keyboard focus; switching routes SHALL not require expanding or scrolling a full sidebar.

#### Scenario: Brand and route navigation
- **WHEN** the clinician activates either logo form from the directory or ficha
- **THEN** the app opens `/patients` without losing clinical drafts or changing patient data
- **WHEN** the sidebar expands or collapses
- **THEN** the existing brand, colors, order and icons remain; supported destinations stay accessible from the compact rail, the current destination remains indicated, and no DentalPin-only module appears

#### Scenario: Compact route selection
- **WHEN** the desktop sidebar is collapsed and the clinician selects Pacientes, Asistente or Chat by its icon
- **THEN** the exact existing route opens without first expanding the sidebar; the compact rail retains an accessible route label and visible current selection
- **WHEN** a clinical draft or stream is active during route selection
- **THEN** the existing transition guard and runtime preservation remain in effect

### Requirement: Editable patient notes
Información SHALL offer owner-scoped general patient notes separate from evolution text and tooth conditions. Creating and editing a note SHALL require an explicit save; cancellation SHALL not persist. A revision history SHALL retain who changed the note, when, and the prior and new text. A note SHALL not enter model prompts automatically.

#### Scenario: Save, edit and cancel
- **WHEN** the owner writes a note and chooses Guardar
- **THEN** the saved note appears in Información and a real note event appears in Actividad
- **WHEN** the owner edits a note and saves
- **THEN** the latest text appears with its revision history, while an unsaved cancel leaves the previous text intact

#### Scenario: Note access and empty state
- **WHEN** a patient has no notes
- **THEN** Información shows a clear empty state and Nueva nota action
- **WHEN** another owner requests or changes a note
- **THEN** the API returns 404 with no note text or existence disclosure

### Requirement: Manually editable tooth diagnosis
Clínica > Diagnóstico SHALL display the permanent and primary FDI dentitions, a diagnostic condition selector, an accessible tooth/surface selector, a legend, and the saved conditions grouped by tooth. Selecting a tool, tooth or surface SHALL only create a draft; Guardar SHALL be the only action that writes. The feature SHALL never infer a condition from an evolution or silently persist an AI draft.

#### Scenario: New and edited condition
- **WHEN** the clinician selects a supported diagnostic condition, an eligible FDI tooth, optional supported surfaces, and confirms Guardar
- **THEN** an owner-scoped condition is saved and appears on both chart and text list with type, tooth, surfaces, clinician and time
- **WHEN** the clinician edits or resolves an existing condition
- **THEN** the new state appears on both representations and the prior revision remains in history and Actividad
- **WHEN** the clinician cancels before Guardar or a save fails
- **THEN** persisted chart/list data remains unchanged and the draft remains recoverable or explicitly discardable

#### Scenario: Dental chart modes and access
- **WHEN** Permanent or Temporal is selected
- **THEN** only the respective FDI tooth set is selectable and the selected mode is visibly labelled
- **WHEN** chart marks cannot be perceived or used
- **THEN** the same tooth, condition, status and edit actions are available through the keyboard-operable textual list with non-color legend
- **WHEN** another owner requests or writes a condition
- **THEN** the API returns 404 and reveals no condition or patient existence

### Requirement: Backed patient activity
Actividad SHALL project only persisted owner-scoped approved evolutions, general-note revisions and tooth-condition revisions into a chronological timeline. It SHALL expose All and only filters whose sources exist, with server-backed pagination, deterministic ordering, date grouping, type text, timestamp, actor when known and exact owning context links. It SHALL not synthesize visits, messages, financial events or medical history.

#### Scenario: Filter and chronology
- **WHEN** the clinician opens Actividad or switches Evoluciones, Notas or Diagnósticos
- **THEN** entries and totals derive from the requested real sources, remain newest-first with a stable tie-breaker, and a no-events state offers Mostrar todo
- **WHEN** an entry opens
- **THEN** it leads to the exact evolution, note or condition within that patient
- **WHEN** a source fails
- **THEN** Actividad shows an error and retry, never a false empty timeline
