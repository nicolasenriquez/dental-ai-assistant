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
- Patient-specific journals, automatic draft export, automatic patient inference, or new dependencies.
- A global redesign outside the Clinical Assistant and its Drive workspace.

## Decisions

### 1. Module boundaries

`evolution_exports/service.py` owns orchestration and `db/evolution_exports_repo.py` owns SQL. Existing Google integration modules retain provider primitives. Routes contain validation and transport only.

### 2. Atomic approval and durable intent

Every approved evolution eligible for Drive journaling SHALL get an export row in the approval transaction, regardless of connection health. The transaction freezes `operation_id`, `period_type`, `period_key`, Journal V1 bytes, and `content_hash` at approval time. A usable connection creates the row as `pending`; a disconnected or revoked connection creates it as `failed` with `DRIVE_CONNECTION_REQUIRED`. Either the evolution and row both commit or neither commits. The remote Drive write is never part of that transaction.

Reconnect and retry reuse the same row, operation ID, period, and content hash. Later preference or timezone changes do not move an already approved evolution.

### 3. Post-response execution model

The approval endpoint SHALL accept FastAPI `BackgroundTasks`. After the atomic transaction commits, it SHALL return canonical HTTP success immediately with the durable `drive_export` state. When the state is `pending`, the route schedules one best-effort background service call. It SHALL NOT perform inline Drive I/O, use browser-driven synchronization, call bare `asyncio.create_task`, or introduce a job-queue dependency.

If the process stops after the response and before the task runs, hydration returns the durable state without scheduling or performing Drive work. The frontend may automatically call the same-origin guarded retry POST once after hydration for a recoverable `pending`, stale `syncing`, or `unknown` state. Only that POST may schedule reconciliation. Thread and journal GET requests remain side-effect free.

Before Drive I/O, the repository atomically claims an export by changing an eligible status to `syncing` and updating `updated_at`. Eligible rows are `pending`, explicitly retried `failed` or `unknown`, and `syncing` rows older than `EXPORT_SYNC_STALE_AFTER_SECONDS=300`. A failed conditional update means another worker owns the attempt, so the caller exits without Drive I/O. A non-stale `syncing` row cannot be claimed. Stale `syncing` is not evidence of success and must reconcile before append.

### 4. Duplicate resistance and honest outcomes

One export row is unique by `(user_id, evolution_id)` and by `operation_id`. Retry reuses that row and stable marker. A successful or successfully reconciled export yields exactly one logical journal block. Remote mutation is duplicate-resistant, not transactionally exactly-once. One fresh-version retry is allowed for a known conflict. An ambiguous write is reread once; marker presence becomes `synced`, marker absence becomes `unknown`, and no blind automatic append follows.

After claiming an export, the service holds a transaction-scoped PostgreSQL advisory lock derived from `(user_id, period_type, period_key, journal_part)` around Drive locate, create-if-missing, read, marker reconciliation, and append/update. This serializes work only for the same owner's same journal part. The service rechecks the remote journal after acquiring the lock.

Journal lookup by exact `appProperties` is fail-safe: zero matches permits create, one match permits use, and more than one match fails with `JOURNAL_IDENTITY_CONFLICT`. The service never selects an arbitrary duplicate.

### 5. Schema contract

`google_drive_connections.evolution_export_frequency` is non-null text, defaults to `weekly`, and is constrained to `weekly|daily`.

`google_drive_evolution_exports` has:

- `id UUID PRIMARY KEY`
- `user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`
- `evolution_id TEXT NOT NULL REFERENCES clinical_evolutions(id) ON DELETE CASCADE`
- `operation_id UUID NOT NULL`
- `period_type TEXT NOT NULL CHECK (period_type IN ('weekly','daily'))`
- `period_key TEXT NOT NULL`
- `journal_part INTEGER NOT NULL DEFAULT 1 CHECK (journal_part >= 1)`
- `drive_file_id TEXT NULL`, `drive_version TEXT NULL`
- `status TEXT NOT NULL CHECK (status IN ('pending','syncing','synced','failed','unknown'))`
- `content_hash TEXT NOT NULL`
- `last_error_code TEXT NULL`
- `created_at TIMESTAMPTZ NOT NULL`, `updated_at TIMESTAMPTZ NOT NULL`, `synced_at TIMESTAMPTZ NULL`
- `UNIQUE(user_id, evolution_id)` and `UNIQUE(operation_id)`

Repository methods always scope reads and mutations by authenticated `user_id`. Public APIs never accept `drive_file_id`, `operation_id`, `period_key`, or `journal_part` from the client except the validated journal read path described below.

### 6. Period and journal identity

Backend config SHALL read `CLINICAL_TIMEZONE` once, defaulting to `America/Santiago`, and validate it as an IANA timezone at startup. The backend alone derives approval-local timestamp and daily/ISO-week period keys.

Weekly filenames are `Evoluciones — YYYY-Www.txt`; daily filenames are `Evoluciones — YYYY-MM-DD.txt`. Part one has no suffix. Later parts are `Evoluciones — <period> — 2.txt`, ` — 3.txt`, and so on.

Each journal file uses exactly these Drive `appProperties`:

- `managedBy=dental-ai-assistant`
- `artifactType=evolution-journal`
- `periodType=weekly|daily`
- `periodKey=<derived period key>`
- `journalPart=<positive decimal integer>`

No `patientRef` or other patient identifier is stored in journal `appProperties`.

### 7. Journal V1 byte format

Every appended block is `text/plain`, UTF-8 without BOM, LF-only, and ends with one final LF. It is exactly:

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

Before serialization, the backend replaces CRLF and CR with LF, removes all terminal LF characters from the approved body, and preserves every other character and whitespace. It inserts that normalized body into the template, encodes the complete block as UTF-8, and computes SHA-256 over those exact bytes.

The RUT is masked and only its existing display-safe suffix may remain (example `••••••94-1`). The block never contains patient UUID, thread ID, or operation ID. The `Dental AI ID` line is the reconciliation marker. Rollover is chosen before append using the exact byte length and existing safe Drive limit.

### 8. API and hydration contracts

All endpoints require the existing authenticated user dependency and return sanitized stable error codes.

- `GET /api/google-drive/evolution-journals/preferences` returns `{ "frequency": "weekly" | "daily" }`.
- `PUT /api/google-drive/evolution-journals/preferences` accepts exactly `{ "frequency": "weekly" | "daily" }` and returns the same shape. It affects only future approvals.
- `POST /api/clinical/evolutions/{evolution_id}/drive-export/retry` accepts no body and returns `{ "drive_export": DriveExportState }`; missing/foreign evolution is `404`, disconnected/revoked is `409 DRIVE_CONNECTION_REQUIRED`, and synced is an idempotent `200`.
- `GET /api/google-drive/evolution-journals` returns `{ "journals": JournalSummary[] }`. A summary contains `period_type`, `period_key`, `journal_part`, `display_name`, and `updated_at`; provider IDs and export-operation status are absent. `updated_at` is the remote Drive `modifiedTime`, so valid manual edits update it.
- `GET /api/google-drive/evolution-journals/{period_type}/{period_key}/parts/{journal_part}` validates the period enum, period-key grammar, and positive part, then returns `{ "journal": JournalDetail }`. Detail contains the summary fields plus ordered `entries`; each entry contains `evolution_id`, `occurred_at`, `patient_display_name`, `patient_rut_masked`, and `content`.

`DriveExportState` is `{ status, error_code?, journal?: { period_type, period_key, journal_part, display_name }, synced_at? }`. Status is `pending|syncing|synced|failed|unknown`. `ClinicalPendingAction.drive_export` is optional for backward compatibility and uses this exact shape after live approval and hydration.

### 9. Remote reader authority

The journal reader fetches the actual remote Drive TXT located through server-owned lineage and exact `appProperties`, then parses Journal V1 on the backend. PostgreSQL lineage supplies identity and navigation but SHALL NOT reconstruct visible journal contents. The frontend never parses raw journal text. Manual remote edits therefore appear when valid; malformed blocks produce a sanitized per-journal parse error without fabricating entries.

### 10. UI composition

`ClinicalTranscript` derives one view per stable artifact/evolution identity from draft, approval, canonical result, and optional export state. No view model or `artifact_stage` field is persisted. Stage precedence is deterministic: `saving` applies only while the client resolve request is in flight; otherwise a canonical approved result/evolution means `saved`; otherwise a pending approval means `review`; otherwise an existing draft means `draft`. The non-interactive semantic stepper uses this mapping, never activity labels. Drive `idle/pending/syncing/synced/failed/unknown` is announced separately and cannot block the composer after canonical save.

The native focus-managed confirmation dialog remains the explicit approval boundary, but its trigger/footer and terminal result render inside the one artifact; there is no duplicate standalone prompt or receipt.

## Risks / Trade-offs

- Concurrent appends can overwrite one another → use Drive versions, stable markers, and one bounded retry.
- A transport timeout can hide a successful write → reconcile by marker and preserve honest `unknown`.
- FastAPI background work is not a durable worker → the durable row plus a guarded POST recovery path closes the process-loss gap without mutating on GET.
- Concurrent background attempts or first-file creation can race → atomically claim each export and hold the period-part advisory lock across Drive locate/create/update.
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
