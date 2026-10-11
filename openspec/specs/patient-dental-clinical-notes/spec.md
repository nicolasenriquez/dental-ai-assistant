# Patient Dental Clinical Notes

## Purpose

Provide typed, owner-scoped dental clinical notes linked to patient work.

## Requirements

### Requirement: N1 Typed linked dental notes
The system SHALL support diagnosis notes owned by the patient with an optional tooth, treatment notes owned by a procedure and treatment_plan notes owned by a plan. General patient notes SHALL retain their existing resource and appear as administrative context without reclassification. All entity links SHALL enforce the same owner/patient. Attachments SHALL remain deferred by D04.

#### Scenario: Bound and unbound diagnosis notes
- **WHEN** the clinician saves text with Asociar al diente16 enabled or disabled
- **THEN** the diagnosis note is saved with tooth16 or no tooth respectively, with owner/actor/time/revision and no condition or plan execution created.

#### Scenario: Foreign entity
- **WHEN** a note attempts to link another patient's treatment or another owner's plan
- **THEN** the server returns404 and persists no note, link, revision or command receipt.

### Requirement: N2 Source composer and templates
The existing dental clinical-note composer SHALL use free text without template controls, remain editable in the shared rail/Sheet and save only on Guardar. It SHALL show its optional tooth candidate without retargeting typed work on passive hover. Before typing, chart hover SHALL update the candidate according to the existing binding rules; deliberate chart activation SHALL remain able to change a new note's candidate while writing. Existing-note edits SHALL preserve saved associations. This requirement records the current PRODUCT.md and 7 October surface behavior rather than restoring the retired mirrored templates.

#### Scenario: Template and hover selection
- **WHEN** a new note already contains typed text and tooth17 is passively hovered
- **THEN** no template is offered or appended, the existing note candidate remains unchanged and no note is persisted; explicit tooth activation can deliberately change the candidate before Guardar

#### Scenario: Failed save
- **WHEN** note creation fails or its committed response is lost
- **THEN** text remains intact and exact retry recovers one persisted note; reset/refresh occurs only after a confirmed committed receipt.

#### Scenario: Editing body only
- **WHEN** an existing note for tooth16 is edited while tooth17 is hovered
- **THEN** PATCH changes only its body, the edit controls reflect the preserved saved linkage, and tooth16 remains its association.

### Requirement: N3 Source cards feed and hover links
The clinical notes feed SHALL fetch20 records with Cargar más, show authorized diagnosis/treatment/plan/general types with source type badge/icon, author/date, entity chip,280-character preview and Ver más. Hover/focus SHALL highlight explicit tooth or procedure members; unbound/general-plan notes SHALL NOT invent a tooth.

#### Scenario: Long linked card
- **WHEN** a treatment note exceeds280 characters and its procedure has three members
- **THEN** its card can expand the full body and hover/focus highlights those three members without changing saved note ownership.

#### Scenario: Responsive rail
- **WHEN** the chart and320/384px rail no longer fit
- **THEN** a floating Notas button opens the right notes Sheet and draft text/binding state survives the change; no read-only substitute replaces the compositor.

### Requirement: N4 Explicit edit logical delete and history
Owned notes SHALL support body-only edit with revision conflict recovery and confirmed soft-delete retaining history. Create/edit/delete SHALL use durable operation receipts. No attachment uploader or nonfunctional attachment button SHALL appear in this phase.

#### Scenario: Delete and reload
- **WHEN** the author confirms deleting a note and reloads the patient
- **THEN** the active feed omits that note but its deletion revision remains accessible to the authorized history path.

#### Scenario: Concurrent edit
- **WHEN** two clients edit the same note revision
- **THEN** one commits and the other receives409 with the latest authorized snapshot and preserved local text, requiring explicit reconciliation before retry.

### Requirement: N5 Separate candidate selection from note highlighting
The composer SHALL preserve the last valid chart tooth candidate when pointerleave clears highlighting. Card/condition-row hover SHALL change highlighting only. Chart hover SHALL update a new note candidate only before typing, while explicit chart activation SHALL be able to deliberately change the candidate during writing under N2. Binding SHALL re-enable when an eligible chart candidate changes, and SHALL remain unchecked when the same candidate is revisited. The current shared rail/Sheet state and available-width layout SHALL remain intact; no hover SHALL write or relink an existing note.

#### Scenario: Unbind and leave
- **WHEN** tooth16 is hovered, binding is unchecked and the pointer leaves then revisits16
- **THEN** candidate16 remains visible, binding remains unchecked and Guardar creates an unbound note.

#### Scenario: Change candidate versus highlight
- **WHEN** binding for16 is unchecked, a card linked to18 is hovered and then chart tooth17 is entered
- **THEN** the card highlights18 without changing the candidate, while chart entry changes the candidate to17 and re-enables binding; Guardar captures the displayed17.

#### Scenario: Source spatial alignment
- **WHEN** diagnosis is rendered with sufficient patient content width
- **THEN** chart/conditions/CTA occupy the main column and the notes header/composer/feed sit in an external320/384px rail aligned at the top with16px column gap,12px sidebar padding/gap and8px card separation; narrow presentation retains the same composer state.
