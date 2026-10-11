## MODIFIED Requirements

### Requirement: Professional chart-first clinical composition
Clínica > Diagnóstico SHALL follow the chart-first hierarchy extracted in the 2026-10-02 visual review (summarized in design.md) while preserving Dental AI Assistant's dark semantic palette, tooth brand, Spanish copy and existing navigation. The diagnostic workspace SHALL present a labelled chart and dentition control, compact illustrated diagnostic/treatment operations, contextual tooth popovers, compact surface selection and saved-record edit modals, a collapsible legend and saved conditions grouped by tooth. General notes SHALL retain their Información owner, dental notes SHALL retain their existing shared composer, and stored plan evidence SHALL remain read-only without plan authoring controls. Media attachments remain deferred.

#### Scenario: Anatomical chart and orientation
- **WHEN** the clinician opens either dentition
- **THEN** the chart distinguishes incisor, canine, premolar where present, and molar forms with lateral outlines and readable occlusal/surface geometry, preserves the specified FDI order in upper/lower arches separated at the midline, and labels orientation in text
- **AND** one repeated brand-tooth glyph or an undifferentiated numbered-button grid does not satisfy the chart requirement

#### Scenario: Clinical section access on narrow screens
- **WHEN** Clínica is selected on a narrow viewport
- **THEN** patient identity/actions and the four-section tab strip precede the clinical mode controls and chart; Resumen metrics, pending-work rows and summary starter actions do not render above the clinical content
- **AND** the existing exact evolution URL selects Clínica > Evoluciones inside the four-tab ficha, retaining its selected detail without an extra summary or diagnostic overview

#### Scenario: Tool recognition and persisted marks
- **WHEN** a diagnostic or observed-treatment tool is selected
- **THEN** its compact operation combines a full Spanish label and consistent symbol, visibly identifies the active tool and explains its existing activation/confirmation consequence without implying that arming the tool writes
- **WHEN** saved conditions render
- **THEN** chart marks encode their supported condition and surfaces using symbols or patterns plus text equivalents; multiple conditions remain individually discoverable, and draft/selected/active/resolved states are distinguishable without color alone

#### Scenario: Available-width composition
- **WHEN** the available diagnostic region meets the current notes-rail breakpoint
- **THEN** chart/list and the existing editable notes rail appear side by side at their established widths; inspection remains in tooth popovers and saved-record editing in domain modals
- **WHEN** that region is narrower, including when contextual Assistant reduces it
- **THEN** title/dentition controls wrap, anatomical arches retain a local horizontal-scroll region and 44px accessible targets, and Notas opens the existing right notes Sheet with its retained composer; no stacked draft inspector replaces the popover/modal flow

#### Scenario: Chart and list linkage
- **WHEN** a tooth or corresponding saved-condition row receives hover or keyboard focus
- **THEN** the other representation highlights the same FDI tooth without changing saved tooth/surfaces or persisted state; a new diagnosis note candidate follows the existing pre-typing hover binding visibly and without persistence, while typing is not silently retargeted
- **WHEN** Ver diente is activated
- **THEN** the correct dentition opens and focus reaches the named tooth; editing remains an explicit separate action

#### Scenario: Pointer-accessible contextual controls
- **WHEN** the page is used at 375×667 or another narrow viewport with contextual Assistant available
- **THEN** every diagnostic action is reachable by ordinary pointer and keyboard interaction, no floating Assistant control covers another action, and fixed controls do not obscure the final condition row or save/cancel controls

#### Scenario: State-specific visual evidence
- **WHEN** the diagnostic implementation is verified
- **THEN** synthetic ready, empty, loading, error, selected-tool, selected-tooth/surfaces, saved, resolved and conflict states are captured at 1440×900, 1024×768 and 375×667, with additional 320px overflow and keyboard checks; screenshots use matching viewports and never substitute a wireframe for production proof

## ADDED Requirements

### Requirement: Complete compact clinical catalog
The diagnosis catalog SHALL separate category navigation from active tool selection through an existing labelled category control and compact operation list. High-volume categories, including Restauradora, SHALL offer contextual text search with result count, clearing and no-match feedback. All twelve findings and 63 existing treatment variants SHALL retain stable catalog identity, order, applicability and full labels. No duplicated UI catalog or new search endpoint SHALL be introduced.

#### Scenario: Find a crown variant
- **WHEN** the clinician searches Restauradora for a supported crown variant, including normalized case or diacritics
- **THEN** the intended stable variant is discoverable with its complete label and existing applicability, without scanning every large illustrated card

#### Scenario: Category navigation and no results
- **WHEN** a category or search filter changes or no option matches
- **THEN** the UI reports the result count or no-match state with clear action, preserves existing draft/tool context, and performs no clinical write

#### Scenario: Concept legend does not mislabel variants
- **WHEN** a crown concept and a saved zirconia variant are described
- **THEN** the concept legend describes crowns generically and the resource uses its own variant label, never the first metal-ceramic catalog entry as the universal description

### Requirement: Canonical exact-resource patient navigation
Patient view changes SHALL retain only safe query parameters belonging to the selected section, while legacy plan links remain valid read-only history. Activity SHALL preserve all stored event categories in Todos and label plan evidence as historical rather than an equivalent daily authoring mode. Exact note and plan links SHALL focus their destination once after the owned read succeeds, including beyond page one.

#### Scenario: Leave historical plan for diagnosis
- **WHEN** a legacy planning/plans link opens and the clinician selects Diagnóstico
- **THEN** stored history remains accessible, the URL selects `tab=clinical&clinical=diagnosis`, irrelevant plan focus parameters clear, and no authoring or clinical mutation occurs

#### Scenario: Condition link round trip
- **WHEN** Activity opens an exact condition/treatment and the user reloads or goes back/forward
- **THEN** the canonical URL restores the owning clinical section and exact authorized target under existing dirty guards, without patient names, clinical text or raw identifiers in the URL

#### Scenario: Note or plan focus
- **WHEN** an exact dental note or historical plan is loaded through Activity
- **THEN** focus reaches its named destination once with revision history available; pagination or background refresh does not steal focus again

#### Scenario: Inaccessible target or failed read
- **WHEN** an exact target is absent, foreign-owned or temporarily unavailable
- **THEN** the existing not-found/error recovery appears without hiding known events or replacing them with a false empty timeline

### Requirement: Available dental-note actor attribution
The dental-note revision client and detail SHALL retain the already supplied actor display name alongside actor UUID and use the existing actor presentation. A declared label SHALL NOT certify credentials or replace persisted actor identity. General notes and clinical notes SHALL retain their separate origins and history.

#### Scenario: Actor label available or missing
- **WHEN** a note revision supplies actor UUID with a stored display name or null name
- **THEN** Activity and note history use that same declared name or the existing distinguishable UUID fallback respectively, never the current session as a substitute or an invented author

#### Scenario: Notes continuity
- **WHEN** a dental note is edited, canceled or logically deleted through the rail/Sheet flow
- **THEN** its original association, revision history and shared draft protections remain; general-note events are not removed or merged into clinical-note storage

### Requirement: Bounded Assistant clarity and touch access
Assistant presentation SHALL use explicit current-response Stop copy and existing queue controls, maintain the three-message queue cap with unsent overflow text preserved, and meet 44px coarse-pointer targets using existing tokens/primitives. Compact header/starters SHALL preserve patient identity, required recovery actions, accessible Pending Work routes and voice/composer behavior.

#### Scenario: Stop and queue explanation
- **WHEN** a response is running with queued follow-ups
- **THEN** the UI explains that Stop targets the current response and separately names the pending count; stopping does not silently pause or erase the queue

#### Scenario: Queue is full
- **WHEN** a fourth message is entered while three messages are queued
- **THEN** the limit is explained and that fourth text remains editable in the composer

#### Scenario: Narrow pane and coarse pointer
- **WHEN** Assistant, inline artifact or Drive accessory changes the available pane width on a coarse-pointer device
- **THEN** action targets remain at least 44px, patient identity and composer remain usable, required actions are not hover-only, and no root horizontal overflow or runtime cancellation occurs
