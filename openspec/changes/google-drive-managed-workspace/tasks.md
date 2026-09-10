## 0. Investigation and Scope Lock

- [ ] 0.1 Confirm current migration head, authenticated route registration, Dental cookie/session behavior, owner-scoped patient lookup, external HTTP mocking, security-header ownership, deployment origin, and environment forwarding; inspect only Filestash list/read/create/update separation, rclone `drive.file`/provider behavior, and official Python Drive request examples without importing their wider storage surfaces.
  Traceability: proposal `Investigation / Current State` and design `Boundary and Ownership`; locks backend Module, Interface, Seam, Adapter, and security-sensitive files for Slice 1.

- [ ] 0.2 Inspect `ClinicalAssistant`, `ClinicalAssistantArea`, `ClinicalTranscript`, `ClinicalComposer`, `MarkdownRenderer`, `AppShell`, `Sidebar`, `VideoExplorer`, Tailwind tokens, responsive tests, and clinical Playwright prior art; verify generic utility/accessory seam is highest viable UI seam, confirm installed Markdown rendering has no raw-HTML path, and confirm raw official `PickerBuilder` path against current docs/open wrapper issue. Before any shadcn install, run the official skill/CLI project-context inspection including `shadcn info --json`, inspect framework/Tailwind 3/aliases/icons/base library/tokens/radius/type and existing `components.json`, read official docs for every approved primitive, run dry-run and diff review, and accept only approved files/dependencies.
  Traceability: proposal `Ownership and Test Seam` and design decisions 17-25; locks UI ownership, local Preview rendering, and avoidance of copied modal Biblioteca behavior or extra mode-control dependency for Slices 3 and 4.

## 1. Contract Coverage (Failing First)

- [ ] 1.1 Add failing cipher, repository, config, and authenticated OAuth route tests for complete/partial configuration, one-shot state bound to initiating Dental user/session, omitted-scope-as-requested semantics, exact explicit scope and unexpected-scope rejection, refresh-token requirement, independent Google identity, purpose-separated AES-GCM keyring/lazy rotation for refresh and binding secrets, no plaintext or access-token cache, checked active/disconnected/revoked state, same-origin mutation checks, no retries for code exchange/revoke, callback sanitization, reconnect account change, best-effort revoke with guaranteed local clear, and sanitized logs.
  Traceability: requirements `Separate least-privilege Google authorization`, `Encrypted refresh-token persistence`, `Same-origin Drive mutations`, and `Disconnect revokes credentials without deleting files`; first external/security proof for Slice 1.
  Blocked by: 0.1.

- [ ] 1.2 Add failing `respx` and HTTP tests for authoritative fixed-name first-folder creation/reuse/missing/recreate, operation-ID-equal `creationOperationId`/`lastOperationId` with immutable marker preservation, unresolved-folder reconciliation/acknowledgement/repeated ambiguity and possible-orphan warning, per-connection signed patient/file binding and tamper rejection, unknown result with no write retry, exact TXT-only metadata validation (`.txt`/`text/plain`), backend MIME ownership, caller-stable create/update operation IDs, `.md`-to-`.txt` name normalization, deterministic Picker Markdown conversion using shared expected-output fixtures, TXT identity import, post-export 1 MiB boundary, patient ownership, pre-pagination patient query, managed-file predicates, 8 MiB pre-JSON request cap, all-read streaming hard stop, 2048-character/control-free opaque IDs and cursors, version conflict, managed-source import rejection, untrusted Picker source IDs, immutable source, patient ownership/no-store token response, `403 GOOGLE_DRIVE_REVOKED`, sensitive validation sanitization, and log prohibition.
  Traceability: requirements `Managed folder lifecycle`, `Patient-bound managed TXT files`, `Deterministic Markdown-to-plain-text export`, `Scoped cursor listing and search`, `Safe read and optimistic update`, `Duplicate-resistant Drive writes`, `Imported files become managed TXT copies`, and `Bounded and sanitized Google integration`; first contract proof for Slice 2.
  Blocked by: 1.1.

- [ ] 1.3 Add failing AppShell, Sidebar, Drive hook/component, ClinicalComposer, ClinicalTranscript, and API tests proving generic utility rendering, unchanged Biblioteca behavior, desktop resizable sidecar, mobile accessible Sheet with viewport height/sticky chrome/body-only scroll, incremental primitive allowlist, exact connection/recovery/error copy, one dominant primary action, familiar non-technical labels, adjacent comfortable targets, spacing-grouped metadata without per-file cards, immediate Connect/Open/Save/Import/Recover feedback and unequivocal success, patient-scoped pages, stable operation IDs, existing-file `ready -> opening -> viewing` with byte-faithful clean TXT identity, draft-first editing, local Markdown preview without raw HTML, deterministic shared serializer fixtures, Assistant Markdown save to TXT with no presentation delimiters, successful plain-text baseline update, close/reopen without Markdown reconstruction, visible destination normalization, shared-buffer Preview/Edit switching without network effects, conflict/unknown preservation, manual editor lifecycle, full-document insertion from Preview or Edit, selection insertion from Edit without submit, both Assistant source types without write, and one AppShell transition guard for same-origin links plus patient/thread/navigation/logout/close programmatic actions, modified/external/download/targeted-link bypass, single queued continuation, and browser unload.
  Traceability: requirements `Responsive Drive workspace accessory`, `Application-native TXT preview`, `Patient-safe workspace transitions`, `Explicit Drive-to-composer insertion`, `Explicit Assistant-to-Drive draft preparation`, and `Manual visible save state`; first visible behavior proof for Slices 3 and 4.
  Blocked by: 0.2 and 1.2.

## 2. Implementation

### Slice 1 - Connection and credential boundary

- [ ] 2.1 Add Google server/frontend configuration and templates; add migration `0012_google_drive_workspace` with checked active/disconnected/revoked status plus transition timestamp, encrypted per-connection binding secret, pending and completed folder operation IDs, and expiring OAuth-transaction table; add dedicated repository, purpose-separated AES-GCM keyring with lazy re-encryption, async OAuth/token/account-identity adapter using existing `httpx` plus stdlib, omitted/explicit token-scope handling, request-local access tokens, shared same-origin Drive mutation guard, authenticated status/start/callback/disconnect routes, stable errors, route registration, `cryptography` dependency/lockfile update, and blue/green environment forwarding without changing Dental auth semantics.
  Traceability: requirements `Separate least-privilege Google authorization`, `Encrypted refresh-token persistence`, `Same-origin Drive mutations`, and `Disconnect revokes credentials without deleting files`; establishes encrypted connection prerequisite and no-token-leak boundary without distributed cache.
  Blocked by: 1.1.

### Slice 2 - Managed patient file API

- [ ] 2.2 Implement 8 MiB Drive-route ASGI body limit plus async Drive REST adapter/route orchestration for authoritative fixed-name folder create/recreate with exact operation markers, missing and unresolved reconciliation/acknowledgement/repeated-ambiguity behavior, HMAC patient references and file-ID-bound MAC validation, pre-pagination Drive queries, bounded cursor/body search limited to valid patient-bound managed TXT, all-read streaming hard stop, deterministic local-export integration, backend-owned `.txt`/`text/plain` normalization, duplicate-resistant create/update with immutable marker preservation, one reconciliation, and no ambiguous write retry, version preflight, patient-verified `POST /picker-token` no-store response, source-validating Markdown/TXT import-copy to new TXT, managed-source rejection, `403 GOOGLE_DRIVE_REVOKED`, `/api/google-drive/*` integration with sensitive validation sanitizer, and metadata-only sanitized logging; keep all SQL in repository and expose typed calls through existing `app/frontend/src/lib/api.ts` without global `401` redirect for Drive revocation.
  Traceability: requirements `Managed folder lifecycle`, `Patient-bound managed TXT files`, `Deterministic Markdown-to-plain-text export`, `Scoped cursor listing and search`, `Safe read and optimistic update`, `Duplicate-resistant Drive writes`, `Imported files become managed TXT copies`, and `Bounded and sanitized Google integration`; completes backend-controlled Drive workspace without file catalog or autonomous access.
  Blocked by: 2.1 and 1.2.

### Slice 3 - Workspace shell, preview, and editor

- [ ] 2.3 Add reviewed Radix/shadcn configuration and only `Resizable`, `Sheet`, `ScrollArea`, `AlertDialog`, and `Alert` using existing tokens after official context inspection, docs review, dry-run, and diff acceptance; extract generic Sidebar utility and AppShell accessory APIs; adapt Biblioteca through utility seam unchanged; implement patient-aware discriminated Drive state union, derived recovery status, exact connection onboarding/error Alerts, file list/search pagination limited to managed TXT, empty/loading/revoked/missing/recovery-pending states with possible-orphan acknowledgement, desktop keyboard-resizable sidecar, mobile accessible Sheet with viewport/sticky actions/body-only scroll, application-native faithful TXT Preview, local Markdown Preview/Edit controls, deterministic serializer, one shared local authoring buffer plus plain-text baseline, literal wrapped TXT rendering, document editor, visible normalization, manual save status, conflict AlertDialog, and explicit workspace recreation. Existing files enter Preview; Assistant drafts enter Edit; mode switches perform no network action; successful save refreshes plain-text baseline/version and returns to clean Edit.
  Traceability: requirements `Deterministic Markdown-to-plain-text export`, `Responsive Drive workspace accessory`, `Application-native TXT preview`, `Patient-safe workspace transitions`, and `Manual visible save state`; creates verifiable Drive workspace while preserving current Sidebar/Chat design and adding no mode-control or renderer dependency.
  Blocked by: 2.2 and 1.3.

### Slice 4 - Clinical transfer and Picker

- [ ] 2.4 Implement AppShell transition-guard context within existing router for captured unmodified same-origin links and guarded patient/thread/navigation/logout/workspace-close continuations, bypass modified/external/download/targeted links, allow one pending transition, and add browser-native unload warning; connect full-buffer insertion from Preview/Edit and selected-editor-text insertion to thread composer draft without submit; add local Drive-draft actions to completed assistant messages and matching structured clinical drafts with fixed serialization and no flags; prove Assistant local Markdown preview -> saved plain TXT create with no delimiters; integrate official Picker JS API through raw `google.picker.PickerBuilder` as `Importar una copia` without React wrapper package; keep existing-file name read-only; render `DRIVE_WRITE_UNKNOWN` recovery; finalize minimal verified Picker CSP allowlist while preserving exact Google Fonts origins; require matching active patient for file, editor, Picker-token, import, and transfer actions while status/connect/disconnect/recreate remain connection-scoped; perform no autonomous LLM or Drive operation.
  Traceability: requirements `Deterministic Markdown-to-plain-text export`, `Imported files become managed TXT copies`, `Patient-safe workspace transitions`, `Explicit Drive-to-composer insertion`, `Explicit Assistant-to-Drive draft preparation`, and `Restrictive Picker browser policy`; completes human-controlled patient-bound workflow.
  Blocked by: 2.3.

## 3. Verification

- [ ] 3.1 Run focused connection/cipher/config/OAuth tests and inspect migrated schema to prove one-shot initiating-user/session state checks, omitted and explicit scope semantics, purpose-separated ciphertext-only secrets, keyring rotation, request-local token lifetime, same-origin mutations, mutually exclusive durable connection status, account-change binding-secret replacement, disconnect cleanup despite revoke failure, no code/revoke retry, callback sanitization, and zero credential leakage.
  Traceability: Slice 1 checkpoint; directly proves authorization and credential-at-rest contract.
  Blocked by: 2.1.

- [ ] 3.2 Run focused managed-folder/file tests against mocked Google endpoints to prove authoritative folder and `creationOperationId` checks, unresolved recovery acknowledgement/possible-orphan warning, patient/owner/appProperty checks, copied/tampered patientRef/MAC rejection, patient-scoped Drive query/cursor pages returning only valid managed TXT, stable operation markers, lost-response success-or-unknown reconciliation with zero automatic write retries, 8 MiB request and 1 MiB content/read bounds, exported-byte 1 MiB boundary, 2048-character/control-free opaque values, managed-source rejection, Markdown/TXT source-copy immutability, patient-verified no-store Picker token, backend-owned `.txt`/`text/plain`, conflict/local-authoring preservation, Drive revoked domain response, and sanitized validation/errors/logs.
  Traceability: Slice 2 checkpoint; directly proves backend authorization rather than trusting browser file IDs.
  Blocked by: 2.2.

- [ ] 3.3 Run focused frontend tests for utility/accessory compatibility, desktop/mobile accessibility, deterministic serializer fixtures, exported-byte boundary, discriminated `opening/viewing/editing/saving/saved` transitions, separate local authoring/plain baseline, existing-file Preview entry, draft Edit entry, same-buffer unsaved Preview, zero-network mode switches, safe local Markdown/no-raw-HTML and faithful literal TXT rendering, visible `.md`-to-`.txt` normalization, non-sensitive header metadata, patient-filtered TXT list/search/editor, operation context without automatic unknown-write retry, save/conflict/unknown/missing/recovery-pending/revoked states, exact Alert/AlertDialog behavior, one dominant primary action, familiar non-technical labels, adjacent comfortable action targets, spacing-grouped metadata, immediate Connect/Open/Save/Import/Recover feedback, unequivocal success, Drive revocation without Dental login redirect, immutable existing-file name, full insertion from either mode, keyboard selection insertion from Edit, no composer submit, both Assistant source serializers, raw PickerBuilder patient/token memory handling, and AppShell-guarded patient/thread/navigation/logout/close plus modified/external/download/targeted bypass and unload transitions.
  Traceability: Slice 3 and Slice 4 component checkpoint; proves read-before-edit, visible human control, safe local rendering, and patient-context behavior.
  Blocked by: 2.4.

- [ ] 3.4 Extend mocked clinical Playwright coverage for exact disconnected/unconfigured/connecting/connected/revoked/missing/recovery-pending UX, collapsed/open usable desktop Drive, keyboard resize, `list -> open -> preview -> edit -> local change -> preview unsaved change -> edit -> save -> saved`, structured Assistant Markdown preview -> TXT create proof, Preview whole-document insertion without submit, Edit selection insertion without submit, conflict/current-version recovery preserving local authoring, unknown-write with no hidden retry, missing/recovery-pending workspace with acknowledged recreation warning, durable revoked grant without login redirect, raw PickerBuilder Markdown/TXT import copies with untouched originals, Assistant-to-Drive draft entering Edit, dirty context navigation, close/reopen TXT fidelity without Markdown reconstruction, viewport-height mobile Sheet with sticky header/actions and body-only scroll, focus/close, CSP header including exact Google Fonts origins, and synthetic-only screenshots; document separate real OAuth/Picker smoke.
  Traceability: requirements `Restrictive Picker browser policy` and `Deterministic automated and manual verification`; browser proof uses existing `/assistant` seam without real Google dependency.
  Blocked by: 3.3.

- [ ] 3.5 Run complete backend Ruff check/format, mypy, pytest; frontend TypeScript, Biome, Vitest, build, and Playwright; verify no clinical SSE, Dental JWT, Chat, RAG, citation, quota, VideoExplorer, or proxy-trust regressions.
  Traceability: requirement `Deterministic automated and manual verification`; final repository regression gate.
  Blocked by: 3.1, 3.2, and 3.4.

## 4. Release Hygiene and Closeout

- [ ] 4.1 Document and collect release evidence for separate test/production Google Cloud projects, verified domain, public homepage, privacy/Limited Use disclosure, branding/support contact, exact origins/callback/return URLs, test users, key restrictions, applicable Google verification, encryption-keyring generation/rotation/retirement, manual synthetic smoke, revoke/reconnect recovery, and workspace-missing behavior; keep production Drive configuration disabled until checklist passes; update repository rules only if shadcn import convention changed; run requirement-to-proof audit and `openspec validate google-drive-managed-workspace`; prepare sync/archive only after evidence passes.
  Traceability: all google-drive-managed-workspace requirements; keeps operational and OpenSpec closeout after runtime verification.
  Blocked by: 3.5.

## Execution Order

### Slice 1 - Connection and credential boundary

- Tasks: `0.1 -> 1.1 -> 2.1 -> 3.1`
- Checkpoint: authenticated test user completes initiating-user/session-bound one-shot exact-only `drive.file` grant; DB contains purpose-separated ciphertext, managed identity, and durable revoked state; access token remains request-local; cross-origin mutations fail; disconnect clears refresh credentials without affecting Dental session.
- Blocks: Slice 2.

### Slice 2 - Managed patient file API

- Tasks: `1.2 -> 2.2 -> 3.2`
- Checkpoint: mocked Drive proves one authoritative marked folder plus explicit possible-orphan recovery, signed patient/file binding, pre-pagination patient-scoped list/search, owned-patient read/create/update/import-copy, ambiguous writes returning success or unknown without automatic retry, request/read/opaque-value bounds, managed-source rejection, immutable source, conflict preservation, and no sensitive logs.
- Blocked by: Slice 1.
- Blocks: Slice 3.

### Slice 3 - Workspace shell, preview, and editor

- Tasks: `0.2 -> 1.3 -> 2.3`
- Checkpoint: generic utility/accessory seam preserves Biblioteca and renders accessible desktop sidecar/mobile Sheet where existing managed files open in local Preview, drafts open in Edit, both modes share one patient-bound buffer, and mode switches have no network side effect.
- Blocked by: Slice 2.
- Blocks: Slice 4.

### Slice 4 - Clinical transfer and release proof

- Tasks: `2.4 -> 3.3 -> 3.4 -> 3.5 -> 4.1`
- Checkpoint: full/selection insertion changes composer without sending; eligible Assistant content opens only local editable Drive draft; dirty context changes resolve safely; raw PickerBuilder uses patient-verified token and restrictive CSP; mocked browser/full regression suites pass; production OAuth readiness evidence is complete before enablement.
- Blocked by: Slice 3.
- Blocks: None.
