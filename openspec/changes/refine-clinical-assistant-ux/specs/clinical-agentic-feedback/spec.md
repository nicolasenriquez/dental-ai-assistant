## ADDED Requirements

### Requirement: Single contextual Assistant shell title
The contextual Assistant SHALL expose its outer h2 or SheetTitle as the sole visible `Asistente clínico` shell heading. The embedded header SHALL NOT repeat that title, and its empty-state heading SHALL be one level below the contextual shell heading. Patient identity, required controls, existing region names, modal accessible naming, artifact hierarchy and full/manual compositions SHALL remain intact. This is local composition, not a new runtime or clinical workflow.

#### Scenario: Empty contextual panel or Sheet
- **WHEN** a successfully loaded empty thread renders in the desktop contextual panel or tablet Sheet
- **THEN** one visible `Asistente clínico` shell heading is h2 and the empty-state heading is h3, without a duplicate visible or compensating hidden shell heading; the Sheet remains named by its title and keeps one close control and its incumbent Escape/focus-return behavior

#### Scenario: Full and populated compositions retain their hierarchy
- **WHEN** the full Assistant, a populated contextual transcript or manual review renders after this refinement
- **THEN** full Assistant retains h1 with empty-state h2 where applicable, contextual artifacts retain h3 with field h4, manual headings follow their actual parent, and patient controls/text/context/edit buffers and exact destinations remain unchanged without induced turn submission or export

### Requirement: Recoverable clinical thread loading
The Assistant SHALL distinguish loading, successfully loaded empty, successfully loaded populated and failed thread reads. First-load failure SHALL show a dedicated Spanish error and a same-thread read retry instead of successful-empty starters. The retry SHALL preserve authenticated unsent work and artifact edit buffers, use canonical hydration, and perform no create/acquire, patient-change, submit, approval, recovery or Drive-export write. It SHALL remain scoped to thread and request generation and preserve existing authentication and inaccessible-resource handling.

#### Scenario: Failed initial read followed by success
- **WHEN** the requested thread GET fails transiently and the clinician chooses `Reintentar`
- **THEN** loading and failure replace welcome content until a successful same-ID read, no replacement thread or write request occurs, and a genuinely empty successful result alone enables starters

#### Scenario: Hydrated thread contains pending exports or an active turn
- **WHEN** the successful load retry hydrates pending, syncing or unknown Drive exports or an active clinical turn
- **THEN** it reconstructs canonical state without triggering export retry, approval or clinical writes; existing read-only active-turn polling can resume

#### Scenario: Background read failure and preserved work
- **WHEN** a read fails after content is available or while local text and unapplied artifact edits exist
- **THEN** content and edits remain readable and preserved, the failed read has truthful recovery feedback, and first-load failure does not permit submission against an unhydrated thread

#### Scenario: Authentication, inaccessible thread or stale result
- **WHEN** reading returns 401, inaccessible 403/404, or a late result from a previously selected thread
- **THEN** existing authentication/unavailable behavior applies, no endless transient retry or replacement thread is offered for inaccessible resources, and stale results and errors cannot mutate the current thread

### Requirement: Operation-owned clinical failure feedback
The Assistant SHALL correlate failure feedback by originating operation and resource identity rather than message text. A failed canonical save represented in its artifact SHALL have one actionable error presentation. Independent read, turn, queue, source, artifact-sync and Drive failures SHALL remain visible at their appropriate owners. Canonical uncertainty SHALL remain distinguishable from confirmed failure and SHALL retain reconciliation before recovery or a new save intention.

#### Scenario: Same save failure reaches artifact and area
- **WHEN** one failed save produces both artifact status and hook-level feedback
- **THEN** its artifact presents that operation's error and recovery once, without a second equivalent alert above the composer or a duplicate live announcement

#### Scenario: Different operations share identical error text
- **WHEN** an artifact save and an independent queue/read/source operation fail with the same human-facing message
- **THEN** both operations remain identifiable and actionable at their owners, without suppression based on the shared string

#### Scenario: Response loss or failed reconciliation
- **WHEN** a save response is lost and its canonical outcome is approved, failed, still pending or not verifiable
- **THEN** presentation reflects that reconciled outcome or explicit uncertainty, preserves content and existing recovery restrictions, and never resolves another approval or silently retries the write

### Requirement: Visibility-aware review recovery access
The Assistant SHALL keep access to the exact pending artifact when its review-action region is outside or occluded in the transcript viewport. It SHALL suppress the redundant review dock only while the destination is visibly usable, retain approval/submit-lock semantics, and preserve focus during visibility changes and modal dismissal. Visibility uncertainty SHALL retain recovery access.

#### Scenario: Review destination is visible
- **WHEN** the pending artifact's review-action region is visibly usable within the current transcript viewport
- **THEN** the duplicate dock action is absent while the artifact action and approval lock remain available

#### Scenario: Review destination is offscreen or occluded
- **WHEN** the destination is outside the scroll viewport, obscured by persistent chrome, temporarily unmounted or cannot be observed
- **THEN** the dock exposes recovery to that exact artifact; activation scrolls and focuses it without resolving approval, creating a new preparation or saving clinical content

#### Scenario: Focused dock or modal return target
- **WHEN** scrolling or reflow would hide a focused dock control, or approval dismissal returns focus
- **THEN** focus remains on a valid control in the same workflow, no focused element is removed before a safe handoff, and pending review can still be resumed

### Requirement: Composition-aware artifact headings
Clinical artifact headings SHALL follow their actual containing page or section, with each field heading one level below the artifact heading. Full and contextual Assistant SHALL keep a single artifact representation, stable identity, edit buffers and the existing content-first visual grammar. Manual composition SHALL use its actual parent level without changing manual actions.

#### Scenario: Full Assistant artifact
- **WHEN** an artifact renders under the full Assistant's h1
- **THEN** `Evolución clínica` is h2 and its clinical field headings are h3 without skipped levels or extra wrapper headings

#### Scenario: Contextual Assistant artifact
- **WHEN** an artifact renders under the contextual Assistant's h2
- **THEN** its heading is h3 and clinical fields are h4, with unchanged artifact identity and buffers

#### Scenario: Manual review composition
- **WHEN** the same review component renders in the manual evolution flow
- **THEN** headings follow that composition's parent, and date/source editing, explicit save, copy and regeneration behavior remain unchanged

### Requirement: Complete abbreviated evolution timestamps
Evolution date/time display SHALL use the existing Spanish abbreviated month format `DD mes AAAA · HH:mm` consistently in Assistant artifacts, approval, manual review and patient-ficha evolution metadata. It SHALL include time for same-day distinction, retain the original timestamp in semantic time metadata, preserve current timezone interpretation, and leave numeric editable date fields unchanged. DESIGN.md SHALL describe this approved display/input distinction.

#### Scenario: Two evolutions on the same day
- **WHEN** two evolutions have different times on one date
- **THEN** their artifact, approval and ficha metadata show the corresponding hour and minute with the same abbreviated date convention, and accessible exact-resource links distinguish the times

#### Scenario: Midnight, locale and timezone boundaries
- **WHEN** timestamps are displayed near midnight or a daylight-saving boundary under different browser locales
- **THEN** the existing timezone interpretation and timestamp values are preserved and Spanish abbreviated date/time display remains consistent across the affected views

#### Scenario: Date editing and saved hydration
- **WHEN** a clinician edits the date/time or an evolution rehydrates after save
- **THEN** the date input retains its existing numeric parser/format, displayed metadata reflects the same underlying value, and no migration, date conversion or clinical write is performed solely to normalize display

#### Scenario: Consulted evolutions share a displayed timestamp
- **WHEN** an Assistant evolution-list result contains distinct valid evolution IDs whose displayed date and minute coincide
- **THEN** each destination is distinguishable through visible text and its accessible link name, for example by a stable ordinal within the unchanged result list, while retaining the existing date/time format, original timestamps, payload order and exact patient/evolution href; identification uses current result data only and introduces no new read, clinical/provider request, payload or SSE change
