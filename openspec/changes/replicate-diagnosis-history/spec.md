# Consolidated change requirements

Generated reading copy; capability deltas under specs/ are normative.

# Capability: dental-diagnosis-workspace

## ADDED Requirements

### Requirement: D1 Clinical mode and route continuity
The patient workspace SHALL add Spanish Historial navigation beside incumbent Diagnóstico and Evoluciones, with explicit tab=clinical/clinical=history and an optional safe date/dentition query. Refresh, new-tab arrival and back/forward SHALL agree with visible selection. Existing clinical record/evolution/legacy plan links and transition guards SHALL remain supported. No Treatment Plans or Appointments authoring/navigation SHALL be introduced by this change.

#### Scenario: Reload an exact historical date
- **WHEN** an authorized patient link with tab=clinical, clinical=history and at=2026-10-03 is opened or reloaded
- **THEN** Historial and that date are selected, no current Diagnosis editor is created and no unrelated Summary tab is shown.

#### Scenario: Dirty or uncertain work on departure
- **WHEN** the clinician leaves Diagnosis for History with an edited record, note draft or uncertain command
- **THEN** the incumbent save/discard/stay or reconciliation policy executes before unmount, canceled navigation retains the same work and no command identity is regenerated or silently lost.

#### Scenario: Existing evolution or plan evidence link
- **WHEN** an incumbent evolution path or legacy plan link with history=1 is opened
- **THEN** its original read/approval/evidence contract remains intact and it is not reinterpreted as the new temporal dental mode.

### Requirement: D2 Grouped diagnosis summary and retained chart behavior
Diagnosis SHALL retain current anatomical charts, 32 permanent/20 primary FDI pieces, twelve findings, all enabled incumbent procedure variants, eight categories and direct-application and edit/resolve semantics plus explicit deletion. The grouped records summary SHALL be an accessible accordion with unique filter-aware record counts, individual identities/surfaces/states and explicit incomplete-read status. Tool selection, category navigation, inspection and hover SHALL NOT write.

#### Scenario: Collapse without discarding context
- **WHEN** the grouped summary is collapsed and reopened while a note draft or inspection context exists
- **THEN** expanded state and title/count remain truthful and the draft/context are not recreated or reassigned.

#### Scenario: Filtered or incomplete record set
- **WHEN** dentition/status changes or a later record page fails
- **THEN** the summary uses the selected filters, distinguishes records/teeth/arches, and does not certify a partial page as a complete total.

#### Scenario: Direct and modal application remain distinct
- **WHEN** an active whole-tooth tool, direct occlusal surface or lateral surface tool is used
- **THEN** existing direct-apply/Confirmar semantics and retry-safe command identities remain, zero selected modal surfaces disable Confirmar and a saved-record edit still requires Guardar.

### Requirement: D3 Contextual notes through one owner
Diagnosis SHALL expose contextual notes from grouped records through the existing note hook/composer and rail/Sheet. Procedure notes SHALL bind to the actual procedure; finding entry SHALL be labelled as patient/optional-tooth context rather than a fabricated per-condition note collection. Counts, templates and revisions SHALL follow the existing note APIs; procedure-context writes SHALL obey deletion-design.md parent-lock and tombstone guards while general/tooth note policy remains unchanged. No new attachment or recall affordance SHALL be added.

#### Scenario: Two findings on one tooth
- **WHEN** either finding opens tooth-context notes
- **THEN** the label/count states the tooth scope without attributing the shared collection exclusively to that condition and the condition's embedded Notes field remains separate.

#### Scenario: Resize with a dirty note
- **WHEN** available width crosses the existing 1160px rail threshold
- **THEN** the rail/Sheet presents the same draft, binding, attempt and feed, restores focus on close and does not open IA or create another composer.

#### Scenario: Save error or revision conflict
- **WHEN** a note or saved clinical record save fails/conflicts
- **THEN** its draft and stable operation/revision context remain available for the existing retry/reconciliation flow without double save, auto-save or silent discard.

### Requirement: D4 Scoped motion and guarded overlay lifecycle
Dental controls SHALL implement the 150ms card/tooth/category and 200ms pulp/modal contracts defined in design.md, with explicit reduced-motion behavior and no new global UI timing. Read-only History SHALL not arm tool previews. Nested delete/dirty confirmations SHALL suspend the parent trap/popover; close gestures SHALL preserve busy/uncertain/dirty rules and record identity until exit completes.

#### Scenario: Surface selection then cancellation
- **WHEN** a surface modal is opened, M/O selected and cancellation allowed
- **THEN** drawings/chips/count agree, only the modal owns trapped focus, exit never shows tooth zero and focus returns to a connected trigger or stable fallback without a clinical write.

#### Scenario: Nested Escape consumption
- **WHEN** Escape cancels an allowed delete confirmation above a dirty record editor
- **THEN** only the top confirmation closes, its parent draft and underlying tool intent remain intact, focus returns to Eliminar and the event does not dismiss the parent.

#### Scenario: Reduced motion
- **WHEN** reduced motion is enabled while a card, tooth, date or modal is activated
- **THEN** translation/scale/decorative pulses are absent, state and focus feedback remain immediate and required controls stay operable.

#### Scenario: Narrow content and dock
- **WHEN** the patient pane is narrow, zoomed to 200% or resized with Notes/Assistant available
- **THEN** 44px targets and focus remain reachable, independent floating actions have at least 8px separation clear of the dock, labels remain inspectable and page-level horizontal overflow is absent.

## MODIFIED Requirements

### Requirement: W3 Reference application and recovery
Hover, focus and tool activation SHALL NOT persist clinical data. D03 anatomical activation SHALL commit according to the reference: whole-tooth click or direct occlusal surface click applies; lateral surface-tool activation opens a compact selector and Confirmar applies. Saved-record editing SHALL use explicit save with revision/conflict protections and explicit confirmed deletion.

#### Scenario: Lateral surface selection
- **WHEN** Caries is selected and the lateral view of tooth16 is activated
- **THEN** a compact anatomical surface modal opens; selecting M/O and Confirmar creates exactly one finding, clears tool intent and displays its receipt without an extra Guardar step.

#### Scenario: Occlusal direct application
- **WHEN** Caries is selected and surface M of tooth16 is activated
- **THEN** one M finding is applied directly, using a stable create identity, without an intermediate editor or confirmation added to this source path.

#### Scenario: Whole-tooth direct application
- **WHEN** Pulpitis or bracket is selected and tooth16 is activated
- **THEN** the appropriate finding/procedure is committed directly, a pending operation blocks duplicate activation and success clears the tool; Eliminar registro opens the explicit deletion confirmation and retains a deleted audit event rather than creating entered_in_error.

#### Scenario: Timeout and edit cancellation
- **WHEN** an application response is uncertain or a saved-record edit is dirty
- **THEN** the exact operation/draft remains recoverable, retry does not duplicate, and dirty edit navigation offers save/discard/remain without changing the successful create flow.

### Requirement: W8 Deep Module ownership and shared caller Seam
The workspace SHALL expose coherent small Interfaces for dental interaction, presentation, notes, explicit deletion and historical plan reads as defined in this change design and deletion-design. UI callers SHALL emit intent and render committed models without duplicating transport/retry, visual registries or lifecycle rules. Callers and behavior tests SHALL cross the same public Seam; backend commands SHALL accept persistence dependencies and preserve server ownership/transaction invariants.

#### Scenario: Public journey through one owner
- **WHEN** PatientDetail renders diagnosis and the clinician inspects, applies, retries and opens the note rail
- **THEN** the public workspace Modules own the resulting state and commands, each gesture has one command owner, and switching rail/Sheet retains one composer without a duplicate request or binding reset.

#### Scenario: Shared clinical rendering
- **WHEN** a variant appears in palette, chart, legend and record history
- **THEN** they resolve one clinical/visual registry and preserved historical aliases without contradictory labels, scope or marks.

### Requirement: W9 Verified retirement without historical loss
The implementation SHALL perform the expand→migrate→contract cleanup in this change design and deletion-design after all replacement consumers pass the integrated journey. Superseded lower create-editor, forced focus, geometry and parallel palette/rail paths SHALL have zero active consumers and be removed. Historical conditions/general notes, IDs, revisions, legacy correction revision reads, new deletion retry and accessibility SHALL remain supported. This change SHALL NOT drop historical schema or depend on destructive migration rollback.

#### Scenario: Retire old create interaction
- **WHEN** integrated replacement tests pass and the removal slice is verified
- **THEN** tooth activation has one mirror interaction, no Cambiar pieza/lower create editor or forced-scroll path remains, and source searches plus browser replay identify no live consumer of the retired handlers.

#### Scenario: Existing data after cleanup
- **WHEN** the patient with pre-change findings, corrections and general notes reloads after cleanup
- **THEN** original IDs/revisions/history and authorized deep links remain reachable alongside eligible observed procedures, retained read-only plan evidence and dental notes; no new plan authoring is introduced.

#### Scenario: Application rollback
- **WHEN** application code is rolled back after new clinical records were written
- **THEN** new tables/revisions/receipts remain intact, a deletion-aware reader/guard floor remains in use and recovery does not execute a destructive down migration.

# Capability: odontogram-human-workflow

## REMOVED Requirements


### Requirement: R1 Explicit error correction distinct from resolution
**Reason**: The user replaced new recording-error removal/correction with explicit deletion, not entered_in_error.
**Migration**: Use patient-dental-record-deletion X1-X6. Preserve stored correction/replacement read evidence; all legacy correction POST operations return owned 410 without replay under X6 demo cutover.


### Requirement: R2 Atomic correction and protected ownership
**Reason**: The user replaced new recording-error removal/correction with explicit deletion, not entered_in_error.
**Migration**: Use patient-dental-record-deletion X1-X6. Preserve stored correction/replacement read evidence; all legacy correction POST operations return owned 410 without replay under X6 demo cutover.


### Requirement: R3 Revision and correction retry identity
**Reason**: The user replaced new recording-error removal/correction with explicit deletion, not entered_in_error.
**Migration**: Use patient-dental-record-deletion X1-X6. Preserve stored correction/replacement read evidence; all legacy correction POST operations return owned 410 without replay under X6 demo cutover.


## MODIFIED Requirements


### Requirement: R4 Truthful current and historical reading
The UI SHALL initially present active current records with explicit historical views for resolved and entered_in_error data. It SHALL retain exact record/history deep links, reason/link/revision metadata, and status text not conveyed only by color. API all SHALL include all non-deleted records in its clinical-status scope; owned deleted targets SHALL remain readable as read-only tombstones and cursor scope SHALL reflect the requested filter.

#### Scenario: Corrected source and replacement
- **WHEN** a legacy correction is inspected or a new deletion succeeds and reads refresh
- **THEN** legacy replacement/error relationships retain their meaning; deletion omits only the deleted source from current views and adds its deleted event, author/time and exact prior snapshots without an error label

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

### Requirement: R8 Field-aware manual conflict decisions
The UI SHALL preserve base/local/current snapshots after409, block saving while recovery is incomplete, show note/surface/status differences and require explicit choices for locally modified editable fields. Unmodified local fields SHALL use latest values; no automatic overwrite or generic whole-payload rebase is permitted. Deletion SHALL retain the saved-source revision and separate parent edit draft, require explicit renewed review after a definitive stale-version conflict, and never rebase deletion automatically.

#### Scenario: Remote surfaces and local note
- **WHEN** tabA changes surfaces and tabB changes only note from the old revision
- **THEN** B shows the comparison, can explicitly keep its note while retaining A's current surfaces, and a reviewed retry saves with the latest expected_revision

#### Scenario: Same field and second race
- **WHEN** both actors change the same field, or current changes again before reviewed retry
- **THEN** the clinician explicitly chooses local/current for that field and another409 refreshes comparison while retaining unsaved content, never forcing a write

#### Scenario: Terminal source or unavailable latest
- **WHEN** an edit/resolve attempt encounters current resolved/error/deleted state
- **THEN** terminal records cannot be edited/rebased and read/discard is offered
- **WHEN** latest cannot be fetched for any command
- **THEN** read retry retains the draft and saving remains blocked

#### Scenario: Delete conflicts with resolution or another edit
- **WHEN** deletion receives revision_conflict
- **THEN** saved base/current source evidence is reviewed, local unsaved content remains and a new operation is permitted only after explicit confirmation of the fresh saved revision; no automatic delete replay against a newer revision occurs.

#### Scenario: Deleted or legacy terminal resource
- **WHEN** the current source is deleted or entered_in_error
- **THEN** new writes are unavailable, historical evidence remains reachable and an exact already committed active command can reconcile its original receipt before terminal rejection; retired correction POST calls always follow X6.


### Requirement: R9 Safe URL and draft continuity
Ficha view changes SHALL persist existing tab=clinical, clinical=diagnosis|history|evolutions with safe at date/dentition and focused condition UUID regardless of preexisting query parameters. Navigation SHALL preserve supported unrelated safe parameters and existing dirty guards. Clinical text or patient identifiers SHALL NOT enter URL/storage.

#### Scenario: Bare ficha to diagnosis and reload
- **WHEN** a bare ficha opens Clínica/Diagnóstico and a saved record, then reloads
- **THEN** diagnosis and focused record are restored from safe query state, with saved data intact

#### Scenario: Back or patient switch with draft
- **WHEN** back/forward/view/patient navigation is attempted with a dirty draft
- **THEN** existing confirmation guards run; canceled navigation restores prior URL/UI and accepted discard navigates without writing

#### Scenario: Invalid URL
- **WHEN** enum parameters are unknown or focused UUID is malformed
- **THEN** deterministic defaults apply, invalid resources are not fetched, and no untrusted text enters clinical content

### Requirement: R13 Per-record commit and truthful post-save continuity
Create, edit, resolve and delete SHALL commit individual reviewed records, not an entire examination. The UI SHALL follow the visual/deletion contracts of this change, retain selected context, focus the exact returned result and announce the outcome once. Next actions SHALL be deliberate without automatic Assistant submission or evolution creation.

#### Scenario: Confirmed result
- **WHEN** a command succeeds
- **THEN** dirty state clears after confirmation; create/edit focuses the result, resolution shows the historical result, and deletion refreshes its current marks/counts then returns focus to the initiating tooth or stable fallback with Ver historial available

#### Scenario: Saved but refresh failed
- **WHEN** a confirmed write is followed by failed read
- **THEN** feedback distinguishes saved data from an outdated view and offers GET-only retry without repeating the write or claiming an empty chart

#### Scenario: Uncertain write or late response
- **WHEN** a write lacks an authoritative response
- **THEN** attempted payload and retry identity remain retained according to the command contract; deletion freezes its operation UUID and body
- **WHEN** a late response belongs to the previous patient
- **THEN** it cannot repaint the new patient or claim their data was saved

# Capability: patient-dental-history

## ADDED Requirements

### Requirement: H1 Owned historical dental projection
The system SHALL expose authenticated patient/dentition-scoped history and as-of snapshot GET APIs over stored condition/procedure revisions. Reads SHALL have no clinical writes, provider calls or command receipts. Unknown and foreign patients SHALL be indistinguishable through 404 responses, including their counts and coverage metadata.

#### Scenario: Later correction does not rewrite a past chart
- **WHEN** an owned finding was created on day A and corrected/replaced on day B and a snapshot for A is requested
- **THEN** the response contains the last eligible original revision, excludes the future replacement and current edited values, and retains the original resource identity and historical surfaces/note/state.

#### Scenario: Deletion preserves earlier knowledge
- **WHEN** a record exists on day A and is deleted on day B
- **THEN** day A retains its last eligible saved snapshot regardless of today's tombstone, day B/current excludes its chart contribution, and the audit exposes deleted action, actor and timestamp without relabelling it entered_in_error or resolved.

#### Scenario: Unauthorized patient
- **WHEN** a second owner requests history, snapshot or cursor pages for that patient
- **THEN** each request returns 404 without patient events, snapshots, counts or completeness information and no persistent row changes.

#### Scenario: Procedure scope and historical state
- **WHEN** a stored multi-tooth, whole-arch, planned, performed, cancelled or entered-in-error procedure is reconstructed
- **THEN** its historical snapshot retains member roles, surfaces, arch, provenance, label and truthful state without enabling a new plan/execution command or inventing tooth zero.

### Requirement: H2 Clinical date and evidence semantics
The system SHALL define a selected YYYY-MM-DD as recorded knowledge before the next clinical day starts in America/Santiago, using timezone-aware cutoffs. An absent date SHALL mean the current committed view. The timeline, tooltip, heading and event grouping SHALL use the same server clinical-date interpretation. History SHALL NOT imply a disease onset date or fabricate an unrecorded baseline.

#### Scenario: Midnight and daylight-saving boundaries
- **WHEN** revisions straddle a Chilean clinical-day or DST boundary
- **THEN** the same UTC event belongs to one matching clinical date in all labels and inclusion rules, without a one-day shift or an assumed fixed 24-hour day.

#### Scenario: Missing or invalid selection
- **WHEN** no date is supplied
- **THEN** the view is labelled Estado actual and uses current committed evidence.
- **WHEN** a malformed/future date is supplied
- **THEN** validation is recoverable and the system does not silently render current records as the requested past date.

#### Scenario: Empty or incomplete provenance
- **WHEN** no stored revisions exist or a known eligible record lacks an initial revision
- **THEN** the system distinguishes an empty history from partial coverage, exposes only supported historical fields and does not infer missing past fields from current rows.

### Requirement: H3 Coherent bounded historical reads
History and snapshot pages SHALL use bounded keyset pagination and a dataset epoch bound to owner/patient/dentition, the revision set and coverage-relevant missing-initial-revision/orphan markers. Each response SHALL select events/snapshots/totals/coverage in one read-only repeatable-read transaction. A changed epoch SHALL produce 409 history_changed; no client SHALL merge pages from different epochs or patients.

#### Scenario: New commit between pages
- **WHEN** another clinical revision commits between the first and subsequent read, including one with an earlier changed_at
- **THEN** the subsequent epoch-bound read reports history_changed, preserves the previous complete display with a stale notice and offers explicit refresh at the same selected date.

#### Scenario: Later snapshot page fails
- **WHEN** a requested date's first chart page loads but a later page fails
- **THEN** the chart does not claim complete absence or a complete requested-date total, the last complete chart retains its own date label, and the failed read can be retried without writes.

#### Scenario: Cursor replay across scope
- **WHEN** a cursor is replayed with a different date, dentition, patient or owner
- **THEN** authorization and cursor validation reject the mismatch without leaking data or mixing datasets.

### Requirement: H4 Strictly read-only temporal inspection
The History component SHALL use shared anatomical/presentation modules through a read-only Interface, without mounting current-record command hooks or editable note composers. Tooth activation SHALL remain inspectable by pointer/keyboard. Inspection SHALL show only the selected revision's data and explicit historical context, without Registrar, Editar, Guardar, Corregir, Deshacer, Eliminar or write callbacks.

#### Scenario: Open a historical tooth
- **WHEN** a clinician activates a historical piece and its condition/procedure
- **THEN** accessible inspection shows anatomy, surfaces, historical note/state and revision context, with zero mutation requests and no editor opened.

#### Scenario: Historical note versus current feed
- **WHEN** the clinician views an earlier chart
- **THEN** an embedded note comes from that revision; today's contextual notes are not presented as past evidence, and editing notes requires an explicit departure to current Diagnosis.

#### Scenario: Current state inside History
- **WHEN** Volver al estado actual is activated
- **THEN** at is removed, the committed current read is refreshed and History remains read-only without changing to Diagnosis.

### Requirement: H5 Navigable timeline and truthful counts
History SHALL expose selectable recorded clinical days, an explicit current-state position, selected-day changes and a paginated audit list. Loaded date ranges SHALL be distinguished from complete history. The event GET SHALL support an optional day filter with independent selected-day cursor/total and the same dataset epoch; exact dates SHALL not depend on loaded timeline pages. Snapshot items/counts SHALL follow history-read-contract.md: unique non-deleted kind/resource records; planned/existing/performed procedure marks count as chart eligible; affected-tooth/arch counts use distinct drawable scope; tombstones are excluded from snapshot items and counted only in deleted_records/audit. Deleted records SHALL contribute only to explicit deleted_records/audit totals, never current chart totals. Event totals SHALL count revisions and SHALL NOT be labelled as record totals.

#### Scenario: Shared bridge identity
- **WHEN** a reconstructed bridge spans three teeth
- **THEN** the record total increases by one, the tooth total reflects its three members and every displayed member opens the same historical resource.

#### Scenario: Keyboard navigation and unloaded date
- **WHEN** keyboard controls traverse the loaded timeline or an exact date link is outside the loaded event window
- **THEN** the selected label is explicit, Home/End/Arrow behavior follows the loaded discrete set, older dates remain loadable and the exact requested snapshot loads independently of event-page position.

#### Scenario: Selected day outside loaded timeline
- **WHEN** the selected at date is outside loaded unfiltered event pages or contains more events than one page
- **THEN** day=at directly returns only that day with an independent total/cursor, zero events is distinct from failed/unloaded reads, and cursor reuse across day/at/reader bindings fails 422.

#### Scenario: Planned marks and tombstones
- **WHEN** a selected snapshot contains a planned bridge and a deleted finding
- **THEN** the bridge contributes one record and charted record plus its distinct member teeth; the tombstone is absent from items and chart, contributes one deleted_records, and remains inspectable through its event/revision.

#### Scenario: Date with corrections
- **WHEN** a selected day contains created/edited/resolved/corrected/deleted revisions
- **THEN** changes use their actual actions and contexts, not a generic Completed treatment label, and exact revision inspection does not replace the chosen as-of date.

### Requirement: H6 Historical evidence remains additive
The history implementation SHALL reuse append-only clinical snapshots, preserve all record/revision IDs and support retained historical states and aliases. Storage changes SHALL use additive temporal indexes and the explicit deletion schema contract, retaining snapshots and identities. Application rollback SHALL preserve clinical evidence; incomplete legacy evidence SHALL be labelled, not backfilled with fabricated history.

#### Scenario: Roll back the new reader
- **WHEN** the new application reader is withdrawn after clinicians have used History
- **THEN** a deletion-aware Diagnosis reader remains the rollback floor and record revision endpoints continue to work and no record, receipt, historical plan or revision is dropped or rewritten.

# Capability: patient-dental-record-deletion

## ADDED Requirements

### Requirement: X1 Explicit deletion distinct from clinical status
The system SHALL let the clinician delete an eligible saved finding/procedure from its odontogram edit modal through a visible Eliminar action and one named confirmation. Deletion SHALL remove that resource from current records/marks, retain a deletion audit and SHALL NOT create entered_in_error, corrected or resolved clinical semantics. No mandatory error reason SHALL be required.

#### Scenario: Saved Caries removal
- **WHEN** the clinician opens one saved Caries record from a tooth and confirms Eliminar
- **THEN** only that saved UUID's current record and marks disappear, one deleted revision/receipt is recorded with author/time, and other records on the tooth remain.

#### Scenario: Unsaved or read-only context
- **WHEN** a creation/surface draft, temporal History, deleted record or plan-linked/performed procedure is inspected
- **THEN** deletion is unavailable and no delete command can be dispatched from that context; History current-state remains read-only.

### Requirement: X2 Precise scope and draft-safe confirmation
Delete SHALL identify the persisted resource, saved surfaces and complete multi-tooth/arch scope independently of local unsaved edits. Cancel/Escape SHALL preserve the parent draft, focus and context with zero writes. Confirmation SHALL explain retained history, lack of product restoration and unsaved-edit consequences; only authoritative success discards local edits.

#### Scenario: Dirty note and surfaces
- **WHEN** a clinician changes unsaved note/surfaces and opens then cancels Eliminar
- **THEN** the same draft is restored without save, deletion or new correction state.
- **WHEN** that deletion is confirmed
- **THEN** it deletes the last saved revision through the reviewed expected revision without auto-saving the local draft first.

#### Scenario: Multi-tooth procedure
- **WHEN** one bridge is selected through any member's inspection
- **THEN** the confirmation names all members, the command targets the one procedure and successful deletion removes its marks across members while retaining unrelated records.

### Requirement: X3 Atomic owner-scoped idempotent deletion
Deletion SHALL require operation_id and expected_revision, run owner/parent checks, resource lock, tombstone, deleted revision and durable receipt in one transaction. Active-command replay SHALL use the existing owner/operation namespace, canonical version-1 delete hash and operation advisory lock defined in deletion-design.md. Exact replay SHALL return the same HTTP 200 receipt before terminal rejection; changed replay SHALL fail 409. Retired condition-correction revision receipts SHALL not be imported or consulted. New deletion of a stale/deleted/ineligible resource SHALL not overwrite newer data. Identity and actor authority SHALL come from the session and path.

#### Scenario: Lost response and repeated confirmation
- **WHEN** identical concurrent requests or a retry after response loss use the same operation/body
- **THEN** one deletion/revision commits, all successful receipts identify it, and uncertain UI retains that operation instead of generating another UUID.

#### Scenario: Stale edit or foreign patient
- **WHEN** another edit/resolve/delete already changed the source revision
- **THEN** deletion fails with an owned conflict and explicit fresh review is required without automatic rebase.
- **WHEN** the parent/resource is inaccessible
- **THEN** 404 reveals no foreign metadata or side effects.

### Requirement: X4 Consistent current and historical reads
All current-list/status-all/count/duplicate/write guards SHALL account for deletion markers. Exact owned links SHALL show a deleted read-only tombstone. History before deletion SHALL retain the original snapshot; after deletion SHALL show a deleted event and omit current marks. Same-key recurrence SHALL use a new UUID; replaying an earlier create SHALL not restore a deleted resource.

#### Scenario: Reload and historical date
- **WHEN** a successful deletion is followed by reload and earlier/current temporal reads
- **THEN** current totals exclude the record, earlier snapshots retain it, Activity/History identify the deletion once, and no current-row deletion filter erases its past snapshots.

#### Scenario: Same clinical key after deletion
- **WHEN** a new UUID records the same tooth/code/surfaces after deletion while the original create is replayed
- **THEN** uniqueness permits the new eligible record, the old UUID stays deleted and no old response repaints it as a fresh active save.

### Requirement: X5 Preserve related evidence and rollback compatibility
Deletion SHALL retain embedded notes, linked notes, members, revisions and legacy correction/replacement references. Finding deletion SHALL not delete patient/tooth notes. Deleted-procedure context SHALL remain readable, clearly labelled and unavailable for new contextual writes. Application rollback SHALL retain a reader/guard version that understands deletion markers; no physical purge, destructive downgrade or silent resurrection is allowed.

#### Scenario: Notes and old links survive
- **WHEN** a procedure with clinical notes is deleted
- **THEN** notes remain readable with Procedimiento eliminado context, no new note binds to that tombstone and old exact history links remain owned and usable.

#### Scenario: Historical data and rollback floor
- **WHEN** existing entered_in_error/replacement data is read or the deletion writer must be rolled back
- **THEN** legacy history is not relabelled/backfilled and the rollback floor understands deleted_at before any old writer can resume.

#### Scenario: Protected procedures and note race
- **WHEN** deletion races a protected procedure transition, an unrelated add-item command or a procedure-context note write
- **THEN** linked/ancestral plan work is rejected without acquiring a plan lock, add-item creates a different planned UUID, and procedure FOR UPDATE versus note-context FOR KEY SHARE serializes deletion and note eligibility without cascading note loss.

### Requirement: X6 Retire new recording-error mutations
The system SHALL replace active recording-error/removal and replacement-wizard callers with explicit deletion, including after-create undo. Under the user-confirmed demo cutover, both legacy correction POST endpoints SHALL check authentication/path/ownership then return 410 correction_workflow_retired without body parsing, receipt replay or writes. Historical correction records/revisions SHALL remain readable and unmodified. The implementation SHALL not reset the running database or build a cross-store compatibility bridge.

#### Scenario: Old correction call with any operation
- **WHEN** an authorized owned correction endpoint is called with a new, previously committed or mismatched operation payload
- **THEN** it returns 410 without a new revision or receipt, no prior correction receipt is replayed and no request is silently translated to deletion.
- **WHEN** the parent/resource is foreign or missing
- **THEN** 404 discloses no receipt or resource metadata.

#### Scenario: Legacy namespace and demo cutover
- **WHEN** an old condition-correction UUID exists only in the retired revision namespace
- **THEN** new deletion identity is governed solely by patient_clinical_commands; reuse of a UUID already present in that active table conflicts unless its delete hash matches exactly.
- **WHEN** the demo runtime is updated
- **THEN** old writers stop, the complete deletion-aware application is deployed and clients reload; no production continuity, data reset or historical relabelling is inferred.

# Capability: patient-dental-treatments

## MODIFIED Requirements

### Requirement: T5 Non-destructive corrections and complete reads
The system SHALL retain actor/time/before/after revisions, delete eligible observed-existing procedures atomically with a tombstone and deletion revision, preserve performed evidence and provide cursor-bound complete reads with honest totals and read failure states. History SHALL NOT be destructively deleted.

#### Scenario: Delete observed work without cascading
- **WHEN** an authorized clinician confirms deletion of an existing observed procedure at its current revision
- **THEN** one deleted revision/receipt is committed, its current marks/count contribution disappear, related notes and all prior evidence remain and no entered_in_error, plan reopening/cancellation or physical purge occurs.

#### Scenario: Historical correction or protected linked work
- **WHEN** historical correction/replacement or performed/plan-linked work is read
- **THEN** it remains truthful and read-only; no new error correction or delete command alters protected performed/plan evidence.

#### Scenario: Later page fails
- **WHEN** a paged treatment/history read fails after a successful page
- **THEN** the UI reports incomplete/unavailable state and retry rather than claiming complete counts or silently hiding records.
