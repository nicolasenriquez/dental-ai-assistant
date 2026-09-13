## ADDED Requirements

### Requirement: Approval atomically creates durable export intent
For every approved evolution eligible for Drive journaling, the system MUST commit the canonical evolution and one owner-scoped export row in the same PostgreSQL transaction before any remote I/O. It MUST freeze operation ID, period type/key, normalized Journal V1 bytes, and content hash at approval time. A usable connection creates `pending`; disconnected or revoked Drive creates `failed` with `DRIVE_CONNECTION_REQUIRED`. Later preference, timezone, connection, or retry changes MUST NOT replace that identity.

#### Scenario: Export intent cannot be persisted
- **WHEN** evolution persistence succeeds inside the transaction but export-intent persistence fails
- **THEN** the transaction rolls back both writes and returns no false approval success

#### Scenario: Drive is disconnected or revoked
- **WHEN** a clinician approves an evolution without a usable Drive connection
- **THEN** the evolution and failed export row commit atomically, no Drive call occurs, and reconnect retry reuses the same operation, period, bytes, and hash

### Requirement: Canonical response precedes background Drive work
The approval endpoint SHALL return canonical success after transaction commit and SHALL use FastAPI `BackgroundTasks` for one best-effort Drive attempt. It MUST NOT await Drive, use bare `asyncio.create_task`, delegate execution to the browser, or add a job queue.

#### Scenario: Process stops before background execution
- **WHEN** canonical success was returned but the background attempt did not run
- **THEN** later hydration reports the durable recoverable state without mutation and a guarded retry POST reconciles it before any append

#### Scenario: Hydration finds recoverable work
- **WHEN** a thread GET returns `pending`, stale `syncing`, or `unknown`
- **THEN** the GET performs no Drive I/O and the frontend may issue the same-origin guarded retry POST once

### Requirement: Export attempts use an atomic claim
Before Drive I/O, the system MUST atomically claim an eligible export by moving it to `syncing`. It SHALL permit `pending`, explicitly retried `failed|unknown`, or `syncing` older than `EXPORT_SYNC_STALE_AFTER_SECONDS=300`; a non-stale `syncing` row cannot be claimed.

#### Scenario: Duplicate background tasks start
- **WHEN** two workers attempt the same non-stale export
- **THEN** one conditional claim succeeds and every other worker exits without Drive I/O

#### Scenario: Syncing claim becomes stale
- **WHEN** `syncing.updated_at` is older than 300 seconds
- **THEN** one worker may reclaim it and must reconcile the remote marker before append

### Requirement: Export produces one logical journal entry
The system MUST maintain `UNIQUE(user_id,evolution_id)` and `UNIQUE(operation_id)`, reuse the export identity on retry, and produce exactly one logical block after successful or successfully reconciled export. Remote Drive writes are duplicate-resistant, not transactionally exactly-once, and unresolved ambiguity remains `unknown`.

#### Scenario: Retry follows an ambiguous write
- **WHEN** a previous append has an unknown outcome and the user retries
- **THEN** the backend rereads the remote journal, returns `synced` when the marker exists, and does not append a duplicate

#### Scenario: Concurrent retries target one evolution
- **WHEN** multiple retries occur for the same owner and evolution
- **THEN** one export row exists and successful/reconciled completion leaves one matching `Dental AI ID` block

### Requirement: Export schema is constrained
The export table SHALL use UUID `id` and `operation_id`; owner and evolution foreign keys with cascade delete; non-null `period_type`, `period_key`, positive `journal_part`, `status`, `content_hash`, `created_at`, and `updated_at`; nullable Drive file/version, error code, and synced timestamp. Status MUST be `pending|syncing|synced|failed|unknown`, and period type MUST be `weekly|daily`.

#### Scenario: Invalid lineage is written
- **WHEN** code attempts an unsupported status or period type, a journal part below one, or duplicate owner/evolution or operation identity
- **THEN** PostgreSQL rejects the write

### Requirement: Periods are backend-owned
The backend MUST read and validate `CLINICAL_TIMEZONE` once in config, default it to `America/Santiago`, derive approval-local daily or ISO-week keys, and persist a `weekly|daily` preference defaulting to `weekly` on the Drive connection.

#### Scenario: Frequency changes
- **WHEN** a user changes frequency from weekly to daily
- **THEN** only subsequently approved evolutions use daily journals and prior journals are not moved or renamed

### Requirement: Journal identity is deterministic
The system SHALL name weekly part one `Evoluciones — YYYY-Www.txt`, daily part one `Evoluciones — YYYY-MM-DD.txt`, and later parts `Evoluciones — <period> — N.txt`. It SHALL identify files with exactly `managedBy=dental-ai-assistant`, `artifactType=evolution-journal`, `periodType`, `periodKey`, and `journalPart`, without `patientRef`.

#### Scenario: Journal rolls over
- **WHEN** the exact UTF-8 append would exceed the existing safe Drive byte limit
- **THEN** the block is written to the next positive numbered part with the same period properties

#### Scenario: Multiple files match one identity
- **WHEN** exact app-property lookup returns more than one journal
- **THEN** the operation fails with `JOURNAL_IDENTITY_CONFLICT` and selects no file

### Requirement: Journal creation and mutation are period serialized
After claiming an export, the backend MUST hold a transaction-scoped PostgreSQL advisory lock derived from owner, period type, period key, and journal part across Drive locate, create-if-missing, read, reconciliation, and update. It MUST recheck remote identity after acquiring the lock.

#### Scenario: Two first exports target one new journal
- **WHEN** concurrent exports find the same owner-period-part initially absent
- **THEN** their critical sections serialize and at most one Drive journal is created

### Requirement: Journal V1 has an exact safe byte format
Before serialization, the backend MUST replace CRLF and CR with LF, remove every terminal LF from the approved body, and preserve all other characters and whitespace. Each complete block MUST be `text/plain`, UTF-8 without BOM, LF-only, final-newline terminated, and use the delimiters and fields defined in `design.md`: localized timestamp, patient display name, masked RUT, `Dental AI ID: <evolution_id>`, approved content, and closing delimiter. It MUST NOT contain patient UUID, thread ID, or operation ID.

#### Scenario: Block is rendered
- **WHEN** an approved evolution is prepared for append
- **THEN** its content hash is computed from the exact encoded V1 bytes and the reconciliation marker is its `Dental AI ID` line

#### Scenario: Windows and Unix body forms match
- **WHEN** otherwise identical approved bodies use CRLF, CR, LF, or extra terminal newlines
- **THEN** normalization produces the same Journal V1 bytes and SHA-256 hash

### Requirement: Writes use bounded reconciliation
The system MUST use optimistic versions, at most one fresh-version conflict retry, and one read-before-retry reconciliation for ambiguous writes. It MUST NOT blindly or indefinitely retry.

#### Scenario: Fresh-version conflict repeats
- **WHEN** the single conflict retry conflicts again
- **THEN** the export becomes retryable `failed`

#### Scenario: Ambiguous write lacks marker
- **WHEN** the reconciliation read cannot find the marker
- **THEN** the export becomes `unknown` and no automatic append follows

### Requirement: Journal APIs are typed and owner scoped
The system SHALL implement the exact preferences, retry, list, read, `DriveExportState`, summary, detail, and entry shapes defined in `design.md`. It MUST authenticate every call, hide provider and operation identifiers, validate path keys and positive parts, and return no resource for another owner.

#### Scenario: Synced retry is requested
- **WHEN** the owner retries an already synced evolution
- **THEN** the endpoint returns idempotent `200` with the same synced state and performs no append

#### Scenario: Journal summaries are listed
- **WHEN** the owner lists journals
- **THEN** each summary omits export-operation status and reports Drive `modifiedTime` as `updated_at`

### Requirement: Structured reading uses remote Drive truth
The backend MUST fetch and parse the actual remote Journal V1 TXT located through owner lineage and exact app properties. PostgreSQL MUST NOT reconstruct displayed journal content, and the frontend MUST NOT parse raw text.

#### Scenario: Journal was manually edited in Drive
- **WHEN** valid remote content differs from prior application content
- **THEN** structured reading reflects the current remote text

#### Scenario: Remote content is malformed
- **WHEN** a journal cannot be parsed as V1
- **THEN** the API returns a sanitized journal parse error and fabricates no entries

### Requirement: Hydrated lineage restores navigation
Approved actions SHALL expose optional `drive_export` using the same typed state after live completion and refresh, including journal display identity when known.

#### Scenario: Synced artifact is reopened
- **WHEN** its thread hydrates
- **THEN** the artifact opens the matching period, part, and evolution entry without a duplicate receipt
