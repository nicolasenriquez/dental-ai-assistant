## MODIFIED Requirements

### Requirement: Queue and stale-operation safety
The system SHALL retain queued messages across Stop, prevent stale voice or stream operations from mutating another conversation, and preserve composer text without submitting or queueing a new turn while clinical approval or canonical saving is pending. Secondary Drive work after canonical save SHALL NOT block or queue the next turn.

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
