## ADDED Requirements

### Requirement: Separate least-privilege Google authorization
The system MUST keep Dental JWT authentication independent from Google authorization and MUST request only `https://www.googleapis.com/auth/drive.file` through an OAuth 2.0 Web Server flow.

#### Scenario: OAuth start requires Dental authentication
- **WHEN** a request without a valid Dental session calls `POST /api/google-drive/oauth/start`
- **THEN** the system returns `401` and creates no OAuth state or Google request

#### Scenario: OAuth state protects callback
- **WHEN** an authenticated user starts connection
- **THEN** the system creates a cryptographically random, ten-minute, HttpOnly, Secure, SameSite=Lax state cookie scoped to the callback

#### Scenario: State mismatch fails closed
- **WHEN** callback query state is absent, expired, or does not constant-time match the state cookie
- **THEN** the system clears the state cookie, rejects connection, stores no token, and performs no folder operation

#### Scenario: Required grant is missing
- **WHEN** Google callback omits `drive.file` or a refresh token
- **THEN** connection fails atomically with a sanitized result and no usable connection row

#### Scenario: Google identity does not replace Dental identity
- **WHEN** authorized Google account email differs from Dental account email
- **THEN** connection remains owned by Dental `user_id` and no Google token or identity becomes a Dental session credential

### Requirement: Encrypted refresh-token persistence
The system MUST persist Google refresh tokens only as AES-256-GCM ciphertext under an independent versioned key and MUST NOT persist access tokens.

#### Scenario: Token is encrypted before persistence
- **WHEN** OAuth callback receives a refresh token
- **THEN** the system uses a fresh 12-byte nonce, Dental user/key-version associated data, and the configured 32-byte key before writing ciphertext, nonce, and key version

#### Scenario: Plaintext is absent
- **WHEN** a stored connection is inspected or application logs are captured
- **THEN** refresh token, access token, client secret, encryption key, and Authorization header are absent

#### Scenario: Cipher authentication fails
- **WHEN** ciphertext, associated user, nonce, key version, or key is wrong
- **THEN** decryption fails closed, cache is evicted, no Google request occurs, and UI receives a sanitized revoked/unavailable state

#### Scenario: Access token cache expires safely
- **WHEN** token endpoint returns `expires_in`
- **THEN** access token lives only in process memory until 60 seconds before expiry and is evicted on disconnect, reconnect, invalid grant, or decryption failure

### Requirement: Managed folder lifecycle
The system SHALL create and manage exactly one visible Drive folder per current Google connection, identified by persisted ID and private application metadata rather than name.

#### Scenario: First successful connection creates folder
- **WHEN** a valid new connection has no managed folder
- **THEN** the system creates `Dental AI Assistant` with folder MIME and exact `managedBy` and `workspaceSchema` app properties, then persists returned ID

#### Scenario: Existing folder is reused
- **WHEN** persisted folder metadata verifies exact folder ID, folder MIME, not trashed state, and application properties
- **THEN** system reuses it and creates no duplicate

#### Scenario: Same-name folder exists
- **WHEN** Drive contains another folder named `Dental AI Assistant` but DB has no valid folder ID
- **THEN** system does not adopt folder by name and creates its own marked folder only after explicit connection or recreation

#### Scenario: Managed folder disappears
- **WHEN** persisted folder is missing, trashed, wrong MIME, or lacks required markers during ordinary operation
- **THEN** system reports `workspace_missing` and performs no implicit replacement or write

#### Scenario: User recreates workspace
- **WHEN** connected user explicitly calls workspace recreation after `workspace_missing`
- **THEN** system creates and persists one new marked folder

#### Scenario: Google account changes
- **WHEN** reconnect resolves a different opaque Google account ID
- **THEN** old folder identity is not reused and one folder is created for new connection

### Requirement: Patient-bound managed files
The system MUST manage only app-created UTF-8 `.md` and `.txt` files in managed folder, each bound by private metadata to one patient owned by current Dental user.

#### Scenario: Create managed Markdown file
- **WHEN** authenticated user submits owned patient, valid `.md` name, Markdown MIME, and non-empty content at most 1 MiB
- **THEN** backend creates file under exact managed folder with application markers and patient UUID property

#### Scenario: Create managed text file
- **WHEN** authenticated user submits owned patient, valid `.txt` name, plain-text MIME, and valid content
- **THEN** backend creates equivalent patient-bound managed file

#### Scenario: Invalid patient is hidden
- **WHEN** user supplies missing or foreign patient UUID
- **THEN** backend returns `404` before Google access

#### Scenario: Client file ID is insufficient
- **WHEN** client requests a file ID
- **THEN** backend fetches metadata and requires exact parent, markers, patient ID, MIME/extension pair, size, and not-trashed state before read or update

#### Scenario: Foreign or unmarked file is rejected
- **WHEN** file belongs elsewhere, another patient, another user, lacks markers, is trashed, or has unsupported type
- **THEN** backend returns sanitized not-managed/not-found behavior and does not read or write content

#### Scenario: Oversize and invalid encoding are rejected
- **WHEN** declared or streamed content exceeds 1,048,576 bytes or cannot decode as UTF-8
- **THEN** backend aborts and returns stable validation error without persisting content

#### Scenario: Duplicate name is allowed
- **WHEN** valid managed folder already has file with same name
- **THEN** create may produce another file because Drive `file_id`, not name, is identity

### Requirement: Scoped cursor listing and search
The system SHALL list and search only active patient's managed files with opaque cursor pagination, bounded fields, and no document names or search terms in URLs or logs.

#### Scenario: List first page
- **WHEN** authenticated user requests files for owned active patient
- **THEN** backend queries exact managed parent and not-trashed state, requests at most 100 metadata rows ordered by modified time then name, post-validates markers/patient, and returns optional opaque next token

#### Scenario: Continue listing
- **WHEN** valid opaque page token is supplied
- **THEN** backend returns next scoped page without exposing or interpreting token in UI

#### Scenario: Search managed files
- **WHEN** user submits body containing owned patient, stripped 1-to-200-character query, and optional cursor
- **THEN** backend escapes Drive literal, scopes name search to managed parent, post-validates every result, and returns cursor page

#### Scenario: Search privacy
- **WHEN** file search is performed
- **THEN** query and document names appear in neither URL, access/application/debug/error logs, analytics, nor telemetry

#### Scenario: Invalid cursor
- **WHEN** Google rejects supplied page token
- **THEN** API returns `422 DRIVE_PAGE_TOKEN_INVALID` without leaking Google response body

### Requirement: Safe read and optimistic update
The system SHALL read validated managed text and SHALL detect Drive version changes before explicit updates without offering force overwrite.

#### Scenario: Read managed file
- **WHEN** user opens a file matching active patient and all managed-file checks
- **THEN** backend streams at most 1 MiB, decodes UTF-8, and returns content with current version and modified time

#### Scenario: Explicit update succeeds
- **WHEN** user submits non-empty valid content and `expected_version` matches immediately fetched metadata version
- **THEN** backend updates media and returns fresh version and modified time

#### Scenario: Version changed
- **WHEN** current Drive version differs from expected version
- **THEN** backend returns `409 DRIVE_FILE_CHANGED`, does not write, preserves local editor content, and UI offers Cancel or View current version

#### Scenario: No force overwrite
- **WHEN** conflict is displayed
- **THEN** V1 exposes no overwrite-anyway action

### Requirement: Imported files become managed copies
The system SHALL use Google Picker only to select an external `.md` or `.txt` source and SHALL create a new patient-bound copy without retaining or mutating original.

#### Scenario: Picker token is issued
- **WHEN** connected authenticated user requests Picker token
- **THEN** API returns short-lived access token with `Cache-Control: no-store` and `Pragma: no-cache`

#### Scenario: Browser handles Picker token
- **WHEN** frontend receives Picker token
- **THEN** it uses token immediately in Picker memory and never stores or emits it through browser storage, cookies, logs, console, analytics, or telemetry

#### Scenario: Import valid source
- **WHEN** Picker selects one permitted source and user confirms import for active owned patient
- **THEN** backend validates metadata/size/encoding, downloads source, creates newly marked managed copy, and returns copy metadata

#### Scenario: Original remains untouched
- **WHEN** import-copy succeeds or fails
- **THEN** source is never moved, renamed, updated, deleted, registered, or retained in PostgreSQL

#### Scenario: Picker source is invalid
- **WHEN** selected file is trashed, unsupported, oversized, inaccessible, or invalid UTF-8
- **THEN** backend creates no managed copy and returns sanitized error

### Requirement: Bounded and sanitized Google integration
The system MUST apply explicit timeouts, bounded retries, stable public errors, and sensitive logging prohibition to every Google request.

#### Scenario: Transient Google failure
- **WHEN** network error, timeout, 429, or 5xx occurs
- **THEN** integration retries at most twice with bounded backoff and jitter before sanitized failure

#### Scenario: Permanent failure
- **WHEN** validation, 400, permission 403, not found 404, conflict, or invalid grant occurs
- **THEN** integration does not run generic retries

#### Scenario: Expired access token
- **WHEN** Google returns first 401
- **THEN** integration evicts and refreshes once; repeated 401 marks grant revoked without invalidating Dental session

#### Scenario: Sensitive logs remain empty
- **WHEN** any Drive operation succeeds or fails at any log level
- **THEN** content, name, search query, source ID, patient identity text, RUT, raw Google body, and all credentials are absent

### Requirement: Responsive Drive workspace accessory
The system SHALL present Drive as non-modal resizable sidecar beside `/assistant` on desktop and as accessible modal Sheet below 768 px, using incremental Radix/shadcn primitives and existing visual tokens.

#### Scenario: Desktop opens sidecar
- **WHEN** user activates Google Drive utility at desktop width
- **THEN** Assistant remains operable beside keyboard-resizable Drive panel without backdrop

#### Scenario: Mobile opens Sheet
- **WHEN** user activates Drive below 768 px
- **THEN** Sheet opens from right with labelled dialog, backdrop, Escape, focus trap, inert background, and focus return

#### Scenario: Incremental primitive adoption
- **WHEN** Drive UI is added
- **THEN** only required primitives and dependencies are introduced; existing Sidebar, Composer, Chat, messages, cards, Motion, tokens, and unrelated components are not migrated

#### Scenario: Connection onboarding
- **WHEN** Drive is disconnected
- **THEN** workspace explains created folder, allowed operations, patient binding, and no global Drive traversal before explicit Connect action

#### Scenario: Workspace states
- **WHEN** connection, list, editor, conflict, missing workspace, revoked grant, or error changes
- **THEN** one discriminated workspace state renders valid Spanish loading, empty, error, and recovery behavior without impossible boolean combinations

### Requirement: Patient-safe workspace transitions
The system MUST require active patient for every file interaction and MUST resolve dirty editor state before patient switch or workspace close.

#### Scenario: No active patient
- **WHEN** Clinical Assistant has no active patient
- **THEN** Drive can show connection status but list/search/create/import/read/update/insert/save-from-Assistant actions are disabled with instruction to select patient

#### Scenario: Clean patient switch
- **WHEN** active patient changes while Drive has no dirty editor
- **THEN** workspace clears prior patient file state and loads new patient's list

#### Scenario: Dirty patient switch
- **WHEN** active patient change is requested while Drive editor is dirty
- **THEN** switch is suspended and dialog offers Save changes, Discard changes, or Cancel

#### Scenario: Save before switch
- **WHEN** user chooses Save changes and save succeeds
- **THEN** switch continues and new patient's list loads; failed/conflicted save keeps old patient and local content

#### Scenario: Discard or cancel switch
- **WHEN** user chooses Discard changes
- **THEN** local Drive edits clear and switch continues; when user chooses Cancel, patient and editor remain unchanged

#### Scenario: Close dirty workspace
- **WHEN** user closes sidecar or Sheet with dirty editor
- **THEN** same save/discard/cancel guard applies

### Requirement: Explicit Drive-to-composer insertion
The system SHALL insert full document or current selection into active patient's composer draft without submitting or invoking clinical runtime.

#### Scenario: Insert complete document
- **WHEN** user activates `Insertar en el chat` with no selection and file patient matches active patient
- **THEN** current editor content appends to composer draft with newline separation and composer receives focus

#### Scenario: Insert selection
- **WHEN** user selects non-empty editor text and activates keyboard-accessible `Insertar selección en el chat`
- **THEN** only selected text appends to composer draft

#### Scenario: Insertion never submits
- **WHEN** either insertion succeeds
- **THEN** no clinical SSE request, LLM request, queue entry, or automatic send occurs

#### Scenario: Cross-patient insertion is blocked
- **WHEN** editor patient does not equal active patient or active patient is absent
- **THEN** insertion is unavailable and composer remains unchanged

### Requirement: Explicit Assistant-to-Drive draft preparation
The system SHALL let completed assistant messages and structured clinical drafts seed editable local Drive drafts but SHALL never persist them until explicit user save.

#### Scenario: Prepare assistant message
- **WHEN** user activates `Guardar en Drive` on completed assistant message under active patient
- **THEN** workspace opens editable local Markdown draft containing message text and performs no Drive API write

#### Scenario: Prepare structured clinical draft
- **WHEN** user activates action on current structured clinical draft matching active patient
- **THEN** workspace serializes fixed visible labels, omits empty clinical sections and all review flags, and opens editable local Markdown draft

#### Scenario: Explicit save required
- **WHEN** local Drive draft is opened or edited
- **THEN** no remote write occurs until user activates Save with valid name and non-empty content

#### Scenario: Approval remains separate
- **WHEN** unapproved clinical draft is prepared for Drive
- **THEN** action does not approve or persist authoritative PostgreSQL evolution and Drive copy remains user-controlled document

### Requirement: Manual visible save state
The system SHALL use manual save with visible local state and SHALL not autosave remote content.

#### Scenario: Edit existing document
- **WHEN** user changes name-local fields or content
- **THEN** editor displays dirty state and no remote request occurs

#### Scenario: Save lifecycle
- **WHEN** user explicitly saves
- **THEN** UI announces Saving, disables duplicate save, then displays Saved with returned version or preserves dirty content with recoverable error

#### Scenario: Empty remote save
- **WHEN** content is empty/whitespace or name/type/byte limit is invalid
- **THEN** frontend and backend reject save and Drive is unchanged

### Requirement: Disconnect revokes credentials without deleting files
The system SHALL explicitly revoke Google authorization, clear credentials/cache, and leave managed Drive files untouched.

#### Scenario: Disconnect succeeds
- **WHEN** connected user confirms disconnect
- **THEN** backend attempts token revocation, clears encrypted token and access cache, marks disconnected, and leaves folder/files in Drive

#### Scenario: Revoke endpoint fails
- **WHEN** Google revoke is already invalid or unavailable
- **THEN** local credentials are still cleared, error is sanitized, and no token remains usable by application

#### Scenario: No Drive deletion API
- **WHEN** client inspects Drive API surface
- **THEN** no delete, move, share, permission, or arbitrary upload endpoint exists

### Requirement: Deterministic automated and manual verification
The system SHALL verify Google integration through mocked automated boundaries and SHALL keep real OAuth outside deterministic CI.

#### Scenario: Automated tests run
- **WHEN** backend, frontend, and Playwright suites exercise Drive
- **THEN** all Google OAuth, token, revoke, Drive, and Picker behavior is mocked and no real credentials or clinical data are required

#### Scenario: Real integration smoke
- **WHEN** operator validates configured Google project
- **THEN** documented manual test uses test account and synthetic files to connect, open Picker, import copy, edit, conflict-check, and disconnect

#### Scenario: Existing runtime regresses
- **WHEN** full validation runs
- **THEN** Dental auth, clinical SSE/approval, Chat, RAG, citations, quota, and VideoExplorer tests remain passing without protocol changes
