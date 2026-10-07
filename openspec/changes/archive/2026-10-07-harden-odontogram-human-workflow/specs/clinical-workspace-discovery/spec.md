## MODIFIED Requirements

### Requirement: Fixed tooth-condition identity and recurrence
Dentition, FDI tooth and condition code SHALL be immutable after creation. Active duplicate identity SHALL be owner/patient/dentition/tooth/code/canonical surfaces, enforced by database partial uniqueness. Resolved records SHALL reject ordinary editing and resolution, but SHALL permit the separate error-correction annotation defined by odontogram-human-workflow. Different surfaces may coexist; recurrence after resolution SHALL create a new resource. Resolver SHALL prepare a draft, with only Guardar persisting resolution. Recording errors SHALL use explicit correction with a mandatory reason, marking the original entered_in_error and optionally creating a linked replacement atomically; correction SHALL NOT imply clinical resolution or overwrite historical evidence.

#### Scenario: Concurrent active duplicate
- **WHEN** two distinct UUIDs create the same active identity concurrently
- **THEN** one record is created and the other receives409 active_condition_exists with its owned existing resource
- **WHEN** an existing active record edits surfaces into another active identity
- **THEN** the same uniqueness rule rejects conflict without writing a revision

#### Scenario: Correction and recurrence
- **WHEN** tooth/code must be corrected
- **THEN** the clinician reviews a separate correction with mandatory reason and explicitly saves it; the original keeps its identity/history, becomes entered_in_error, and an optional valid linked replacement commits in the same transaction
- **WHEN** a resolved condition recurs
- **THEN** a new UUID records it; the old record is neither reopened nor overwritten

#### Scenario: Correction of a resolved original
- **WHEN** an owned resolved original is corrected with its current revision
- **THEN** previous resolution evidence remains intact and a new corrected revision annotates the recording error without reactivating the original
- **WHEN** an ordinary edit or resolution targets a resolved or entered_in_error record
- **THEN** terminal-state rules reject the mutation, apart from an identical already-committed retry allowed by its command contract

#### Scenario: Correction after concurrent resolution
- **WHEN** another session resolves the original before a pending correction commits
- **THEN** the stale correction returns409 without writes, and renewed correction requires review of the current source and explicit confirmation of a new operation against its latest revision
