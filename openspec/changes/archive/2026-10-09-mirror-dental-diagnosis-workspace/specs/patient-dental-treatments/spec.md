## ADDED Requirements

### Requirement: T1 Fixed variant-aware clinical catalog
The server SHALL expose the versioned inventory in design.md appendix B:63 therapeutic variants and the twelve preserved findings, eight Spanish category labels, variant identity, clinical type, anatomy scope, surfaces, dentition and visual metadata. Findings SHALL retain their current resource contract.

#### Scenario: Shared clinical type
- **WHEN** the catalog includes zirconia and metal-ceramic crowns
- **THEN** both have distinct selectable IDs and saved Spanish variant snapshots despite sharing clinical_type crown.

#### Scenario: Scope differs within a type
- **WHEN** an occlusal appliance and periodontal splint share clinical_type splint
- **THEN** catalog scope directs whole-arch versus multi-tooth validation; neither is forced onto a single FDI.

### Requirement: T2 Explicit anatomical validation
Therapeutic commands SHALL validate owner, patient, dentition, unique FDI members, canonical supported surfaces, catalog scope and bridge roles server-side as defined in design.md.

#### Scenario: Invalid scope
- **WHEN** a bridge has one member, invalid pillar/pontic roles, mixed arches or duplicate teeth
- **THEN** the server rejects it with422 and persists no treatment, member, revision or receipt.

#### Scenario: Invalid FDI or surface code
- **WHEN** a command uses an FDI outside the chosen dentition or an unsupported surface Z
- **THEN**422 is returned without persistence; no inferred veneer-V-only or pediatric-only restriction is added, and legacy fracture surfaces remain readable/editable.

### Requirement: T3 Separate observed and planned procedures
The system SHALL persist therapeutic records separately from findings, distinguish existing observation from planned and performed work, and create planned records atomically within an editable draft/pending/active plan item command.

#### Scenario: Existing bracket
- **WHEN** a clinician selects the bracket tool and activates tooth16
- **THEN** one existing therapeutic record appears in diagnosis with provenance observed_existing and no plan execution occurs.

#### Scenario: Existing extraction
- **WHEN** an existing extraction is recorded
- **THEN** no missing finding is fabricated and no planned extraction is marked performed automatically.

### Requirement: T4 Durable writes and conflict recovery
Every new clinical write SHALL be owner-scoped, atomic, revision checked and replayable by operation_id with an exact canonical payload and durable receipt. Same-ID changed payload SHALL fail409; unknown fields SHALL fail422; unauthorized resources SHALL return404.

#### Scenario: Commit response lost
- **WHEN** a create commits but the response is lost and the exact command is retried
- **THEN** the same receipt/resource/revisions return, with no duplicate treatment or clinical action.

#### Scenario: Concurrent edit
- **WHEN** two clients edit revision1 and one has already committed revision2
- **THEN** the stale command returns409 with only the latest authorized snapshot, local content remains available and a fresh explicit confirmation is required.

#### Scenario: Foreign patient
- **WHEN** a user reads or mutates another owner's treatment or links it to their plan
- **THEN**404 is returned with no foreign snapshot or side effect.

### Requirement: T5 Non-destructive corrections and complete reads
The system SHALL retain actor/time/before/after revisions, perform reasoned corrections atomically, preserve performed evidence and provide cursor-bound complete reads with honest totals and read failure states. History SHALL NOT be destructively deleted.

#### Scenario: Correct linked work
- **WHEN** an authorized clinician corrects a linked treatment with a reason and current revision
- **THEN** the original becomes entered_in_error with replacement linkage, completed evidence remains traceable and no invented automatic plan reopening/cancellation occurs; explicit lifecycle commands govern related work.

#### Scenario: Later page fails
- **WHEN** a paged treatment/history read fails after a successful page
- **THEN** the UI reports incomplete/unavailable state and retry rather than claiming complete counts or silently hiding records.
