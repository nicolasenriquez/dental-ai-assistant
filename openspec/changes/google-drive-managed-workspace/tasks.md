## 0. Investigation and Scope Lock

- [ ] 0.1 Confirm current migration head, authenticated route registration, Dental cookie behavior, owner-scoped patient lookup, external HTTP mocking, deployment origin, and environment forwarding before runtime edits.
  Traceability: proposal `Investigation / Current State` and design `Boundary and Ownership`; locks backend Module, Interface, Seam, Adapter, and security-sensitive files for Slice 1.

- [ ] 0.2 Inspect `ClinicalAssistant`, `ClinicalAssistantArea`, `ClinicalTranscript`, `ClinicalComposer`, `AppShell`, `Sidebar`, `VideoExplorer`, Tailwind tokens, responsive tests, and clinical Playwright prior art; verify generic utility/accessory seam is highest viable UI seam and record exact primitive CLI diff before adding dependencies.
  Traceability: proposal `Ownership and Test Seam` and design decisions 16-21; locks UI ownership and avoids copying modal Biblioteca behavior for Slices 3 and 4.

## 1. Contract Coverage (Failing First)

- [ ] 1.1 Add failing cipher, repository, config, and authenticated OAuth route tests for complete/partial configuration, state cookie and mismatch, session requirement, exact scope, refresh-token requirement, independent Google identity, AES-GCM associated data, no plaintext/access-token persistence, callback redirect sanitization, cache lifecycle, reconnect account change, disconnect, and sanitized logs.
  Traceability: requirements `Separate least-privilege Google authorization`, `Encrypted refresh-token persistence`, and `Disconnect revokes credentials without deleting files`; first external/security proof for Slice 1.
  Blocked by: 0.1.

- [ ] 1.2 Add failing `respx` and HTTP tests for first-folder creation/reuse/missing/recreate, exact metadata validation, patient ownership, managed-file predicates, UTF-8/type/name/size bounds, list/search cursor contracts, read/create/update, version conflict, import-copy source immutability, Picker no-store response, bounded retry/timeout behavior, revoked grant, and sensitive log prohibition.
  Traceability: requirements `Managed folder lifecycle`, `Patient-bound managed files`, `Scoped cursor listing and search`, `Safe read and optimistic update`, `Imported files become managed copies`, and `Bounded and sanitized Google integration`; first contract proof for Slice 2.
  Blocked by: 1.1.

- [ ] 1.3 Add failing AppShell, Sidebar, Drive hook/component, ClinicalComposer, ClinicalTranscript, and API tests proving generic utility rendering, unchanged Biblioteca behavior, desktop resizable sidecar, mobile accessible Sheet, incremental primitive scope, onboarding/states, patient-scoped pages, manual editor lifecycle, selection/full insertion without submit, both Assistant source types without write, and dirty patient-switch/close resolution.
  Traceability: requirements `Responsive Drive workspace accessory`, `Patient-safe workspace transitions`, `Explicit Drive-to-composer insertion`, `Explicit Assistant-to-Drive draft preparation`, and `Manual visible save state`; first visible behavior proof for Slices 3 and 4.
  Blocked by: 0.2 and 1.2.

## 2. Implementation

### Slice 1 - Connection and credential boundary

- [ ] 2.1 Add Google server/frontend configuration and templates; add migration `0011_google_drive_workspace`, dedicated repository, independently versioned AES-GCM cipher, async OAuth/token/account-identity adapter, authenticated status/start/callback/disconnect routes, ephemeral serialized refresh cache, stable errors, route registration, official backend dependencies, lockfile updates, and blue/green environment forwarding without changing Dental auth semantics.
  Traceability: requirements `Separate least-privilege Google authorization`, `Encrypted refresh-token persistence`, and `Disconnect revokes credentials without deleting files`; establishes encrypted connection prerequisite and no-token-leak boundary.
  Blocked by: 1.1.

### Slice 2 - Managed patient file API

- [ ] 2.2 Implement async Drive REST adapter and route orchestration for folder create/verify/missing/explicit recreation, patient-bound metadata validation, cursor list, body search, streamed read, explicit create/update with version preflight, Picker-token no-store response, safe import-copy, retry/timeout policy, revoked state, and metadata-only sanitized logging; keep all SQL in repository and expose typed calls through existing `app/frontend/src/lib/api.ts`.
  Traceability: requirements `Managed folder lifecycle`, `Patient-bound managed files`, `Scoped cursor listing and search`, `Safe read and optimistic update`, `Imported files become managed copies`, and `Bounded and sanitized Google integration`; completes backend-controlled Drive workspace without file catalog or autonomous access.
  Blocked by: 2.1 and 1.2.

### Slice 3 - Workspace shell and editor

- [ ] 2.3 Add reviewed Radix/shadcn configuration and only listed primitives using existing tokens; extract generic Sidebar utility and AppShell accessory APIs; adapt Biblioteca through utility seam unchanged; implement patient-aware Drive state hook, connection onboarding, file list/search pagination, empty/loading/error/revoked/missing states, desktop keyboard-resizable sidecar, mobile accessible Sheet, document editor, manual save status, conflict dialog, and explicit workspace recreation.
  Traceability: requirements `Responsive Drive workspace accessory`, `Patient-safe workspace transitions`, and `Manual visible save state`; creates verifiable Drive workspace while preserving current Sidebar/Chat design.
  Blocked by: 2.2 and 1.3.

### Slice 4 - Clinical transfer and Picker

- [ ] 2.4 Wire active-patient changes through dirty-editor save/discard/cancel guard; connect full/selected editor insertion to thread composer draft without submit; add local Drive-draft actions to completed assistant messages and matching structured clinical drafts with fixed serialization and no flags; integrate official React Picker adapter as `Importar una copia`; ensure all actions require matching active patient and perform no autonomous LLM or Drive operation.
  Traceability: requirements `Imported files become managed copies`, `Patient-safe workspace transitions`, `Explicit Drive-to-composer insertion`, and `Explicit Assistant-to-Drive draft preparation`; completes human-controlled patient-bound workflow.
  Blocked by: 2.3.

## 3. Verification

- [ ] 3.1 Run focused connection/cipher/config/OAuth tests and inspect migrated schema to prove state/session/scope checks, ciphertext-only DB, cache eviction, account-change handling, disconnect cleanup, callback sanitization, and zero credential leakage.
  Traceability: Slice 1 checkpoint; directly proves authorization and credential-at-rest contract.
  Blocked by: 2.1.

- [ ] 3.2 Run focused managed-folder/file tests against mocked Google endpoints to prove patient/owner/folder/appProperty checks, body search and cursor pages, byte/encoding/type bounds, source-copy immutability, no-store Picker token, conflict preservation, bounded retries, and sanitized errors/logs.
  Traceability: Slice 2 checkpoint; directly proves backend authorization rather than trusting browser file IDs.
  Blocked by: 2.2.

- [ ] 3.3 Run focused frontend tests for utility/accessory compatibility, desktop/mobile accessibility, deterministic state transitions, patient-filtered list/search/editor, save/conflict/missing/revoked states, keyboard selection insertion, no composer submit, both Assistant source serializers, Picker memory handling, and dirty patient transition.
  Traceability: Slice 3 and Slice 4 component checkpoint; proves visible human-control and patient-context behavior.
  Blocked by: 2.4.

- [ ] 3.4 Extend mocked clinical Playwright coverage for collapsed/open desktop Drive, keyboard resize, list/search/open/edit/dirty/saving/saved/conflict, missing workspace, revoked grant, import copy, Assistant-to-Drive draft, Drive-to-composer no-submit, dirty patient switch, mobile Sheet focus/close, and synthetic-only screenshots; document separate real OAuth/Picker smoke.
  Traceability: requirement `Deterministic automated and manual verification`; browser proof uses existing `/assistant` seam without real Google dependency.
  Blocked by: 3.3.

- [ ] 3.5 Run complete backend Ruff check/format, mypy, pytest; frontend TypeScript, Biome, Vitest, build, and Playwright; verify no clinical SSE, Dental JWT, Chat, RAG, citation, quota, VideoExplorer, or proxy-trust regressions.
  Traceability: requirement `Deterministic automated and manual verification`; final repository regression gate.
  Blocked by: 3.1, 3.2, and 3.4.

## 4. Release Hygiene and Closeout

- [ ] 4.1 Document Google Cloud project setup, exact development/production callback and return URLs, test users, key restrictions, encryption-key generation/rotation, manual synthetic smoke, revoke/reconnect recovery, and workspace-missing behavior; update repository rules only if shadcn alias/import convention changed; run requirement-to-proof audit and `openspec validate google-drive-managed-workspace`; prepare sync/archive only after evidence passes.
  Traceability: all google-drive-managed-workspace requirements; keeps operational and OpenSpec closeout after runtime verification.
  Blocked by: 3.5.

## Execution Order

### Slice 1 - Connection and credential boundary

- Tasks: `0.1 -> 1.1 -> 2.1 -> 3.1`
- Checkpoint: authenticated test user completes state-bound `drive.file` grant; DB contains only AES-GCM ciphertext and managed identity; access cache evicts correctly; disconnect clears credentials without affecting Dental session.
- Blocks: Slice 2.

### Slice 2 - Managed patient file API

- Tasks: `1.2 -> 2.2 -> 3.2`
- Checkpoint: mocked Drive proves one marked folder, owned-patient list/search/read/create/update/import-copy, cursor and size bounds, immutable source, conflict preservation, and no sensitive logs.
- Blocked by: Slice 1.
- Blocks: Slice 3.

### Slice 3 - Workspace shell and editor

- Tasks: `0.2 -> 1.3 -> 2.3`
- Checkpoint: generic utility/accessory seam preserves Biblioteca and renders accessible desktop sidecar/mobile Sheet with deterministic patient-bound file/editor states.
- Blocked by: Slice 2.
- Blocks: Slice 4.

### Slice 4 - Clinical transfer and release proof

- Tasks: `2.4 -> 3.3 -> 3.4 -> 3.5 -> 4.1`
- Checkpoint: full/selection insertion changes composer without sending; eligible Assistant content opens only local editable Drive draft; dirty patient switches resolve safely; mocked browser and full regression suites pass; operational setup is documented.
- Blocked by: Slice 3.
- Blocks: None.
