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
Deletion SHALL require operation_id and expected_revision, run owner/parent checks, resource lock, tombstone, deleted revision and durable receipt in one transaction. Exact replay SHALL return the same HTTP 200 receipt before terminal rejection; changed replay SHALL fail 409. New deletion of a stale/deleted/ineligible resource SHALL not overwrite newer data. Identity and actor authority SHALL come from the session and path.

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

### Requirement: X6 Retire new recording-error mutations
The system SHALL replace active recording-error/removal and replacement-wizard callers with explicit deletion, including after-create undo. Legacy correction endpoints SHALL return 410 correction_workflow_retired for new operations, retain authorized exact committed receipt replay and reject changed replay without side effects. Existing historical corrections SHALL remain readable.

#### Scenario: Old client starts a new correction
- **WHEN** an old client submits a new correction operation after retirement
- **THEN** it receives 410 with no new corrected/entered_in_error row/revision, and the command is not silently translated to deletion.

#### Scenario: Already committed legacy receipt
- **WHEN** an authorized identical legacy operation whose response was lost is replayed
- **THEN** its original receipt is returned without another write; a changed payload for that operation returns 409.
