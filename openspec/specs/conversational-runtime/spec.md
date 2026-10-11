## Purpose

Provide a hardened conversational runtime with deterministic voice handback, robust composer keyboard semantics, caret-aware dictation, durable Stop semantics, queue and stale-operation safety, and backward-compatible conversation transport.

## Requirements

### Requirement: Deterministic voice handback
The system SHALL cancel voice work, invalidate late results, release media resources, return to idle, and restore the initiating composer focus and valid selection without changing its draft.

#### Scenario: Cancel then type
- **WHEN** a user cancels an active recording and immediately types
- **THEN** the textarea remains focused and editable and the prior draft plus new text is present

#### Scenario: Late transcript
- **WHEN** a cancelled or previous-scope transcription completes late
- **THEN** it does not mutate the current composer

### Requirement: Robust composer keyboard semantics
The system SHALL submit on Enter, preserve newline on Shift+Enter, ignore Enter during IME composition, and cancel active voice interaction on Escape within the active composer.

#### Scenario: IME composition
- **WHEN** Enter confirms native text composition
- **THEN** no message is submitted

### Requirement: Caret-aware dictation
The system SHALL insert a transcript at the captured selection while preserving edits made during transcription.

#### Scenario: Dictation at a caret
- **WHEN** the caret is inside an existing draft and transcription succeeds
- **THEN** transcript text is inserted at that caret rather than appended blindly

### Requirement: Durable Stop semantics
The system SHALL persist terminal meaning for assistant messages and expose it after reload.

#### Scenario: Partial cancellation
- **WHEN** a stream ends after partial content because the client cancels or disconnects
- **THEN** the partial message is persisted with a non-completed termination reason

#### Scenario: Completed response
- **WHEN** the server emits the normal DONE terminator
- **THEN** the persisted assistant message is marked completed

### Requirement: Queue and stale-operation safety
The system SHALL retain queued messages across Stop, prevent stale voice or stream operations from mutating another conversation, and preserve composer text without submitting or queueing a new turn while clinical approval or canonical saving is pending. Stop success, error, reconciliation and cleanup SHALL act only on their originating thread, turn and subscription generation. Secondary Drive work after canonical save SHALL NOT block or queue the next turn.

#### Scenario: Stop with queued follow-up
- **WHEN** a user queues a follow-up and stops the active response
- **THEN** the queued follow-up remains available for deterministic dispatch

#### Scenario: Switch during stream
- **WHEN** an old conversation produces a late result after navigation
- **THEN** it cannot mutate the active conversation

#### Scenario: Submit during pending approval or save
- **WHEN** an artifact is awaiting approval or its canonical save is running
- **THEN** submit is disabled, draft text is preserved, no queue entry is created, and the UI directs the user to review or resume editing

#### Scenario: Only Drive synchronization remains
- **WHEN** canonical save is complete and Drive status is pending, syncing, failed, or unknown
- **THEN** the composer accepts the next turn while the prior artifact independently reports Drive state

#### Scenario: Late Stop belongs to another subscription
- **WHEN** Stop for A completes or fails after B starts, including a new generation of the same thread
- **THEN** B's controller, transcript, error, runtime and queue are unchanged by A's callbacks and cleanup

#### Scenario: Repeated Stop or unmount
- **WHEN** Stop is repeated for the same active turn or its initiating component unmounts
- **THEN** cancellation remains scoped to that turn, no controller belonging to another generation is aborted, and subscriber detachment alone does not cancel server work

### Requirement: Backward-compatible conversation transport
The system SHALL preserve the existing JSON-token SSE and sources-before-DONE contract while adding terminal semantics through persisted message fields.

#### Scenario: Existing RAG response
- **WHEN** a normal RAG turn completes
- **THEN** tokens, sources, citations, and DONE retain their existing order and shape

### Requirement: Explicit original-context unsent work
The Clinical Assistant SHALL retain the chosen patient ID or explicit patient-less context of unsent text, attached sources and queued messages. Artifact edit buffers SHALL remain bound to their artifact's historical patient. Switching or removing the workspace patient SHALL NOT silently rebind or dispatch this work. Deliberately general consultation and general Drive sources SHALL remain supported; source-library scope SHALL NOT be confused with the recipient context of an unsent message.

#### Scenario: Change patient with work
- **WHEN** patient A is changed to B or null while contextual unsent work exists
- **THEN** the user can remain with A, preserve the work under its original context while changing the workspace, or explicitly discard the affected unsent work before changing; none of those choices submits a message or saves clinical content

#### Scenario: General work followed by patient selection
- **WHEN** patient-less unsent work exists and patient A is selected
- **THEN** that work remains explicitly general until an explicit context decision; it is not implicitly turned into A's clinical note

#### Scenario: Retained work has a different context
- **WHEN** retained composer or queue context differs from the workspace patient
- **THEN** sending and automatic dispatch are blocked with an explanation and a guarded action to restore the original patient or patient-less context; no automatic reassignment occurs

#### Scenario: Null queue context can be restored
- **WHEN** the first queued message has null patient context and the workspace has a patient
- **THEN** an explicit action restores patient-less context through the same transition guard, including the existing voice and approval/save restrictions

#### Scenario: Cancel or failed patient change
- **WHEN** the transition is canceled or the server patient update fails
- **THEN** the previous workspace context and all retained work remain usable, no queue entry is claimed for dispatch, and any destructive discard is committed only with a confirmed successful transition

#### Scenario: Authentication and reload boundary
- **WHEN** authenticated memory is cleared at logout or the user confirms a warned hard reload
- **THEN** unsent work and unapplied buffers are cleared, no clinical content has been written to browser storage, and only server-persisted work is restored
