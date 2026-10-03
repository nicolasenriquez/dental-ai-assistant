## 0. Investigation and Scope Lock

- [x] 0.1 Audit voice, composer, queue, stream, Clinical events, message persistence, migrations, and existing tests at local HEAD.
  Traceability: locks the highest existing seams and prevents an unnecessary runtime rewrite.
  Notes: confirmed sticky voice cancellation, missing IME/focus handback, existing queues/deduplication, and absent durable Chat termination semantics.

## 1. Contract Coverage (Failing First)

- [x] 1.1 Add interaction regressions for cancel-to-type, focus, Escape, IME, selection insertion, and stale transcript behavior.
  Traceability: proves the reported microphone failure at the composer boundary before production changes.
  Notes: added composer, selection, and voice-hook regressions; focused frontend run passes 38 tests.

- [x] 1.2 Add Stop persistence and reload contract tests, including normal completion and partial cancellation.
  Traceability: proves terminal meaning at the HTTP/repository seam before schema and route changes.
  Notes: route tests assert completed and user-cancelled persistence; loaded message rendering consumes the durable field.

- [x] 1.3 Lock existing queue survival, stale stream isolation, approval idempotency, and Clinical/RAG compatibility with focused regressions.
  Traceability: protects already-correct domain behavior while shared lifecycle seams change.
  Notes: retained existing queue, scoped stream, Clinical reducer, approval, and RAG contracts; focused stream isolation tests pass.

## 2. Implementation

### Slice A — Voice and Composer

- [x] 2.1 Settle voice cancellation to idle after cleanup and retain stale-operation invalidation.
  Traceability: makes `useVoiceDictation` the canonical owner of media lifecycle without adding a state library.
  Notes: cancellation now invalidates pending work, releases tracks, and returns directly to idle.

- [x] 2.2 Add minimal focus/selection capture, restoration, caret-aware transcript insertion, Escape, and IME handling to both composers.
  Traceability: fixes the full interaction at the existing composer interface and preserves picker/dialog focus ownership.
  Notes: both composers capture selection on voice start and restore focus/caret only when voice hands control back.

### Slice B — Durable Stop

- [x] 2.3 Add the nullable message termination-reason migration and repository/API shape.
  Traceability: expands durable storage before route/client consumption with the smallest schema evolution.
  Notes: migration 0014 adds a constrained nullable field and repository/API types expose it.

- [x] 2.4 Persist completed versus interrupted assistant responses and render the durable terminal state after reload.
  Traceability: closes Stop semantics across backend execution, persistence, API, and UI without changing SSE token framing.
  Notes: completed, user-cancelled, and disconnected paths persist distinct meanings; reload renders interrupted status.

- [x] 2.5 Settle aborted client runtime state, preserve draft/queue, and keep conversation-scoped stale updates isolated.
  Traceability: closes the frontend Stop transaction at the existing per-conversation transport owner.
  Notes: scoped run cancellation settles to completed UI phase while existing per-conversation queue ownership is preserved.

### Slice C — Proven Shared Semantics

- [x] 2.6 Extract only the event/termination types demonstrably shared by Chat and Clinical and retain backward compatibility.
  Traceability: uses the Clinical protocol as reference after P0 behavior is green, avoiding speculative framework code.
  Notes: extracted only shared composer selection behavior; preserved Clinical event v1 and legacy Chat SSE framing unchanged.

- [x] 2.7 Add structured lifecycle timing logs that exclude raw clinical or chat content.
  Traceability: supplies P2 cancellation and latency evidence through existing logging/telemetry seams.
  Notes: added structured run-settled duration and terminal reason without message content.

## 3. Verification

- [x] 3.1 Run focused backend and frontend lifecycle tests.
  Traceability: proves each touched seam directly.
  Notes: frontend 38 passed; backend persistence/source/scoping run 48 passed and 5 skipped before full-suite proof.

- [x] 3.2 Run the full ruff, format, mypy, pytest, tsc, Biome, and Vitest suite.
  Traceability: proves repository-wide compatibility.
  Notes: Ruff and format clean; mypy 146 files; pytest 612 passed/75 skipped; Vitest 410 passed; tsc and Biome clean.

- [x] 3.3 Run the app in Docker and execute the applicable Playwright CLI lifecycle matrix on desktop and mobile.
  Traceability: proves the real rendered interaction and runtime wiring.
  Notes: production image built; isolated Postgres/app health passed; Chat and Clinical cancel-to-type/focus passed; 390x844 Clinical console clean.

## 4. Release Hygiene and Closeout

- [x] 4.1 Update only shipped behavior documentation and record any honest resume limitation.
  Traceability: keeps documentation aligned without claiming unsupported live replay.
  Notes: proposal/design/spec document deterministic reconciliation and explicitly exclude fake live SSE resume.

- [x] 4.2 Validate `harden-conversational-runtime` and mark implementation evidence in task Notes.
  Traceability: final artifact-level proof that code, tests, and specification agree.
  Notes: OpenSpec validation passes with every implementation task complete.

## Execution Order

### Slice 1 — Voice and composer interaction
- Tasks: `0.1 -> 1.1 -> 2.1 -> 2.2 -> 3.1`
- Checkpoint: cancel-to-type, focus, IME, Escape, caret, and stale transcript regressions pass.
- Blocks: Slice 3

### Slice 2 — Durable Stop
- Tasks: `1.2 -> 1.3 -> 2.3 -> 2.4 -> 2.5`
- Checkpoint: stopped partial content reloads with durable terminal meaning and queues survive.
- Blocks: Slice 3

### Slice 3 — Shared semantics and closeout
- Tasks: `2.6 -> 2.7 -> 3.2 -> 3.3 -> 4.1 -> 4.2`
- Checkpoint: full validation, Docker runtime, Playwright matrix, and OpenSpec validation pass.
- Blocked by: Slice 1, Slice 2
- Blocks: None
