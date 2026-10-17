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
