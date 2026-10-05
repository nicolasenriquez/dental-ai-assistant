# Clinical workspace integration

Base: `9faf998`, branch `feat/ai-assisted-evolutions`. Implementation is additive.
DentalPin supplies conceptual references only; no source or styling is copied.

## Delivery order

1. Authorized patient-to-thread opening and return to ficha.
2. Request-scoped privacy boundary at every clinical provider call.
3. One attached runtime above route mounts; per-thread composer memory.
4. Owner-scoped pending projection from approvals, drafts and failed exports.
5. Patient overview above existing history on the base patient route.
6. Durable typed read results through the existing clinical event envelope.
7. Desktop panel, tablet Sheet, mobile full Assistant route.

These are independently verifiable delivery slices, not authorization to commit,
push or open pull requests.

## Closed contracts

- `WorkspaceContext` is route metadata, not authorization or model input.
- `open-context` uses an owner advisory lock and a transaction. Explicit foreign
  resources return 404; mismatched owned evolution/patient returns 422.
- Default `mode= reuse_compatible`; `create_new` creates and associates atomically.
- Same-patient explicit threads are reused. Patient-less threads with history and
  different-patient threads conflict. `thread_has_history` handles general chat;
  the conflict's current patient may be null. Errors use FastAPI's `detail` envelope.
- Automatic reuse selects the newest unfinished same-patient thread, then an
  unused owner thread, then creates. Ordering breaks ties by ID. Older work stays.
- Request-local references are assigned by first occurrence and never persisted.
  Known names/RUTs, emails, phones and structured UUIDs are protected. Unknown
  free-text names remain a documented limitation. Failure never sends raw input.
- Existing `lookup_dental_terms` is the READ tool; there is no new patient tool.
- Route departures detach transport, not server execution. Recovery uses GET and
  existing polling, not a new replay protocol or repeated POST of the turn.
- Composer, attachments and queue are memory-only and cleared on logout.
- Pending kinds are `approval_required`, `recoverable_draft`, `drive_export_failed`.
  A pending approval suppresses its draft duplicate; expired actions cannot approve.
- Pending pagination uses `(updated_at DESC, id DESC)`, default 20, maximum 50.
- Base ficha shows latest persisted evolution, count and pending count. Deep links
  remain evolution-focused. Documents require a separate verified association.
- `result_kind` drives renderers. Read results live on persisted assistant messages,
  without creating artifact types, another runtime or a different SSE framing.
- Desktop >=1024 uses a nonmodal panel, tablet >=768 a modal Sheet; mobile opens
  the full route. Contextual UI never contains Drive. Close is not Stop.

## Validation and completion

Use synthetic clinical data. Cover owner isolation, context conflicts, concurrent
opening, stale/repeated approval, transport loss, navigation, logout, reload,
pending pagination/dedupe and Drive recovery. Intercept actual provider requests
before and after tool execution. Validate desktop 1440x900 and 1280x800, tablet
834x1112 and mobile 390x844, keyboard/focus and reduced motion.

Run backend ruff, format check, mypy and pytest; frontend tsc, biome, Vitest,
build and relevant Playwright clinical/baseline suites. Record actual evidence,
failures and limitations; never replace a failed query with an empty state.

Final scenario: ficha -> contextual Assistant -> note/dictation -> draft -> edit
-> approval -> one persisted evolution -> ficha -> failed optional Drive export
-> Pending Work -> retry without duplicating the clinical record.

Server process restart durability, clinical catalog release clearance, new PMS
features, providers, browser PHI storage and visual redesign remain outside scope.
