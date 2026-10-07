# Odontogram Human Workflow

## Purpose

Provide an explicit, recoverable, human-reviewed workflow for odontogram correction, record selection, retries, and truthful clinical history.

## Requirements

### Requirement: R1 Explicit error correction distinct from resolution
The system SHALL provide a manual correction command with mandatory trimmed reason of1–1000characters, preserving original identity/evidence and marking it entered_in_error. It SHALL accept owned active or resolved originals and optionally create a new linked replacement atomically. It SHALL NOT reinterpret previous resolved records or allow editing immutable identity in place.

#### Scenario: Wrong piece with replacement
- **WHEN** the clinician corrects Caries16 to a valid Caries26 replacement and explicitly saves the reviewed correction
- **THEN** the original retains FDI16 and its history, receives a corrected revision/reason and entered_in_error status, and a new active26 record plus created revision links to the original

#### Scenario: Recording error without replacement
- **WHEN** the clinician saves a valid reason with no replacement
- **THEN** the original becomes entered_in_error with one corrected revision and no replacement resource

#### Scenario: Previously resolved original
- **WHEN** an owned resolved original is explicitly corrected with its current revision
- **THEN** earlier resolved evidence remains unchanged and a new correction annotation marks the recording error without claiming reactivation or a new clinical outcome

#### Scenario: Draft and cancellation
- **WHEN** the correction editor is opened or canceled without Guardar corrección
- **THEN** no API write, state change, replacement or clinical revision occurs

### Requirement: R2 Atomic correction and protected ownership
The system SHALL implement correction within one owner/patient-scoped transaction, including original state, corrected revision and optional replacement/created revision/link. It SHALL preserve existing FDI/catalog/surface/note/active-identity rules and reject inaccessible resources without disclosure.

#### Scenario: Replacement cannot be created
- **WHEN** a replacement collides with another active exact identity or an insert/revision fails
- **THEN** no correction or replacement commits, the original status/revision stays unchanged, and a duplicate409 exposes only the owned existing record

#### Scenario: Invalid input or foreign access
- **WHEN** body validation fails, including invalid FDI, dentition mismatch, unknown code, incompatible surfaces, empty reason or extra authority fields
- **THEN** the command returns422 and commits nothing
- **WHEN** source, parent or colliding UUID belongs to another owner
- **THEN** it returns404 without foreign metadata and commits nothing

#### Scenario: Different surface extents
- **WHEN** a valid replacement overlaps surfaces of another active condition but is not the same canonical identity
- **THEN** existing overlap policy remains allowed without automatic clinical merge

### Requirement: R3 Revision and correction retry identity
The correction endpoint SHALL require operation_id UUID and expected_revision, return a stable revision receipt with201 first commit/200 identical retry, and reject incompatible replay409. Receipt lookup SHALL precede terminal-state rejection and be rechecked under source lock. New operations on entered_in_error originals SHALL fail409.

#### Scenario: Lost response and retry
- **WHEN** the same normalized command is retried after a successful correction whose response was lost
- **THEN** the same operation/source/revision/replacement receipt is returned without new resources or revisions, even if the replacement has since been edited

#### Scenario: Uncertain transport outcome
- **WHEN** saving has no authoritative response
- **THEN** operation_id and the full attempted body stay frozen for identical retry, local content is retained and leaving the draft does not claim to undo a possibly committed correction

#### Scenario: Changed replay
- **WHEN** an operation_id is reused with different source, expected_revision, reason or replacement payload
- **THEN** the system returns409idempotency_conflict and commits nothing

#### Scenario: Same operation ID racing across sources
- **WHEN** two commands reuse one owned operation_id concurrently for different original conditions
- **THEN** only one commits, the other fully rolls back and returns409idempotency_conflict after comparing the committed receipt rather than failing500 or partially correcting its source

#### Scenario: Same-operation concurrent retries
- **WHEN** two valid identical requests with the same operation_id race
- **THEN** one correction transaction commits and both successful receipts identify that single result

#### Scenario: Distinct operations or stale version
- **WHEN** distinct correction operations race on the same source revision, or edit/resolve has already advanced the source
- **THEN** only the applicable current revision commits and the losing request receives409 without lost data

### Requirement: R4 Truthful current and historical reading
The UI SHALL initially present active current records with explicit historical views for resolved and entered_in_error data. It SHALL retain exact record/history deep links, reason/link/revision metadata, and status text not conveyed only by color. API all SHALL continue to include all records and cursor scope SHALL reflect the requested filter.

#### Scenario: Corrected source and replacement
- **WHEN** correction succeeds and reads refresh
- **THEN** current view shows the replacement if present, not the error source as active; history shows original identity, reason, actor and accessible replacement link

#### Scenario: Empty current chart
- **WHEN** no active conditions are recorded or a read is incomplete/failed
- **THEN** the UI respectively states Sin registros actuales or an explicit incomplete/error state, never inferring a normal examination or showing failed reads as clinical absence

#### Scenario: Historical deep target
- **WHEN** a valid link opens a resolved/error record outside the first page or the selected dentition
- **THEN** that record is fetched through the owned exact-read endpoint and shown with its historical status and dentition without silently discarding a draft

#### Scenario: Legacy data and recurrence
- **WHEN** old created/edited/resolved revisions are read, or a new recurrence follows resolution
- **THEN** null new metadata is safe, old snapshots remain unchanged, and recurrence still creates a new UUID rather than reopening history

#### Scenario: Correction metadata and exact audit snapshot
- **WHEN** original, replacement and revisions are read
- **THEN** their nullable correction and supersedes_condition_id fields follow design.md's read DTO contract; the internal command_snapshot is not exposed and Activity contains no correction reason or note
- **WHEN** a receipt's exact revision is outside the first history page or the replacement has since changed
- **THEN** owned revision pages are read until that UUID is found and its snapshot is shown separately from current state; a failed page retries its cursor with GET only, and a missing target is explicit rather than substituted with latest

### Requirement: R5 Safe distinguishable author identity
The UI SHALL show the actual persisted actor on condition/history/Activity using a trusted display_name if available, otherwise a stable distinguishable account UUID label with accessible full identifier. It SHALL NOT fabricate a verified professional identity or disclose email/RUT.

#### Scenario: Name unavailable
- **WHEN** a revision has actor UUID but null display_name
- **THEN** it shows Usuario plus UUID abbreviation, expands colliding abbreviations and provides the full UUID through accessible disclosure instead of Autor no disponible

#### Scenario: Reading another revision
- **WHEN** a record is rendered under the authenticated session
- **THEN** displayed actor comes from that revision/resource, not the current session substituted into every event

### Requirement: R6 Responsive visual tooth selection
At1440×900,1280×800,1024×768,768×1024,430×932 and390×844, the UI SHALL support choosing every valid FDI visually with named focusable targets of at least44×44CSSpx and no horizontal page overflow. A quadrant-paged layout SHALL preserve anatomy, selected FDI/draft and dentition. Dropdown SHALL remain an alternative, not required repeated selection.

#### Scenario: Narrow usable chart
- **WHEN** sixteen accessible targets cannot fit in the available chart width
- **THEN** named quadrant navigation exposes up to eight permanent/five primary teeth with wrapping as needed, all quadrants are reachable and the overview is explicitly non-interactive where it cannot host valid targets

#### Scenario: Visual workflow and resize
- **WHEN** a clinician selects16 visually, chooses Caries/O, resizes or changes chart quadrant and saves
- **THEN** the draft retains16/O, no FDI lookup is required again, and the saved resource matches the reviewed draft

#### Scenario: Keyboard
- **WHEN** the clinician uses keyboard on quadrant/tooth/surface controls
- **THEN** focus is visible, selection state is exposed, Space activates native controls and pointer hover cannot mutate the draft

### Requirement: R7 Compact applicable editor
The editor SHALL keep clinical information explicit, selected FDI clear, immutable fields noneditable after creation, and relevant save/cancel controls adjacent. Whole-tooth codes SHALL show a concise no-surfaces statement instead of disabled surface controls. It SHALL retain labels, native checkbox semantics and touch targets.

#### Scenario: Whole-tooth condition
- **WHEN** a code does not support surfaces
- **THEN** Pieza completa, sin superficies is shown and payload surfaces remains[] with no five disabled options consuming space

#### Scenario: Note editing on mobile
- **WHEN** a short or long note is entered at390/430px
- **THEN** initial textarea shows at least four lines, controlled growth precedes internal scrolling, preview is at most96px high in narrow layout, text input is at least16px and Cancel/Guardar remain adjacent without fixed-overlay occlusion

### Requirement: R8 Field-aware manual conflict decisions
The UI SHALL preserve base/local/current snapshots after409, block saving while recovery is incomplete, show note/surface/status differences and require explicit choices for locally modified editable fields. Unmodified local fields SHALL use latest values; no automatic overwrite or generic whole-payload rebase is permitted. Correction SHALL use separate source review and renewed confirmation under D-03, not merge its replacement with original editable fields.

#### Scenario: Remote surfaces and local note
- **WHEN** tabA changes surfaces and tabB changes only note from the old revision
- **THEN** B shows the comparison, can explicitly keep its note while retaining A's current surfaces, and a reviewed retry saves with the latest expected_revision

#### Scenario: Same field and second race
- **WHEN** both actors change the same field, or current changes again before reviewed retry
- **THEN** the clinician explicitly chooses local/current for that field and another409 refreshes comparison while retaining unsaved content, never forcing a write

#### Scenario: Terminal source or unavailable latest
- **WHEN** an edit/resolve attempt encounters current resolved/error status
- **THEN** terminal records cannot be edited/rebased and read/discard is offered
- **WHEN** latest cannot be fetched for any command
- **THEN** read retry retains the draft and saving remains blocked

#### Scenario: Correction conflicts with resolution or another edit
- **WHEN** a correction receives revision_conflict and the latest original is active or resolved
- **THEN** reason/replacement are retained, base/current source evidence and status are reviewed, and explicit renewed confirmation freezes a new operation_id with the reviewed current expected_revision; no automatic retry, revision adoption or replacement/source field merge occurs
- **WHEN** the newly confirmed correction conflicts again
- **THEN** source review repeats with unsaved content retained

#### Scenario: Original already corrected
- **WHEN** a definitive conflict reveals an entered_in_error source
- **THEN** new correction is blocked and history/read/discard remain available
- **WHEN** an uncertain correction retries its identical committed operation
- **THEN** the existing receipt is returned before terminal rejection, without creating a new operation

### Requirement: R9 Safe URL and draft continuity
Ficha view changes SHALL persist existing tab=clinical, clinical=diagnosis|evolutions and focused condition UUID regardless of preexisting query parameters. Navigation SHALL preserve supported unrelated safe parameters and existing dirty guards. Clinical text or patient identifiers SHALL NOT enter URL/storage.

#### Scenario: Bare ficha to diagnosis and reload
- **WHEN** a bare ficha opens Clínica/Diagnóstico and a saved record, then reloads
- **THEN** diagnosis and focused record are restored from safe query state, with saved data intact

#### Scenario: Back or patient switch with draft
- **WHEN** back/forward/view/patient navigation is attempted with a dirty draft
- **THEN** existing confirmation guards run; canceled navigation restores prior URL/UI and accepted discard navigates without writing

#### Scenario: Invalid URL
- **WHEN** enum parameters are unknown or focused UUID is malformed
- **THEN** deterministic defaults apply, invalid resources are not fetched, and no untrusted text enters clinical content

### Requirement: R10 Scoped proof and preserved invariants
Future implementation SHALL provide fail-first contract/UI proofs, real Postgres atomicity/concurrency/ownership tests, browser evidence in all six sizes and existing regression checks. It SHALL separate mocks, source inspection and live proof and clean up only owned disposable resources.

#### Scenario: Verification coverage
- **WHEN** a slice is declared complete
- **THEN** its external behavior checkpoint and applicable guard cases pass; artifact validation or the previous audit alone is insufficient

#### Scenario: Real database gate is not skipped
- **WHEN** S1 atomicity/concurrency/ownership is declared proven
- **THEN** WORKSPACE_LIVE_TEST_DSN identifies a migrated owned disposable Postgres database and the required live cases executed without skips; unset DSN, mocked pools or missing live execution leave that gate incomplete

#### Scenario: Paging and many records
- **WHEN** synthetic fixtures contain1,50,51 or500records or a later page fails
- **THEN** complete reads/pagination maintain every active fact and error/incomplete status, with no silently truncated or false-empty chart; measurement does not imply an invented performance SLA

### Requirement: R11 Shared human application boundary
Record/edit/resolve/correct HTTP commands SHALL delegate to the patient-condition application boundary using the same domain validation and owner context, while SQL/locks/atomic rechecks remain in repositories. This change SHALL NOT register agent adapters or introduce a second clinical event store.

#### Scenario: Existing callers
- **WHEN** legacy valid create/edit/resolve requests or retries are sent
- **THEN** validated behavior, duplicate identity, surface overlap, no-op revision policy and ownership remain unchanged

### Requirement: R12 Clinical and agent expansions remain excluded
This change SHALL NOT infer normal examination, change taxonomy/surface obligation, introduce procedures/plans, implement simultaneous mixed view, add model context or enable tools. Permanent/primary coexistence SHALL remain intact. Deferred findings SHALL have explicit disposition in closeout documentation.

#### Scenario: Readiness claim
- **WHEN** this human-workflow change is implemented or its specification is validated
- **THEN** no agent-ready or clinical taxonomy certification is claimed; agent write still requires a separately approved proposal/approval/provenance specification

### Requirement: R13 Per-record commit and truthful post-save continuity
Create, edit, resolve and correct SHALL commit individual reviewed records, not an entire examination. The UI SHALL follow the visual acceptance contract in design.md appendix A, retain selected context, focus the exact returned result and announce the outcome once. Next actions SHALL be deliberate without automatic Assistant submission or evolution creation.

#### Scenario: Confirmed result
- **WHEN** a command succeeds
- **THEN** dirty state clears after confirmation; create/edit focuses the result, resolution shows the historical result, and correction focuses its replacement or historical source if no replacement exists

#### Scenario: Saved but refresh failed
- **WHEN** a confirmed write is followed by failed read
- **THEN** feedback distinguishes saved data from an outdated view and offers GET-only retry without repeating the write or claiming an empty chart

#### Scenario: Uncertain write or late response
- **WHEN** a write lacks an authoritative response
- **THEN** attempted payload and retry identity remain retained according to the command contract; correction freezes its operation UUID and body
- **WHEN** a late response belongs to the previous patient
- **THEN** it cannot repaint the new patient or claim their data was saved

### Requirement: R14 Consistent clinical symbols and visual grouping
The UI SHALL retain the twelve-concept catalog and original Assistant identity. Concept, persisted status, draft, focus and hover SHALL remain distinct per the visual acceptance contract (design.md appendix A) with explicit labels and a compact visible status legend. FDI grouping SHALL preserve individual records/actions, without a card per field.

#### Scenario: Status and counts
- **WHEN** active, resolved, entered_in_error or draft data is displayed
- **THEN** symbol meaning remains stable, text distinguishes status and historical error never looks active
- **WHEN** complete filtered data contains eight conditions on five pieces
- **THEN** optional counts distinguish these units and exclude drafts; incomplete reads never imply complete totals

### Requirement: R15 Visual reference and spatial continuity
The visual acceptance contract in design.md appendix A SHALL guide composition. Future production proof SHALL cover six R6 sizes, its state matrix, long/short names and notes, both dentitions, and existing desktop Assistant panel open/closed at actual available widths.

#### Scenario: Anatomical linking
- **WHEN** an exact record or quadrant is activated
- **THEN** anatomical order follows the visual acceptance contract; explicit record activation selects its FDI/dentition subject to dirty guards, while hover only highlights and never changes draft or note linkage
- **WHEN** another quadrant is displayed
- **THEN** draft FDI remains explicit and clinical records are not silently filtered to that quadrant

#### Scenario: Reference proof boundary
- **WHEN** layout-only or synthetic checks pass
- **THEN** evidence does not claim production persistence, API/DB correctness, assistive technology or virtual-keyboard proof; mobile retains the existing full Assistant route

#### Scenario: Existing navigation compatibility
- **WHEN** an existing clinical=evolutions link or evolution detail path opens
- **THEN** existing links remain valid, detail paths take precedence, and otherwise valid clinical selects the view with diagnosis as absent/invalid default; no clinicalView alias is introduced
- **WHEN** navigation leaves diagnosis or the clinical tab
- **THEN** condition is cleared on leaving diagnosis, clinical is also cleared on leaving the tab and exact condition reads only run in diagnosis

### Requirement: R16 Backend-owned extensible Condition catalog
The system SHALL consolidate current labels, category grouping and applicability in typed backend Condition definitions, with catalog serialization and application validation using those definitions. It SHALL preserve the exact twelve codes, labels/order, both dentitions, canonical surfaces and existing optional-empty-surface rules. The existing version1 catalog SHALL retain its fields and add categories and entry category_key/allowed_dentitions as defined in design decision9. Category SHALL be presentation grouping, not a new entity or lifecycle authority. Backend validation and immutable SQL constraints SHALL remain authoritative.

#### Scenario: Twelve-concept contract and migrated database agreement
- **WHEN** the authenticated catalog is read and create/edit/correct validation is exercised for the twelve codes in permanent and primary dentition
- **THEN** labels/applicability agree with the shared definitions; only caries, incipient_caries, pigmentation and fracture allow nonempty M,D,O,V,L subsets, all allow an empty list, and migrated database acceptance/rejection agrees without changing active uniqueness, overlap, revision or retry semantics

#### Scenario: Legacy catalog response and request compatibility
- **WHEN** an existing version1 consumer reads the additive catalog or a new consumer receives a legacy version1 response without additive metadata
- **THEN** existing fields/behavior remain valid and the new presentation boundary normalizes the single diagnosis group and both incumbent dentitions without inventing labels or surfaces
- **WHEN** a mutation supplies category, icon, draft status or other authority extras
- **THEN** the request remains invalid and no clinical state is persisted

#### Scenario: Future persisted vocabulary change
- **WHEN** a later approved change adds a persistable code or changes applicability
- **THEN** it updates domain definitions and adds the required schema migration and drift proofs; historical migrations do not import mutable runtime definitions, and this change does not add a thirteenth code or remove current CHECKs

### Requirement: R17 Shared presentation and bounded family preparation
Palette, chart, inspector, list, concept legend and history SHALL consume one catalog resolution/presentation boundary with independent original symbol geometry and status adornments. Only the populated diagnosis group SHALL ship now. No empty family tabs, Procedure/planning semantics, multi-tooth authoring or per-concept statusBehavior SHALL be introduced. Selection/drafts/44px controls and R1–R15 SHALL remain intact.

#### Scenario: Synthetic extension without component rewrites
- **WHEN** a component fixture supplies an extra server-supported Condition entry in a populated synthetic category with supported single-condition applicability and no dedicated glyph
- **THEN** all six views show consistent server labels, applicability and neutral symbol fallback without per-view code lists or status changes; production catalog and DB remain the original twelve codes

#### Scenario: Unknown saved concept or category
- **WHEN** saved evidence has a code absent from catalog or a category is unfamiliar to the frontend
- **THEN** saved identity/surfaces/status/history remain visible; absent codes show Condición no reconocida plus escaped code, supported entries without geometry show Símbolo no disponible, and category descriptors are rendered or explicitly fall back without granting new command semantics
- **WHEN** an absent code is proposed for create/edit/replacement
- **THEN** fallback does not authorize that mutation; existing lifecycle-only resolve/correct-without-replacement rules still apply

#### Scenario: Catalog failure does not hide evidence
- **WHEN** catalog reading fails or applicability metadata is malformed while condition/history reads succeed
- **THEN** owned saved facts remain visible with explicit catalog error and GET-only retry; unsupported authoring is blocked, drafts/attempts remain retained, and frozen uncertain retries follow the unchanged command contract

#### Scenario: Optional surfaces are not whole-tooth reclassification
- **WHEN** a surface-capable record has surfaces[]
- **THEN** editor/list/history describe Sin superficies especificadas and do not reinterpret it as a whole-tooth finding or require a surface
- **WHEN** a whole-tooth code is selected
- **THEN** only Pieza completa, sin superficies is shown and nonempty surfaces remain rejected by backend

#### Scenario: Category navigation and container reflow
- **WHEN** a populated category is navigated or the Assistant changes available container width
- **THEN** category navigation alone never selects a new concept, mutates note/FDI, discards a draft or writes; piece/surface keyboard targets, focus, both dentitions and resize continuity retain R6/R15 behavior
