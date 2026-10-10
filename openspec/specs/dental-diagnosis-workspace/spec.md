# Dental Diagnosis Workspace

## Purpose

Provide a chart-first, source-backed workspace for inspecting and recording patient dental diagnoses.

## Requirements

### Requirement: W1 Read-only tooth inspection
The workspace SHALL keep tooth inspection distinct from clinical drafts and tool intent, preserving saved record identity and existing condition deep links.

#### Scenario: Tooth-first inspection
- **WHEN** the clinician activates a tooth without an active tool
- **THEN** an accessible tooth-anchored record popover shows its saved findings and treatments, with Editar/Historial/Registrar actions, no empty condition code, no write request and no scroll jump to a lower editor.

#### Scenario: Existing condition link
- **WHEN** an authorized condition deep link is opened
- **THEN** the correct dentition, FDI, record and history are reachable without inventing a new draft; a foreign record is unavailable.

### Requirement: W2 Spanish illustrated palette and truthful indicators
The workspace SHALL expose eight categories and every enabled catalog variant with its Spanish label, independently authored icon, consistent card dimensions and accessible selection state. It SHALL preserve all twelve findings.

#### Scenario: Select a surface tool
- **WHEN** the clinician selects Caries or a surface-bearing therapeutic variant
- **THEN** the card gains pressed border/background and aria-pressed, the upper-right cyan dot is explained as Admite superficies, and no persisted-use state is inferred from the dot.

#### Scenario: Card and preview parity
- **WHEN** a concept card is selected and a tooth is hovered
- **THEN** source border/background/halo and50% anatomical preview appear with source timing; no card usage counter is added and hover performs no write.

### Requirement: W3 Reference application and recovery
Hover, focus and tool activation SHALL NOT persist clinical data. D03 anatomical activation SHALL commit according to the reference: whole-tooth click or direct occlusal surface click applies; lateral surface-tool activation opens a compact selector and Confirmar applies. Saved-record editing SHALL use explicit save with incumbent conflict/correction protections.

#### Scenario: Lateral surface selection
- **WHEN** Caries is selected and the lateral view of tooth16 is activated
- **THEN** a compact anatomical surface modal opens; selecting M/O and Confirmar creates exactly one finding, clears tool intent and displays its receipt without an extra Guardar step.

#### Scenario: Occlusal direct application
- **WHEN** Caries is selected and surface M of tooth16 is activated
- **THEN** one M finding is applied directly, using a stable create identity, without an intermediate editor or confirmation added to this source path.

#### Scenario: Whole-tooth direct application
- **WHEN** Pulpitis or bracket is selected and tooth16 is activated
- **THEN** the appropriate finding/procedure is committed directly, a pending operation blocks duplicate activation and success clears the tool; Deshacer retains a logical audit trail.

#### Scenario: Timeout and edit cancellation
- **WHEN** an application response is uncertain or a saved-record edit is dirty
- **THEN** the exact operation/draft remains recoverable, retry does not duplicate, and dirty edit navigation offers save/discard/remain without changing the successful create flow.

### Requirement: W4 Grouped clinical context and reference legend
The workspace SHALL group saved findings and existing procedures by FDI with the reference individual record labels, shared identity for multi-tooth procedures, separate whole-arch groups and unique record totals. The legend SHALL start collapsed and expose source status indicators and five core clinical groups with type illustrations; the legend SHALL use base type illustrations while variant cards/records resolve the overrides in design.md appendix D.

#### Scenario: Overlapping clinical records
- **WHEN** a tooth has a crown, root-canal procedure and caries finding
- **THEN** distinguishable chart marks and the inspector expose all three records with truthful labels; no generic blue mask replaces their meaning.

#### Scenario: Multi-tooth count
- **WHEN** one bridge spans three teeth
- **THEN** each member links to the same procedure and the total procedure count increases by one, while the affected-tooth count reflects three.

### Requirement: W5 Responsive accessible workflow
The workspace SHALL place Permanente/Temporal inside the chart panel, reproduce eight anatomical profiles and retain both arches/FDI with local chart scrolling on narrow views, keep actionable targets at least44px and support keyboard, tap, 200% zoom and reduced motion. Saved-record editing SHALL use a domain modal and tooth inspection a contextual popover; Sheet SHALL be used for mobile notes only. D04 dental notes SHALL be editable in the rail.

#### Scenario: Narrow viewport
- **WHEN** the available patient content cannot fit the source composition with320/384px notes rail
- **THEN** a floating Notas action opens the mobile notes Sheet, tool cards wrap and chart/modal controls remain reachable and the clinical draft survives the layout change.

#### Scenario: Keyboard and reduced motion
- **WHEN** the clinician activates a tooth/tool with the keyboard and prefers reduced motion
- **THEN** focus is visible and restored on close, state feedback is immediate and no decorative entrance or chart scaling runs.

### Requirement: W6 Diagnosis-to-plan continuity
The diagnosis CTA SHALL offer explicit creation or continuation of a draft clinical plan without claiming that diagnosis is clinically complete. Planificación SHALL display future procedures only in the selected plan context; Diagnóstico SHALL display current findings and observed/executed procedures.

#### Scenario: Continue existing draft
- **WHEN** multiple draft plans exist and the clinician selects one
- **THEN** the chosen authorized plan opens with its saved work and no duplicate plan is created.

### Requirement: W7 Source-backed dental rendering and motion
The workspace SHALL implement the anatomical, layer, pattern, opacity, background and motion contracts in design.md appendix A. Four generic tooth profiles or identical glyphs SHALL NOT count as completed mirror coverage.

#### Scenario: Replacement and planned states
- **WHEN** a missing tooth has an implant or a bridge pontic, and another procedure is planned
- **THEN** anatomy transparency/replacement and hidden-root rules match source, planned opacity0.7 and P appear outside transforms, and inspection retains every underlying record.

#### Scenario: Source motion
- **WHEN** a tool, tooth, linked row or selected piece is hovered/selected
- **THEN**150ms card/tooth feedback,200ms pulp fill and source1s/1.5s preview/highlight/ring pulses use their specified values; reduced-motion disables decorative motion.

### Requirement: W8 Deep Module ownership and shared caller Seam
The workspace SHALL expose coherent small Interfaces for dental interaction, presentation, notes and plan commands as defined in design.md appendix E. UI callers SHALL emit intent and render committed models without duplicating transport/retry, visual registries or lifecycle rules. Callers and behavior tests SHALL cross the same public Seam; backend commands SHALL accept persistence dependencies and preserve server ownership/transaction invariants.

#### Scenario: Public journey through one owner
- **WHEN** PatientDetail renders diagnosis and the clinician inspects, applies, retries and opens the note rail
- **THEN** the public workspace Modules own the resulting state and commands, each gesture has one command owner, and switching rail/Sheet retains one composer without a duplicate request or binding reset.

#### Scenario: Shared clinical rendering
- **WHEN** a variant appears in palette, chart, legend and record history
- **THEN** they resolve one clinical/visual registry and preserved historical aliases without contradictory labels, scope or marks.

### Requirement: W9 Verified retirement without historical loss
The implementation SHALL perform the expand→migrate→contract cleanup in design.md appendix E after all replacement consumers pass the integrated journey. Superseded lower create-editor, forced focus, geometry and parallel palette/rail paths SHALL have zero active consumers and be removed. Historical conditions/general notes, IDs, revisions, correction/retry and accessibility SHALL remain supported. This change SHALL NOT drop historical schema or depend on destructive migration rollback.

#### Scenario: Retire old create interaction
- **WHEN** integrated replacement tests pass and the removal slice is verified
- **THEN** tooth activation has one mirror interaction, no Cambiar pieza/lower create editor or forced-scroll path remains, and source searches plus browser replay identify no live consumer of the retired handlers.

#### Scenario: Existing data after cleanup
- **WHEN** the patient with pre-change findings, corrections and general notes reloads after cleanup
- **THEN** original IDs/revisions/history and authorized deep links remain reachable alongside new treatments/plans/dental notes.

#### Scenario: Application rollback
- **WHEN** application code is rolled back after new clinical records were written
- **THEN** new tables/revisions/receipts remain intact, incumbent reads still operate and recovery does not execute a destructive down migration.

### Requirement: W10 Variant icons semantic colors and unobstructed actions
The workspace SHALL follow design.md appendix D for source-backed variant icon overrides, separate palette/layer color roles, dental tokens and measured state feedback. It SHALL preserve Dental AI/Chat global design tokens and use independently authored clinical artwork. Floating actions SHALL NOT overlap each other or the shell dock; a modal SHALL suspend the tooth popover and preserve context during exit.

#### Scenario: Distinguishable variant cards
- **WHEN** metal-ceramic, zirconia and Maryland bridges or occlusal/periodontal splints are presented
- **THEN** variant overrides resolve to their distinct source-like motifs, Spanish labels remain visible and the clinical scope is validated independently from icon appearance.

#### Scenario: Color role parity
- **WHEN** root-canal tools and their saved anatomical marks are displayed in the dark clinical workbench
- **THEN** palette violet and source pulp-layer blue remain distinct, anatomy/clinical tokens resolve their own role, labels/focus meet the specified contrast and Chat action/message colors do not change.

#### Scenario: Floating action and modal access
- **WHEN** Notas and Asistente are available in a narrow workspace or a surface modal opens
- **THEN** each action has its own44px hit area with at least8px separation clear of any dock, pointer/keyboard reaches the intended action, and only the active modal owns trapped focus without a competing popover or Pieza0 exit flash.
