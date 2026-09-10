## Context

Current `/assistant` is a patient-aware clinical workspace. `ClinicalAssistantArea` owns active patient, composer drafts, queue behavior, and clinical runtime integration. `AppShell` owns navigation/sidebar layout but has no accessory pane seam. `Sidebar` owns a hardcoded Biblioteca button and modal `VideoExplorer`; copying that model would block simultaneous document and Assistant work.

Google Drive introduces a second authorization domain and external persistence system. Dental JWT identifies the application user. Google OAuth grants that user limited Drive access. These identities remain independent even when emails happen to match. Google credentials never become Dental session credentials.

Feature handles clinical text, OAuth secrets, external writes, responsive interaction, and patient switching. Design therefore chooses a narrow managed workspace rather than general Drive access.

## Goals / Non-Goals

**Goals**

- Give `/assistant` a patient-bound Drive sidecar that stays usable beside conversation on desktop.
- Use only `drive.file` and work persistently only with files created by this application.
- Keep one managed visible folder per current Google connection and validate every file operation server-side.
- Support `.md` and `.txt` list, search, read, create, explicit update, and safe imported copies.
- Prevent silent data transfer, cross-patient carryover, token exposure, overwrite conflicts, and sensitive logging.
- Use accessible, incremental shadcn/Radix primitives without redesigning existing application UI.

**Non-Goals**

- General Drive explorer, native Google Docs editor, shared drives, synchronization, file deletion, or autonomous agent access.
- New clinical persistence model or replacement of existing approved evolution workflow.
- Whole-application component-library migration.

## Boundary and Ownership

### Dental authentication

`auth/dependencies.py:get_current_user` remains the highest Dental authentication Seam. Every `/api/google-drive/*` operation, including OAuth start/callback, resolves the current Dental user through the existing `session` cookie. Google tokens never enter that cookie or Dental JWT claims.

### Google authorization

`integrations/google_drive_oauth.py` is the Module owning authorization URL construction, authorization-code exchange, refresh, revoke, granted-scope verification, and Google-account identity lookup. Its Interface accepts configuration plus opaque codes/tokens and returns sanitized typed values. `httpx.AsyncClient` is the network Adapter so route handlers stay non-blocking.

Official `google-auth` and `google-auth-oauthlib` remain dependencies for supported Google credential/protocol structures and validation. No synchronous network request may run on the event loop. Network exchange, refresh, revoke, and Drive calls use async `httpx` with explicit timeouts.

### Credential persistence

`auth/token_cipher.py` owns authenticated encryption. `db/google_drive_repo.py` owns all SQL for one connection row per Dental user. Routes and integrations never contain SQL.

### Drive workspace

`integrations/google_drive.py` is the only Module that knows Google Drive/revoke endpoint URLs and Drive request fields. Its Interface exposes folder, metadata, paging, read, create, update, copy-import, account identity, and revoke operations. Routes orchestrate ownership and map sanitized domain errors to HTTP.

### Clinical web experience

`ClinicalAssistant` owns Drive accessory open state, active-patient binding, and dirty patient-switch coordination. `ClinicalAssistantArea` remains owner of composer content. It exposes a narrow draft insertion Interface instead of letting Drive submit messages. `ClinicalTranscript` exposes eligible completed assistant text and structured draft serialization through callbacks.

`AppShell` gains generic `utilities` and `workspaceAccessory` Interfaces. Sidebar renders utilities; shell renders accessory. Neither imports Google Drive domain components. This is the highest reusable Seam and removes hardcoded feature ownership from Sidebar.

### Test seams

- Backend: authenticated route behavior with Google endpoints mocked by `respx`.
- Frontend: typed API mocks and visible interactions in Vitest.
- Browser: mocked `/api/google-drive/*` plus existing clinical endpoints in `tests/clinical-assistant.spec.ts` or a focused sibling spec.
- Manual: one documented test-user OAuth smoke against configured Google project; never CI.

## Decisions

1. Keep Dental JWT and Google OAuth separate.

   Dental JWT identifies `user_id`; Google refresh token authorizes Drive. No service account, JWT assertion, domain-wide delegation, Firebase/Auth0/Supabase replacement, or Google-email coupling is permitted.

2. Use exact scope `https://www.googleapis.com/auth/drive.file`.

   OAuth start sends `access_type=offline`, `include_granted_scopes=true`, and `prompt=consent`. Callback requires the exact Drive scope among granted scopes and a refresh token. Missing scope or refresh token fails the connection atomically.

3. Use one managed folder identified by ID and private metadata.

   Folder name defaults to `Dental AI Assistant`. Creation sets:

   ```json
   {"appProperties":{"managedBy":"dental-ai-assistant","workspaceSchema":"1"}}
   ```

   DB `folder_id` is authority. Application never adopts a same-named folder. Folder verification requests only `id,name,mimeType,trashed,appProperties` and requires folder MIME, not trashed, and exact markers.

   Missing folder during ordinary operation produces `workspace_missing`; no write recreates it. `POST /workspace/recreate` requires explicit user action and creates/persists a replacement. Initial successful OAuth may create the first folder because connection itself is explicit.

4. Bind every managed file to one owned patient.

   Create/import requires `patient_id`; backend verifies patient ownership before Google access. File creation sets:

   ```json
   {
     "appProperties": {
       "managedBy": "dental-ai-assistant",
       "workspaceSchema": "1",
       "patientId": "<owned-patient-uuid>"
     }
   }
   ```

   Valid managed file requires exact managed parent, not trashed, allowed MIME and extension, size at most 1 MiB, and all three properties. Read/update receives expected patient ID and rejects mismatched metadata. UI lists only active-patient files and closes or resolves old-patient state before switching.

5. Store one encrypted connection row and no file catalog.

   Migration `0011_google_drive_workspace` adds:

   ```text
   google_drive_connections
   user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE
   google_account_id TEXT NULL
   refresh_token_ciphertext BYTEA NULL
   refresh_token_nonce BYTEA NULL
   token_key_version INTEGER NULL
   granted_scopes TEXT[] NOT NULL DEFAULT '{}'
   folder_id TEXT NULL
   folder_name TEXT NULL
   connected_at TIMESTAMPTZ NOT NULL
   disconnected_at TIMESTAMPTZ NULL
   created_at TIMESTAMPTZ NOT NULL
   updated_at TIMESTAMPTZ NOT NULL
   ```

   `google_account_id` is Google's opaque Drive user permission ID, not email. File IDs/content and access tokens are not persisted. Credential columns are nullable only so a disconnected row can retain folder history. A database check requires account ID, ciphertext, nonce, key version, non-empty scopes, and `connected_at` together whenever `disconnected_at IS NULL`; disconnected rows require those credential fields empty. Disconnect clears ciphertext, nonce, scopes, account ID, in-memory token, and active connection state but retains folder ID/name only as historical reconnect aid. Reconnect verifies Google account identity before reuse; a different account clears old folder identity and creates one folder in the new account.

6. Encrypt refresh tokens with independently versioned AES-256-GCM.

   `GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY` is URL-safe base64 encoding of exactly 32 random bytes. AES-GCM uses a fresh 12-byte nonce and associated data containing Dental `user_id` plus key version. Ciphertext includes authentication tag. `JWT_SECRET` is never reused. Decryption/authentication failure produces a sanitized revoked/unavailable state and no Google request.

7. Make Drive configuration optional but fail the feature closed.

   Server config adds client ID, client secret, OAuth redirect URI, post-connect return URL, token key, folder name, and key version. If all required values are absent, app starts and Drive status reports `configured=false`; mutation/OAuth endpoints return sanitized `503 GOOGLE_DRIVE_NOT_CONFIGURED`. Partial or malformed configuration fails application startup with a configuration error. Return URL must be an exact configured URL, never a request parameter.

   Production values use `https://chat.dynamous.ai/api/google-drive/oauth/callback` and `https://chat.dynamous.ai/assistant`. Local documented values use backend callback on port 8000 and frontend return on port 5173.

8. Use cookie-bound OAuth state and exact callback behavior.

   `POST /oauth/start` requires Dental session, generates 32-byte URL-safe state, and sets `google_drive_oauth_state` as `HttpOnly`, `Secure`, `SameSite=Lax`, `Max-Age=600`, path `/api/google-drive/oauth/callback`. Response contains only authorization URL. Callback requires Dental session, compares query/cookie state with `secrets.compare_digest`, clears state cookie on every terminal path, exchanges code, validates scope/refresh token/account identity, encrypts/persists, ensures first folder, invalidates token cache, and redirects to fixed return URL with only a sanitized result code. It never returns tokens in URL.

9. Keep access tokens ephemeral.

   Process cache key is Dental user ID plus Google account ID. Entry contains access token and monotonic expiry at `expires_in - 60 seconds`; non-positive remaining lifetime is not cached. Cache miss decrypts refresh token and exchanges it at Google token endpoint. Concurrent refresh for same key is serialized. Disconnect, reconnect, invalid grant, and decrypt failure evict cache. Access token is never written to DB, logs, analytics, or browser storage.

10. Expose Picker token as a narrow exception.

   `GET /picker-token` returns `{access_token, expires_in}` only for connected users with an active owned patient selected client-side. It sends `Cache-Control: no-store` and `Pragma: no-cache`. Frontend holds token in function/component memory only, immediately builds Picker, and drops references after Picker closes. No localStorage, sessionStorage, IndexedDB, cookie, telemetry, or console output is allowed.

11. Import only a copy.

   Picker filters `.md`/`.txt` MIME types and returns one selected source ID. `POST /import-copy` takes active `patient_id`, source ID, and optional destination name. Backend verifies owned patient, fetches source metadata, validates not trashed, allowed MIME/extension, declared size at most 1 MiB, downloads with a streaming 1 MiB hard stop, UTF-8 decodes, then creates a new marked patient-bound file in managed folder. Source ID is discarded after request and never persisted. Original is never moved, changed, deleted, or managed.

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
   GET  /api/google-drive/picker-token
   POST /api/google-drive/import-copy
   ```

   List page size is 100, sorted `modifiedTime desc,name`. Search body is `{patient_id, query, page_token?}` with stripped query length 1..200. Backend escapes Drive query literals, scopes query to exact parent/not trashed/name contains term, requests only allowed fields, and post-validates every result's patient/app metadata. Cursor is returned as opaque `next_page_token`; neither query nor document name enters URL/logs. Invalid Google page tokens map to `422 DRIVE_PAGE_TOKEN_INVALID`.

13. Define text-file naming and content rules.

   Allowed MIME/extension pairs are `text/markdown` + `.md` and `text/plain` + `.txt`; comparison is case-insensitive, output normalizes extension lowercase. New drafts default to `.md`. Names are stripped, must be 1..120 characters including extension, contain no control characters, `/` or `\\`, and must end in an allowed extension. Duplicate names are allowed; identity is Drive `file_id`. Content must UTF-8 encode to at most 1,048,576 bytes. Empty content is allowed only in a local new draft, not in create/update requests.

14. Use preflight version conflict detection without claiming atomic CAS.

   Read returns Drive monotonic `version` as string. Update body contains `patient_id`, non-empty content, and `expected_version`. Backend fetches and validates metadata immediately before media update. Mismatch returns `409 DRIVE_FILE_CHANGED` and does not update. Successful update returns fresh metadata/version. This is best-effort conflict detection, not atomic compare-and-swap. V1 never offers force overwrite; conflict dialog offers Cancel and View current version, preserving local text in memory.

15. Bound Google networking and sanitize errors.

   Explicit timeouts: connect 5 s, read 15 s, write 20 s, pool 5 s. Retry at most twice with bounded exponential backoff and jitter only for connection/timeouts, 429, and 5xx. Never retry validation, 400, permission 403, not found 404, local conflict, or `invalid_grant`. One 401 may evict token and refresh once; repeated 401 becomes revoked. Public errors use stable codes and never include Google response bodies, tokens, source IDs, names, or content.

16. Add a generic shell utility/accessory seam.

   `AppShell` accepts generic utility descriptors and optional accessory render content. `Sidebar` renders utility buttons independent of `showConversations`; Biblioteca is adapted through this seam for Chat without changing behavior. Desktop shell places Assistant and Drive in accessible resizable panels. Narrow view uses Sheet with backdrop, Escape, focus trap, focus return, labelled title, and inert background. Breakpoint follows existing 767 px mobile boundary.

17. Adopt shadcn incrementally with Radix.

   Add `components.json` and only dependencies generated for `Resizable`, `Sheet`, `ScrollArea`, `Input`, `Textarea`, `DropdownMenu`, `AlertDialog`, `Badge`, `Button`, `Tooltip`, `Skeleton`, and `Empty` composition. Use Radix, current Tailwind 3, Lucide, existing CSS variables, and current radius/typography. Review CLI `--dry-run`/`--diff` before adding. Existing components are not migrated. Generated source lives under `src/components/ui/`; repository import conventions remain relative after generation normalization.

18. Use one deterministic workspace state union.

   State covers `unconfigured`, `disconnected`, `connecting`, `loading_list`, `ready`, `opening`, `editing`, `saving`, `saved`, `conflict`, `workspace_missing`, `revoked`, and `error`. Each variant carries only valid data. Local new draft and opened-document edit both carry bound patient ID. Independent loading/saving/editing booleans are not combined.

19. Keep Drive-to-composer transfer explicit.

   Full-document action inserts current editor content. When textarea selection is non-empty, accessible `Insertar selección en el chat` inserts only selected text; selection action remains keyboard reachable and does not depend only on a floating pointer control. Insertion appends to current composer draft with a newline separator, focuses composer, and never calls submit/SSE/LLM. Action is disabled if bound patient differs from active patient or no active patient exists.

20. Keep Assistant-to-Drive transfer local until save.

   Completed assistant messages expose `Guardar en Drive`; structured clinical draft artifacts expose same action and serialize fixed visible labels while omitting empty sections and all review flags. Action requires matching active patient, opens sidecar/Sheet in `editing` with default Markdown name and editable content, and performs no API write. User may edit name/content, then explicitly save. Approval status is not required because Drive copy is a user-controlled document, not the authoritative PostgreSQL evolution.

21. Resolve dirty state before patient switch or close.

   If Drive editor is dirty, any active-patient change is suspended and AlertDialog offers `Guardar cambios`, `Descartar cambios`, and `Cancelar`. Save performs normal conflict/version validation; switch continues only after successful save. Discard clears local draft then switches. Cancel preserves patient and editor. Sheet/sidecar close uses same guard. Clean state switches immediately and reloads patient-scoped list.

22. Log metadata, never clinical material or credentials.

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

Status values: `unconfigured`, `disconnected`, `connected`, `workspace_missing`, `revoked`. Folder ID, Google account ID, scopes, and token data are never public.

### List/search page

```json
{
  "files": [
    {
      "id": "opaque",
      "name": "evolucion-2026-09-09.md",
      "mime_type": "text/markdown",
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
  "name": "evolucion-2026-09-09.md",
  "mime_type": "text/markdown",
  "content": "..."
}
```

```json
{"patient_id":"uuid","content":"...","expected_version":"27"}
```

### Import copy

```json
{"patient_id":"uuid","source_file_id":"picker-opaque-id","name":"importado.md"}
```

`name` may be omitted to retain a validated/normalized source name. Response is the new managed document only; source identity is absent.

## Error Contract

Stable codes include `GOOGLE_DRIVE_NOT_CONFIGURED`, `GOOGLE_DRIVE_NOT_CONNECTED`, `GOOGLE_DRIVE_REVOKED`, `GOOGLE_DRIVE_SCOPE_MISSING`, `GOOGLE_DRIVE_OAUTH_STATE_INVALID`, `GOOGLE_DRIVE_OAUTH_FAILED`, `DRIVE_WORKSPACE_MISSING`, `DRIVE_FILE_NOT_MANAGED`, `DRIVE_FILE_PATIENT_MISMATCH`, `DRIVE_FILE_TYPE_UNSUPPORTED`, `DRIVE_FILE_TOO_LARGE`, `DRIVE_FILE_ENCODING_INVALID`, `DRIVE_FILE_CHANGED`, `DRIVE_PAGE_TOKEN_INVALID`, `DRIVE_RATE_LIMITED`, and `DRIVE_UNAVAILABLE`.

Foreign Dental owner or foreign patient returns `404`. Google permission/foreign file failures map to managed-file `404` without revealing existence. Validation returns `422`; version conflict returns `409`; revoked grant returns `401`-equivalent domain state to authenticated UI without invalidating Dental session; transient upstream failure returns `502` or `503` with sanitized code.

## Google Cloud and Deployment

- One Google Cloud project owns OAuth client, restricted browser API key, Picker API, Drive API, and project number/App ID.
- OAuth client type is Web application. Testing mode lists explicit test users.
- Picker API key is restricted to production/local web referrers plus `https://docs.google.com/*`, and restricted to Picker and Drive APIs.
- `VITE_GOOGLE_PICKER_API_KEY` and `VITE_GOOGLE_DRIVE_APP_ID` are public build-time values; App ID is Cloud project number.
- Client secret, refresh token, encryption key, and JWT secret never use `VITE_` variables.
- Deployment forwards required server variables to both blue and green services without exposing app ports or changing proxy trust boundaries.

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

- Fail-first authenticated route tests prove state, encrypted persistence, folder/file validation, patient scope, paging/search, copy import, retries, disconnect, and conflicts.
- Cipher unit tests prove random nonce, associated-data binding, wrong-key/version failure, and absence of plaintext.
- Vitest proves state union transitions, responsive primitive behavior, explicit no-submit/no-write transfers, selection insertion, source serialization, and dirty-switch guard.
- Playwright mocks all Google/application endpoints and captures desktop sidecar, mobile Sheet, list/editor/save/conflict/missing/revoked states, keyboard resizing, focus movement/return, and patient transition.
- Manual smoke validates real test-user OAuth and Picker only after automated checks; no real clinical data is used.

## Execution Dependencies

- Connection/security slice enables managed-folder slice.
- Managed-folder/file slice enables sidecar/editor slice.
- Sidecar/editor plus generic shell seam enable clinical transfer and Picker slice.
- Full verification and deployment documentation follow all runtime slices.
