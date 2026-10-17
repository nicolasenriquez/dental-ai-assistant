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
