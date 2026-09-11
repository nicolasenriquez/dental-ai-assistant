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
The system SHALL retain queued messages across Stop and SHALL prevent stale voice or stream operations from mutating another thread/conversation.

#### Scenario: Stop with queued follow-up
- **WHEN** a user queues a follow-up and stops the active response
- **THEN** the queued follow-up remains available for deterministic dispatch

#### Scenario: Switch during stream
- **WHEN** an old conversation produces a late result after navigation
- **THEN** it cannot mutate the active conversation

### Requirement: Backward-compatible conversation transport
The system SHALL preserve the existing JSON-token SSE and sources-before-DONE contract while adding terminal semantics through persisted message fields.

#### Scenario: Existing RAG response
- **WHEN** a normal RAG turn completes
- **THEN** tokens, sources, citations, and DONE retain their existing order and shape
