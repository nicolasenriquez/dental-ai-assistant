## MODIFIED Requirements

### Requirement: Responsive Drive workspace accessory
The Clinical Assistant SHALL start with Drive closed and expose exactly one accessible Drive control in the Assistant header. That control SHALL open or guardedly close the existing desktop sidecar or mobile sheet. The Drive workspace SHALL use only the three compact top-level sections `Notas`, `Documentos`, and `Diarios`, and SHALL reuse existing panel, sheet, focus, and transition behavior. A focused primitive remains subject to the dependency gate in `design.md`.

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
- **WHEN** the user selects `Notas`, `Documentos`, or `Diarios`
- **THEN** the corresponding global-note, patient-managed-document, or journal experience renders with keyboard-operable selected state and without nested top-level navigation

#### Scenario: Viewport changes
- **WHEN** Drive opens on desktop, tablet, or mobile
- **THEN** it uses the existing usable-width side workspace, right-side sheet, or full-width sheet respectively, without compressing the clinical artifact or composer below usable minimums

### Requirement: Patient-safe workspace transitions
The workspace SHALL keep global external Notes and cross-patient evolution journals independent from active-patient identity. A patient SHALL be required only for patient-bound managed-document create/import/update and insertion into the clinical composer. Patient switches MUST NOT infer ownership from filenames or silently discard dirty work.

#### Scenario: No patient is selected
- **WHEN** Drive is connected without an active patient
- **THEN** external Notes and evolution journals remain listable, searchable, and readable while `Documentos` shows an intentional prerequisite state with `Seleccionar paciente`, not an error

#### Scenario: Patient changes with external note or journal open
- **WHEN** the active patient changes
- **THEN** the global content remains open and no patient association is inferred

#### Scenario: Patient changes with managed content open
- **WHEN** managed content belongs to the previous patient
- **THEN** the existing transition guard resolves dirty work and the workspace never presents it as belonging to the new patient

### Requirement: Explicit Drive-to-composer insertion
The workspace SHALL expose the explicit actions `Insertar selección` and `Insertar nota completa` for appending eligible Drive text to existing composer text with visible provenance and one blank-line separator. Insertion SHALL require an active patient, preserve source and draft on failure, focus the composer on success, show brief contextual confirmation such as `Añadido al borrador`, and perform no send, queue, SSE, LLM, approval, save, patient change, or thread creation.

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
The `Diarios` section SHALL list owner-scoped daily or weekly journals as readable period groups with Drive-derived update time, without entry counts, a patient prerequisite, or provider IDs. One-part periods SHALL hide `Parte 1`; rollover periods SHALL appear once and reveal their parts. It SHALL use structured backend responses rather than parsing raw Drive text in the browser.

#### Scenario: Journal entry opens from an artifact
- **WHEN** a synced artifact supplies journal lineage
- **THEN** Drive opens `Diarios`, selects the exact period and part, locates the evolution ID, scrolls it into view, focuses its semantic root or heading outside the regular tab order, and applies one subtle temporary highlight without adding a routing identifier

#### Scenario: Linked evolution is absent remotely
- **WHEN** the selected valid remote journal does not contain the target evolution ID
- **THEN** the journal remains open with a sanitized contextual error and the UI does not focus another entry or reconstruct content

### Requirement: Journal preferences affect future approvals only
The `Diarios` section SHALL contain the only journal-frequency control, labelled `Agrupar nuevas evoluciones`, with `Semanal` and `Diario` values from the existing typed GET/PUT API and associated helper text `Los cambios solo afectan futuras evoluciones.`

#### Scenario: Preference update succeeds
- **WHEN** the PUT succeeds
- **THEN** compact inline progress ends, the control remains on the canonical returned value, and no existing journal or export identity changes

#### Scenario: Preference update fails
- **WHEN** the PUT fails
- **THEN** the control restores the previous canonical value, shows contextual inline error with retry, and uses no modal or required global toast

### Requirement: Journal search is local to loaded detail
Journal search in V1 SHALL filter only the currently loaded backend-parsed `JournalDetail` entries by patient display name, masked RUT, content, or occurrence time. It SHALL NOT fetch another period, parse TXT, search all Drive or PostgreSQL, add an index, or add an endpoint.

#### Scenario: Local search has no matches
- **WHEN** no loaded entry matches the query
- **THEN** the reader shows `No encontramos evoluciones para esta búsqueda.` and offers query clearing, which restores all entries in that detail

### Requirement: Active patient is shared workspace context
The Clinical Assistant SHALL present the existing active-patient selector near the workspace heading and Drive control while preserving the current state owner, composer dependency, and transition guards.

#### Scenario: Patient context is elevated
- **WHEN** a patient is active
- **THEN** the header-level control shows name and masked RUT without duplicating patient state or adding a global store
