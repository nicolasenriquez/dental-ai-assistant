## Context

The branch already has owner-scoped Drive connections and managed TXT files, global source-note APIs, dirty-transition protection, a clinical SSE reducer, persisted artifacts, approval actions, artifact autosave, and mocked browser coverage. Missing pieces are a clear Drive information architecture, durable journal lineage, and a single artifact presentation spanning draft through Drive outcome.

## Baseline Snapshot

- `STARTING_SHA=9ac7aa552f2112c92bb42c203eca70452c1ea816`
- `WORKTREE_STATUS=dirty`
- This dirty worktree is the implementation baseline. It contains the locally verified Drive header/closed-default shell, composer queue guard, migration draft, their focused tests, and this OpenSpec change; these changes are not assumed to exist on the remote branch.
- Tasks remain checked only when their implementation and focused validation are present in this exact worktree. The migration task remains incomplete until its schema matches the contracts below.
- Backend runtime and validation use Docker. The broken host `.venv` is not an execution authority.

## Goals / Non-Goals

**Goals:**

- Preserve PostgreSQL as the canonical clinical record and explicit clinician approval.
- Produce exactly one logical journal entry after a successful or successfully reconciled Drive export.
- Make live SSE and hydrated threads render the same persistent clinical artifact.
- Keep global Notes, patient-bound managed documents, and cross-patient journals distinct.
- Preserve local work and expose explicit recovery for conflicts and ambiguous Drive outcomes.

**Non-Goals:**

- Transactionally exactly-once remote Drive mutation.
- Generic attachments, settings, sync, collaborative Google Docs editing, or bidirectional journal sync.
- Patient-specific journals, automatic draft export, automatic patient inference, or speculative dependency installation.
- A global redesign outside the Clinical Assistant and its Drive workspace.

## Decisions

### 1. Module boundaries

`evolution_exports/service.py` owns orchestration and `db/evolution_exports_repo.py` owns SQL. Existing Google integration modules retain provider primitives. Routes contain validation and transport only.

### 2. Atomic approval and durable intent

An evolution is eligible for Drive journaling if and only if the authenticated user already has a `google_drive_connections` row, regardless of whether its status is connected, disconnected, or revoked. A user who has never connected Drive gets no export row and `drive_export=null`.

Every eligible approved evolution SHALL get an export row in the approval transaction. The transaction freezes `operation_id`, `period_type`, `period_key`, exact serialized `journal_block`, and `content_hash` at approval time. A usable connection creates the row as `pending`; a disconnected or revoked connection creates it as `failed` with `DRIVE_CONNECTION_REQUIRED`. Either the evolution and row both commit or neither commits. The remote Drive write is never part of that transaction.

Reconnect and retry reuse the same row, operation ID, period, and content hash. Later preference or timezone changes do not move an already approved evolution.

### 3. Post-response execution model

The approval endpoint SHALL accept FastAPI `BackgroundTasks`. After the atomic transaction commits, it SHALL return canonical HTTP success immediately with the durable `drive_export` state. When the state is `pending`, the route schedules one best-effort background service call. It SHALL NOT perform inline Drive I/O, use browser-driven synchronization, call bare `asyncio.create_task`, or introduce a job-queue dependency.

The background task receives only stable scalar `user_id` and `evolution_id`. During execution it reacquires the pool connection, export row, current Drive connection, and request-independent provider credentials. It MUST NOT receive or retain a request object, an `asyncpg.Connection`, a transaction, an OAuth access token, or a dependency-scoped repository/service instance from the HTTP request.

If the process stops after the response and before the task runs, hydration returns the durable state without scheduling or performing Drive work. The frontend may automatically call the same-origin guarded retry POST once after hydration for `pending`, `syncing`, or `unknown`; it does not classify syncing age. Only that POST may schedule recovery or verification. Thread and journal GET requests remain side-effect free.

The frontend never decides whether `syncing` is stale from local time or hydrated timestamps. It may invoke the one guarded recovery POST allowed by hydration policy, but the backend alone evaluates `EXPORT_SYNC_STALE_AFTER_SECONDS` and decides whether the row remains active, is claimable, or requires reconciliation. The API does not expose `updated_at`, `is_stale`, `stale_after`, or `retry_after` for this decision, and TypeScript does not duplicate the timeout.

Before Drive I/O, the repository atomically claims an export by changing an eligible status to `syncing` and updating `updated_at`. Eligible rows are `pending`, explicitly retried `failed` or `unknown`, and `syncing` rows older than `EXPORT_SYNC_STALE_AFTER_SECONDS=300`. A failed conditional update means another worker owns the attempt, so the caller exits without Drive I/O. A non-stale `syncing` row cannot be claimed. Stale `syncing` is not evidence of success and must reconcile before append.

The atomic claim returns the row together with its pre-update `previous_status`; no persisted column is added. Recovery dispatch uses that value, never the post-claim `syncing` value. `pending` enters normal synchronization. `failed` enters safe known-no-write retry. Stale `syncing` reconciles first and continues only when safe. `unknown` performs reconciliation only and cannot reach append or update logic.

Before claiming a `failed` export, recovery validates the current Drive connection. If it remains disconnected or revoked, the endpoint returns `409 DRIVE_CONNECTION_REQUIRED`, preserves the row's status and error code, and performs no claim or provider I/O. The background task also checks connection usability after it starts. If Drive became unavailable after scheduling, the claimed `syncing` row becomes `failed` with `DRIVE_CONNECTION_REQUIRED` because no journal mutation occurred.

### 4. Duplicate resistance and honest outcomes

One export row is unique by `(user_id, evolution_id)` and by `operation_id`. Retry reuses that row and stable marker. A successful or successfully reconciled export yields exactly one logical journal block. Remote mutation is duplicate-resistant, not transactionally exactly-once. One fresh-version retry is allowed for a known conflict. An ambiguous write is reread once; marker presence becomes `synced`, marker absence becomes `unknown`, and no blind automatic append follows.

Status meanings are strict. `pending` means no write was attempted. `syncing` means one worker owns an attempt. `failed` means the backend knows no remote journal mutation occurred. `unknown` means a remote mutation may have occurred. `synced` means the write was confirmed or reconciled. Any timeout or provider result that may follow a write reconciles to `synced` or `unknown`, never `failed`.

After claiming an export, the service acquires a session-scoped PostgreSQL advisory lock derived from `(user_id, period_type, period_key)` on one dedicated pool connection. It does not open or hold a database transaction during Google I/O. While holding the lock it inspects parts, chooses the writable part, persists `journal_part`, locates or creates the file, reads it, reconciles the marker, and appends or updates. It rechecks remote identity after acquiring the lock and always calls `pg_advisory_unlock` in `finally` before releasing the connection.

`journal_part`, `drive_file_id`, and `drive_version` form one remote-target tuple and the repository persists them atomically through one operation. Known-safe rollover reselection first writes `(new_part, NULL, NULL)`, clearing the old provider identity. After locating or creating the new file, it writes `(new_part, new_file_id, new_version)` together. Once a provider outcome becomes ambiguous, the entire tuple is immutable until reconciliation resolves that attempt.

Journal lookup by exact `appProperties` is fail-safe: zero matches permits create, one match permits use, and more than one match fails with `JOURNAL_IDENTITY_CONFLICT`. The service never selects an arbitrary duplicate.

When an ambiguous create leaves `drive_file_id` unset, reconciliation locates the already selected `journal_part` using its exact server-owned `appProperties`. One match becomes the reconciliation target, zero matches leaves the export `unknown`, and multiple matches fail with `JOURNAL_IDENTITY_CONFLICT`. Reconciliation MUST NOT create another file.

### 5. Schema contract

`google_drive_connections.evolution_export_frequency` is non-null text, defaults to `weekly`, and is constrained to `weekly|daily`.

`google_drive_evolution_exports` has:

- `id UUID PRIMARY KEY`
- `user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`
- `evolution_id UUID NOT NULL REFERENCES evolutions(id) ON DELETE CASCADE`
- `operation_id UUID NOT NULL`
- `period_type TEXT NOT NULL CHECK (period_type IN ('weekly','daily'))`
- `period_key TEXT NOT NULL`
- `journal_part INTEGER NULL CHECK (journal_part IS NULL OR journal_part >= 1)`
- `drive_file_id TEXT NULL`, `drive_version TEXT NULL`
- `status TEXT NOT NULL CHECK (status IN ('pending','syncing','synced','failed','unknown'))`
- `journal_block TEXT NOT NULL`
- `content_hash TEXT NOT NULL`
- `last_error_code TEXT NULL`
- `created_at TIMESTAMPTZ NOT NULL`, `updated_at TIMESTAMPTZ NOT NULL`, `synced_at TIMESTAMPTZ NULL`
- `UNIQUE(user_id, evolution_id)` and `UNIQUE(operation_id)`

Repository methods always scope reads and mutations by authenticated `user_id`. Public APIs never accept `drive_file_id`, `operation_id`, `period_key`, or `journal_part` from the client except the validated journal read path described below.

### 6. Period and journal identity

Backend config SHALL read `CLINICAL_TIMEZONE` once, defaulting to `America/Santiago`, and validate it as an IANA timezone at startup. The backend alone derives daily/ISO-week period keys from the canonical approval/save timestamp in that timezone. The `EVOLUCIÓN` header displays canonical `evolution_at` converted to the same timezone, even when its date differs from the approval date used for journal grouping.

Weekly filenames are `Evoluciones — YYYY-Www.txt`; daily filenames are `Evoluciones — YYYY-MM-DD.txt`. Part one has no suffix. Later parts are `Evoluciones — <period> — 2.txt`, ` — 3.txt`, and so on.

Each journal file uses exactly these Drive `appProperties`:

- `managedBy=dental-ai-assistant`
- `artifactType=evolution-journal`
- `periodType=weekly|daily`
- `periodKey=<derived period key>`
- `journalPart=<positive decimal integer>`

No `patientRef` or other patient identifier is stored in journal `appProperties`.

### 7. Journal V1 byte format

Every appended block is serialized once at approval, persisted verbatim as `journal_block`, encoded as UTF-8 without BOM with LF-only line endings, and ends with one final LF. It is exactly:

```text
============================================================
EVOLUCIÓN · DD-MM-YYYY · HH:mm
Paciente: <display name>
RUT: <masked RUT>
Dental AI ID: <evolution_id>
============================================================

<approved evolution>

============================================================
```

Before serialization, the backend replaces CRLF and CR with LF, removes all terminal LF characters from the approved body, and preserves every other character and whitespace. It inserts that normalized body into the template, persists the resulting string as `journal_block`, encodes that exact string as UTF-8, and computes SHA-256 over those bytes. Export and recovery read the stored block, re-encode it, verify the hash, and never reconstruct it from current patient or evolution data.

The RUT is masked and only its existing display-safe suffix may remain (example `••••••94-1`). The block never contains patient UUID, thread ID, or operation ID. The `Dental AI ID` line is the reconciliation marker. Rollover is chosen before append using the exact byte length and existing safe Drive limit.

`journal_part` remains nullable until the first claimed sync inspects remote parts under the period lock. Before any ambiguous provider outcome, a known no-write result may change it. Specifically, after a known version conflict, the service rereads the selected part; if the new exact byte length would overflow, it may select or create the next part, persist that positive part, and use its one allowed write attempt there. Once any provider outcome is ambiguous, the selected part is immutable until reconciliation resolves that attempt.

### 8. API and hydration contracts

All endpoints require the existing authenticated user dependency and return sanitized stable error codes.

- `GET /api/google-drive/evolution-journals/preferences` returns `{ "frequency": "weekly" | "daily" }`.
- `PUT /api/google-drive/evolution-journals/preferences` accepts exactly `{ "frequency": "weekly" | "daily" }` and returns the same shape. It affects only future approvals.
- `POST /api/clinical/evolutions/{evolution_id}/drive-export/retry` accepts no body and returns `{ "drive_export": DriveExportState }`; missing/foreign evolution is `404`, disconnected/revoked is `409 DRIVE_CONNECTION_REQUIRED`, and synced is an idempotent `200`.
- `GET /api/google-drive/evolution-journals` returns `{ "journals": JournalSummary[] }`. A summary contains `period_type`, `period_key`, `journal_part`, `display_name`, and `updated_at`; provider IDs and export-operation status are absent. `updated_at` is the remote Drive `modifiedTime`, so valid manual edits update it.
- `GET /api/google-drive/evolution-journals/{period_type}/{period_key}/parts/{journal_part}` validates the period enum, period-key grammar, and positive part, then returns `{ "journal": JournalDetail }`. Detail contains the summary fields plus ordered `entries`; each entry contains `evolution_id`, `occurred_at`, `patient_display_name`, `patient_rut_masked`, and `content`.

`DriveExportState` is `{ status, error_code?, journal?: { period_type, period_key, journal_part?, display_name? }, synced_at? }`. Status is `pending|syncing|synced|failed|unknown`. `journal_part` and `display_name` remain absent until the first claimed sync selects a remote part. `ClinicalPendingAction.drive_export` is optional for backward compatibility and uses this exact shape after live approval and hydration.

`connection-required` is a presentation condition derived only from `status == "failed" && error_code == "DRIVE_CONNECTION_REQUIRED"`. It is not persisted and MUST NOT extend the backend or TypeScript status union with `connection-required`, `connection_required`, `disconnected`, or `revoked`.

`POST .../drive-export/retry` is a state-aware recovery operation. `pending` claims and syncs normally. Explicit recovery of `failed` is allowed only for a known no-write failure and then syncs normally. Stale `syncing` claims, verifies first, and may continue normal sync when the marker is absent. `unknown` is write-terminal and verification-only: it verifies the selected part and becomes `synced` when the marker exists, otherwise remains `unknown`. No automatic or ordinary recovery may append from `unknown`. The UI labels safe failed recovery `Reintentar` and unknown recovery `Verificar`; pending recovery stays automatic, and stale syncing uses verify/recover wording.

### 9. Remote reader authority

The journal reader fetches the actual remote Drive TXT located through server-owned lineage and exact `appProperties`, then parses Journal V1 on the backend. PostgreSQL lineage supplies identity and navigation but SHALL NOT reconstruct visible journal contents. The frontend never parses raw journal text. Manual remote edits therefore appear when valid; malformed blocks produce a sanitized per-journal parse error without fabricating entries.

The V1 parser recognizes an entry start only at the beginning of the file or after the previous entry's closing delimiter, followed by the complete ordered header sequence: delimiter; `EVOLUCIÓN · <valid DD-MM-YYYY> · <valid HH:mm>`; `Paciente:`; `RUT:`; `Dental AI ID: <valid UUID>`; delimiter; blank line. The UUID must resolve to owner-scoped export lineage for the requested period. After a valid header, the body ends only at a delimiter followed by EOF or at a delimiter followed by the complete next valid entry-start sequence. A delimiter or header-like text inside the approved body remains body content unless the whole boundary sequence and lineage check succeed.

### 10. UI composition

`ClinicalTranscript` derives one view per stable artifact/evolution identity from draft, approval, canonical result, and optional export state. No view model or `artifact_stage` field is persisted. Stage precedence is deterministic: `saving` applies only while the client resolve request is in flight; otherwise a canonical approved result/evolution means `saved`; otherwise a pending approval means `review`; otherwise an existing draft means `draft`. The non-interactive semantic stepper uses this mapping, never activity labels. Drive `idle/pending/syncing/synced/failed/unknown` is announced separately and cannot block the composer after canonical save.

The native focus-managed confirmation dialog remains the explicit approval boundary, but its trigger/footer and terminal result render inside the one artifact; there is no duplicate standalone prompt or receipt.

One clinical job SHALL have one persistent visible `ClinicalEvolutionArtifact`. It is the only spatial representation of that evolution during draft, review, saving, saved, hydration, navigation away/back, return-to-edit, reconnect, retry, and verification. It keeps one stable React key, transcript position, patient context, heading, accessible label, content container, and artifact/evolution identity. Implementing it as a wrapper around separately visible draft, approval, and result cards does not satisfy this contract.

The visual lifecycle has three conceptual stages: `Borrador`, `Revisión`, and `Guardada`. Internal `saving` is a transition toward `Guardada`, shown as `Guardando…` with a single 14–16 px spinner inside the unchanged artifact. It is not a fourth destination, a percentage, a large wizard, a skeleton replacement, or another card.

Action hierarchy is fixed. Draft has primary `Revisar y guardar`, optional secondary `Regenerar`, and copy or Drive actions in overflow. Review has primary `Confirmar guardado`, secondary `Seguir editando`, and copy in overflow. Saving has no actions or overflow. Saved has primary `Ver en ficha` only when a resource exists, a secondary Drive status/link, and copy or infrequent contextual actions in overflow. The confirmation action opens the existing focus-managed dialog. No footer presents five or six peer actions.

Drive remains a secondary lifecycle outside the clinical stepper. User-facing mappings are: `pending` → `Pendiente de sincronización`; `syncing` → `Sincronizando con Drive…`; `synced` → `Guardado en Drive` with `Abrir` when lineage is navigable; known `failed` → `No se pudo guardar en Drive` with `Reintentar`; connection-required → `Drive necesita reconexión` with `Reconectar`; `unknown` → `No pudimos confirmar el resultado` with `Verificar`. Unknown uses attention styling, not destructive-error styling.

The active patient is workspace context near the Clinical Assistant heading and Drive control, while the existing state/hook remains the single owner. This is a compositional move only: do not duplicate patient state, add a global store, or bypass dirty-transition guards.

### 11. Drive information architecture and navigation

The Drive workspace has three compact keyboard-operable sections: `Notas`, `Documentos`, and `Diarios`. `Notas` is global/external and remains usable without a patient. `Documentos` is patient-bound managed content and shows the active patient's name and masked RUT. Without a patient it shows an intentional prerequisite state with `Seleccionar paciente`, not an error. `Diarios` is cross-patient, lists human-readable periods, journal parts when applicable, and Drive `modifiedTime`, hides provider IDs, and reads only backend-parsed remote content. Journal entry counts are not part of V1; the frontend does not calculate them or download journal details to manufacture them.

The primary journal navigation object is a group keyed by `(period_type, period_key)`, not a TXT filename. A one-part period hides `Parte 1`. A period with rollover appears once with `N partes`, then reveals `Parte 1`, `Parte 2`, and later parts inside that group. It never duplicates the period, hides later parts, treats the latest part as the whole period, or uses filenames as primary navigation.

The journal-frequency control exists only inside `Drive > Diarios`. It is labelled `Agrupar nuevas evoluciones`, offers visible values `Semanal` and `Diario`, initializes from the existing GET, and associates helper text `Los cambios solo afectan futuras evoluciones.` While PUT is pending the control is disabled with compact inline progress. Success keeps the canonical new value. Failure restores the previous canonical value, shows a contextual inline error, and permits retry. It uses no modal, settings route, global preferences screen, or required global toast. It never renames journals, moves prior evolutions, changes frozen period identity, rewrites Drive, or changes an export row already created.

`Abrir` from a synced artifact opens Drive if closed, selects `Diarios`, selects the exact period and `journal_part`, loads that `JournalDetail`, locates `evolution_id`, scrolls the exact entry into view, and moves programmatic focus to its semantic root or heading. The target may use `tabIndex={-1}` when no suitable focusable element exists, but it does not enter the regular tab order. It retains the focus ring and receives one subtle, temporary, non-blocking highlight. Reduced motion removes highlight transition, not focus.

If the valid remote journal does not contain the requested `evolution_id`, the reader stays open on the requested journal and shows a sanitized contextual error. It does not focus another entry, reconstruct content from PostgreSQL, or invent a result. Existing lineage resolves the destination; no new routing identifier or persisted frontend view model is allowed.

Journal search in V1 is client-side and limited to entries in the currently loaded structured `JournalDetail`. It filters only `patient_display_name`, `patient_rut_masked`, `content`, and `occurred_at`. Clearing the query restores all entries in that detail. An empty result says `No encontramos evoluciones para esta búsqueda.` and permits clearing the query. Search does not fetch another period, parse raw TXT, search all Drive or PostgreSQL, add an index, or add an endpoint.

Insertion actions are named `Insertar selección` and `Insertar nota completa`. Success shows brief local status such as `Añadido al borrador`; it does not open a modal or global toast when contextual feedback is available. Existing composer text, provenance, blank-line separation, patient identity, thread identity, no-send behavior, and focus return remain authoritative.

### 12. Visual, responsive, and scrolling contract

The incumbent dark visual system remains authoritative. Use a flat main workspace, subtle borders, and low-elevation artifacts. Visible shadows are reserved for overlays and floating controls. Reuse typography and color tokens: neutral by default, the existing accent for primary/focus, green for canonical/Drive success, amber for attention/unknown/reconnect, and red only for real destructive or error states. Do not assign a strong color to every lifecycle stage.

New microinteractions use opacity, status crossfade, or a small transform for 120–180 ms. Do not animate transcript height, margin, or padding. Reduced motion removes entrance transforms and unnecessary crossfades while preserving immediate state, focus, and scroll changes.

Transcript scrolling must preserve stable row identity, hydration without a visible jump, user-turn anchoring, stable streaming, restoration, large-artifact behavior, and a keyboard-accessible `Ir al final` control when the user is away from the latest turn. It MUST NOT force-scroll while the user reads history, wrap individual streaming tokens, persist scroll state on the backend, or change reducer identity.

Desktop Drive starts closed and opens as the existing persistent side workspace. Existing width constraints win; an initial proportion near 68/32 is guidance, not a hardcoded ratio, and neither workspace may shrink below usable minimums. Tablet uses a right-side sheet rather than two narrow persistent panes. Mobile uses a full-width sheet with compact sticky header, list-to-reader navigation, scrollable content, and sticky actions only when they do not obscure content.

### 13. UI primitive dependency gate

Existing primitives are the default. Before using a shadcn-derived or other focused interaction primitive, inspect the exact generated files and packages with the repository's Bun-compatible toolchain, compare them with installed primitives, and prove in focused tests that the change removes bespoke interaction logic or materially improves accessibility or maintainability. Only primitives used by this change may be added. Document each new package before editing `package.json`.

Potential evaluations are limited to transcript scrolling, patient combobox, compact tabs, empty states, artifact overflow, icon-control tooltips, sheet, and resizable layout. The existing reducer remains transcript-state authority; any scroller owns scrolling only. A patient combobox must preserve search, keyboard navigation, custom name/masked-RUT rows, empty state, and focus. Primary actions remain visible, and tooltips never replace their labels.

Do not initialize a new theme, install a component catalog, add a second incompatible primitive stack, or add a framework, state library, styling system, animation library, backend provider, or runtime service. If equivalence cannot be proven without widening scope, keep the existing component.

### 14. Clinical transcript artifact visual grammar

`ClinicalEvolutionArtifact` SHALL read as an inline work artifact inside the transcript, not a dashboard card mounted in chat. Its hierarchy is clinical content, clinical state, the primary next action, secondary metadata, then container decoration. One clinical job introduces at most one high-emphasis structured surface. Assistant prose stays low-chrome conversational content, while processing, approval, saving, Drive status, provenance, and operational feedback render inside the artifact or as compact unboxed activity rows.

The artifact uses one low-chrome document-like container aligned to the assistant reading column. It has a subtle border, modest radius, minimal surface contrast, and no heavy shadow, colored full-card fill, decorative icon box, large header band, tinted footer panel, or nested metadata, provenance, lifecycle, Drive, or action cards. A nested surface is allowed only for a genuinely independent interactive object. The transcript wrapper and artifact MUST NOT duplicate padding or large vertical gaps.

Information order is title and current state, compressed patient/date metadata, optional compact lifecycle, clinical body, optional provenance, optional Drive row, then contextual actions. The stable title is `Evolución clínica`. Patient name, masked RUT, and short date share a quiet row when space permits and wrap naturally otherwise. Do not replace compact metadata with form-like uppercase label/value stacks unless the viewport makes a readable row impossible.

The clinical body is the dominant document content. It uses the existing reading width, typography tokens, natural paragraphs, and comfortable line height without a second tinted content panel. Provenance is a quiet row such as `Fuente · Nota clínica`; additional source detail uses progressive disclosure only when it needs inspection. Drive is one compact row with its current state-safe action, never a nested card, large provider logo, heading, or full-width semantic-color panel.

At most one filled primary action is visible. Secondary actions use existing ghost, text, icon, or overflow treatments. They may become more prominent on hover or `focus-within`, but no action is hover-only, recovery actions remain visible when relevant, and keyboard users have equivalent access. Saving removes actionable footer and overflow instead of leaving a disabled button collection. It preserves the same content and geometry with compact inline progress. Saved state becomes quieter; it uses a small check or success text, never a celebratory receipt or green artifact background.

The lifecycle remains semantic, non-interactive, subordinate to content, and MUST NOT use Tabs, boxed stages, a wizard, or a percentage. The bounded polish pass may compare the compact three-stage rendering with a title/status-only presentation. It may adopt title/status-only when tests and visual review show better scanability without losing accessible lifecycle meaning. This is presentation only and cannot alter derivation, identity, saving, or approval behavior.

Use existing spacing utilities following the incumbent compact rhythm rather than one-off values. Artifact and assistant prose share the same reading column. The artifact does not span unrelated viewport space or use viewport calculations when the transcript already owns readable width. State changes preserve transcript position and avoid layout flash.

On mobile, metadata and status wrap naturally, the primary action may become full-width, secondary actions stack as text or ghost controls, and overflow remains reachable. The artifact has no compressed horizontal toolbar, unreadable lifecycle columns, or horizontal scrolling.

Historical saved-artifact collapse is optional P2 work after the primary density pass. Only the user may collapse older saved artifacts. The current or newly saved artifact starts and remains expanded; collapse state is frontend-local and unpersisted, clinical state is unchanged, focus remains predictable, and internal artifact sections never become an accordion system. If this adds more complexity than value, defer it.

## Risks / Trade-offs

- Concurrent appends can overwrite one another → use Drive versions, stable markers, and one bounded retry.
- A transport timeout can hide a successful write → reconcile by marker and preserve honest `unknown`.
- FastAPI background work is not a durable worker → the durable row plus a guarded POST recovery path closes the process-loss gap without mutating on GET.
- Concurrent background attempts or first-file creation can race → atomically claim each export and hold a session-level period advisory lock across part selection and Drive locate/create/update.
- Same-period bursts wait while holding pool connections → bound concurrency tests above half the configured pool size and prove unlock/release on success and exceptions while unrelated queries still complete.
- Journals can exceed provider limits → calculate UTF-8 bytes before append and create numbered parts.
- Old clients do not know export state → additive optional hydration preserves their contract.
- UI scope can regress visually → deliver in ordered slices and run bounded desktop/mobile comparison after behavior passes.

## Migration and Rollback

1. Add the frequency column and export table without rewriting existing clinical data.
2. Deploy backend schema and typed contracts before frontend Drive-state consumption.
3. Enable journal UI only when capability/state is returned; existing Notes and managed documents continue to operate.
4. Normal production rollback deploys the prior frontend/backend while leaving the additive column, table, and lineage intact and unused.
5. Alembic downgrade may destructively remove the new schema only in development/test or under an explicit, separately approved data-loss procedure; it is not the production rollback runbook.

## Open Questions

None remaining. The execution model, atomicity boundary, schema, API, byte format, identity, reader authority, timezone, disconnected behavior, and rollback policy above are normative.
