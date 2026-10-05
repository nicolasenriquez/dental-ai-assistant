## Context

Current `/assistant` is a patient-aware clinical workspace. `ClinicalAssistantArea` owns active patient, composer drafts, queue behavior, and clinical runtime integration. `AppShell` owns navigation/sidebar layout but has no accessory pane seam. `Sidebar` owns a hardcoded Biblioteca button and modal `VideoExplorer`; copying that model would block simultaneous document and Assistant work.

Current authentication persists every user with `users.password_hash TEXT NOT NULL`; `users_repo.create_user` requires a hash. Successful local login currently updates `last_login_at`, refreshes Circle membership, writes `is_member`, and only then issues the Dental session cookie. These existing persistence and login side-effects are implementation constraints for Google provisioning, not optional follow-up work.

Google adds two separate provider operations. Google Sign-In verifies external identity so Dental can create its existing application session. Google Drive OAuth grants that authenticated Dental user limited Drive access. Google ID token, Dental JWT, Drive refresh token, and Drive access token are never interchangeable.

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
- Support exactly `AUTH_MODE=local|google`, with local authentication preserved and Google authentication converging into the existing Dental session.
- Make first-time Google login and explicit Drive consent feel like one onboarding journey without claiming they are one authorization event.
- Accept only authoritative Google email identities for V1: verified Gmail addresses or verified Google Workspace identities with a non-empty `hd` claim.
- In `AUTH_MODE=google`, ensure Drive OAuth resolves to the same Google account selected for Dental sign-in; in `AUTH_MODE=local`, preserve explicit manual Drive account choice.
- Preserve existing login side-effects through one provider-neutral Dental login finalizer.

**Non-Goals**

- General Drive explorer, native Google Docs editor, shared drives, synchronization, file deletion, or autonomous agent access.
- New clinical persistence model or replacement of existing approved evolution workflow.
- Whole-application component-library migration.
- Replacing Dental JWT/session semantics, email-based auto-linking, explicit account linking, silently granting Drive permission, or using same-account Drive email comparison as account linking.

## Boundary and Ownership

### Dental authentication

`auth/dependencies.py:get_current_user` remains the highest Dental authentication seam. Local credentials and verified Google identity both resolve a Dental `user_id`, run the same `finalize_dental_login` side-effects, issue the same Dental JWT/session cookie, and converge into `GET /api/auth/me`. Every `/api/google-drive/*` operation resolves that cookie. Google tokens never enter Dental JWT claims. The finalizer updates `last_login_at`, calls Circle membership verification using the Dental user's canonical email, persists `is_member`, and sets the session cookie; Circle failure remains fail-closed as in current login behavior.

### Google identity

`POST /api/auth/google` accepts a Google ID token only. A dedicated identity adapter uses Google's maintained verification implementation and accepts a token only after it establishes `aud == GOOGLE_CLIENT_ID`, `iss` in the exact allowed issuer set `{accounts.google.com, https://accounts.google.com}`, valid `exp` at verification time, non-empty `sub`, non-empty `email`, and boolean `email_verified == true`. It also returns optional `hd` as a typed claim. Before identity lookup or creation, V1 requires an authoritative email: case-insensitive normalized email ending in `@gmail.com`, or a non-empty `hd` claim. A valid but non-authoritative external email returns `403 GOOGLE_EMAIL_NOT_AUTHORITATIVE` without identity/session state. It returns a sanitized typed identity containing the required claims plus optional `hd` and never logs the credential or raw provider payload. `db/users_repo.py` or a dedicated auth repository owns provider-identity SQL; route handlers contain none.

`auth_identities` maps unique `(provider, provider_subject)` to one Dental `user_id` and V1 also permits at most one identity per `(user_id, provider)`. For Google, `provider_subject` is `sub`; `provider_email_snapshot` is refreshed after successful verified sign-in, while Dental `users.email` remains application-owned and is not silently reassigned. A new Google subject may create a federated Dental user only when no existing Dental account owns the email. Matching an existing local account by email returns `409 GOOGLE_ACCOUNT_LINK_REQUIRED`; no implicit association occurs.

### Runtime authentication configuration

Backend validates exactly `AUTH_MODE=local|google`. Unknown values fail startup. `local` is default and does not require Google credentials. `google` requires valid public client configuration and makes Google Sign-In the only dominant login control. `AUTH_MODE` controls backend provider availability, not only presentation: local signup/login are unavailable in Google mode, and Google authentication is unavailable in local mode. `GET /api/auth/config` exposes only mode, public Google client ID, Drive enabled state, and auto-onboard state. Backend secrets, credentials, transaction state, and encryption material are never returned.

### Authentication and Drive bootstrap

Frontend uses one discriminated bootstrap state rather than independent booleans. After Google authentication, it hydrates `/api/auth/me`, checks `/api/google-drive/status`, and either enters Assistant, starts deterministic redirect-based Drive onboarding, or enters `ready-without-drive`. Initial Drive onboarding may start automatically when configured, but provider consent remains explicit. In `AUTH_MODE=google`, the backend resolves the current user's single Google identity snapshot, uses its verified email as `login_hint`, and stores that expected email in the one-shot OAuth transaction. After code exchange, Drive `about.get` verifies the authorized account email before any connection persistence or workspace preparation. The handoff always calls authenticated `POST /api/google-drive/oauth/start`, receives the backend-built authorization URL, and follows it with `window.location.assign`; it never navigates to the POST route with GET or constructs a provider URL in the browser. Denial, revoked grant, account mismatch, or reconnect failure never logs out Dental. A valid callback transaction ends through the browser redirect contract: `303 See Other` with an allowlisted sanitized result, not a JSON HTTP error.

### Authentication provider enforcement

`AUTH_MODE` controls backend availability, not only presentation.

When `AUTH_MODE=local`:

- Current local signup and login routes remain enabled.
- `POST /api/auth/google` returns `404 AUTH_PROVIDER_DISABLED` and cannot create a Dental session.
- `/api/auth/me` and logout retain current behavior.

When `AUTH_MODE=google`:

- `POST /api/auth/google` is enabled.
- Local signup and login routes return `404 AUTH_PROVIDER_DISABLED` and cannot create a Dental session.
- `/api/auth/me` and logout retain current behavior.

Frontend visibility is never treated as access control. The disabled provider response is stable and sanitized; it does not expose implementation details.

### Google authorization

`integrations/google_drive_oauth.py` is the Module owning authorization URL construction, authorization-code exchange, refresh, revoke, and granted-scope verification. Its Interface accepts configuration plus opaque codes/tokens and returns sanitized typed values. `integrations/google_drive.py` owns Drive REST calls, including `about.get(fields=user(permissionId,emailAddress))` for post-exchange account confirmation. `httpx.AsyncClient` is the network Adapter so route handlers stay non-blocking.

Existing `httpx` handles OAuth token, refresh, revoke, account, and Drive HTTP calls; stdlib handles state generation/hashing and URL encoding. Add Google's maintained authentication verifier for ID-token validation and `cryptography` for AES-GCM. No synchronous network request may run on event loop; if verifier performs blocking certificate/network work, call it through `asyncio.to_thread` at adapter boundary.

### Credential persistence

`auth/token_cipher.py` owns authenticated encryption. `db/google_drive_repo.py` owns all SQL for one connection row per Dental user. Routes and integrations never contain SQL.

### Drive workspace

`integrations/google_drive.py` is the only Module that knows Google Drive API endpoint URLs and Drive request fields. Its Interface exposes folder, metadata, authenticated-user identity, paging, read, create, update, and copy-import operations. OAuth code exchange, refresh, revoke, and scope verification remain in `integrations/google_drive_oauth.py`; Drive `about.get` remains in the Drive adapter because it is a Drive REST resource. Routes orchestrate ownership and map sanitized domain errors to HTTP.

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

1. Support exactly two backend-owned authentication modes.

   `AUTH_MODE=local` preserves current signup/login/logout/me behavior, enables local signup/login, disables `POST /api/auth/google` with `404 AUTH_PROVIDER_DISABLED`, and remains the development/test default. `AUTH_MODE=google` enables `POST /api/auth/google`, disables local signup/login with `404 AUTH_PROVIDER_DISABLED`, renders official Google Sign-In, and hides local email/password controls. `GET /api/auth/config` is the sole frontend authority. Unknown mode or incomplete Google-mode configuration fails startup.

2. Enforce the selected authentication provider at the backend.

   `AUTH_MODE=local` enables local signup/login and disables `POST /api/auth/google` with `404 AUTH_PROVIDER_DISABLED`. `AUTH_MODE=google` enables `POST /api/auth/google` and disables local signup/login with the same `404 AUTH_PROVIDER_DISABLED`. `/api/auth/me` and logout remain enabled in both modes. Hiding controls in the frontend is not an access-control mechanism.

3. Converge Google Sign-In into the existing Dental session.

    `POST /api/auth/google` verifies the ID token through Google's maintained library, requires `aud == GOOGLE_CLIENT_ID`, `iss` in `{accounts.google.com, https://accounts.google.com}`, valid `exp`, non-empty `sub`, non-empty `email`, and `email_verified == true`, then requires authoritative email: normalized email ending in `@gmail.com` or non-empty `hd`. A non-authoritative external email returns `403 GOOGLE_EMAIL_NOT_AUTHORITATIVE`; any other failed claim or provider error returns `401 GOOGLE_IDENTITY_INVALID`, all with sanitized content. It then maps Google `sub` through `auth_identities`, refreshes only its provider email snapshot, and runs the same `finalize_dental_login` path as local password login. Raw credentials and payloads never enter logs. Downstream code sees only `get_current_user()` and Dental `user_id`.

4. Never auto-link an existing account by email.

    Unique `(provider, provider_subject)` and V1 unique `(user_id, provider)` are identity authority. Email is metadata and the same-account Drive check is not account linking. If unknown Google `sub` presents an email already used by an existing Dental user, authentication returns `409 GOOGLE_ACCOUNT_LINK_REQUIRED`. Explicit linking requires a separate approved change.

5. Keep Google identity, Dental session, and Google Drive authorization separate.

    Dental JWT identifies `user_id`; Google refresh token authorizes Drive. No service account, JWT assertion, domain-wide delegation, Firebase/Auth0/Supabase replacement, or Google email auto-linking is permitted. Email equality between authenticated Google identity and Drive `about.user.emailAddress` is a narrowly scoped authorization-consistency check, not an identity association mechanism.

6. Chain first-time onboarding through deterministic redirect.

    After `POST /api/auth/google` establishes the session, frontend hydrates `/api/auth/me` and requests Drive status. A healthy connection enters Assistant without consent or account chooser. If disconnected and `GOOGLE_DRIVE_AUTO_ONBOARD=true`, frontend calls `POST /api/google-drive/oauth/start` with Dental session credentials included. In Google mode the backend binds the transaction to the verified Google email, sets `login_hint`, and callback confirms it through Drive `about.get` before persistence. A mismatch revokes returned credentials best-effort, creates no workspace, preserves any old connection, and redirects with sanitized `result=account_mismatch`; it does not return HTTP 409 from the browser callback. In local mode explicit consent may select any Drive account. The backend persists the one-shot state, sets its HttpOnly cookie, builds the provider URL, and returns `{"authorization_url":"https://accounts.google.com/..."}`. Frontend then executes `window.location.assign(authorization_url)`. It never uses GET, a form submission, a browser-built provider URL, a browser-supplied `return_to`, or a chained popup from the Google Sign-In callback. Callback returns only to configured fixed `/assistant` target with an allowlisted `result` query. Valid callback success or handled provider/domain failure uses `303 See Other`; invalid security state uses sanitized HTTP `400` before code exchange. Drive denial yields `ready-without-drive`; reconnect remains explicit and never changes Dental session.

7. Represent bootstrap as one state machine.

   Frontend state is conceptually `loading-config | unauthenticated-local | unauthenticated-google | authenticating-google | establishing-session | checking-drive | authorizing-drive | preparing-workspace | ready | ready-without-drive | error`. Variants carry only valid state. Provider operations use Spinner and immediate copy, not fake percentages. Google mode has one official provider-rendered dominant action; local mode keeps current form and shows no disabled Google action.

8. Use exact scope `https://www.googleapis.com/auth/drive.file`.

   OAuth start sends `access_type=offline`, `include_granted_scopes=false`, and `prompt=consent`. Callback requires refresh token. Under OAuth semantics, omitted token-response `scope` means unchanged requested scope and is treated as exact `drive.file`; when `scope` is present its set must equal exactly `{drive.file}`. Explicit missing/extra scope fails connection atomically; any returned credential is revoked best-effort and never persisted.

9. Use one authoritative managed folder identified by ID and private metadata.

   Folder name is fixed as `Dental AI Assistant`. Creation sets:

   ```json
   {"appProperties":{"managedBy":"dental-ai-assistant","workspaceSchema":"1","creationOperationId":"<uuid>"}}
   ```

   DB `folder_id` is sole authority. Application never adopts same-named folder. Folder verification requests only `id,name,mimeType,trashed,appProperties` and requires folder MIME, not trashed, exact `managedBy`/`workspaceSchema`, and `creationOperationId` equal to operation UUID that created authoritative folder.

   Missing authoritative folder during ordinary operation produces `workspace_missing`; no write recreates it. Before every folder create, backend persists pending operation ID. Ambiguous create first reconciles exact `creationOperationId`. If found, backend persists it and performs no replacement. If still absent, status becomes `workspace_recovery_pending`, all folder/file writes remain blocked, and unacknowledged recreation returns `409 DRIVE_WORKSPACE_RECOVERY_PENDING` without mutation. `POST /workspace/recreate` first reconciles again; while still unknown it requires `acknowledge_possible_orphan=true` plus new operation ID before replacing pending marker and creating/persisting replacement. UI warns prior folder might exist and must be removed manually from Drive if it later appears. If acknowledged replacement is itself ambiguous, its new marker remains pending and same recovery state repeats. Initial successful OAuth may create first folder because connection itself is explicit. Contract guarantees one authoritative DB folder, not exactly one physical Drive folder under provider ambiguity.

10. Bind every managed file cryptographically to one owned patient.

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

11. Store one encrypted connection row and no file catalog.

    Implementation first inspects actual Alembic head, creates an identity migration from that head that relaxes `users.password_hash` and adds `auth_identities`, verifies graph, then creates Drive workspace migration from new head. No ordinal in this design is authoritative. Drive migration adds connection row plus short-lived OAuth transaction table:

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
    expected_google_email TEXT NULL
    folder_operation_id UUID NOT NULL
   expires_at TIMESTAMPTZ NOT NULL
   used_at TIMESTAMPTZ NULL
   created_at TIMESTAMPTZ NOT NULL
   ```

    `google_account_id` is Google's opaque Drive user permission ID, not email. File IDs/content and access tokens are not persisted. Checked `status` is sole persisted connection-state source: `active` requires all three refresh-token columns non-null and `granted_scopes` exactly `{drive.file}`; `disconnected`/`revoked` require all three refresh-token columns null and `granted_scopes='{}'`. Every transition updates `status_changed_at`; explicit disconnect changes active/revoked to disconnected, invalid grant/repeated Drive 401 changes active to revoked, and successful reconnect changes either terminal state to active. Terminal states clear refresh credentials and pending operation but retain Google account ID, completed folder ID/name/creation-operation identity, and encrypted binding secret. Reconnect to same verified Google account reuses folder/binding identity. In `AUTH_MODE=local`, explicit reconnect to a different verified Google account clears old folder/binding identity and generates a new binding secret. In `AUTH_MODE=google`, a different Drive account fails the pre-persistence email check with `409 GOOGLE_DRIVE_ACCOUNT_MISMATCH`; it does not clear or replace an existing connection. Folder creation persists `pending_folder_operation_id` before Google access, then atomically persists returned `folder_id` plus matching `folder_creation_operation_id` before clearing pending marker. Reconciliation does the same from matching Google metadata.

12. Encrypt refresh tokens with an independently versioned AES-256-GCM keyring.

   `GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEYS` is a version-to-key mapping whose values are URL-safe base64 encodings of exactly 32 random bytes; `GOOGLE_DRIVE_TOKEN_ACTIVE_KEY_VERSION` selects write key. AES-GCM uses fresh 12-byte nonce and associated data containing Dental `user_id`, purpose (`refresh-token` or `binding-secret`), and key version. Ciphertext includes authentication tag. `JWT_SECRET` is never reused. Reads select stored version; successful reads under old version re-encrypt refresh token and binding secret with active key in same request. Old key may be removed only after database has no token or binding rows at that version. Unknown version/authentication failure produces sanitized revoked/unavailable state and no Google request.

13. Make Drive configuration optional but fail the feature closed.

   Server config adds client ID, client secret, OAuth redirect URI, post-connect return URL, token keyring, active key version, and allowed application origins. Folder name remains fixed. If all required values are absent, app starts and Drive status reports `configured=false`; mutation/OAuth endpoints return sanitized `503 GOOGLE_DRIVE_NOT_CONFIGURED`. Partial or malformed configuration fails application startup with a configuration error. Return URL must be an exact configured URL, never a request parameter.

   Production values use `https://chat.dynamous.ai/api/google-drive/oauth/callback` and `https://chat.dynamous.ai/assistant`. Local documented values use backend callback on port 8000 and frontend return on port 5173.

14. Bind OAuth state to one initiating Dental user and session.

    `POST /oauth/start` requires Dental session, generates 32-byte URL-safe state and folder operation UUID, and stores only state hash, Dental `user_id`, SHA-256 fingerprint of current raw Dental session cookie, expected Google email when `AUTH_MODE=google`, operation ID, expiry, and use timestamp. In Google mode, expected email comes from the server-side verified `auth_identities` row, never request input; authorization URL includes that email as backend-generated `login_hint`. If no single non-empty verified identity exists, this same-origin JSON endpoint returns `409 GOOGLE_DRIVE_ACCOUNT_MISMATCH` and creates no OAuth transaction. In local mode, no same-account expectation or login hint is set. It sets the raw state in `google_drive_oauth_state` as `HttpOnly`, `Secure`, `SameSite=Lax`, `Max-Age=600`, path `/api/google-drive/oauth/callback`; response contains only authorization URL. Callback requires Dental session, constant-time matches query/cookie state, loads by state hash, checks expiry, initiating user, and current-session fingerprint, then atomically marks transaction used before code exchange. Any missing/mismatched/expired state, wrong user/session, or replay is an invalid security transaction: clear the state cookie, return sanitized HTTP `400` directly, perform no code/token exchange, and persist nothing. Every terminal path clears the state cookie. After valid one-shot transaction establishment, callback uses browser-navigation transport, not JSON error transport. Success validates scope/refresh token, calls Drive `about.get` with exactly `fields=user(permissionId,emailAddress)`, persists/encrypts credentials, ensures the first folder with the transaction's operation ID, and returns `303 See Other` to the fixed configured Assistant return URL with `result=connected`. Consent denial, account mismatch, or provider authorization failure cleans/revokes as required, preserves the Dental session, and returns `303 See Other` to that fixed URL with only an allowlisted sanitized result: `result=consent_denied`, `result=account_mismatch`, or `result=provider_error`. In Google mode it compares non-empty normalized `emailAddress` with expected Google email before persisting account/refresh credentials or creating/reusing a workspace; account mismatch maps to domain code `GOOGLE_DRIVE_ACCOUNT_MISMATCH`, but browser callback never emits HTTP `409`. In local mode account email is not compared. The fixed return URL is never request-supplied, and callback never returns tokens, provider payloads, or arbitrary query parameters. Expired/used rows are pruned opportunistically.

15. Keep access tokens request-local; do not add a shared cache in V1.

   Each authenticated Drive HTTP request loads active connection, decrypts refresh token, obtains one access token, and reuses it only inside that request. No process, distributed, or persistent access-token cache exists, eliminating worker/blue-green invalidation state. Disconnect clears local credentials even when remote revocation fails. Access tokens are never written to DB, logs, analytics, or browser storage; Picker remains the explicit exception below.

16. Expose Picker token as a narrow exception.

   `POST /picker-token` accepts `{patient_id}`, verifies Dental ownership and active connection server-side, and returns `{access_token, expires_in}` with `Cache-Control: no-store` and `Pragma: no-cache`. Token itself is not cryptographically patient-scoped; patient isolation remains enforced by subsequent Dental API ownership and metadata checks. Frontend holds token in function/component memory only, loads official Picker JS API, constructs raw `google.picker.PickerBuilder` with exact app ID, API key, OAuth token, origin, one filtered `DocsView`, and callback, then drops references after Picker closes. No React Picker wrapper package, localStorage, sessionStorage, IndexedDB, cookie, telemetry, or console output is allowed.

17. Import only a copy.

    Picker is intended UI for choosing one external `.md`/`.txt` source but does not produce server-verifiable selection proof. `POST /import-copy` therefore treats source ID as untrusted opaque input, takes active `patient_id`, caller-stable `operation_id`, source ID, and optional destination name, and independently validates everything. Backend verifies owned patient, fetches source metadata, rejects every source already carrying this application's `managedBy` marker, validates not trashed and exact external-source pair (`text/markdown` + `.md` or `text/plain` + `.txt`, case-insensitive), checks declared size at most 1 MiB, downloads with streaming 1 MiB hard stop, UTF-8 decodes, serializes Markdown sources to deterministic plain text, then creates a new marked patient-bound `text/plain` `.txt` file in the managed folder. Source ID is discarded after request and never persisted. Original is never moved, changed, deleted, or managed.

18. Define exact file and search contracts.

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

19. Define TXT-only managed naming and content rules.

    Managed destinations always use `text/plain` and lowercase `.txt`. Backend owns MIME and extension normalization. A new name without an extension visibly becomes `.txt`; a new destination ending in `.md` visibly becomes `.txt`; Markdown is never a valid managed destination. Existing managed names are read-only and cannot be renamed. New names are stripped, must be 1..120 characters including normalized extension, contain no control characters, `/` or `\\`, and end in `.txt`. Duplicate names are allowed; identity is Drive `file_id`. Persisted content is deterministic plain text, valid UTF-8, and must encode to at most 1,048,576 bytes after export. Empty content is allowed only in local new draft, not create/update requests. ASGI request-body limiter rejects `/api/google-drive/*` bodies above 8 MiB with `413` before JSON parsing; larger transport cap permits valid JSON escaping while decoded persisted content cap remains 1 MiB.

    Local authoring uses `localAuthoringContent` plus discriminated `authoringRepresentation: local_markdown | persisted_plain_text`; this is not a user-visible format selector. `plainTextExport = serializeToPlainText(localAuthoringContent, authoringRepresentation)` is the only content sent to create, import, or update. For `persisted_plain_text`, serialization is byte-faithful identity so opening a remote TXT is immediately clean even when externally edited text contains Markdown-like characters or lacks a final newline. For `local_markdown`, the serializer is deterministic and not an ad-hoc regex-only parser: it strips heading/emphasis/backtick/block-quote/fence delimiters while preserving content, emits readable `•` unordered bullets and preserves ordered-list numbers, renders `[label](URL)` as `label (URL)` and autolinks as their URL, removes HTML tags without creating an executable path while preserving text, normalizes CRLF to LF, preserves paragraph/list/code line breaks, collapses three or more consecutive newlines to two, trims trailing horizontal whitespace, and ends with exactly one LF. The same fixture corpus defines frontend local export and backend Picker Markdown conversion. The byte limit is checked against exported UTF-8 bytes. Because create/update receive this already-exported plain text without server transformation, a successful save sets `persistedPlainTextBaseline = plainTextExport` and derives clean state; failed, conflict, and unknown writes preserve local Markdown authoring content.

20. Make Drive writes duplicate-resistant without claiming exactly-once semantics.

   Workspace recreation, create, import-copy, and update accept caller-generated UUID `operation_id`; frontend generates it once per user action. Initial folder creation uses operation ID stored in OAuth transaction. Folder operation persists to connection row before Google access. Created folders/files set `appProperties.creationOperationId` exactly to operation ID. Updates preserve all managed binding properties and atomically send content plus `appProperties.lastOperationId` exactly equal to operation ID. After timeout/connection loss/429/5xx, backend reconciles once: create/import/recreate query exact `creationOperationId`, while update fetches exact file and checks `lastOperationId`. Found matching result returns success. No match returns `503 DRIVE_WRITE_UNKNOWN`, preserves local content, and performs no automatic write retry; user refreshes patient list/current file before explicitly trying again. Reused marker on another target/patient returns `409 DRIVE_OPERATION_REUSED`. Pending folder operation lets later request recover Google-success/DB-failure folder result. Google Drive has no exactly-once/CAS primitive, so operation markers reduce duplicates but do not promise impossibility under provider indexing lag or malicious concurrent calls.

    Read returns Drive monotonic `version` as string. Update body contains `patient_id`, caller-stable `operation_id`, non-empty exported `content`, and `expected_version`; it never contains name or MIME. Backend fetches and validates metadata immediately before media update. Mismatch returns `409 DRIVE_FILE_CHANGED` and does not update. Ambiguous update without matching operation marker returns conflict or unknown, never blind retry. Successful update returns fresh metadata/version. This remains optimistic best-effort conflict protection, not atomic compare-and-swap. V1 never offers force overwrite; conflict dialog offers Cancel and View current version, preserving local authoring text in memory.

21. Bound Google networking and sanitize errors.

   Explicit timeouts: connect 5 s, read 15 s, write 20 s, pool 5 s. GET/list and refresh-token exchange may retry at most twice with bounded exponential backoff and jitter for connection/timeouts, 429, and 5xx. Drive writes reconcile but never retry automatically after ambiguous outcome. Authorization-code exchange and revoke are never retried. Never retry validation, 400, permission 403, not found 404, local conflict, or `invalid_grant`. One Drive 401 obtains fresh request-local token once; repeated 401 persists revoked state. Every media download enforces streaming 1 MiB hard stop regardless of earlier metadata. Public errors use stable codes and never include Google response bodies, tokens, source IDs, names, or content.

22. Reject cross-site mutations at the shared Drive route boundary.

   Every Drive `POST`/`PUT` except cross-site OAuth callback requires an `Origin` matching configured application origin, compatible same-origin Fetch Metadata when header is present, and `application/json` for request bodies. Missing/mismatched origin fails with `403` before Google or DB mutation. SameSite cookies remain defense in depth; OAuth callback relies on one-shot state binding instead.

23. Add a generic shell utility/accessory seam.

   `AppShell` accepts generic utility descriptors and optional accessory render content. `Sidebar` renders utility buttons independent of `showConversations`; Biblioteca is adapted through this seam for Chat without changing behavior. AppShell also owns one generic transition-guard context: active feature registers blocker and queued continuation; internal link capture handles unmodified same-origin links, while Sidebar/ClinicalThreadList/patient selection/logout programmatic actions call same transition API. `ClinicalAssistant` registers/unregisters Drive dirty resolver. Modified, external, download, and targeted/new-window links bypass guard; one pending transition is allowed and further attempts are ignored until resolved. Existing `createBrowserRouter` structure remains unchanged; no route migration. Desktop shell places Assistant and Drive in accessible resizable panels. Narrow view uses Sheet with backdrop, Escape, focus trap, focus return, labelled title, and inert background. Breakpoint follows existing 767 px mobile boundary.

24. Adopt shadcn incrementally with Radix.

    This is a blocking pre-install workflow, not an authorization to install immediately: inspect project context with the official shadcn skill/CLI, including `shadcn info --json`, `components.json` if present, framework, Tailwind 3 setup, aliases, icon library, base component library, tokens, radius, and typography. Read official docs for each proposed primitive, run a dry run, inspect generated diff and dependency changes, and accept only approved files/dependencies. The review must preserve Tailwind 3, existing tokens, Lucide, radius, type, and unrelated migrations.

    The approved primitive allowlist is `Resizable`, `Sheet`, `ScrollArea`, `AlertDialog`, and `Alert`. Reuse existing or native Button, Input, Textarea, Badge, Tooltip, Spinner, loading, and empty-state patterns with Tailwind rather than importing equivalent primitives. Do not add Tabs, ToggleGroup, Progress, Dialog, Drawer, Command, Combobox, Card-per-file, DataTable, or another Markdown renderer. Existing components are not migrated. Generated source lives under `src/components/ui/`; repository import conventions remain relative after generation normalization.

    Preview/Edit mode uses two native buttons with selected-state semantics; it does not add Tabs or ToggleGroup. `ScrollArea` owns document scrolling. `Alert` informs inline status and recovery; `AlertDialog` confirms consequences such as discard or possible-orphan recreation. `Card` and `Item` are conceptual layout references only, not dependencies.

25. Use one deterministic workspace state union.

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

26. Preview managed TXT documents before editing.

    Existing managed TXT files open in a read-only application-native preview. The frontend renders only plain text returned by the patient-bound Dental Drive read endpoint and never embeds `drive.google.com`, Google Docs Viewer, or another external iframe/rendering surface. Remote TXT preview is faithful typography and spacing, without invented Markdown semantics.

    Local Markdown authoring and presentation uses the already-installed `react-markdown` and `remark-gfm` stack without `rehype-raw`, `dangerouslySetInnerHTML`, or another raw-HTML path. Managed TXT renders literally with preserved whitespace and wrapping. Preview and editor consume the same local authoring buffer, so unsaved edits appear immediately when returning to local Preview. Switching modes performs no Google request, write, composer submission, SSE request, or LLM call. Reopen reads remote TXT and does not reconstruct or claim Markdown.

    Document view contains one header, one mode control, one scrolling body, and one action area rather than nested cards. Header exposes Back, filename, normalized TXT type, and available safe size/modified metadata; existing filename is read-only while new-draft name remains editable and visibly normalizes to `.txt`. Header never exposes file ID, patient ID, folder ID, Google account ID, or technical version. Existing files expose Preview first, Edit, and Insert full document. Editing additionally exposes explicit Save and keyboard-reachable selection insertion when selection exists. New drafts may locally preview unsaved Markdown but begin in Edit; persistence always exports plain text.

   Desktop keeps document and Assistant independently operable. Mobile Sheet occupies available viewport height with sticky document header and actions; only document body scrolls. Actions and mode controls retain visible focus, accessible names, `aria-pressed` selected state, disabled state, and save-status announcements.

27. Keep Drive-to-composer transfer explicit.

   Full-document action inserts current local buffer from Preview or Edit. When textarea selection is non-empty in Edit, accessible `Insertar selección en el chat` inserts only selected text without replacing full-document action; selection action remains keyboard reachable and does not depend only on a floating pointer control. Insertion appends to current composer draft with a newline separator, focuses composer, and never calls submit/SSE/LLM. Action is disabled if bound patient differs from active patient or no active patient exists.

28. Keep Assistant-to-Drive transfer local until save.

    Completed assistant messages expose `Guardar en Drive`; structured clinical draft artifacts expose same action and serialize fixed visible labels while omitting empty sections and all review flags. Action requires matching active patient, opens sidecar/Sheet in `editing` with local Markdown authoring and a name that visibly normalizes to `.txt`, and performs no API write. User may edit name/content, then explicitly save. The create request contains `patient_id`, `operation_id`, normalized `name`, and exported `content`; it contains no frontend MIME selector. Approval status is not required because Drive copy is a user-controlled document, not the authoritative PostgreSQL evolution. There is no Markdown round trip: local Markdown is exported once to plain text, and reopen reads the remote TXT baseline.

29. Resolve dirty state before every context-losing transition.

   One guard owned by `ClinicalAssistant` covers active-patient change, thread change, in-app route/sidebar navigation, logout, and Sheet/sidecar close. Dirty internal transitions are suspended while AlertDialog offers `Guardar cambios`, `Descartar cambios`, and `Cancelar`. Save performs normal idempotency/conflict validation; transition continues only after successful save. Discard clears local draft then continues. Cancel preserves current context/editor. A `beforeunload` handler requests browser-native confirmation for reload/tab close while dirty; no custom save is attempted during unload. Clean transitions proceed immediately.

30. Enforce restrictive browser policy before production.

    Application responses use CSP with `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`, exact Google script/frame/connect origins proven necessary by official Google Identity Services and raw PickerBuilder, and existing `fonts.googleapis.com` style plus `fonts.gstatic.com` font origins. No wildcard source, `unsafe-eval`, or unrelated third-party script is allowed. V1 disables GIS FedCM button mode and serves `Cross-Origin-Opener-Policy: same-origin-allow-popups` for the popup callback flow. Implementation captures actual GIS and Picker browser requirements before finalizing allowlist, adds automated security-header coverage, and records one browser smoke result.

31. Log metadata, never clinical material or credentials.

    Allowed structured fields: event, internal user ID, patient ID, hashed folder/file ID, byte count, version before/after, duration, status, sanitized error code. Forbidden at every level: document content, document name, search term, Picker source ID, Google identity email, Google `sub`, raw Google body, Authorization header, access token, refresh token, client secret, encryption key, nonce/ciphertext, patient name, and RUT.

32. Persist federated users without inventing local credentials.

    The identity migration changes `users.password_hash` from `NOT NULL` to nullable while preserving hashes for existing/local users. `create_local_user(email, password_hash)` requires a real password hash. `create_federated_user(email, conn)` inserts `password_hash=NULL` in the same transaction as its `auth_identities` row. `NULL` is the only representation of federated-only authentication; random passwords and sentinel hashes are forbidden. Local login treats missing/null hash as the same generic invalid-credentials `401` as an unknown email and never passes null to password verification. Returning Google sign-in refreshes `provider_email_snapshot` only; it does not silently rewrite `users.email`.

33. Accept only authoritative Google email identities in V1.

    The maintained verifier validates signature, audience, issuer, and lifetime. The application then requires boolean `email_verified == true` and either a case-insensitive normalized email ending in `@gmail.com` or a non-empty `hd` claim. A valid Google token for an external email without `hd` is not authoritative enough for Dental identity provisioning or login because that address may no longer be controlled by the Google Account. It returns `403 GOOGLE_EMAIL_NOT_AUTHORITATIVE` before identity lookup/creation, Circle refresh, or session issuance. This policy applies to new and returning Google identities; explicit future verification/linking is outside this change.

34. Bind Google-mode Drive to the Google sign-in account.

    V1 allows at most one Google identity per Dental user. In `AUTH_MODE=google`, Drive OAuth start reads that user's single latest verified `provider_email_snapshot` server-side; absent or ambiguous identity fails closed as same-origin JSON `409 GOOGLE_DRIVE_ACCOUNT_MISMATCH` without creating OAuth state. The value is stored in the short-lived transaction and included as backend-generated `login_hint`. After authorization-code exchange, the Drive adapter calls `about.get` with exactly `fields=user(permissionId,emailAddress)` under `drive.file`. The non-empty normalized `emailAddress` must equal the expected Google email before any connection row, token, folder, or file state is persisted. Mismatch best-effort revokes returned credentials, maps domain code `GOOGLE_DRIVE_ACCOUNT_MISMATCH` to browser result `result=account_mismatch`, returns `303 See Other` through the fixed sanitized callback target, preserves any prior connection, and creates no workspace. The browser callback never emits HTTP `409`; that status is reserved for same-origin JSON application responses. In `AUTH_MODE=local`, explicit Drive consent may select a different Google account and the email comparison is not applied. The equality check confirms authorization continuity; it never links Dental accounts.

35. Preserve login side-effects through one finalizer.

    Existing local password login and new Google login both call one conceptual `finalize_dental_login(user, response)` after provider/credential validation and identity resolution. It performs `update_last_login(user.id)`, calls `circle.verify_paid_member(user.email)`, persists `set_member_status(user.id, is_member=...)`, and sets the existing Dental session cookie. Circle failures remain fail-closed and do not create provider-specific session behavior. Signup retains its current post-create membership check; invalid Google requests never reach the finalizer.

36. Fix GIS to popup callback with explicit browser/request guards.

    V1 uses official GIS-rendered `renderButton` with JavaScript `callback` and `ux_mode=popup`. It never configures `login_uri`/redirect mode, calls One Tap `prompt()`, or uses automatic account selection; `auto_select=false`, `use_fedcm_for_button=false`, and `button_auto_select=false` where the option is exposed. GIS owns its popup. Callback sends only `credentials: include`, `Content-Type: application/json` `POST /api/auth/google` containing `credential`. Before token validation, endpoint requires an exact configured application `Origin`, requires `Sec-Fetch-Site: same-origin` when present, and rejects any non-JSON content type with sanitized `403 GOOGLE_AUTH_REQUEST_INVALID`. It does not use GIS's form `login_uri`/`g_csrf_token` contract because this design uses the same-origin JSON callback. Browser release evidence verifies popup callback delivery, no blank popup, no One Tap/auto-select, and correct COOP behavior on FedCM-capable and non-FedCM browsers.

## API and Data Contracts

### Authentication configuration

```json
{
  "mode": "google",
  "google_client_id": "public-client-id.apps.googleusercontent.com",
  "drive_enabled": true,
  "drive_auto_onboard": true
}
```

`GET /api/auth/config` is public and safe to cache only under normal application configuration policy. It contains no client secret, token, session material, encryption key, or OAuth state. In local mode, `google_client_id` may be null and Google credentials are not required.

### Google identity authentication

```json
{"credential":"google-id-token"}
```

`POST /api/auth/google` accepts only `credential`, verifies it against configured public client ID, applies authoritative-email policy, resolves Google `sub`, refreshes the identity email snapshot, runs shared Dental login finalization, and sets existing Dental session cookie. It is available only in `AUTH_MODE=google`; in local mode it returns `404 AUTH_PROVIDER_DISABLED`. Response follows current login/session convention rather than introducing Google session schema. Existing-email collision returns `409 GOOGLE_ACCOUNT_LINK_REQUIRED`.

Accepted Google identity claims are exact: `aud == GOOGLE_CLIENT_ID`, `iss` is `accounts.google.com` or `https://accounts.google.com`, `exp` is valid at verification time, `sub` is present and non-empty, `email` is present and non-empty, and `email_verified == true`. The optional `hd` claim is accepted only as a non-empty string when present. Authoritative email additionally requires normalized email ending in `@gmail.com` or non-empty `hd`; otherwise response is `403 GOOGLE_EMAIL_NOT_AUTHORITATIVE`. A failed required claim returns `401 GOOGLE_IDENTITY_INVALID`. The maintained verifier, not application code, performs Google signature and certificate validation.

### Google authentication request boundary

The GIS callback path is same-origin JSON, not GIS `login_uri` form delivery. Before parsing or verifying `credential`, `POST /api/auth/google` requires an exact configured application `Origin`, requires `Sec-Fetch-Site: same-origin` when that header is present, and requires `Content-Type: application/json` (parameters such as charset may be accepted). Missing/mismatched request context returns sanitized `403 GOOGLE_AUTH_REQUEST_INVALID`; no identity lookup, Circle call, session issuance, or provider verification occurs.

The browser callback uses `credentials: 'include'` and sends only `{"credential":"..."}`. It does not send `g_csrf_token`, use `application/x-www-form-urlencoded`, configure GIS `login_uri`, or let Google post directly to the endpoint. Request-context checks are the application CSRF boundary for this callback mode; same-origin cookies and Fetch Metadata remain defense in depth.

### Federated user persistence

```text
users.password_hash TEXT NULL

create_local_user(email, password_hash)
  -> inserts non-null password_hash

create_federated_user(email, conn)
  -> inserts password_hash = NULL
```

The identity migration only relaxes the existing `NOT NULL` constraint; existing hashes remain unchanged. New Google users create the `users` row and `auth_identities` row atomically. Local login treats a missing user or null `password_hash` as the same generic invalid-credentials `401` and does not call password verification with null. For a returning Google subject, `provider_email_snapshot` may update, but Dental `users.email` remains application-owned and is not silently reassigned.

### Drive OAuth start handoff

`POST /api/google-drive/oauth/start` is the sole OAuth-start contract. The authenticated frontend calls the API wrapper with Dental session credentials included. The request contains no provider URL and no browser-supplied return target. The backend validates the current Dental user, creates and persists the one-shot transaction, sets its HttpOnly state cookie, constructs the Google authorization URL, and returns:

```json
{"authorization_url":"https://accounts.google.com/..."}
```

The frontend then performs:

```ts
const { authorization_url } = await api.startGoogleDriveOAuth();
window.location.assign(authorization_url);
```

The frontend MUST NOT navigate directly to `/api/google-drive/oauth/start` with GET, submit a form as a POST substitute, construct the provider URL, supply `return_to`, or open a chained popup from the Google Sign-In callback. The callback is browser-navigation transport and redirects only to the configured fixed Assistant URL with an allowlisted sanitized `result` query.

When `AUTH_MODE=google`, backend obtains expected email from the user's single verified Google identity row; absent, blank, or ambiguous identity fails closed with same-origin JSON `409 GOOGLE_DRIVE_ACCOUNT_MISMATCH` and creates no OAuth transaction. The expected email is included as `login_hint` and stored in the OAuth transaction. After exchanging the authorization code, the backend calls Drive `about.get` with exactly `fields=user(permissionId,emailAddress)` and compares non-empty normalized `emailAddress` to the stored expected email. Equality is required before connection/token persistence or workspace preparation. A mismatch best-effort revokes returned credentials, leaves any prior connection unchanged, creates no workspace, and maps domain code `GOOGLE_DRIVE_ACCOUNT_MISMATCH` to browser `303 See Other` with `result=account_mismatch` through the fixed sanitized callback result. The browser callback never emits HTTP `409`; that status is reserved for same-origin JSON application endpoints. When `AUTH_MODE=local`, backend sends no same-account login hint and permits explicit connection to any Google account.

Google documents `about.get` as the source for `user.permissionId` and `user.emailAddress`; `drive.file` remains sufficient because Google documents that this scope works with all Drive REST resources. The email is compared transiently and is not added to the persisted Drive connection row.

### Provider identity persistence

```text
auth_identities
id UUID PRIMARY KEY
user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
provider TEXT NOT NULL
provider_subject TEXT NOT NULL
provider_email_snapshot TEXT NULL
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
UNIQUE(provider, provider_subject)
UNIQUE(user_id, provider)
```

For this change, `provider='google'` and `provider_subject` is verified Google `sub`. V1 permits one Google identity per Dental user so Drive bootstrap has one unambiguous expected account. Email snapshot never authorizes login or account association; it is only the current verified email used for the Google-mode Drive continuity check.

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

Stable codes include `AUTH_PROVIDER_DISABLED`, `GOOGLE_AUTH_REQUEST_INVALID`, `GOOGLE_IDENTITY_INVALID`, `GOOGLE_EMAIL_NOT_AUTHORITATIVE`, `GOOGLE_ACCOUNT_LINK_REQUIRED`, `GOOGLE_DRIVE_ACCOUNT_MISMATCH`, `GOOGLE_DRIVE_NOT_CONFIGURED`, `GOOGLE_DRIVE_NOT_CONNECTED`, `GOOGLE_DRIVE_REVOKED`, `GOOGLE_DRIVE_SCOPE_MISSING`, `GOOGLE_DRIVE_SCOPE_UNEXPECTED`, `GOOGLE_DRIVE_OAUTH_STATE_INVALID`, `GOOGLE_DRIVE_OAUTH_FAILED`, `DRIVE_WORKSPACE_MISSING`, `DRIVE_WORKSPACE_RECOVERY_PENDING`, `DRIVE_FILE_NOT_MANAGED`, `DRIVE_FILE_PATIENT_MISMATCH`, `DRIVE_FILE_TYPE_UNSUPPORTED`, `DRIVE_FILE_TOO_LARGE`, `DRIVE_FILE_ENCODING_INVALID`, `DRIVE_FILE_CHANGED`, `DRIVE_OPERATION_REUSED`, `DRIVE_WRITE_UNKNOWN`, `DRIVE_PAGE_TOKEN_INVALID`, `DRIVE_RATE_LIMITED`, and `DRIVE_UNAVAILABLE`.

Disabled authentication provider routes return `404 AUTH_PROVIDER_DISABLED` and cannot create a Dental session. Invalid Google request context returns `403 GOOGLE_AUTH_REQUEST_INVALID` before provider verification; invalid Google identity claims return `401 GOOGLE_IDENTITY_INVALID`; valid but non-authoritative Google email returns `403 GOOGLE_EMAIL_NOT_AUTHORITATIVE`; existing-email collision returns `409 GOOGLE_ACCOUNT_LINK_REQUIRED`; missing or ambiguous expected Google identity on same-origin JSON OAuth start returns `409 GOOGLE_DRIVE_ACCOUNT_MISMATCH`; a Drive account mismatch discovered during a valid browser OAuth callback uses domain code `GOOGLE_DRIVE_ACCOUNT_MISMATCH` but returns `303 See Other` with sanitized `result=account_mismatch`, never HTTP `409`. Missing/mismatched/expired/replayed OAuth state or wrong Dental session returns sanitized HTTP `400` with code `GOOGLE_DRIVE_OAUTH_STATE_INVALID` directly before code exchange. Foreign Dental owner or foreign patient returns `404`. Google permission/foreign file failures map to managed-file `404` without revealing existence. `/api/google-drive/*` is added to existing `RequestValidationError` sensitive-path predicate so invalid content/name/query/IDs are never echoed. Validation returns `422`; oversized transport returns `413`; version/operation/recovery-pending conflict returns `409`; revoked grant returns `403 GOOGLE_DRIVE_REVOKED` so existing global `401` handler does not redirect authenticated user; transient/unknown upstream failure on same-origin JSON endpoints returns `502` or `503` with sanitized code, while a handled failure after valid callback state returns `303 See Other` with an allowlisted result.

## Google Cloud and Deployment

- One Google Cloud project per environment owns OAuth client, restricted browser API key, Picker API, Drive API, and project number/App ID; test and production projects remain separate.
- OAuth client type is Web application. Testing mode lists explicit test users.
- Picker API key is restricted to production/local web referrers plus `https://docs.google.com/*`, and restricted to Picker and Drive APIs.
- `VITE_GOOGLE_PICKER_API_KEY` and `VITE_GOOGLE_DRIVE_APP_ID` are public build-time values; App ID is Cloud project number.
- Client secret, refresh token, encryption key, and JWT secret never use `VITE_` variables.
- GIS V1 uses official JavaScript popup callback with `use_fedcm_for_button=false`, `auto_select=false`, and One Tap disabled. Responses serving the sign-in page include `Cross-Origin-Opener-Policy: same-origin-allow-popups`; browser smoke verifies this header prevents blank/lost GIS popup communication on non-FedCM browsers and records behavior on FedCM-capable browsers.
- Deployment forwards required server variables to both blue and green services without exposing app ports or changing proxy trust boundaries.
- Production release requires separate test/production Cloud projects, verified owned domain, public HTTPS homepage, privacy-policy link and Limited Use disclosure, accurate OAuth branding/support contact, exact authorized JavaScript origins/redirect URIs, enabled APIs, and applicable Google verification complete.

## Blast Radius

### Touched runtime areas

- Authentication route registration, mode configuration, Google identity persistence, and login/bootstrap UI.
- Ordered migrations from implementation-time head: relax `users.password_hash` and add provider identity, then Drive workspace. Dedicated repositories own their SQL.
- External Google OAuth/Drive integration.
- `/assistant` shell, active-patient transition, transcript actions, composer draft insertion, and responsive layout.
- Frontend primitive/dependency configuration and API types.

### Untouched runtime areas

- Dental JWT format, session-cookie semantics, logout behavior, `/api/auth/me`, and `get_current_user()` downstream contract. Login entry points and shared login finalization are extended by configured mode.
- Clinical SSE protocol, reducer events, rate limit, prompt, approval persistence, and final evolution insert.
- Chat conversations, RAG, citations, VideoExplorer behavior, admin, ingestion, and channel sync.

## Verification Strategy

- Fail-first authenticated route tests prove provider mode enforcement, federated-user null-password persistence, authoritative Google email policy, shared login finalization, GIS request context, user/session-bound one-shot state, same-origin mutations, encrypted persistence, Drive-account continuity, folder/file validation, patient-scoped Drive queries, operation reconciliation, copy-import rejection, safe retries, disconnect, and conflicts.
- Cipher unit tests prove random nonce, associated-data binding, keyring rotation/lazy re-encryption, wrong-key/version failure, and absence of plaintext.
- Vitest proves state union transitions, existing-file Preview entry, shared-buffer Preview/Edit switching, safe Markdown/plain-text rendering, responsive primitive behavior, explicit no-submit/no-write transfers, selection insertion, source serialization, stable operation IDs, Picker patient request, and shared dirty-navigation guard.
- Playwright mocks all Google/application endpoints and captures GIS popup callback/COOP behavior, no One Tap or auto-select, same-account/mismatch Drive onboarding, desktop sidecar, mobile Sheet, list/preview/editor/unsaved-preview/save/conflict/unknown-write/missing/revoked states, sticky mobile layout, keyboard resizing, focus movement/return, and patient transition.
- Manual smoke validates real test-user OAuth and Picker only after automated checks; no real clinical data is used.

## Execution Dependencies

- OpenSpec reconciliation enables Google identity and authentication-mode work.
- Google identity/session convergence enables Drive connection and seamless bootstrap.
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
- Google ID-token claims, `sub`, `email_verified`, and authoritative Gmail/Workspace email guidance: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
- GIS HTML/JavaScript button, popup callback, `login_hint`, and One Tap configuration: https://developers.google.com/identity/gsi/web/reference/html-reference
- GIS setup, CSP, COOP, and popup requirements: https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid
- GIS FedCM migration and browser verification: https://developers.google.com/identity/gsi/web/guides/fedcm-migration
- Drive `about.get` user identity fields: https://developers.google.com/workspace/drive/api/guides/user-info
- Functional Drive operation prior art, not security contract: https://github.com/mickael-kerjean/filestash/blob/master/server/plugin/plg_backend_gdrive/index.go
- Operational Drive/provider prior art: https://github.com/rclone/rclone/blob/master/docs/content/drive.md
- Official Python request examples: https://github.com/googleworkspace/python-samples/tree/main/drive
- Raw PickerBuilder-over-wrapper evidence: https://github.com/googleworkspace/drive-picker-element/issues/118
- shadcn component catalog and incremental composition guidance: https://ui.shadcn.com/docs/components
- shadcn AI skill/project-context guidance: https://ui.shadcn.com/docs/skills
