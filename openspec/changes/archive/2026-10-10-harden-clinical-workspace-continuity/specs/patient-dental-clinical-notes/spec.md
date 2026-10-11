## MODIFIED Requirements

### Requirement: N2 Source composer and templates
The existing dental clinical-note composer SHALL use free text without template controls, remain editable in the shared rail/Sheet and save only on Guardar. It SHALL show its optional tooth candidate without retargeting typed work on passive hover. Before typing, chart hover SHALL update the candidate according to the existing binding rules; deliberate chart activation SHALL remain able to change a new note's candidate while writing. Existing-note edits SHALL preserve saved associations. This requirement records the current PRODUCT.md and 7 October surface behavior rather than restoring the retired mirrored templates.

#### Scenario: Template and hover selection
- **WHEN** a new note already contains typed text and tooth17 is passively hovered
- **THEN** no template is offered or appended, the existing note candidate remains unchanged and no note is persisted; explicit tooth activation can deliberately change the candidate before Guardar

#### Scenario: Failed save
- **WHEN** note creation fails or its committed response is lost
- **THEN** text remains intact and exact retry recovers one persisted note; reset/refresh occurs only after a confirmed committed receipt

#### Scenario: Editing body only
- **WHEN** an existing note for tooth16 is edited while tooth17 is hovered
- **THEN** PATCH changes only its body, the edit controls reflect the preserved saved linkage, and tooth16 remains its association

### Requirement: N5 Separate candidate selection from note highlighting
The composer SHALL preserve the last valid chart tooth candidate when pointerleave clears highlighting. Card/condition-row hover SHALL change highlighting only. Chart hover SHALL update a new note candidate only before typing, while explicit chart activation SHALL be able to deliberately change the candidate during writing under N2. Binding SHALL re-enable when an eligible chart candidate changes, and SHALL remain unchecked when the same candidate is revisited. The current shared rail/Sheet state and available-width layout SHALL remain intact; no hover SHALL write or relink an existing note.

#### Scenario: Unbind and leave
- **WHEN** tooth16 is hovered before typing, binding is unchecked and the pointer leaves then revisits16
- **THEN** candidate16 remains visible, binding remains unchecked and Guardar creates an unbound note

#### Scenario: Change candidate versus highlight
- **WHEN** binding for16 is unchecked, no text has been entered, a card linked to18 is hovered and then chart tooth17 is entered
- **THEN** the card highlights18 without changing the candidate, while eligible chart entry changes the candidate to17 and re-enables binding; Guardar captures the displayed17

#### Scenario: Source spatial alignment
- **WHEN** diagnosis is rendered with sufficient patient content width for the current notes rail
- **THEN** chart/conditions occupy the main column and the notes header/composer/feed align at the top using existing layout tokens; narrow presentation retains the same composer state without restoring retired plan-authoring CTA or template controls
