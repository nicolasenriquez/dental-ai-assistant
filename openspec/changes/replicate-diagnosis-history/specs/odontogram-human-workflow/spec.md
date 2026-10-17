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
