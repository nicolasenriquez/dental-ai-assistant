## Why

The clinical assistant cannot currently work beside user-owned Google Drive documents. Professionals must manually alternate between Drive and `/assistant`, which adds friction and creates opportunities to paste content into the wrong patient context or persist an unreviewed AI response.

This change adds a least-privilege, patient-bound Drive workspace where every transfer remains explicit: opening a Drive file never sends it to the LLM, inserting text never submits the composer, and preparing Assistant output never writes to Drive.

## Investigation / Current State

- `/assistant` and `/a/:threadId` render `ClinicalAssistant` inside `AppShell`; `ClinicalThreadList` already occupies `secondarySidebarContent`.
- `ClinicalAssistantArea` owns active-patient context and composer drafts by thread. `ClinicalComposer` receives its value and submit callback from that owner.
- `ClinicalTranscript` renders both plain assistant messages and structured `ClinicalDraftItem` artifacts. Those are the two eligible sources for a new Drive draft.
- `Sidebar` hardcodes the Biblioteca utility and `VideoExplorer` behind `showConversations`; `VideoExplorer` is a modal panel and is not suitable for simultaneous document and chat work.
- All frontend HTTP calls live in `app/frontend/src/lib/api.ts`; SSE framing remains in `lib/sse.ts` and is unrelated to Drive.
- Dental authentication uses the `session` JWT cookie and `get_current_user`. No Google OAuth connection exists.
- PostgreSQL access is owned by `app/backend/db/`; migration `0010_add_clinical_turn_artifacts` is current head.
- Production serves API and built frontend from `https://chat.dynamous.ai`; local frontend and backend run on ports 5173 and 8000.
- Frontend uses React 18, Tailwind 3, Lucide, Motion, and repository-native components. It has no `components.json`, Radix dependency, or shadcn primitive layer.
- Existing backend tests use pytest and `respx`; existing frontend tests use Vitest and mocked API boundaries; `tests/clinical-assistant.spec.ts` is the deterministic Playwright seam for `/assistant`.

## What Changes

- Add a Google OAuth 2.0 Web Server connection owned by the authenticated Dental user and independent from the Dental JWT session.
- Request only `https://www.googleapis.com/auth/drive.file`; do not use service accounts, domain-wide delegation, or broader Drive scopes.
- Store long-lived Google application state as AES-256-GCM-encrypted refresh token and per-connection binding secret plus managed-folder identity/status. Persist only short-lived OAuth transaction metadata beyond that boundary. Mint access tokens per HTTP request, retain them only for that request, and expose one only through a short-lived no-store Picker response.
- Keep one authoritative visible `Dental AI Assistant` folder for current Google connection, identified by persisted `folder_id` plus private `appProperties`, never by name lookup. Ambiguous creation may leave a non-authoritative orphan and requires explicit recovery.
- Manage only UTF-8 `.md` and `.txt` blob files no larger than 1 MiB. Every managed file belongs to managed folder and carries a server-verifiable HMAC binding over file ID, Dental user, opaque patient reference, and schema.
- Add cursor-paginated managed-file listing and body-based server search whose Drive query includes exact managed-folder, application-marker, and patient binding. Document names never enter URL queries or logs.
- Offer Google Picker as source-selection UI for external `.md` or `.txt` files, then treat selected source ID as untrusted and create a patient-bound copy only after backend validation. Never retain, move, update, or delete source file.
- Bind each OAuth attempt to its initiating Dental user and session through a persisted, expiring, one-shot transaction. Protect every mutating JSON endpoint with same-origin request validation.
- Mark folder/file writes with caller-stable operation IDs. Reconcile ambiguous results, but never automatically retry an uncertain Drive write or claim exactly-once semantics.
- Add authenticated status, OAuth, disconnect, workspace recreation, Picker-token, file list/search/read/create/update, and import-copy endpoints. Do not add delete, move, share, permission, upload, or global-browse endpoints.
- Add an incremental Radix-based shadcn primitive layer only for the Drive experience. Preserve existing visual tokens and do not migrate Chat, Clinical Assistant, Sidebar, Composer, messages, cards, or motion.
- Add a non-modal, resizable Drive sidecar beside `/assistant` on desktop and a modal Sheet on narrow screens. The workspace remains patient-bound and cannot carry an open document across patient changes.
- Open existing managed files in an application-native read-only preview before editing. Preview renders the validated `.md` or `.txt` buffer locally, never through a Google-hosted iframe, and switching between Preview and Edit performs no Google request, save, composer submission, or LLM call.
- Let users insert a complete document or selected text into the current clinical composer draft without submitting it.
- Let completed assistant messages and current structured clinical draft artifacts open an editable new Drive draft. Clinical draft serialization includes visible clinical sections and excludes review flags.
- Guard active-patient/thread changes, in-app navigation, logout, workspace close, and browser unload while a Drive document is dirty; internal transitions require save, discard, or cancel.
- Ship a restrictive CSP containing only application, existing exact Google Fonts, and verified Google Picker origins before production exposure.
- Keep Drive outside clinical SSE, agent tools, RAG, automatic synchronization, and autonomous LLM authority.

## Capabilities

### New Capabilities

- `google-drive-managed-workspace`: patient-bound Google authorization, managed-folder and file security, import-copy, optimistic update protection, sidecar UX, and explicit human-controlled transfer between Drive and the clinical assistant.

### Modified Capabilities

- None. `openspec/specs/` contains no active capability specs; existing Chat, patient, evolution, and Clinical Assistant runtime contracts remain unchanged.

## Change Profile

- Profile: `runtime-change`
- Why this profile fits: adds encrypted persistence, external OAuth and Drive integration, authenticated APIs, frontend dependencies, responsive UI, and patient-context interactions.

## Out Of Scope

- Google Docs native files, PDF, DOCX, images, arbitrary upload, binary content, nested folders, Shared Drives, and organization-wide Drive access.
- File deletion, move, rename after creation, sharing, permissions, comments, background sync, Drive Changes API, Watch API, crawling, and global My Drive search.
- Agent tools, autonomous Drive reads or writes, RAG, indexing, embeddings, or sending Drive content directly to an LLM.
- Automatic save, automatic composer submission, automatic persistence of Assistant output, and conflict overwrite.
- Google Drive/Docs iframe preview, remote document rendering, raw HTML rendering, or a new preview-format pipeline beyond the existing Markdown dependencies and literal plain text.
- Persisting access tokens, file content, source Picker IDs, local clinical drafts, or a duplicate Drive file catalog in PostgreSQL; distributed token cache, Redis, or write-operation ledger.
- Feature-specific quota accounting before observed usage requires it; Google quota responses remain bounded and sanitized.
- Replacing Dental authentication, coupling Dental and Google email identities, or adding service-account authorization.
- Migrating the existing application wholesale to shadcn/ui.

## Impact

- Adds migration `0011_google_drive_workspace` for connections and short-lived OAuth transactions, `db/google_drive_repo.py`, Google OAuth/Drive integrations, token cipher, route module, and focused backend tests.
- Extends `config.py`, `main.py`, `pyproject.toml`, `uv.lock`, backend/deploy environment templates, deployment service environment forwarding, and operational documentation.
- Extends `AppShell`, Sidebar utility composition, `ClinicalAssistant`, `ClinicalAssistantArea`, `ClinicalTranscript`, `ClinicalComposer`, `lib/api.ts`, frontend tests, and clinical Playwright coverage.
- Adds `components.json`, only required shadcn/Radix dependencies, and a small `components/ui/` primitive set while preserving current Tailwind tokens and repository UI language.
- Does not change clinical SSE schemas, clinical persistence, conversation persistence, Chat RAG, citations, quotas, or model prompts.

## Ownership and Test Seam

- Highest existing Seam: authenticated `/api/google-drive/*` HTTP behavior and user-visible `/assistant` interactions under an active patient.
- Owning Module: `integrations/google_drive_oauth.py` owns Google authorization protocol; `integrations/google_drive.py` owns Drive REST semantics; `db/google_drive_repo.py` owns connection persistence; `routes/google_drive.py` owns transport and Dental-user authorization; `ClinicalAssistant` owns accessory visibility and active-patient transition coordination.
- Interface: typed JSON APIs, one short-lived no-store Picker token, patient-scoped cursor responses, explicit composer insertion, and explicit Drive draft/save actions.
- Highest test Seam: authenticated FastAPI route tests with mocked Google endpoints, Vitest interaction tests over the page/component boundary, and mocked Playwright `/assistant` flows.
- Adapter: `asyncpg`, `httpx.AsyncClient`, AES-GCM token cipher, official Google Picker JS API through raw `google.picker.PickerBuilder`, Radix/shadcn primitives, and `app/frontend/src/lib/api.ts`.
- Depth / Leverage / Locality: Google protocol and authorization checks stay behind one backend integration boundary; patient context stays with existing Clinical Assistant ownership; reusable shell utility/accessory seams replace feature-specific Sidebar coupling without changing unrelated runtime behavior.

## Prior Art and First Proof

- Prior art: `test_auth.py` and `test_conversation_scoping.py` for authenticated ownership; `test_clinical_assistant_contract.py` for patient-bound clinical behavior and sanitized errors; `AppShell.test.tsx`, `Sidebar.test.tsx`, `ClinicalComposer.test.tsx`, and `clinical-assistant.spec.ts` for shell, composer, responsive, and browser behavior; `respx` external-boundary tests in backend suite.
- First failing behavior or contract proof: an authenticated user cannot connect with another user's/session's OAuth transaction or unexpected scope; plaintext refresh tokens never reach persistence; ambiguous writes reconcile or return unknown without blind retry; only the managed patient-bound folder/file set is readable or writable; managed files cannot re-enter through import; stale versions return `409`; oversized request bodies fail before JSON parsing; existing files open in local Preview before Edit; Preview/Edit share one buffer and switching performs no network action; Drive insertion changes only composer draft; Assistant output opens only a local Drive draft; dirty navigation requires resolution; and no token, document title, or clinical content enters logs.

## Verification Policy

- Add fail-first tests at authenticated HTTP, Google adapter, page interaction, and browser seams before production behavior.
- Mock every Google OAuth, Drive, revoke, and Picker boundary in automated tests; real Google authorization is manual smoke coverage only.
- Prove negative security boundaries directly, including foreign user, foreign patient, foreign folder, cross-session OAuth callback, cross-origin mutation, missing metadata, managed-source import, wrong MIME, oversize content, ambiguous write, revoked grant, state mismatch, and version conflict.
- Run focused checks before full backend/frontend suites and `openspec validate google-drive-managed-workspace`.

## Prior Art Policy

- Filestash's Google Drive backend is functional prior art for separating list/read/create/update operations, not a security blueprint. Do not copy its full `drive` scope, path-by-name resolution, broad CRUD surface, error leakage, or token lifecycle.
- rclone is operational prior art for `drive.file`, provider errors, paging, and quota behavior. Do not import its sync, deletion, conversion, shared-drive, service-account, or tuning surface.
- Google Workspace Python samples and official Drive documentation are authoritative for REST request/response semantics; adapt examples to existing async `httpx` boundary instead of adding Google client libraries.
- Picker uses official raw `google.picker.PickerBuilder`. Do not add `@googleworkspace/drive-picker-react` while its reported 403 regression remains unresolved; do not copy Storage Hub's browser token persistence or full-drive model.

## Execution Order Decision

- Required: yes
- Why: encrypted connection setup gates managed-folder operations; those gate file behavior; file behavior and shell seams gate patient-bound transfer UX and Picker integration.

## Notes

- Context: source design uses official Google OAuth, Drive API v3, Picker, Google Auth, and Google Workspace sample semantics as references, adapted to this repository's async FastAPI and `httpx` architecture rather than cloned.
- Clarification: `/grill-with-docs google-drive-managed-workspace source=openspec mode=grill` resolved four decisions: files bind to an owned patient; search is server-side and cursor-paginated; completed assistant messages and structured clinical drafts may seed local Drive drafts; dirty patient changes are blocked until save, discard, or cancel.
- Assumptions: default new document format is Markdown; duplicate Drive names are allowed because Drive identity is `file_id`; all user-facing copy is Spanish; current active patient is mandatory for list, search, create, import, read, update, insert, and Assistant-to-Drive actions.
- Review hardening: accepted signed file/patient binding, per-connection encrypted binding secret, duplicate-resistant writes without blind retry, initiating-session OAuth binding, exact granted scope, no-cache V1, persistent revoked state, same-origin mutation checks, server-bound Picker patient, patient-scoped Drive queries, managed-source rejection, versioned keyring rotation, inbound/outbound byte limits, global dirty guards, CSP, and production OAuth gates. Deferred write ledger and custom Drive rate accounting until observed correctness/quota evidence requires them.
- Preview hardening: existing files enter application-native read-only Preview; drafts enter Edit; both modes share one local buffer; Markdown reuses installed safe renderer without raw HTML; plain text remains literal; mode controls use native buttons; no iframe, renderer package, Tabs/ToggleGroup dependency, backend endpoint, autosave, or remote mode switch was added.
- Grilling: follow-up decisions selected signed file binding, encrypted per-connection binding secret retained only for same Google account, reconcile-without-retry for ambiguous writes, and provider quota only for V1.
- Boundaries: Google Drive is source of truth for managed file metadata/content; PostgreSQL stores only connection security state, managed-folder identity, and short-lived OAuth transactions; every transfer to Chat or Drive remains visible, editable, and explicitly confirmed by the professional.
