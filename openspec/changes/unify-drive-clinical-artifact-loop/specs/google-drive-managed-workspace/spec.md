## MODIFIED Requirements

### Requirement: Responsive Drive workspace accessory
The Clinical Assistant SHALL start with Drive closed and expose exactly one accessible Drive control in the Assistant header. That control SHALL open or guardedly close the existing desktop sidecar or mobile sheet. The Drive workspace MAY use only the two top-level tabs `Notas` and `Evoluciones`, and SHALL reuse existing panel, sheet, focus, and transition primitives without adding a UI dependency.

#### Scenario: Assistant opens
- **WHEN** the user enters the Clinical Assistant
- **THEN** Drive is closed, the clinical workspace uses available width, the header control reports collapsed state, and no Drive utility appears in the sidebar

#### Scenario: Header control opens and closes Drive
- **WHEN** the user activates the header control
- **THEN** desktop toggles the sidecar, mobile opens the sheet, `aria-expanded` matches visibility, and focus returns to that control after close

#### Scenario: Dirty workspace is closed
- **WHEN** close is requested while local Drive content is dirty
- **THEN** the existing Save, Discard, and Cancel transition guard resolves before content can be lost

#### Scenario: Drive kind changes
- **WHEN** the user selects `Notas` or `Evoluciones`
- **THEN** the corresponding global-note or journal experience renders without nesting another top-level navigation system

### Requirement: Patient-safe workspace transitions
The workspace SHALL keep global external Notes and cross-patient evolution journals independent from active-patient identity. A patient SHALL be required only for patient-bound managed-document create/import/update and insertion into the clinical composer. Patient switches MUST NOT infer ownership from filenames or silently discard dirty work.

#### Scenario: No patient is selected
- **WHEN** Drive is connected without an active patient
- **THEN** external Notes and evolution journals remain listable, searchable, and readable while managed-document and composer-insertion actions explain their patient prerequisite

#### Scenario: Patient changes with external note or journal open
- **WHEN** the active patient changes
- **THEN** the global content remains open and no patient association is inferred

#### Scenario: Patient changes with managed content open
- **WHEN** managed content belongs to the previous patient
- **THEN** the existing transition guard resolves dirty work and the workspace never presents it as belonging to the new patient

### Requirement: Explicit Drive-to-composer insertion
The workspace SHALL allow a complete external note or non-empty selection to be appended to existing composer text with visible Drive provenance and one blank-line separator. Insertion SHALL require an active patient, preserve source and draft on failure, focus the composer on success, and perform no send, queue, SSE, LLM, approval, or save operation.

#### Scenario: Complete note is inserted
- **WHEN** the user inserts an eligible external note with an active patient
- **THEN** its full text and visible Drive provenance are appended after one blank line and the composer receives focus

#### Scenario: Selection is inserted
- **WHEN** a non-empty eligible selection is inserted with an active patient
- **THEN** only that selection and its provenance are appended and nothing is submitted

#### Scenario: Patient is missing
- **WHEN** insertion is requested without an active patient
- **THEN** the note/selection and composer draft remain unchanged and the UI requests patient selection

## ADDED Requirements

### Requirement: Picker intents are explicit
The workspace SHALL distinguish opening a global external note from importing a patient-bound managed copy and SHALL request the minimum MIME and permission behavior for each existing intent.

#### Scenario: User cancels either Picker
- **WHEN** the Picker closes without a selection
- **THEN** workspace state and local work remain unchanged and no error is shown

### Requirement: Evolution journals are cross-patient read surfaces
The `Evoluciones` tab SHALL list and read owner-scoped daily or weekly journals without requiring a patient and SHALL use structured backend responses rather than parsing raw Drive text in the browser.

#### Scenario: Journal entry opens from an artifact
- **WHEN** a synced artifact supplies journal lineage
- **THEN** Drive opens the matching period and part and locates the evolution entry without exposing provider identifiers
