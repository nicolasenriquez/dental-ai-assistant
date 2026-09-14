## Purpose

Provide deterministic, owner-scoped Drive journal exports for approved clinical evolutions and structured remote-truth reading of their persisted lineage.

## Requirements

### Requirement: Approval atomically creates durable export intent
An approved evolution is eligible for Drive journaling if and only if its authenticated owner already has a `google_drive_connections` row. The system MUST commit every eligible canonical evolution and one owner-scoped export row in the same PostgreSQL transaction before remote I/O. It MUST freeze operation ID, period type/key, persisted normalized `journal_block`, and content hash at approval time. A usable connection creates `pending`; disconnected or revoked Drive creates `failed` with `DRIVE_CONNECTION_REQUIRED`. Later preference, timezone, connection, or retry changes MUST NOT replace that identity. A user who never connected Drive gets no export row and `drive_export=null`.

#### Scenario: Export intent cannot be persisted
- **WHEN** evolution persistence succeeds inside the transaction but export-intent persistence fails
- **THEN** the transaction rolls back both writes and returns no false approval success

#### Scenario: Drive is disconnected or revoked
- **WHEN** a clinician approves an evolution without a usable Drive connection
- **THEN** the evolution and failed export row commit atomically, no Drive call occurs, and reconnect retry reuses the same operation, period, bytes, and hash

### Requirement: Canonical response precedes background Drive work
The approval endpoint SHALL return canonical success after transaction commit and SHALL use FastAPI `BackgroundTasks` for one best-effort Drive attempt. The task MUST receive only stable scalar owner and evolution IDs and reacquire its pool connection, export row, Drive connection, and provider credentials during execution. It MUST NOT receive a request, database connection or transaction, OAuth token, or dependency-scoped service from the request. The endpoint MUST NOT await Drive, use bare `asyncio.create_task`, delegate execution to the browser, or add a job queue.

#### Scenario: Process stops before background execution
- **WHEN** canonical success was returned but the background attempt did not run
- **THEN** later hydration reports the durable recoverable state without mutation and a guarded retry POST reconciles it before any append

#### Scenario: Hydration finds recoverable work
- **WHEN** a thread GET returns `pending`, stale `syncing`, or `unknown`
- **THEN** the GET performs no Drive I/O and the frontend may issue the same-origin guarded retry POST once

#### Scenario: Syncing age is evaluated
- **WHEN** the recovery POST targets a `syncing` export
- **THEN** the backend alone evaluates the five-minute stale threshold and the frontend uses no local clock, hydrated timestamp, duplicated timeout, or new staleness field

### Requirement: Export attempts use an atomic claim
Before Drive I/O, the system MUST atomically claim an eligible export by moving it to `syncing` and returning its pre-update `previous_status` without adding a persisted column. It SHALL permit `pending`, explicitly retried `failed|unknown`, or `syncing` older than `EXPORT_SYNC_STALE_AFTER_SECONDS=300`; a non-stale `syncing` row cannot be claimed. Dispatch MUST use `previous_status`: pending syncs normally, failed retries only known-no-write work, stale syncing reconciles before any safe continuation, and unknown only reconciles and cannot reach append/update logic.

#### Scenario: Duplicate background tasks start
- **WHEN** two workers attempt the same non-stale export
- **THEN** one conditional claim succeeds and every other worker exits without Drive I/O

#### Scenario: Syncing claim becomes stale
- **WHEN** `syncing.updated_at` is older than 300 seconds
- **THEN** one worker may reclaim it and must reconcile the remote marker before append

#### Scenario: Unknown is claimed for verification
- **WHEN** an unknown export is atomically claimed
- **THEN** `previous_status` is `unknown`, reconciliation runs, and append/update calls remain zero

#### Scenario: Failed recovery remains disconnected
- **WHEN** a failed export with `DRIVE_CONNECTION_REQUIRED` is retried while Drive is disconnected or revoked
- **THEN** the backend returns `409 DRIVE_CONNECTION_REQUIRED`, preserves status/error, and performs no claim or provider I/O

#### Scenario: Connection is lost after scheduling
- **WHEN** the connection was usable at the route but is unavailable when the claimed background task starts
- **THEN** the export becomes `failed` with `DRIVE_CONNECTION_REQUIRED` and no journal write occurs

### Requirement: Export produces one logical journal entry
The system MUST maintain `UNIQUE(user_id,evolution_id)` and `UNIQUE(operation_id)`, reuse the export identity on retry, and produce exactly one logical block after successful or successfully reconciled export. Remote Drive writes are duplicate-resistant, not transactionally exactly-once, and unresolved ambiguity remains `unknown`.

#### Scenario: Retry follows an ambiguous write
- **WHEN** a previous append has an unknown outcome and the user retries
- **THEN** the backend rereads the remote journal, returns `synced` when the marker exists, and does not append a duplicate

#### Scenario: Concurrent retries target one evolution
- **WHEN** multiple retries occur for the same owner and evolution
- **THEN** one export row exists and successful/reconciled completion leaves one matching `Dental AI ID` block

### Requirement: Export schema is constrained
The export table SHALL use UUID `id` and `operation_id`, UUID `user_id REFERENCES users(id) ON DELETE CASCADE`, and UUID `evolution_id REFERENCES evolutions(id) ON DELETE CASCADE`. It SHALL store non-null `period_type`, `period_key`, `journal_block`, `status`, `content_hash`, `created_at`, and `updated_at`; nullable positive `journal_part`, Drive file/version, error code, and synced timestamp. Status MUST be `pending|syncing|synced|failed|unknown`, and period type MUST be `weekly|daily`.

`failed` SHALL mean the backend knows no remote journal mutation occurred. Any provider outcome where a write may have occurred but cannot be confirmed MUST reconcile to `synced` or `unknown`, never `failed`.

#### Scenario: Invalid lineage is written
- **WHEN** code attempts an unsupported status or period type, a non-null journal part below one, or duplicate owner/evolution or operation identity
- **THEN** PostgreSQL rejects the write

### Requirement: Periods are backend-owned
The backend MUST read and validate `CLINICAL_TIMEZONE` once in config, default it to `America/Santiago`, derive daily or ISO-week keys from the canonical approval/save timestamp in that timezone, and persist a `weekly|daily` preference defaulting to `weekly` on the Drive connection. The V1 `EVOLUCIÓN` header MUST show canonical `evolution_at` converted to that timezone, even when its date differs from the approval date used for grouping.

#### Scenario: Frequency changes
- **WHEN** a user changes frequency from weekly to daily
- **THEN** only subsequently approved evolutions use daily journals and prior journals are not moved or renamed

### Requirement: Journal identity is deterministic
The system SHALL name weekly part one `Evoluciones — YYYY-Www.txt`, daily part one `Evoluciones — YYYY-MM-DD.txt`, and later parts `Evoluciones — <period> — N.txt`. It SHALL identify files with exactly `managedBy=dental-ai-assistant`, `artifactType=evolution-journal`, `periodType`, `periodKey`, and `journalPart`, without `patientRef`.

#### Scenario: Journal rolls over
- **WHEN** the exact UTF-8 append would exceed the existing safe Drive byte limit
- **THEN** the block is written to the next positive numbered part with the same period properties

#### Scenario: Known conflict makes the selected part overflow
- **WHEN** a known no-write version conflict is followed by a fresh read showing the append no longer fits
- **THEN** before any ambiguous outcome the service may select/create the next part, persist the replacement part, and use its one allowed write attempt there

#### Scenario: Provider outcome becomes ambiguous
- **WHEN** a write may have reached Drive but its outcome is unknown
- **THEN** the selected `journal_part` becomes immutable until reconciliation resolves that attempt

#### Scenario: Multiple files match one identity
- **WHEN** exact app-property lookup returns more than one journal
- **THEN** the operation fails with `JOURNAL_IDENTITY_CONFLICT` and selects no file

### Requirement: Journal creation and mutation are period serialized
After claiming an export, the backend MUST acquire a session-scoped PostgreSQL advisory lock derived from owner, period type, and period key on one dedicated pool connection, without keeping a database transaction open during Google I/O. While holding it, the backend SHALL inspect parts, select and persist the writable positive `journal_part`, locate or create the file, read, reconcile, and update. It MUST recheck remote identity after locking, unlock in `finally`, and then release the connection.

The repository MUST persist `(journal_part, drive_file_id, drive_version)` as one atomic remote-target tuple. Known-safe rollover reselection SHALL write `(new_part, NULL, NULL)` before file resolution, then persist all three resolved values together. An ambiguous outcome freezes the whole tuple until reconciliation.

#### Scenario: Two first exports target one new journal
- **WHEN** concurrent exports target the same owner and period before any journal part exists
- **THEN** their critical sections serialize and at most one Drive journal is created

#### Scenario: Known conflict rolls over from an existing file
- **WHEN** part 1/file A/version 7 conflicts without a write and the fresh content requires part 2
- **THEN** the repository first persists part 2/null/null and later part 2/file B/version 1, never part 2/file A/version 7

### Requirement: Journal V1 has an exact safe byte format
Before serialization, the backend MUST replace CRLF and CR with LF, remove every terminal LF from the approved body, and preserve all other characters and whitespace. Each complete block MUST be `text/plain`, UTF-8 without BOM, LF-only, final-newline terminated, and use the delimiters and fields defined in `design.md`: localized timestamp, patient display name, masked RUT, `Dental AI ID: <evolution_id>`, approved content, and closing delimiter. It MUST persist that exact string as `journal_block`, hash its UTF-8 bytes with SHA-256, and never reconstruct it from mutable clinical data during export or recovery. It MUST NOT contain patient UUID, thread ID, or operation ID.

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

#### Scenario: Provider outcome may follow a write
- **WHEN** a timeout or provider error cannot prove that no mutation occurred
- **THEN** reconciliation yields `synced` or `unknown` and MUST NOT yield `failed`

#### Scenario: Ambiguous create has no persisted file ID
- **WHEN** Drive created the selected journal part but its response was lost, leaving `drive_file_id` null and status `unknown`
- **THEN** verification looks up the exact server-owned app properties for that selected part, uses one match for marker reconciliation, leaves zero matches `unknown`, returns `JOURNAL_IDENTITY_CONFLICT` for multiple matches, and never issues another create

#### Scenario: Unknown export is recovered
- **WHEN** automatic or explicit ordinary recovery claims an `unknown` export
- **THEN** it only verifies the selected remote part, becomes `synced` when the marker exists, and otherwise remains `unknown` without appending

#### Scenario: Recovery action is presented
- **WHEN** export state is `failed`, `unknown`, `pending`, or stale `syncing`
- **THEN** the shared POST behaves by state and the UI respectively presents `Reintentar`, `Verificar`, automatic recovery, or verify/recover wording; `unknown` remains terminal for writes

### Requirement: Journal APIs are typed and owner scoped
The system SHALL implement the exact preferences, retry, list, read, `DriveExportState`, summary, detail, and entry shapes defined in `design.md`. It MUST authenticate every call, hide provider and operation identifiers, validate path keys and positive parts, and return no resource for another owner.

#### Scenario: Synced retry is requested
- **WHEN** the owner retries an already synced evolution
- **THEN** the endpoint returns idempotent `200` with the same synced state and performs no append

#### Scenario: Journal summaries are listed
- **WHEN** the owner lists journals
- **THEN** each summary omits export-operation status and reports Drive `modifiedTime` as `updated_at`

#### Scenario: Reconnection presentation is derived
- **WHEN** state is `failed` with `DRIVE_CONNECTION_REQUIRED`
- **THEN** clients derive the reconnect presentation without adding connection, disconnected, or revoked values to the persisted status union

### Requirement: Structured reading uses remote Drive truth
The backend MUST fetch and parse the actual remote Journal V1 TXT located through owner lineage and exact app properties. It MUST recognize entry boundaries only through the complete ordered header grammar and a valid evolution UUID that resolves to owner-scoped lineage for the requested period. A body delimiter or header-like text is content unless the full next-entry boundary and lineage checks succeed. PostgreSQL MUST NOT reconstruct displayed journal content, and the frontend MUST NOT parse raw text.

#### Scenario: Journal was manually edited in Drive
- **WHEN** valid remote content differs from prior application content
- **THEN** structured reading reflects the current remote text

#### Scenario: Remote content is malformed
- **WHEN** a journal cannot be parsed as V1
- **THEN** the API returns a sanitized journal parse error and fabricates no entries

#### Scenario: Clinical body resembles journal framing
- **WHEN** approved content contains delimiter lines, header labels, or a pasted evolution
- **THEN** the parser preserves it as body text unless a complete valid boundary with matching owner-period lineage follows

### Requirement: Hydrated lineage restores navigation
Approved actions SHALL expose optional `drive_export` using the same typed state after live completion and refresh, including journal display identity when known.

#### Scenario: Synced artifact is reopened
- **WHEN** its thread hydrates
- **THEN** the artifact opens the matching period, part, and evolution entry without a duplicate receipt
