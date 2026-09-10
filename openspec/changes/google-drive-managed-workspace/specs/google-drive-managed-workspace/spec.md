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

### Requirement: Patient-bound managed TXT files
The system MUST manage only app-created UTF-8 `.txt` files in the managed folder, each bound to one owned patient by opaque HMAC patient reference and file-ID-bound HMAC verified server-side. Backend owns `text/plain` MIME and destination normalization.

#### Scenario: Create managed TXT file
- **WHEN** authenticated user submits owned patient, stable operation UUID, valid name, and non-empty exported plain-text content at most 1 MiB
- **THEN** backend normalizes destination to lowercase `.txt`, creates `text/plain` content under exact managed folder with application markers, opaque patient reference, `creationOperationId` equal to request operation UUID, and valid file-ID-bound MAC before returning it as managed

#### Scenario: Create request has no frontend MIME selector
- **WHEN** frontend creates a managed document
- **THEN** request conceptually contains `patient_id`, `operation_id`, `name`, and exported `content`, while backend supplies `text/plain` and frontend sends no MIME selector

#### Scenario: Update request preserves TXT contract
- **WHEN** frontend explicitly updates an existing managed document
- **THEN** update body contains `patient_id`, caller-stable `operation_id`, exported content, and expected version, but contains no name or MIME and cannot rename the managed file

#### Scenario: New name gets TXT extension
- **WHEN** a new draft name has no extension
- **THEN** UI visibly normalizes it to `.txt` before save and backend creates only `text/plain` `.txt`

#### Scenario: Markdown destination is normalized
- **WHEN** a new draft name ends in `.md`
- **THEN** UI visibly normalizes it to `.txt`, no Markdown destination is created, and backend still owns `text/plain`

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

#### Scenario: Exported bytes define size boundary
- **WHEN** local Markdown serializes to exactly 1 MiB of valid UTF-8 bytes
- **THEN** create or update remains eligible

#### Scenario: Exported bytes exceed size boundary
- **WHEN** local Markdown serializes above 1 MiB after export
- **THEN** save is rejected before Drive mutation, even if source authoring text was smaller

#### Scenario: Duplicate name is allowed
- **WHEN** valid managed folder already has file with same name
- **THEN** create may produce another file because Drive `file_id`, not name, is identity

#### Scenario: Existing managed name is read-only
- **WHEN** an existing managed TXT file is opened for editing
- **THEN** filename cannot be changed and update sends content/version only

#### Scenario: Managed file list excludes invalid content
- **WHEN** list or search encounters a file with wrong parent, marker, patient binding, extension, MIME, or declared size
- **THEN** backend excludes it and returns only metadata-valid patient-bound managed `.txt` files without downloading every body; bounded read later rejects invalid UTF-8 before content is exposed

### Requirement: Deterministic Markdown-to-plain-text export
The system MUST serialize local Markdown authoring to clean deterministic plain text before managed persistence or external Markdown import. The serializer MUST preserve clinically relevant text, avoid executable HTML, produce meaningful newlines, and never be an ad-hoc regex-only parser.

#### Scenario: Markdown presentation delimiters are removed
- **WHEN** local authoring contains headings, emphasis, inline backticks, fenced code delimiters, or block-quote markers
- **THEN** exported plain text preserves readable content while removing those presentation delimiters

#### Scenario: Lists remain readable
- **WHEN** local authoring contains unordered or numbered lists
- **THEN** export uses readable `•` bullets for unordered items and human-readable numbering for numbered items

#### Scenario: Informative links retain destination
- **WHEN** local authoring contains a link with an informative label and URL
- **THEN** `[label](URL)` exports as `label (URL)` and an autolink exports as its URL

#### Scenario: HTML is never executable
- **WHEN** local authoring or imported source contains HTML-looking content
- **THEN** export removes HTML tags without creating an executable path, preserves clinically relevant text, and exposes no raw-HTML rendering behavior

#### Scenario: Whitespace is meaningful and bounded
- **WHEN** local authoring contains meaningful paragraph or list breaks and excessive blank space
- **THEN** export normalizes CRLF to LF, preserves paragraph/list/code line breaks, collapses three or more consecutive newlines to two, trims trailing horizontal whitespace, and ends with exactly one LF

#### Scenario: Serializer is deterministic
- **WHEN** the same local Markdown input is serialized repeatedly
- **THEN** output bytes are identical, and one shared expected-output fixture corpus covers headings, emphasis, inline/fenced code, quotes, unordered/nested and numbered lists, links/autolinks, HTML-looking text, CRLF, blank lines, Unicode, trailing whitespace, and final-newline behavior for frontend local export and backend Picker conversion

#### Scenario: Canonical fixture defines combined behavior
- **WHEN** local authoring is `# Evolución\r\n\r\n**Dolor** con [referencia](https://example.test).\r\n\r\n- Leve\r\n- Control\r\n`
- **THEN** exact UTF-8 export is `Evolución\n\nDolor con referencia (https://example.test).\n\n• Leve\n• Control\n`

#### Scenario: Persisted plain text uses identity export
- **WHEN** remote TXT is opened with any valid UTF-8 plain text, including Markdown-like characters or no final newline
- **THEN** `authoringRepresentation` is `persisted_plain_text`, `localAuthoringContent` and `persistedPlainTextBaseline` equal exact remote content, `plainTextExport` is byte-faithful identity, and document is immediately clean

### Requirement: Scoped cursor listing and search
The system SHALL list and search only active patient's metadata-valid managed `.txt`/`text/plain` files with opaque cursor pagination, bounded fields, and no document names or search terms in URLs or logs. Content encoding is validated by bounded read before exposure, not by downloading every body during list/search.

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
- **WHEN** user submits update content and `expected_version` matching immediately fetched metadata version while write context carries one stable operation UUID for reconciliation
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

### Requirement: Imported files become managed TXT copies
The system SHALL offer Google Picker as UI for choosing external `.md` or `.txt` source, treat returned source ID as untrusted, and create a new patient-bound `.txt`/`text/plain` copy only after independent backend validation without retaining or mutating original.

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
- **THEN** backend validates metadata/size/encoding, downloads source, serializes external Markdown to clean plain text when needed, normalizes destination to `.txt`, creates newly marked `text/plain` managed copy, and returns copy metadata

#### Scenario: Picker source type is validated independently
- **WHEN** backend validates a Picker-selected external source
- **THEN** it accepts only case-insensitive `text/markdown` + `.md` or `text/plain` + `.txt` source pairs before download; these source pairs never authorize a managed Markdown destination

#### Scenario: Picker TXT source becomes TXT copy
- **WHEN** Picker selects valid external `.txt` source
- **THEN** backend validates and normalizes it into a patient-bound managed `.txt` copy with `text/plain`

#### Scenario: Picker Markdown source becomes TXT copy
- **WHEN** Picker selects valid external `.md` source
- **THEN** backend validates, serializes it to clean plain text, normalizes its source filename or valid user destination to `.txt`, and creates a patient-bound managed TXT copy

#### Scenario: Picker export exceeds persisted limit
- **WHEN** external Markdown source is within download limit but its deterministic plain-text export exceeds 1,048,576 UTF-8 bytes
- **THEN** backend rejects import before Drive creation and leaves original source untouched

#### Scenario: Explicit Markdown destination is normalized
- **WHEN** import supplies a destination ending in `.md`
- **THEN** destination visibly and server-side normalizes to `.txt`; no Markdown destination is created

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
The system SHALL present Drive as non-modal resizable sidecar beside `/assistant` on desktop and as accessible modal Sheet below 768 px, using incremental Radix/shadcn primitives and existing visual tokens. The allowlist is `Resizable`, `Sheet`, `ScrollArea`, `AlertDialog`, and `Alert`; repository Spinner and compatible existing/native Button, Input, Textarea, Badge, Tooltip, loading, and empty patterns are reused. Tabs, ToggleGroup, Progress, Dialog, Drawer, Command, Combobox, Card-per-file, DataTable, and another Markdown renderer are not added.

#### Scenario: Desktop opens sidecar
- **WHEN** user activates Google Drive utility at desktop width
- **THEN** Assistant remains operable beside keyboard-resizable Drive panel without backdrop

#### Scenario: Mobile opens Sheet
- **WHEN** user activates Drive below 768 px
- **THEN** Sheet opens from right with labelled dialog, backdrop, Escape, focus trap, inert background, and focus return

#### Scenario: Incremental primitive adoption
- **WHEN** Drive UI is added
- **THEN** only approved primitives and dependencies are introduced after official project/config inspection, docs review, dry-run, and diff review; existing Sidebar, Composer, Chat, messages, cards, Motion, tokens, and unrelated components are not migrated

#### Scenario: Connection onboarding
- **WHEN** Drive is disconnected
- **THEN** centered onboarding shows `Conecta Google Drive`, `Trabaja con documentos asociados al paciente sin salir del Asistente Clínico.`, one primary `Conectar Google Drive`, and secondary `Dental AI Assistant sólo administrará los archivos que cree o importes explícitamente.`, without OAuth/security internals or a second primary

#### Scenario: Drive is unconfigured
- **WHEN** required Drive configuration is absent
- **THEN** workspace passively shows `Google Drive no está disponible` and `La integración no está configurada en este entorno.`, with no fake connection CTA

#### Scenario: Connection starts
- **WHEN** user activates `Conectar Google Drive`
- **THEN** the same primary immediately becomes disabled repository Spinner plus `Conectando…`, with no percentage

#### Scenario: Connected workspace header
- **WHEN** Drive status is connected and workspace is available
- **THEN** compact header shows `Google Drive`, `Conectado`, workspace `Dental AI Assistant`, search, compact semantic rows, and secondary `Importar una copia`, without Google account identity

#### Scenario: Revoked connection preserves Dental login
- **WHEN** public status is revoked
- **THEN** Alert title is `Vuelve a conectar Google Drive`, description is `El acceso al workspace dejó de estar disponible. Tu sesión de Dental AI Assistant continúa activa.`, action is `Reconectar`, and Dental authentication remains active

#### Scenario: Missing workspace has no implicit recreation
- **WHEN** authoritative folder cannot be verified during ordinary operation
- **THEN** Alert title is `Workspace no disponible`, description is `La carpeta administrada anteriormente no se puede verificar.`, action is `Ver opciones`, and no implicit recreation occurs; that explicit action opens AlertDialog `Recrear workspace` with `Se creará una nueva carpeta Dental AI Assistant. Los archivos de la carpeta anterior no se eliminarán.` and actions `Cancelar` / `Recrear workspace`

#### Scenario: Recovery pending requires explicit acknowledgement
- **WHEN** folder creation remains unresolved and may have created an orphan
- **THEN** Alert shows `Revisión del workspace pendiente`, `Google Drive podría haber creado una carpeta que Dental AI Assistant todavía no puede verificar. Revisa las opciones antes de crear otra.`, and `Ver opciones`; only that explicit action opens AlertDialog `Recrear workspace` with `Podría existir una carpeta anterior no administrada. Si aparece después, deberás eliminarla manualmente desde Google Drive.` and actions `Cancelar` / `Recrear workspace`, while no ordinary write proceeds

#### Scenario: General error is recoverable and sanitized
- **WHEN** a Drive error has a valid concrete recovery action
- **THEN** Alert title is `No se pudo completar la acción`, description starts `Tu trabajo local se conserva.` with sanitized context, and a concrete action appears only when a stable error maps to valid recovery, without IDs or provider response bodies

#### Scenario: Loading, empty, and operation feedback is explicit
- **WHEN** workspace loads a list, finds no patient documents, opens, saves, imports, or checks recovery
- **THEN** visible status is respectively `Cargando documentos…`, `No hay documentos para este paciente.`, `Abriendo…`, `Guardando…`, `Importando…`, or `Revisando workspace…`, without fabricated percentage

#### Scenario: Successful operations end clearly
- **WHEN** save, import, or workspace recovery succeeds
- **THEN** visible completion is respectively `Guardado`, `Copia importada`, or `Workspace disponible`

#### Scenario: Alert and AlertDialog have different jobs
- **WHEN** workspace communicates status or recovery versus asks for an irreversible or data-loss-sensitive choice
- **THEN** `Alert` informs inline for revoked, missing, recovery-pending, or recoverable errors, while `AlertDialog` confirms only explicit consequences such as dirty-content discard or possible-orphan recreation

#### Scenario: Hick and Von Restorff keep one dominant action
- **WHEN** any connection, document, import, save, or recovery state renders
- **THEN** one valid primary action is visually dominant and secondary actions remain available without competing emphasis

#### Scenario: Fitts and Proximity keep controls near their work
- **WHEN** frequent search, open, Preview/Edit, Save, import, or recovery actions render
- **THEN** each has a comfortable pointer/keyboard target beside the content it affects, while related metadata is grouped through spacing instead of repeated borders or per-file cards

#### Scenario: Jakob and Tesler keep interaction familiar
- **WHEN** user connects, searches, opens, edits, saves, imports, or recovers
- **THEN** UI uses familiar labels and patterns without exposing OAuth scopes, operation IDs, Drive version IDs, HMACs, cryptographic binding, provider account identity, or implementation details

#### Scenario: Doherty and Peak-End make progress and success clear
- **WHEN** Connect, Open, Save, Import, or Recover begins or completes
- **THEN** UI acknowledges the action immediately without fabricated percentage and ends successful work with one unequivocal visible success state

#### Scenario: Error recovery preserves work
- **WHEN** any remote operation fails, conflicts, is revoked, or remains ambiguous
- **THEN** local authoring/editor content remains available while UI offers only a concrete valid recovery action

#### Scenario: UX priorities resolve tension
- **WHEN** interaction principles conflict
- **THEN** implementation prioritizes clarity, accessibility, user control, data safety, then task completion

#### Scenario: Workspace states
- **WHEN** connection, list, editor, conflict, missing workspace, revoked grant, or error changes
- **THEN** one discriminated workspace state including `viewing` and `workspace_recovery_pending` renders valid Spanish loading, empty, error, warning, and recovery behavior without impossible boolean combinations

#### Scenario: Authoring and persisted baseline are distinct
- **WHEN** document state is represented
- **THEN** discriminated state conceptually carries `localAuthoringContent`, `authoringRepresentation: local_markdown | persisted_plain_text`, and `persistedPlainTextBaseline`, derives representation-aware `plainTextExport`, and never uses independent loading/viewing/editing/saving/dirty booleans as a substitute or exposes a format selector

#### Scenario: Recovery status is derived
- **WHEN** persisted connection is `active` with a completed or pending folder operation
- **THEN** public status derives `connected`, `workspace_missing`, or `workspace_recovery_pending` from folder verification and pending-operation evidence, while database checked states remain only `active`, `disconnected`, or `revoked`

#### Scenario: Persisted active status is presented
- **WHEN** status endpoint reads persisted active connection
- **THEN** public status is `connected`, `workspace_missing`, or `workspace_recovery_pending` according to authoritative-folder verification; persisted terminal statuses map directly

### Requirement: Application-native TXT preview
The system SHALL open existing managed TXT files in a read-only application-native Preview before editing, SHALL render only the validated local document buffer, and SHALL NOT use a Google-hosted or other external rendering surface. Local authoring may use Markdown presentation before save; persisted remote content is plain TXT and is never reconstructed as Markdown.

#### Scenario: Existing managed file opens in Preview
- **WHEN** user opens a validated managed file from active patient's list or search results
- **THEN** workspace transitions `ready -> opening -> viewing`, shows faithful plain-text Preview rather than an editable textarea, and performs only the existing managed-TXT read request

#### Scenario: Assistant-created draft opens in Edit
- **WHEN** eligible Assistant content seeds a new local Drive draft
- **THEN** workspace begins in `editing` because no persisted Drive file exists

#### Scenario: Local Markdown preview is safe
- **WHEN** an unsaved local authoring buffer contains Markdown
- **THEN** frontend renders it with installed `react-markdown` and `remark-gfm` without `rehype-raw`, `dangerouslySetInnerHTML`, executable raw HTML, iframe, Google viewer, or additional renderer dependency

#### Scenario: Remote TXT preview remains literal
- **WHEN** opened file is a managed `text/plain` `.txt`
- **THEN** frontend interprets no markup and preserves whitespace while wrapping long content without horizontal page overflow

#### Scenario: Reopen does not reconstruct Markdown
- **WHEN** a local Markdown draft is saved and later closed and reopened from Drive
- **THEN** reopened content is faithful remote TXT with no Markdown reconstruction claim or invented semantics

#### Scenario: Preview and Edit share one buffer
- **WHEN** user edits content and activates Preview before saving
- **THEN** Preview displays unsaved local content from same buffer without refetching, saving, inserting into composer, submitting, starting SSE, or invoking LLM

#### Scenario: Manual edit has no request before save
- **WHEN** user manually changes the local authoring buffer in Edit and has not activated Save
- **THEN** no Google, network, save, composer, SSE, or LLM request occurs

#### Scenario: User returns to Edit
- **WHEN** user activates Edit from Preview
- **THEN** editor shows unchanged local buffer and persisted version baseline without a Google request

#### Scenario: Successful save resets baseline
- **WHEN** explicit save succeeds from Edit
- **THEN** state briefly announces `Guardado`, updates returned version/modified metadata, sets `persistedPlainTextBaseline = plainTextExport`, derives clean state, and returns to clean `editing`; Preview remains an explicit user choice

#### Scenario: Dirty state is derived
- **WHEN** workspace evaluates whether document can be discarded safely
- **THEN** document is dirty exactly when it has no persisted file or `plainTextExport != persistedPlainTextBaseline`, where `plainTextExport = serializeToPlainText(localAuthoringContent, authoringRepresentation)` and `persisted_plain_text` uses byte-faithful identity, without an independent dirty boolean

#### Scenario: Preview exposes safe document context
- **WHEN** Preview or Edit is visible
- **THEN** header exposes Back, normalized `.txt` filename/type, and available size/modified metadata; existing filename is read-only, new-draft name is editable only in Edit and visibly normalizes to `.txt`, and file ID, patient ID, folder ID, Google account ID, and technical version remain hidden

#### Scenario: Mobile document layout keeps one scroll owner
- **WHEN** document is open below 768 px
- **THEN** Sheet occupies available viewport height, keeps document header and actions visible, and makes only document body scroll

#### Scenario: Mode control remains minimal and accessible
- **WHEN** Preview/Edit control renders
- **THEN** two keyboard-operable native buttons expose accessible names, visible focus, and `aria-pressed` selected state without adding Tabs, ToggleGroup, or another component dependency

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
- **WHEN** user activates `Insertar en el chat` from Preview or Edit and file patient matches active patient
- **THEN** complete current local buffer appends to composer draft with newline separation and composer receives focus

#### Scenario: Insert selection
- **WHEN** user selects non-empty editor text and activates keyboard-accessible `Insertar selección en el chat`
- **THEN** only selected text appends to composer draft

#### Scenario: Full insertion remains available while editing
- **WHEN** editor has a non-empty selection
- **THEN** selection insertion is available without replacing full-document insertion

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
- **THEN** no remote write occurs until user activates Save with valid name and non-empty exported plain-text content; create sends patient, operation, normalized name, and export, with backend-owned `text/plain`

#### Scenario: Assistant Markdown transfers through serializer
- **WHEN** a structured Assistant draft or message contains Markdown delimiters and user saves it
- **THEN** persisted content is deterministic clean plain text without Markdown delimiters, while local authoring may remain Markdown until close or reopen

#### Scenario: Save errors preserve authoring
- **WHEN** save returns validation, conflict, unknown-write, or general error
- **THEN** local authoring content remains available, no hidden retry occurs, and user can recover explicitly

#### Scenario: Approval remains separate
- **WHEN** unapproved clinical draft is prepared for Drive
- **THEN** action does not approve or persist authoritative PostgreSQL evolution and Drive copy remains user-controlled document

### Requirement: Manual visible save state
The system SHALL use manual save with visible local state and SHALL not autosave remote content.

#### Scenario: Edit existing document
- **WHEN** user explicitly enters Edit from an existing document Preview and changes content
- **THEN** editor displays dirty state derived from local buffer and persisted baseline and no remote request occurs

#### Scenario: Existing file name is immutable
- **WHEN** user edits existing managed file
- **THEN** current name is read-only and no rename request is available; only new local draft name is editable

#### Scenario: Save lifecycle
- **WHEN** user explicitly saves
- **THEN** UI immediately announces `Guardando…`, disables duplicate save, then displays `Guardado` or preserves dirty content with recoverable error; technical Drive version remains hidden

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
- **THEN** no delete, move, share, permission, or arbitrary/global upload endpoint exists; controlled patient-bound TXT creation remains available

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
