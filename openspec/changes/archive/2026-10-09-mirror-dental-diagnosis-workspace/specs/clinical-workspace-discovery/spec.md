## MODIFIED Requirements

### Requirement: Manually editable tooth diagnosis
Clínica > Diagnóstico SHALL display the permanent and primary FDI dentitions, a diagnostic condition selector, an accessible tooth/surface selector, a legend, and the saved conditions grouped by tooth. Selecting a tool or hovering a tooth SHALL not write. With an active tool, explicit whole-tooth or occlusal-surface activation SHALL apply directly; lateral activation of a surface tool SHALL open the compact surface selector and Confirmar SHALL apply its selected surfaces. Editing existing records SHALL retain explicit save and history-preserving correction. The feature SHALL never infer a condition from an evolution or silently persist an AI draft.

#### Scenario: New and edited condition
- **WHEN** the clinician selects a supported diagnostic condition and activates an eligible whole tooth or occlusal surface, or confirms selected surfaces in the compact selector
- **THEN** an owner-scoped condition is saved and appears on both chart and text list with type, tooth, surfaces, clinician and time
- **WHEN** the clinician edits or resolves an existing condition
- **THEN** the new state appears on both representations and the prior revision remains in history and Actividad
- **WHEN** the clinician cancels a surface selector/edit before confirmation, or an application fails
- **THEN** persisted chart/list data remains unchanged and the unsent selector/edit or frozen failed command remains recoverable or explicitly discardable

#### Scenario: Dental chart modes and access
- **WHEN** Permanent or Temporal is selected
- **THEN** only the respective FDI tooth set is selectable and the selected mode is visibly labelled
- **WHEN** chart marks cannot be perceived or used
- **THEN** the same tooth, condition, status and edit actions are available through the keyboard-operable textual list with non-color legend
- **WHEN** another owner requests or writes a condition
- **THEN** the API returns 404 and reveals no condition or patient existence

### Requirement: Backed patient activity
Actividad SHALL project only persisted owner-scoped approved evolutions, general-note revisions, tooth-condition revisions, therapeutic-record revisions, clinical-plan/session revisions and dental-note revisions into a chronological timeline. It SHALL expose All and only filters whose sources exist, with server-backed pagination, deterministic ordering, date grouping, type text, timestamp, actor when known and exact owning context links. It SHALL not synthesize visits, messages, financial events or medical history.

#### Scenario: Filter and chronology
- **WHEN** the clinician opens Actividad or switches Evoluciones, Notas, Diagnósticos or available therapeutic/plan filters
- **THEN** entries and totals derive from the requested real sources, remain newest-first with a stable tie-breaker, and a no-events state offers Mostrar todo
- **WHEN** an entry opens
- **THEN** it leads to the exact evolution, general/dental note, condition, treatment or clinical plan/session within that patient
- **WHEN** a source fails
- **THEN** Actividad shows an error and retry, never a false empty timeline

### Requirement: Professional chart-first clinical composition
Clínica > Diagnóstico SHALL follow the chart-first hierarchy extracted in the 2026-10-02 visual review (summarized in design.md) while preserving Dental AI Assistant's dark semantic palette, tooth brand, Spanish copy and existing navigation. The diagnostic workspace SHALL present a labelled chart and dentition control, illustrated diagnostic tools, contextual tooth popovers, compact surface selection and saved-record edit modals, a collapsible legend and saved conditions grouped by tooth. General notes SHALL retain their Información owner; this mirror adds typed dental notes and clinical plans alongside them, while media attachments remain deferred.

#### Scenario: Anatomical chart and orientation
- **WHEN** the clinician opens either dentition
- **THEN** the chart distinguishes incisor, canine, premolar where present, and molar forms with lateral outlines and readable occlusal/surface geometry, preserves the specified FDI order in upper/lower arches separated at the midline, and labels orientation in text
- **AND** one repeated brand-tooth glyph or an undifferentiated numbered-button grid does not satisfy the chart requirement

#### Scenario: Clinical section access on narrow screens
- **WHEN** Clínica is selected on a narrow viewport
- **THEN** patient identity/actions and the four-section tab strip precede the clinical mode controls and chart; Resumen metrics, pending-work rows and summary starter actions do not render above the clinical content
- **AND** the existing exact evolution URL selects Clínica > Evoluciones inside the four-tab ficha, retaining its selected detail without an extra summary or diagnostic overview

#### Scenario: Tool recognition and persisted marks
- **WHEN** a diagnostic tool is selected
- **THEN** its tile combines a Spanish label and a consistent condition symbol, visibly identifies selection and shows that tool selection alone has not applied a concept
- **WHEN** saved conditions render
- **THEN** chart marks encode their supported condition and surfaces using symbols or patterns plus text equivalents; multiple conditions remain individually discoverable, and draft/selected/active/resolved states are distinguishable without color alone

#### Scenario: Available-width composition
- **WHEN** the diagnostic region has at least 960 CSS px of available width
- **THEN** the source chart/list and editable notes rail are side by side, with320px rail or384px at the wider source breakpoint; inspection remains in tooth popovers and saved-record editing in domain modals
- **WHEN** that region is narrower, including when contextual Assistant reduces it
- **THEN** title/dentition controls wrap, anatomical arches retain a local horizontal-scroll region and44px accessible targets, and floating Notas opens the right notes Sheet with its retained composer; no stacked draft inspector replaces the mirrored popover/modal flow

#### Scenario: Chart and list linkage
- **WHEN** a tooth or corresponding saved-condition row receives hover or keyboard focus
- **THEN** the other representation highlights the same FDI tooth without changing saved tooth/surfaces or persisted state; a new diagnosis note candidate follows the source hover binding defined by N2, visibly and without persistence
- **WHEN** Ver diente is activated
- **THEN** the correct dentition opens and focus reaches the named tooth; editing remains an explicit separate action

#### Scenario: Pointer-accessible contextual controls
- **WHEN** the page is used at 375×667 or another narrow viewport with contextual Assistant available
- **THEN** every diagnostic action is reachable by ordinary pointer and keyboard interaction, no floating Assistant control covers another action, and fixed controls do not obscure the final condition row or save/cancel controls

#### Scenario: State-specific visual evidence
- **WHEN** the diagnostic implementation is verified
- **THEN** synthetic ready, empty, loading, error, selected-tool, selected-tooth/surfaces, saved, resolved and conflict states are captured at 1440×900, 1024×768 and 375×667, with additional 320px overflow and keyboard checks; screenshots use matching viewports and never substitute a wireframe for production proof
