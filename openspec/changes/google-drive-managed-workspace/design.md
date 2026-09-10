## Context

Current `/assistant` is a patient-aware clinical workspace. `ClinicalAssistantArea` owns active patient, composer drafts, queue behavior, and clinical runtime integration. `AppShell` owns navigation/sidebar layout but has no accessory pane seam. `Sidebar` owns a hardcoded Biblioteca button and modal `VideoExplorer`; copying that model would block simultaneous document and Assistant work.

Google Drive introduces a second authorization domain and external persistence system. Dental JWT identifies the application user. Google OAuth grants that user limited Drive access. These identities remain independent even when emails happen to match. Google credentials never become Dental session credentials.

Feature handles clinical text, OAuth secrets, external writes, responsive interaction, and patient switching. Design therefore chooses a narrow managed workspace rather than general Drive access.

## Goals / Non-Goals

**Goals**

- Give `/assistant` a patient-bound Drive sidecar that stays usable beside conversation on desktop.
- Use only `drive.file` and work persistently only with files created by this application.
- Keep one authoritative managed visible folder per current Google connection and validate every file operation server-side.
- Support only managed UTF-8 `.txt` list, search, read, create, explicit update, and safe imported copies. Picker may select external `.md` or `.txt` sources; both become managed `.txt` copies.
- Keep Markdown as local authoring/presentation only and export it deterministically to plain text before persistence.
- Preview existing managed documents locally before editing them.
- Prevent silent data transfer, cross-patient carryover, token exposure, overwrite conflicts, and sensitive logging.
- Use accessible, incremental shadcn/Radix primitives without redesigning existing application UI. Approved shadcn primitives are `Resizable`, `Sheet`, `ScrollArea`, `AlertDialog`, and `Alert`.

**Non-Goals**

- General Drive explorer, native Google Docs editor, shared drives, synchronization, file deletion, or autonomous agent access.
- New clinical persistence model or replacement of existing approved evolution workflow.
- Whole-application component-library migration.

## Boundary and Ownership

### Dental authentication

`auth/dependencies.py:get_current_user` remains the highest Dental authentication Seam. Every `/api/google-drive/*` operation, including OAuth start/callback, resolves the current Dental user through the existing `session` cookie. Google tokens never enter that cookie or Dental JWT claims.

### Google authorization

`integrations/google_drive_oauth.py` is the Module owning authorization URL construction, authorization-code exchange, refresh, revoke, granted-scope verification, and Google-account identity lookup. Its Interface accepts configuration plus opaque codes/tokens and returns sanitized typed values. `httpx.AsyncClient` is the network Adapter so route handlers stay non-blocking.

Existing `httpx` handles OAuth token, refresh, revoke, account, and Drive HTTP calls; stdlib handles state generation/hashing and URL encoding. Only `cryptography` is added for AES-GCM. No synchronous network request may run on event loop.

### Credential persistence

`auth/token_cipher.py` owns authenticated encryption. `db/google_drive_repo.py` owns all SQL for one connection row per Dental user. Routes and integrations never contain SQL.

### Drive workspace

`integrations/google_drive.py` is the only Module that knows Google Drive API endpoint URLs and Drive request fields. Its Interface exposes folder, metadata, paging, read, create, update, and copy-import operations. OAuth account identity and revoke remain exclusively in `integrations/google_drive_oauth.py`. Routes orchestrate ownership and map sanitized domain errors to HTTP.

### Clinical web experience

`ClinicalAssistant` owns Drive accessory open state, active-patient binding, and dirty context-transition coordination. `ClinicalAssistantArea` remains owner of composer content. It exposes a narrow draft insertion Interface instead of letting Drive submit messages. `ClinicalTranscript` exposes eligible completed assistant text and structured draft serialization through callbacks.

`AppShell` gains generic `utilities` and `workspaceAccessory` Interfaces. Sidebar renders utilities; shell renders accessory. Neither imports Google Drive domain components. This is the highest reusable Seam and removes hardcoded feature ownership from Sidebar.

### Test seams

- Backend: authenticated route behavior with Google endpoints mocked by `respx`.
- Frontend: typed API mocks and visible interactions in Vitest.
- Browser: mocked `/api/google-drive/*` plus existing clinical endpoints in `tests/clinical-assistant.spec.ts` or a focused sibling spec.
- Manual: one documented test-user OAuth smoke against configured Google project; never CI.

### Preserved security invariants

The TXT-only content contract does not relax existing security boundaries: Dental auth remains independent from Google OAuth; scope remains exact `drive.file`; refresh tokens remain encrypted and access tokens request-local except the no-store Picker response; one authoritative folder remains ID/app-property bound; patient/file HMAC binding, stable operation IDs, one reconciliation with no blind retry, optimistic version checks, no force overwrite, no remote autosave, and no autonomous LLM/Drive/RAG/indexing/content-to-LLM path remain required. The AppShell seam, desktop `Resizable`, mobile `Sheet`, dirty guards, official Picker untrusted source ID, same-origin mutation checks, restrictive CSP, and no iframe/viewer remain unchanged.

## Decisions

1. Keep Dental JWT and Google OAuth separate.

   Dental JWT identifies `user_id`; Google refresh token authorizes Drive. No service account, JWT assertion, domain-wide delegation, Firebase/Auth0/Supabase replacement, or Google-email coupling is permitted.

2. Use exact scope `https://www.googleapis.com/auth/drive.file`.

   OAuth start sends `access_type=offline`, `include_granted_scopes=false`, and `prompt=consent`. Callback requires refresh token. Under OAuth semantics, omitted token-response `scope` means unchanged requested scope and is treated as exact `drive.file`; when `scope` is present its set must equal exactly `{drive.file}`. Explicit missing/extra scope fails connection atomically; any returned credential is revoked best-effort and never persisted.

3. Use one authoritative managed folder identified by ID and private metadata.

   Folder name is fixed as `Dental AI Assistant`. Creation sets:

   ```json
   {"appProperties":{"managedBy":"dental-ai-assistant","workspaceSchema":"1","creationOperationId":"<uuid>"}}
   ```

   DB `folder_id` is sole authority. Application never adopts same-named folder. Folder verification requests only `id,name,mimeType,trashed,appProperties` and requires folder MIME, not trashed, exact `managedBy`/`workspaceSchema`, and `creationOperationId` equal to operation UUID that created authoritative folder.

   Missing authoritative folder during ordinary operation produces `workspace_missing`; no write recreates it. Before every folder create, backend persists pending operation ID. Ambiguous create first reconciles exact `creationOperationId`. If found, backend persists it and performs no replacement. If still absent, status becomes `workspace_recovery_pending`, all folder/file writes remain blocked, and unacknowledged recreation returns `409 DRIVE_WORKSPACE_RECOVERY_PENDING` without mutation. `POST /workspace/recreate` first reconciles again; while still unknown it requires `acknowledge_possible_orphan=true` plus new operation ID before replacing pending marker and creating/persisting replacement. UI warns prior folder might exist and must be removed manually from Drive if it later appears. If acknowledged replacement is itself ambiguous, its new marker remains pending and same recovery state repeats. Initial successful OAuth may create first folder because connection itself is explicit. Contract guarantees one authoritative DB folder, not exactly one physical Drive folder under provider ambiguity.

4. Bind every managed file cryptographically to one owned patient.

   Create/import requires `patient_id`; backend verifies patient ownership before Google access. A random 32-byte per-connection binding secret is encrypted under token keyring and never sent to Google/browser. HMAC inputs use canonical UUID bytes and explicit domain separators: `patientRef = hex(HMAC-SHA256(secret, b"patient:v1\0" || user_id.bytes || patient_id.bytes))`; after Google returns file ID, `bindingMac = hex(HMAC-SHA256(secret, b"file:v1\0" || utf8(file_id) || b"\0" || user_id.bytes || bytes.fromhex(patientRef) || b"\0" || b"1"))`. Hex output is lowercase 64 characters. File metadata becomes:

   ```json
   {
     "appProperties": {
        "managedBy": "dental-ai-assistant",
        "workspaceSchema": "1",
        "patientRef": "<hex-hmac>",
        "bindingMac": "<hex-hmac>",
        "creationOperationId": "<request operation_id>"
     }
   }
   ```

    Create first writes content with application markers, patient reference, and `creationOperationId` exactly equal to request `operation_id`, then adds file-ID-bound MAC through metadata update before returning. If second step is ambiguous, reconciliation queries exact operation marker and completes/verifies binding; incomplete files never pass managed-file validation. Metadata-valid managed files require exact managed parent, not trashed, `text/plain` MIME, `.txt` extension, declared size at most 1 MiB, expected patient reference, and constant-time-valid file binding. List/search return only that metadata-valid set; they do not download every body. Read additionally enforces the streaming 1 MiB hard stop and valid UTF-8 before exposing content, while update validates new exported content before replacement. Dental session ownership of connection and requested patient remains authoritative. Connected-account owner may alter content or metadata, but cannot rebind file to another patient without server secret; altered binding fails closed.

5. Store one encrypted connection row and no file catalog.

   Migration `0012_google_drive_workspace` adds the connection row plus a short-lived OAuth transaction table:

   ```text
   google_drive_connections
   user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE
   google_account_id TEXT NULL
   refresh_token_ciphertext BYTEA NULL
   refresh_token_nonce BYTEA NULL
   token_key_version INTEGER NULL
   binding_secret_ciphertext BYTEA NOT NULL
   binding_secret_nonce BYTEA NOT NULL
   binding_key_version INTEGER NOT NULL
   granted_scopes TEXT[] NOT NULL DEFAULT '{}'
   folder_id TEXT NULL
   folder_name TEXT NULL
   folder_creation_operation_id UUID NULL
   pending_folder_operation_id UUID NULL
   status TEXT NOT NULL CHECK (status IN ('active','disconnected','revoked'))
   status_changed_at TIMESTAMPTZ NOT NULL
   connected_at TIMESTAMPTZ NOT NULL
   created_at TIMESTAMPTZ NOT NULL
   updated_at TIMESTAMPTZ NOT NULL

   google_drive_oauth_transactions
   state_hash BYTEA PRIMARY KEY
   user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
   session_fingerprint BYTEA NOT NULL
   folder_operation_id UUID NOT NULL
   expires_at TIMESTAMPTZ NOT NULL
   used_at TIMESTAMPTZ NULL
   created_at TIMESTAMPTZ NOT NULL
   ```

   `google_account_id` is Google's opaque Drive user permission ID, not email. File IDs/content and access tokens are not persisted. Checked `status` is sole persisted connection-state source: `active` requires all three refresh-token columns non-null and `granted_scopes` exactly `{drive.file}`; `disconnected`/`revoked` require all three refresh-token columns null and `granted_scopes='{}'`. Every transition updates `status_changed_at`; explicit disconnect changes active/revoked to disconnected, invalid grant/repeated Drive 401 changes active to revoked, and successful reconnect changes either terminal state to active. Terminal states clear refresh credentials and pending operation but retain Google account ID, completed folder ID/name/creation-operation identity, and encrypted binding secret. Reconnect to same verified Google account reuses folder/binding identity. Different account clears old folder/binding identity and generates new binding secret. Folder creation persists `pending_folder_operation_id` before Google access, then atomically persists returned `folder_id` plus matching `folder_creation_operation_id` before clearing pending marker. Reconciliation does same from matching Google metadata.

6. Encrypt refresh tokens with an independently versioned AES-256-GCM keyring.

   `GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEYS` is a version-to-key mapping whose values are URL-safe base64 encodings of exactly 32 random bytes; `GOOGLE_DRIVE_TOKEN_ACTIVE_KEY_VERSION` selects write key. AES-GCM uses fresh 12-byte nonce and associated data containing Dental `user_id`, purpose (`refresh-token` or `binding-secret`), and key version. Ciphertext includes authentication tag. `JWT_SECRET` is never reused. Reads select stored version; successful reads under old version re-encrypt refresh token and binding secret with active key in same request. Old key may be removed only after database has no token or binding rows at that version. Unknown version/authentication failure produces sanitized revoked/unavailable state and no Google request.

7. Make Drive configuration optional but fail the feature closed.

   Server config adds client ID, client secret, OAuth redirect URI, post-connect return URL, token keyring, active key version, and allowed application origins. Folder name remains fixed. If all required values are absent, app starts and Drive status reports `configured=false`; mutation/OAuth endpoints return sanitized `503 GOOGLE_DRIVE_NOT_CONFIGURED`. Partial or malformed configuration fails application startup with a configuration error. Return URL must be an exact configured URL, never a request parameter.

   Production values use `https://chat.dynamous.ai/api/google-drive/oauth/callback` and `https://chat.dynamous.ai/assistant`. Local documented values use backend callback on port 8000 and frontend return on port 5173.

8. Bind OAuth state to one initiating Dental user and session.

   `POST /oauth/start` requires Dental session, generates 32-byte URL-safe state and folder operation UUID, and stores only state hash, Dental `user_id`, SHA-256 fingerprint of current raw Dental session cookie, operation ID, expiry, and use timestamp. It sets the raw state in `google_drive_oauth_state` as `HttpOnly`, `Secure`, `SameSite=Lax`, `Max-Age=600`, path `/api/google-drive/oauth/callback`; response contains only authorization URL. Callback requires Dental session, constant-time matches query/cookie state, loads by state hash, checks expiry, initiating user, and current-session fingerprint, then atomically marks transaction used before code exchange. Any repeat, session/user change, or mismatch fails closed. Every terminal path clears the state cookie. Success validates scope/refresh token/account identity, encrypts/persists, ensures the first folder with the transaction's operation ID, and redirects to fixed return URL with only a sanitized result code. It never returns tokens in URL. Expired/used rows are pruned opportunistically.

9. Keep access tokens request-local; do not add a shared cache in V1.

   Each authenticated Drive HTTP request loads active connection, decrypts refresh token, obtains one access token, and reuses it only inside that request. No process, distributed, or persistent access-token cache exists, eliminating worker/blue-green invalidation state. Disconnect clears local credentials even when remote revocation fails. Access tokens are never written to DB, logs, analytics, or browser storage; Picker remains the explicit exception below.

10. Expose Picker token as a narrow exception.

   `POST /picker-token` accepts `{patient_id}`, verifies Dental ownership and active connection server-side, and returns `{access_token, expires_in}` with `Cache-Control: no-store` and `Pragma: no-cache`. Token itself is not cryptographically patient-scoped; patient isolation remains enforced by subsequent Dental API ownership and metadata checks. Frontend holds token in function/component memory only, loads official Picker JS API, constructs raw `google.picker.PickerBuilder` with exact app ID, API key, OAuth token, origin, one filtered `DocsView`, and callback, then drops references after Picker closes. No React Picker wrapper package, localStorage, sessionStorage, IndexedDB, cookie, telemetry, or console output is allowed.

11. Import only a copy.

    Picker is intended UI for choosing one external `.md`/`.txt` source but does not produce server-verifiable selection proof. `POST /import-copy` therefore treats source ID as untrusted opaque input, takes active `patient_id`, caller-stable `operation_id`, source ID, and optional destination name, and independently validates everything. Backend verifies owned patient, fetches source metadata, rejects every source already carrying this application's `managedBy` marker, validates not trashed and exact external-source pair (`text/markdown` + `.md` or `text/plain` + `.txt`, case-insensitive), checks declared size at most 1 MiB, downloads with streaming 1 MiB hard stop, UTF-8 decodes, serializes Markdown sources to deterministic plain text, then creates a new marked patient-bound `text/plain` `.txt` file in the managed folder. Source ID is discarded after request and never persisted. Original is never moved, changed, deleted, or managed.

12. Define exact file and search contracts.

   Endpoints:

   ```text
   GET  /api/google-drive/status
   POST /api/google-drive/oauth/start
   GET  /api/google-drive/oauth/callback
   POST /api/google-drive/disconnect
   POST /api/google-drive/workspace/recreate
   GET  /api/google-drive/files?patient_id=<uuid>&page_token=<opaque>
   POST /api/google-drive/files/search
   GET  /api/google-drive/files/{file_id}?patient_id=<uuid>
   POST /api/google-drive/files
   PUT  /api/google-drive/files/{file_id}
   POST /api/google-drive/picker-token
    POST /api/google-drive/import-copy
    ```

    “No upload endpoint” means no arbitrary or global upload surface. Controlled patient-bound TXT creation remains the create endpoint above, and import-copy remains the only external-source conversion path.

   List page size is 100, sorted `modifiedTime desc,name`. Search body is `{patient_id, query, page_token?}` with stripped query length 1..200. `file_id`, `source_file_id`, and `page_token` are opaque strings of 1..2048 characters with no control characters; invalid values fail before Google access. Backend computes patient reference and escapes Drive query literals. List/search Drive `q` includes exact parent, not-trashed state, `managedBy`, `workspaceSchema`, and `patientRef`; search additionally includes name term. Backend requests only allowed metadata fields and constant-time verifies each returned file MAC, TXT MIME/extension, parent, markers, patient reference, declared size, and not-trashed state without downloading bodies. Full encoding validity is established only by bounded read, so a remotely corrupted body fails closed when opened. Cursor is patient-scoped before pagination and returned as opaque `next_page_token`. Query/name never enters browser-visible or application endpoint URLs, access/application logs, analytics, or telemetry; escaped query necessarily appears in outbound TLS-protected Google `q`. Invalid Google page tokens map to `422 DRIVE_PAGE_TOKEN_INVALID`.

13. Define TXT-only managed naming and content rules.

    Managed destinations always use `text/plain` and lowercase `.txt`. Backend owns MIME and extension normalization. A new name without an extension visibly becomes `.txt`; a new destination ending in `.md` visibly becomes `.txt`; Markdown is never a valid managed destination. Existing managed names are read-only and cannot be renamed. New names are stripped, must be 1..120 characters including normalized extension, contain no control characters, `/` or `\\`, and end in `.txt`. Duplicate names are allowed; identity is Drive `file_id`. Persisted content is deterministic plain text, valid UTF-8, and must encode to at most 1,048,576 bytes after export. Empty content is allowed only in local new draft, not create/update requests. ASGI request-body limiter rejects `/api/google-drive/*` bodies above 8 MiB with `413` before JSON parsing; larger transport cap permits valid JSON escaping while decoded persisted content cap remains 1 MiB.

    Local authoring uses `localAuthoringContent` plus discriminated `authoringRepresentation: local_markdown | persisted_plain_text`; this is not a user-visible format selector. `plainTextExport = serializeToPlainText(localAuthoringContent, authoringRepresentation)` is the only content sent to create, import, or update. For `persisted_plain_text`, serialization is byte-faithful identity so opening a remote TXT is immediately clean even when externally edited text contains Markdown-like characters or lacks a final newline. For `local_markdown`, the serializer is deterministic and not an ad-hoc regex-only parser: it strips heading/emphasis/backtick/block-quote/fence delimiters while preserving content, emits readable `•` unordered bullets and preserves ordered-list numbers, renders `[label](URL)` as `label (URL)` and autolinks as their URL, removes HTML tags without creating an executable path while preserving text, normalizes CRLF to LF, preserves paragraph/list/code line breaks, collapses three or more consecutive newlines to two, trims trailing horizontal whitespace, and ends with exactly one LF. The same fixture corpus defines frontend local export and backend Picker Markdown conversion. The byte limit is checked against exported UTF-8 bytes. Because create/update receive this already-exported plain text without server transformation, a successful save sets `persistedPlainTextBaseline = plainTextExport` and derives clean state; failed, conflict, and unknown writes preserve local Markdown authoring content.

14. Make Drive writes duplicate-resistant without claiming exactly-once semantics.

   Workspace recreation, create, import-copy, and update accept caller-generated UUID `operation_id`; frontend generates it once per user action. Initial folder creation uses operation ID stored in OAuth transaction. Folder operation persists to connection row before Google access. Created folders/files set `appProperties.creationOperationId` exactly to operation ID. Updates preserve all managed binding properties and atomically send content plus `appProperties.lastOperationId` exactly equal to operation ID. After timeout/connection loss/429/5xx, backend reconciles once: create/import/recreate query exact `creationOperationId`, while update fetches exact file and checks `lastOperationId`. Found matching result returns success. No match returns `503 DRIVE_WRITE_UNKNOWN`, preserves local content, and performs no automatic write retry; user refreshes patient list/current file before explicitly trying again. Reused marker on another target/patient returns `409 DRIVE_OPERATION_REUSED`. Pending folder operation lets later request recover Google-success/DB-failure folder result. Google Drive has no exactly-once/CAS primitive, so operation markers reduce duplicates but do not promise impossibility under provider indexing lag or malicious concurrent calls.

    Read returns Drive monotonic `version` as string. Update body contains `patient_id`, caller-stable `operation_id`, non-empty exported `content`, and `expected_version`; it never contains name or MIME. Backend fetches and validates metadata immediately before media update. Mismatch returns `409 DRIVE_FILE_CHANGED` and does not update. Ambiguous update without matching operation marker returns conflict or unknown, never blind retry. Successful update returns fresh metadata/version. This remains optimistic best-effort conflict protection, not atomic compare-and-swap. V1 never offers force overwrite; conflict dialog offers Cancel and View current version, preserving local authoring text in memory.

15. Bound Google networking and sanitize errors.

   Explicit timeouts: connect 5 s, read 15 s, write 20 s, pool 5 s. GET/list and refresh-token exchange may retry at most twice with bounded exponential backoff and jitter for connection/timeouts, 429, and 5xx. Drive writes reconcile but never retry automatically after ambiguous outcome. Authorization-code exchange and revoke are never retried. Never retry validation, 400, permission 403, not found 404, local conflict, or `invalid_grant`. One Drive 401 obtains fresh request-local token once; repeated 401 persists revoked state. Every media download enforces streaming 1 MiB hard stop regardless of earlier metadata. Public errors use stable codes and never include Google response bodies, tokens, source IDs, names, or content.

16. Reject cross-site mutations at the shared Drive route boundary.

   Every Drive `POST`/`PUT` except cross-site OAuth callback requires an `Origin` matching configured application origin, compatible same-origin Fetch Metadata when header is present, and `application/json` for request bodies. Missing/mismatched origin fails with `403` before Google or DB mutation. SameSite cookies remain defense in depth; OAuth callback relies on one-shot state binding instead.

17. Add a generic shell utility/accessory seam.

   `AppShell` accepts generic utility descriptors and optional accessory render content. `Sidebar` renders utility buttons independent of `showConversations`; Biblioteca is adapted through this seam for Chat without changing behavior. AppShell also owns one generic transition-guard context: active feature registers blocker and queued continuation; internal link capture handles unmodified same-origin links, while Sidebar/ClinicalThreadList/patient selection/logout programmatic actions call same transition API. `ClinicalAssistant` registers/unregisters Drive dirty resolver. Modified, external, download, and targeted/new-window links bypass guard; one pending transition is allowed and further attempts are ignored until resolved. Existing `createBrowserRouter` structure remains unchanged; no route migration. Desktop shell places Assistant and Drive in accessible resizable panels. Narrow view uses Sheet with backdrop, Escape, focus trap, focus return, labelled title, and inert background. Breakpoint follows existing 767 px mobile boundary.

18. Adopt shadcn incrementally with Radix.

    This is a blocking pre-install workflow, not an authorization to install immediately: inspect project context with the official shadcn skill/CLI, including `shadcn info --json`, `components.json` if present, framework, Tailwind 3 setup, aliases, icon library, base component library, tokens, radius, and typography. Read official docs for each proposed primitive, run a dry run, inspect generated diff and dependency changes, and accept only approved files/dependencies. The review must preserve Tailwind 3, existing tokens, Lucide, radius, type, and unrelated migrations.

    The approved primitive allowlist is `Resizable`, `Sheet`, `ScrollArea`, `AlertDialog`, and `Alert`. Reuse existing or native Button, Input, Textarea, Badge, Tooltip, Spinner, loading, and empty-state patterns with Tailwind rather than importing equivalent primitives. Do not add Tabs, ToggleGroup, Progress, Dialog, Drawer, Command, Combobox, Card-per-file, DataTable, or another Markdown renderer. Existing components are not migrated. Generated source lives under `src/components/ui/`; repository import conventions remain relative after generation normalization.

    Preview/Edit mode uses two native buttons with selected-state semantics; it does not add Tabs or ToggleGroup. `ScrollArea` owns document scrolling. `Alert` informs inline status and recovery; `AlertDialog` confirms consequences such as discard or possible-orphan recreation. `Card` and `Item` are conceptual layout references only, not dependencies.

19. Use one deterministic workspace state union.

    State covers `unconfigured`, `disconnected`, `connecting`, `loading_list`, `ready`, `opening`, `viewing`, `editing`, `saving`, `saved`, `conflict`, `workspace_missing`, `workspace_recovery_pending`, `revoked`, and `error`. Each discriminated variant carries only valid data; boolean soup is prohibited. Document state conceptually separates `localAuthoringContent`, `authoringRepresentation`, and `persistedPlainTextBaseline`. `plainTextExport` is derived by the representation-aware serializer above. Dirty is exactly `no persisted file OR plainTextExport != persistedPlainTextBaseline`. Existing files transition `ready -> opening -> viewing` with `persisted_plain_text`, exact remote content copied into both local authoring and baseline, and identity export; they are clean immediately. Assistant-created drafts begin in `editing` with `local_markdown`. `viewing <-> editing` changes only presentation and retains the same local buffer. Save can begin only from `editing`; success sends only the export, updates returned metadata/version and baseline to exact returned persisted text, announces `saved`, then returns to clean `editing`. Save, conflict, and unknown-write errors preserve authoring content. Persisted active plus pending operation derive public recovery status; database checked states remain only `active`, `disconnected`, and `revoked`. Ordinary writes are blocked in missing/recovery-pending state, and only an explicit acknowledged recreation may proceed.

    Connection presentation is exact and deliberately compact:

    - `unconfigured`: passive `Google Drive no está disponible` and `La integración no está configurada en este entorno.`; no fake CTA.
    - `disconnected`: centered icon, `Conecta Google Drive`, `Trabaja con documentos asociados al paciente sin salir del Asistente Clínico.`, one primary `Conectar Google Drive`, and secondary `Dental AI Assistant sólo administrará los archivos que cree o importes explícitamente.`; no OAuth/security internals.
    - `connecting`: the same primary immediately becomes repository Spinner plus `Conectando…`, disabled, with no percentage.
    - `connected`: compact `Google Drive` header, `Conectado`, workspace `Dental AI Assistant`, search, compact semantic file rows, and secondary `Importar una copia`; no Google account identity.
    - `revoked`: Alert title `Vuelve a conectar Google Drive`, description `El acceso al workspace dejó de estar disponible. Tu sesión de Dental AI Assistant continúa activa.`, action `Reconectar`.
    - `workspace_missing`: Alert title `Workspace no disponible`, description `La carpeta administrada anteriormente no se puede verificar.`, and action `Ver opciones`; it never implicitly recreates. That action opens AlertDialog title `Recrear workspace`, description `Se creará una nueva carpeta Dental AI Assistant. Los archivos de la carpeta anterior no se eliminarán.`, and actions `Cancelar` / `Recrear workspace`.
    - `workspace_recovery_pending`: Alert title `Revisión del workspace pendiente`, description `Google Drive podría haber creado una carpeta que Dental AI Assistant todavía no puede verificar. Revisa las opciones antes de crear otra.`, and action `Ver opciones`. Only that explicit action can open AlertDialog title `Recrear workspace`, description `Podría existir una carpeta anterior no administrada. Si aparece después, deberás eliminarla manualmente desde Google Drive.`, and actions `Cancelar` / `Recrear workspace`.
    - general error: Alert title `No se pudo completar la acción` and description `Tu trabajo local se conserva.` plus sanitized context; it exposes a concrete action only when a stable error maps to valid recovery, never IDs/provider body.
    - list/operation feedback: list loading shows `Cargando documentos…`, empty list shows `No hay documentos para este paciente.`, opening shows `Abriendo…`, saving shows `Guardando…`, importing shows `Importando…`, and recovery shows `Revisando workspace…`; success ends as `Guardado`, `Copia importada`, or `Workspace disponible` as applicable.

    UX priority is clarity, accessibility, user control, data safety, then task completion. Hick gives each state one dominant primary; Fitts keeps frequent actions near affected content with comfortable targets; Jakob uses familiar connect/search/open/edit/save/import/recover actions; Proximity groups metadata by spacing rather than card borders; Doherty gives immediate visible feedback; Von Restorff reserves dominance for the primary; Peak-End makes success unequivocal; Tesler hides OAuth scopes, operation/version IDs, HMACs, and provider internals.

20. Preview managed TXT documents before editing.

    Existing managed TXT files open in a read-only application-native preview. The frontend renders only plain text returned by the patient-bound Dental Drive read endpoint and never embeds `drive.google.com`, Google Docs Viewer, or another external iframe/rendering surface. Remote TXT preview is faithful typography and spacing, without invented Markdown semantics.

    Local Markdown authoring and presentation uses the already-installed `react-markdown` and `remark-gfm` stack without `rehype-raw`, `dangerouslySetInnerHTML`, or another raw-HTML path. Managed TXT renders literally with preserved whitespace and wrapping. Preview and editor consume the same local authoring buffer, so unsaved edits appear immediately when returning to local Preview. Switching modes performs no Google request, write, composer submission, SSE request, or LLM call. Reopen reads remote TXT and does not reconstruct or claim Markdown.

    Document view contains one header, one mode control, one scrolling body, and one action area rather than nested cards. Header exposes Back, filename, normalized TXT type, and available safe size/modified metadata; existing filename is read-only while new-draft name remains editable and visibly normalizes to `.txt`. Header never exposes file ID, patient ID, folder ID, Google account ID, or technical version. Existing files expose Preview first, Edit, and Insert full document. Editing additionally exposes explicit Save and keyboard-reachable selection insertion when selection exists. New drafts may locally preview unsaved Markdown but begin in Edit; persistence always exports plain text.

   Desktop keeps document and Assistant independently operable. Mobile Sheet occupies available viewport height with sticky document header and actions; only document body scrolls. Actions and mode controls retain visible focus, accessible names, `aria-pressed` selected state, disabled state, and save-status announcements.

21. Keep Drive-to-composer transfer explicit.

   Full-document action inserts current local buffer from Preview or Edit. When textarea selection is non-empty in Edit, accessible `Insertar selección en el chat` inserts only selected text without replacing full-document action; selection action remains keyboard reachable and does not depend only on a floating pointer control. Insertion appends to current composer draft with a newline separator, focuses composer, and never calls submit/SSE/LLM. Action is disabled if bound patient differs from active patient or no active patient exists.

22. Keep Assistant-to-Drive transfer local until save.

    Completed assistant messages expose `Guardar en Drive`; structured clinical draft artifacts expose same action and serialize fixed visible labels while omitting empty sections and all review flags. Action requires matching active patient, opens sidecar/Sheet in `editing` with local Markdown authoring and a name that visibly normalizes to `.txt`, and performs no API write. User may edit name/content, then explicitly save. The create request contains `patient_id`, `operation_id`, normalized `name`, and exported `content`; it contains no frontend MIME selector. Approval status is not required because Drive copy is a user-controlled document, not the authoritative PostgreSQL evolution. There is no Markdown round trip: local Markdown is exported once to plain text, and reopen reads the remote TXT baseline.

23. Resolve dirty state before every context-losing transition.

   One guard owned by `ClinicalAssistant` covers active-patient change, thread change, in-app route/sidebar navigation, logout, and Sheet/sidecar close. Dirty internal transitions are suspended while AlertDialog offers `Guardar cambios`, `Descartar cambios`, and `Cancelar`. Save performs normal idempotency/conflict validation; transition continues only after successful save. Discard clears local draft then continues. Cancel preserves current context/editor. A `beforeunload` handler requests browser-native confirmation for reload/tab close while dirty; no custom save is attempted during unload. Clean transitions proceed immediately.

24. Enforce restrictive browser policy before production.

   Application responses use CSP with `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`, exact Google script/frame/connect origins proven necessary by raw PickerBuilder, and existing `fonts.googleapis.com` style plus `fonts.gstatic.com` font origins. Backend-issued token means Google Identity Services token-client script is not loaded. No wildcard source, `unsafe-eval`, or unrelated third-party script is allowed. Implementation verifies actual Picker network dependencies before finalizing allowlist and tests security headers.

25. Log metadata, never clinical material or credentials.

   Allowed structured fields: event, internal user ID, patient ID, hashed folder/file ID, byte count, version before/after, duration, status, sanitized error code. Forbidden at every level: document content, document name, search term, Picker source ID, raw Google body, Authorization header, access token, refresh token, client secret, encryption key, nonce/ciphertext, patient name, and RUT.

## API and Data Contracts

### Status

```json
{
  "configured": true,
  "status": "connected",
  "workspace": {"folder_name": "Dental AI Assistant"}
}
```

Status values: `unconfigured`, `disconnected`, `connected`, `workspace_missing`, `workspace_recovery_pending`, `revoked`. Persisted `active` maps to public `connected` when authoritative folder verifies, `workspace_missing` when completed folder fails verification, or `workspace_recovery_pending` when pending creation cannot reconcile. This is public derived state over persisted active plus pending operation; database checked states remain only `active`, `disconnected`, and `revoked`. Persisted terminal statuses map directly. Folder ID, Google account ID, scopes, token data, and pending operation ID are never public. Ordinary file writes are blocked for `workspace_missing` and `workspace_recovery_pending`; only explicitly acknowledged recreation can write a replacement folder.

### List/search page

```json
{
  "files": [
    {
      "id": "opaque",
      "name": "evolucion-2026-09-09.txt",
      "mime_type": "text/plain",
      "modified_time": "2026-09-09T21:38:00Z",
      "version": "27",
      "size": 2314,
      "patient_id": "uuid"
    }
  ],
  "next_page_token": null
}
```

Search request:

```json
{"patient_id":"uuid","query":"evolucion septiembre","page_token":null}
```

### Create/update

```json
{
  "patient_id": "uuid",
  "operation_id": "uuid",
  "name": "evolucion-2026-09-09.txt",
  "content": "..."
}
```

```json
{"patient_id":"uuid","operation_id":"uuid","content":"...","expected_version":"27"}
```

Create has no frontend MIME selector; backend always sends `text/plain`. Update retains patient ownership, stable operation identity, content, and expected version, but never accepts name or MIME and never renames an existing file. Both receive plain-text export, not local Markdown delimiters.

### Import copy

```json
{"patient_id":"uuid","operation_id":"uuid","source_file_id":"picker-opaque-id","name":"importado.txt"}
```

`name` may be omitted to derive a validated source name. An external `.txt` source filename is validated and normalized to managed `.txt`; an external `.md` source filename is normalized to a `.txt` destination, then its content is serialized to plain text. An explicitly supplied `.md` destination is visibly normalized to `.txt`. Response is the new managed document only; source identity is absent.

### Workspace recreation and Picker token

```json
{"operation_id":"uuid","acknowledge_possible_orphan":false}
```

```json
{"patient_id":"uuid"}
```

## Error Contract

Stable codes include `GOOGLE_DRIVE_NOT_CONFIGURED`, `GOOGLE_DRIVE_NOT_CONNECTED`, `GOOGLE_DRIVE_REVOKED`, `GOOGLE_DRIVE_SCOPE_MISSING`, `GOOGLE_DRIVE_SCOPE_UNEXPECTED`, `GOOGLE_DRIVE_OAUTH_STATE_INVALID`, `GOOGLE_DRIVE_OAUTH_FAILED`, `DRIVE_WORKSPACE_MISSING`, `DRIVE_WORKSPACE_RECOVERY_PENDING`, `DRIVE_FILE_NOT_MANAGED`, `DRIVE_FILE_PATIENT_MISMATCH`, `DRIVE_FILE_TYPE_UNSUPPORTED`, `DRIVE_FILE_TOO_LARGE`, `DRIVE_FILE_ENCODING_INVALID`, `DRIVE_FILE_CHANGED`, `DRIVE_OPERATION_REUSED`, `DRIVE_WRITE_UNKNOWN`, `DRIVE_PAGE_TOKEN_INVALID`, `DRIVE_RATE_LIMITED`, and `DRIVE_UNAVAILABLE`.

Foreign Dental owner or foreign patient returns `404`. Google permission/foreign file failures map to managed-file `404` without revealing existence. `/api/google-drive/*` is added to existing `RequestValidationError` sensitive-path predicate so invalid content/name/query/IDs are never echoed. Validation returns `422`; oversized transport returns `413`; version/operation/recovery-pending conflict returns `409`; revoked grant returns `403 GOOGLE_DRIVE_REVOKED` so existing global `401` handler does not redirect authenticated user; transient/unknown upstream failure returns `502` or `503` with sanitized code.

## Google Cloud and Deployment

- One Google Cloud project per environment owns OAuth client, restricted browser API key, Picker API, Drive API, and project number/App ID; test and production projects remain separate.
- OAuth client type is Web application. Testing mode lists explicit test users.
- Picker API key is restricted to production/local web referrers plus `https://docs.google.com/*`, and restricted to Picker and Drive APIs.
- `VITE_GOOGLE_PICKER_API_KEY` and `VITE_GOOGLE_DRIVE_APP_ID` are public build-time values; App ID is Cloud project number.
- Client secret, refresh token, encryption key, and JWT secret never use `VITE_` variables.
- Deployment forwards required server variables to both blue and green services without exposing app ports or changing proxy trust boundaries.
- Production release requires separate test/production Cloud projects, verified owned domain, public HTTPS homepage, privacy-policy link and Limited Use disclosure, accurate OAuth branding/support contact, exact authorized JavaScript origins/redirect URIs, enabled APIs, and applicable Google verification complete.

## Blast Radius

### Touched runtime areas

- Authenticated route registration and configuration.
- One migration and one dedicated repository.
- External Google OAuth/Drive integration.
- `/assistant` shell, active-patient transition, transcript actions, composer draft insertion, and responsive layout.
- Frontend primitive/dependency configuration and API types.

### Untouched runtime areas

- Dental JWT format/login/logout behavior.
- Clinical SSE protocol, reducer events, rate limit, prompt, approval persistence, and final evolution insert.
- Chat conversations, RAG, citations, VideoExplorer behavior, admin, ingestion, and channel sync.

## Verification Strategy

- Fail-first authenticated route tests prove user/session-bound one-shot state, same-origin mutations, encrypted persistence, folder/file validation, patient-scoped Drive queries, operation reconciliation, copy-import rejection, safe retries, disconnect, and conflicts.
- Cipher unit tests prove random nonce, associated-data binding, keyring rotation/lazy re-encryption, wrong-key/version failure, and absence of plaintext.
- Vitest proves state union transitions, existing-file Preview entry, shared-buffer Preview/Edit switching, safe Markdown/plain-text rendering, responsive primitive behavior, explicit no-submit/no-write transfers, selection insertion, source serialization, stable operation IDs, Picker patient request, and shared dirty-navigation guard.
- Playwright mocks all Google/application endpoints and captures desktop sidecar, mobile Sheet, list/preview/editor/unsaved-preview/save/conflict/unknown-write/missing/revoked states, sticky mobile layout, keyboard resizing, focus movement/return, and patient transition.
- Manual smoke validates real test-user OAuth and Picker only after automated checks; no real clinical data is used.

## Execution Dependencies

- Connection/security slice enables managed-folder slice.
- Managed-folder/file slice enables sidecar/editor slice.
- Sidecar/editor plus generic shell seam enable clinical transfer and Picker slice.
- Full verification and deployment documentation follow all runtime slices.

## References

- Google Drive scopes and `drive.file`: https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- Drive query syntax and private `appProperties`: https://developers.google.com/workspace/drive/api/guides/search-files
- Google retry guidance: https://developers.google.com/workspace/drive/api/guides/handle-errors
- Picker browser integration and raw PickerBuilder: https://developers.google.com/workspace/drive/picker/guides/web-picker
- OAuth production-readiness requirements: https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance
- Functional Drive operation prior art, not security contract: https://github.com/mickael-kerjean/filestash/blob/master/server/plugin/plg_backend_gdrive/index.go
- Operational Drive/provider prior art: https://github.com/rclone/rclone/blob/master/docs/content/drive.md
- Official Python request examples: https://github.com/googleworkspace/python-samples/tree/main/drive
- Raw PickerBuilder-over-wrapper evidence: https://github.com/googleworkspace/drive-picker-element/issues/118
- shadcn component catalog and incremental composition guidance: https://ui.shadcn.com/docs/components
- shadcn AI skill/project-context guidance: https://ui.shadcn.com/docs/skills
