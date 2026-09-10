## ADDED Requirements

### Requirement: Separate least-privilege Google authorization
The system MUST keep Dental JWT authentication independent from Google authorization and MUST request only `https://www.googleapis.com/auth/drive.file` through an OAuth 2.0 Web Server flow.

#### Scenario: OAuth start requires Dental authentication
- **WHEN** a request without a valid Dental session calls `POST /api/google-drive/oauth/start`
- **THEN** the system returns `401` and creates no OAuth state or Google request

#### Scenario: OAuth state protects callback
- **WHEN** an authenticated user starts connection
- **THEN** the system creates a cryptographically random ten-minute state, stores only its hash with initiating Dental user and session fingerprint, and sets raw state in an HttpOnly, Secure, SameSite=Lax cookie scoped to callback

#### Scenario: Dental identity changes during consent
- **WHEN** callback Dental user or session fingerprint differs from OAuth transaction initiator
- **THEN** system clears state cookie, rejects callback before code exchange, and stores no Google credential

#### Scenario: OAuth transaction is consumed once
- **WHEN** valid callback claims an unused OAuth transaction
- **THEN** system atomically marks transaction used before code exchange and every concurrent or replayed callback fails closed

#### Scenario: State mismatch fails closed
- **WHEN** callback query state is absent, expired, or does not constant-time match the state cookie
- **THEN** the system clears the state cookie, rejects connection, stores no token, and performs no folder operation

#### Scenario: Required grant is missing
- **WHEN** token response explicitly reports scope set without `drive.file` or omits refresh token
- **THEN** connection fails atomically with a sanitized result and no usable connection row

#### Scenario: Unexpected scope is granted
- **WHEN** callback granted scope set contains anything besides exact `drive.file`
- **THEN** connection fails atomically, returned credential is revoked best-effort, and no token is persisted or exposed to Picker

#### Scenario: Token response omits scope
- **WHEN** authorization requested only `drive.file` with incremental grants disabled and token response omits optional `scope`
- **THEN** system treats grant as unchanged exact requested scope; explicit scope value must equal exact `drive.file`

#### Scenario: Google identity does not replace Dental identity
- **WHEN** authorized Google account email differs from Dental account email
- **THEN** connection remains owned by Dental `user_id` and no Google token or identity becomes a Dental session credential

### Requirement: Encrypted refresh-token persistence
The system MUST persist Google refresh tokens and per-connection file-binding secrets only as purpose-separated AES-256-GCM ciphertext under a versioned keyring independent from Dental JWT and MUST NOT persist access tokens.

#### Scenario: Token is encrypted before persistence
- **WHEN** OAuth callback receives a refresh token
- **THEN** the system uses a fresh 12-byte nonce, Dental user/purpose/key-version associated data, and the configured 32-byte key before writing ciphertext, nonce, and key version

#### Scenario: Binding secret is encrypted before persistence
- **WHEN** new Google account connection creates random binding secret
- **THEN** system encrypts it with fresh nonce and purpose-separated associated data before persistence and never sends it to Google or browser

#### Scenario: Plaintext is absent
- **WHEN** a stored connection is inspected or application logs are captured
- **THEN** refresh token, access token, client secret, encryption key, and Authorization header are absent

#### Scenario: Cipher authentication fails
- **WHEN** ciphertext, associated user, nonce, key version, or key is wrong
- **THEN** decryption fails closed, current request drops credential material, no Google request occurs, and UI receives a sanitized revoked/unavailable state

#### Scenario: Access token remains request-local
- **WHEN** authenticated Drive request obtains access token
- **THEN** system reuses it only within current HTTP request and retains no process, distributed, or persistent cache afterward

#### Scenario: Encryption key rotates
- **WHEN** stored refresh token or binding secret uses available non-active key version
- **THEN** system decrypts token and binding secret with stored versions, re-encrypts them with active key during same request, and old key remains required until no row references it

#### Scenario: Persisted connection status is valid
- **WHEN** connection row is written
- **THEN** checked status is exactly active, disconnected, or revoked; active has complete refresh credentials and exact `drive.file`, terminal statuses have null refresh credentials and empty scopes, and every transition updates status timestamp

### Requirement: Managed folder lifecycle
The system SHALL designate at most one authoritative visible Drive folder per current Google connection by persisted ID and private metadata, reconcile ambiguous creation before replacement, and disclose that provider ambiguity can leave a non-authoritative orphan.

#### Scenario: First successful connection creates folder
- **WHEN** a valid new connection has no managed folder
- **THEN** system persists pending OAuth folder operation ID, creates fixed-name `Dental AI Assistant` with folder MIME, exact `managedBy`/`workspaceSchema`, and `creationOperationId` equal to OAuth transaction operation ID, atomically persists returned folder ID plus completed creation operation ID as sole authority, then clears pending operation

#### Scenario: Initial folder result is ambiguous
- **WHEN** Google may create first folder but response or folder-ID persistence fails
- **THEN** next authenticated request queries exact `creationOperationId` before replacement, adopts matching folder without creating another, or reports `workspace_recovery_pending` if still unknown

#### Scenario: Recovery remains unacknowledged
- **WHEN** folder remains unresolved and recreation does not set `acknowledge_possible_orphan=true`
- **THEN** backend returns `409 DRIVE_WORKSPACE_RECOVERY_PENDING` and performs no Google or folder-identity mutation

#### Scenario: User accepts possible orphan
- **WHEN** pending folder remains unresolved
- **THEN** UI warns old folder may exist and requires explicit confirmation before submitting `acknowledge_possible_orphan=true` plus new operation ID; backend then designates created replacement as sole authoritative folder and never manages later orphan

#### Scenario: Acknowledged replacement is ambiguous
- **WHEN** acknowledged replacement may be created but its result remains unknown
- **THEN** new operation marker remains pending, status remains `workspace_recovery_pending`, and backend does not retry write

#### Scenario: Existing folder is reused
- **WHEN** persisted folder metadata verifies exact folder ID, folder MIME, not trashed state, application properties, and `creationOperationId` equal to persisted completed folder operation ID
- **THEN** system reuses it and creates no duplicate

#### Scenario: Same-name folder exists
- **WHEN** Drive contains another folder named `Dental AI Assistant` but DB has no valid folder ID
- **THEN** system does not adopt folder by name and creates its own marked folder only after explicit connection or recreation

#### Scenario: Managed folder disappears
- **WHEN** persisted folder is missing, trashed, wrong MIME, or lacks required markers during ordinary operation
- **THEN** system reports `workspace_missing` and performs no implicit replacement or write

#### Scenario: User recreates workspace
- **WHEN** connected user explicitly calls workspace recreation with stable operation UUID after `workspace_missing`
- **THEN** system creates and persists one new marked folder

#### Scenario: Google account changes
- **WHEN** reconnect resolves a different opaque Google account ID
- **THEN** old folder identity is not reused and one folder is created for new connection

### Requirement: Patient-bound managed files
The system MUST manage only app-created UTF-8 `.md` and `.txt` files in managed folder, each bound to one owned patient by opaque HMAC patient reference and file-ID-bound HMAC verified server-side.

#### Scenario: Create managed Markdown file
- **WHEN** authenticated user submits owned patient, stable operation UUID, valid `.md` name, Markdown MIME, and non-empty content at most 1 MiB
- **THEN** backend creates file under exact managed folder with application markers, opaque patient reference, `creationOperationId` equal to request operation UUID, and valid file-ID-bound MAC before returning it as managed

#### Scenario: Create managed text file
- **WHEN** authenticated user submits owned patient, stable operation UUID, valid `.txt` name, plain-text MIME, and valid content
- **THEN** backend creates equivalent patient-bound managed file

#### Scenario: Invalid patient is hidden
- **WHEN** user supplies missing or foreign patient UUID
- **THEN** backend returns `404` before Google access

#### Scenario: Client file ID is insufficient
- **WHEN** client requests a file ID
- **THEN** backend fetches metadata and requires exact parent, markers, expected patient reference, constant-time-valid file MAC, MIME/extension pair, size, and not-trashed state before read or update

#### Scenario: Foreign or unmarked file is rejected
- **WHEN** file belongs elsewhere, another patient, another user, lacks markers, has missing/invalid binding MAC, is trashed, or has unsupported type
- **THEN** backend returns sanitized not-managed/not-found behavior and does not read or write content

#### Scenario: Connected account tampers with patient metadata
- **WHEN** patient reference or file binding is copied or changed through Google account access
- **THEN** file-ID-bound MAC verification fails and backend does not classify, read, update, or insert file as requested patient

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
- **THEN** backend Drive query includes exact managed parent, not-trashed state, application markers, and computed patient reference before pagination, requests at most 100 metadata rows ordered by modified time then name, verifies each file MAC, and returns optional opaque next token

#### Scenario: Continue listing
- **WHEN** valid opaque page token is supplied
- **THEN** backend returns next scoped page without exposing or interpreting token in UI

#### Scenario: Search managed files
- **WHEN** user submits body containing owned patient, stripped 1-to-200-character query, and optional cursor
- **THEN** backend escapes Drive literal, scopes Drive query to managed parent, application markers, computed patient reference, and name term before pagination, verifies every file MAC, and returns cursor page

#### Scenario: Search privacy
- **WHEN** file search is performed
- **THEN** query and document names appear in neither browser/application endpoint URL, access/application/debug/error logs, analytics, nor telemetry; escaped query is sent only through TLS-protected Google `q`

#### Scenario: Invalid cursor
- **WHEN** Google rejects supplied page token
- **THEN** API returns `422 DRIVE_PAGE_TOKEN_INVALID` without leaking Google response body

#### Scenario: Opaque Google value is malformed
- **WHEN** `file_id`, `source_file_id`, or `page_token` is empty, contains control characters, or exceeds 2048 characters
- **THEN** backend returns sanitized `422` before Google access

### Requirement: Safe read and optimistic update
The system SHALL read validated managed text and SHALL detect Drive version changes before explicit updates without offering force overwrite.

#### Scenario: Read managed file
- **WHEN** user opens a file matching active patient and all managed-file checks
- **THEN** backend streams at most 1 MiB, decodes UTF-8, and returns content with current version and modified time

#### Scenario: Explicit update succeeds
- **WHEN** user submits stable operation UUID, non-empty valid content, and `expected_version` matching immediately fetched metadata version
- **THEN** backend atomically updates media plus `appProperties.lastOperationId` equal to request operation UUID, preserves managed binding properties, and returns fresh version and modified time

#### Scenario: Version changed
- **WHEN** current Drive version differs from expected version
- **THEN** backend returns `409 DRIVE_FILE_CHANGED`, does not write, preserves local editor content, and UI offers Cancel or View current version

#### Scenario: No force overwrite
- **WHEN** conflict is displayed
- **THEN** V1 exposes no overwrite-anyway action

### Requirement: Duplicate-resistant Drive writes
The system MUST mark workspace recreation, create, import-copy, and update with one caller-stable UUID operation ID, reconcile ambiguous outcomes once, and MUST NOT claim exactly-once semantics or automatically retry an uncertain Drive write.

#### Scenario: Create response is lost
- **WHEN** create/import/recreate returns timeout, connection loss, 429, or 5xx after Google may have committed write
- **THEN** backend queries exact `appProperties.creationOperationId` equal to request operation UUID once and returns matching validated resource when found

#### Scenario: Reconciliation remains inconclusive
- **WHEN** operation marker is absent after ambiguous write
- **THEN** backend returns `503 DRIVE_WRITE_UNKNOWN`, performs no write retry, and UI preserves local state while requiring list/file refresh before explicit new attempt

#### Scenario: Update response is lost
- **WHEN** update result is ambiguous
- **THEN** backend fetches exact file and treats `appProperties.lastOperationId` equal to request operation UUID as success, otherwise returns conflict or unknown without retry

#### Scenario: Operation ID is reused incorrectly
- **WHEN** operation marker already identifies different target or patient
- **THEN** backend returns `409 DRIVE_OPERATION_REUSED` and performs no write

#### Scenario: Frontend does not retry unknown write
- **WHEN** API returns `DRIVE_WRITE_UNKNOWN`
- **THEN** frontend keeps operation context and local text for reconciliation display but sends no automatic or hidden repeat write

### Requirement: Imported files become managed copies
The system SHALL offer Google Picker as UI for choosing external `.md` or `.txt` source, treat returned source ID as untrusted, and create new patient-bound copy only after independent backend validation without retaining or mutating original.

#### Scenario: Picker token is issued
- **WHEN** connected authenticated user posts owned active patient to Picker-token endpoint
- **THEN** backend verifies patient before token mint and returns short-lived access token with `Cache-Control: no-store` and `Pragma: no-cache`

#### Scenario: Picker token boundary is represented accurately
- **WHEN** Picker token is returned
- **THEN** system treats token as Google-account scoped rather than patient scoped and enforces patient isolation again on import endpoint

#### Scenario: Browser handles Picker token
- **WHEN** frontend receives Picker token
- **THEN** it uses token immediately with raw official `google.picker.PickerBuilder`, no React wrapper package, and never stores or emits token through browser storage, cookies, logs, console, analytics, or telemetry

#### Scenario: Import valid source
- **WHEN** Picker selects one permitted source and user confirms import with stable operation UUID for active owned patient
- **THEN** backend validates metadata/size/encoding, downloads source, creates newly marked managed copy, and returns copy metadata

#### Scenario: Original remains untouched
- **WHEN** import-copy succeeds or fails
- **THEN** source is never moved, renamed, updated, deleted, registered, or retained in PostgreSQL

#### Scenario: Picker source is invalid
- **WHEN** selected file is trashed, unsupported, oversized, inaccessible, or invalid UTF-8
- **THEN** backend creates no managed copy and returns sanitized error

#### Scenario: Managed source cannot be imported
- **WHEN** selected source carries this application's `managedBy` marker for any patient
- **THEN** backend rejects import before content download and creates no copy

### Requirement: Bounded and sanitized Google integration
The system MUST apply explicit timeouts, operation-aware retries, streaming read limits, stable public errors, and sensitive logging prohibition to every Google request.

#### Scenario: Transient Google failure
- **WHEN** network error, timeout, 429, or 5xx occurs on GET/list or refresh-token exchange
- **THEN** integration retries at most twice with bounded backoff and jitter before sanitized failure

#### Scenario: Write transient failure
- **WHEN** network error, timeout, 429, or 5xx occurs on Drive write
- **THEN** integration performs one operation-ID reconciliation and never retries write automatically

#### Scenario: Permanent failure
- **WHEN** validation, 400, permission 403, not found 404, conflict, or invalid grant occurs
- **THEN** integration does not run generic retries

#### Scenario: Authorization-code exchange or revoke fails transiently
- **WHEN** authorization-code exchange or revoke receives timeout, network error, 429, or 5xx
- **THEN** integration does not retry that request; callback fails safely or disconnect continues local clearing respectively

#### Scenario: Expired access token
- **WHEN** Google returns first 401
- **THEN** integration obtains a new request-local token once; repeated 401 marks grant revoked without invalidating Dental session

#### Scenario: Every read is byte-bounded
- **WHEN** any managed or Picker-selected media body is downloaded
- **THEN** backend stops stream above 1,048,576 bytes even when prior metadata declared smaller size

#### Scenario: Request body is transport-bounded
- **WHEN** `/api/google-drive/*` request body exceeds 8 MiB
- **THEN** ASGI boundary returns `413` before JSON parsing or route execution while decoded document remains limited to 1 MiB

#### Scenario: Sensitive logs remain empty
- **WHEN** any Drive operation succeeds or fails at any log level
- **THEN** content, name, search query, source ID, patient identity text, RUT, raw Google body, and all credentials are absent

#### Scenario: Drive validation fails
- **WHEN** Drive route request fails schema or field validation
- **THEN** existing sensitive validation sanitizer omits submitted input/context from response and logs

### Requirement: Same-origin Drive mutations
The system MUST reject cross-origin Drive mutations before database or Google side effects and MUST NOT rely on SameSite cookies alone.

#### Scenario: Valid mutation origin
- **WHEN** authenticated browser sends Drive `POST` or `PUT` with configured exact Origin, compatible same-origin Fetch Metadata when present, and JSON content type where body exists
- **THEN** request proceeds to normal authorization and validation

#### Scenario: Missing or foreign mutation origin
- **WHEN** Drive mutation has absent or mismatched Origin or cross-site Fetch Metadata
- **THEN** backend returns `403` before Google or database mutation

#### Scenario: OAuth callback crosses origin
- **WHEN** Google redirects browser to OAuth callback
- **THEN** callback is exempt from mutation-origin check and is protected by user/session-bound one-shot OAuth state

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
- **THEN** one discriminated workspace state including `workspace_recovery_pending` renders valid Spanish loading, empty, error, warning, and recovery behavior without impossible boolean combinations

#### Scenario: Persisted active status is presented
- **WHEN** status endpoint reads persisted active connection
- **THEN** public status is `connected`, `workspace_missing`, or `workspace_recovery_pending` according to authoritative-folder verification; persisted terminal statuses map directly

### Requirement: Patient-safe workspace transitions
The system MUST require active patient for every file interaction and MUST resolve dirty editor state before any supported transition that would discard editor state.

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

#### Scenario: Dirty internal navigation
- **WHEN** user changes thread, follows app navigation, or logs out with dirty editor
- **THEN** AppShell transition-guard context suspends captured same-origin link or guarded programmatic continuation and applies same save/discard/cancel choices

#### Scenario: Modified or external link
- **WHEN** user activates modified-click, download, targeted, or external link
- **THEN** internal transition guard does not hijack browser behavior

#### Scenario: Dirty browser unload
- **WHEN** user reloads or closes browser context with dirty editor
- **THEN** active `beforeunload` handler requests browser-native confirmation without attempting asynchronous save

#### Scenario: Clean navigation
- **WHEN** editor is clean or absent
- **THEN** patient/thread/navigation/logout/close proceeds without Drive prompt

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
- **WHEN** user changes existing document content
- **THEN** editor displays dirty state and no remote request occurs

#### Scenario: Existing file name is immutable
- **WHEN** user edits existing managed file
- **THEN** current name is read-only and no rename request is available; only new local draft name is editable

#### Scenario: Save lifecycle
- **WHEN** user explicitly saves
- **THEN** UI announces Saving, disables duplicate save, then displays Saved with returned version or preserves dirty content with recoverable error

#### Scenario: Empty remote save
- **WHEN** content is empty/whitespace or name/type/byte limit is invalid
- **THEN** frontend and backend reject save and Drive is unchanged

### Requirement: Disconnect revokes credentials without deleting files
The system SHALL attempt Google revocation, always clear local credentials and request-local token material, and leave managed Drive files untouched.

#### Scenario: Disconnect succeeds
- **WHEN** connected user confirms disconnect
- **THEN** backend attempts token revocation, clears encrypted token and current request token, marks disconnected, and leaves folder/files in Drive

#### Scenario: Revoke endpoint fails
- **WHEN** Google revoke is already invalid or unavailable
- **THEN** local credentials are still cleared, request-local token is dropped, error is sanitized, and no server worker retains a cached token

#### Scenario: Grant becomes revoked
- **WHEN** refresh returns `invalid_grant` or repeated Drive 401 occurs
- **THEN** backend persists checked `revoked` state, clears refresh credentials, returns `403 GOOGLE_DRIVE_REVOKED`, and status remains revoked across workers/restarts until reconnect or disconnect without triggering Dental login redirect

#### Scenario: Explicit disconnect resolves revoked state
- **WHEN** user disconnects while connection status is revoked
- **THEN** checked connection status transitions to disconnected and overlapping revoked/disconnected state is impossible

#### Scenario: No Drive deletion API
- **WHEN** client inspects Drive API surface
- **THEN** no delete, move, share, permission, or arbitrary upload endpoint exists

### Requirement: Restrictive Picker browser policy
The system MUST deploy Picker with restrictive Content Security Policy and MUST complete Google OAuth production-readiness prerequisites before public exposure.

#### Scenario: Picker CSP is served
- **WHEN** production application response loads Drive workspace
- **THEN** CSP defaults to self, blocks objects/base injection/framing, excludes unsafe eval/wildcards, allows only exact raw PickerBuilder script/frame/connect origins, preserves existing fonts through exact `fonts.googleapis.com` style and `fonts.gstatic.com` font origins, and does not load Google Identity Services token client

#### Scenario: OAuth production release gate
- **WHEN** Drive feature is prepared for public production use
- **THEN** release evidence verifies separate production Cloud project, owned domain, public HTTPS homepage, privacy policy and Limited Use disclosure, accurate branding/support contact, exact origins/redirects, enabled APIs, and applicable Google verification before production configuration is enabled

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
