## Context

The existing deep seams are already adequate: `useVoiceDictation` owns media lifetime, composers own focus/selection, `useStreamingResponse` owns Chat transport, and the message repository owns durable message truth. Clinical event identity remains the reference without forcing a destructive protocol rewrite.

## Goals / Non-Goals

**Goals**
- Return voice cancellation to canonical idle and hand control back to the initiating composer.
- Preserve draft, selection, queues, and stale-operation safety.
- Make partial Stop durable and visible after reload.
- Keep stream state deterministic per conversation.

**Non-Goals**
- Full replayable event sourcing or live SSE resume.
- Moving Clinical patient, approval, or evolution state into a generic runtime.

## Boundary and Ownership

### Voice Module
`useVoiceDictation` owns operation invalidation and resource cleanup. It settles cancellation to idle; callers own focus because only the composer knows whether a dialog or picker should retain it.

### Composer Interface
ChatInput and ClinicalComposer expose the textarea seam. Selection is captured before voice starts and restored only on voice completion/cancellation/error handback.

### Run and Persistence Interface
`useStreamingResponse` owns per-conversation AbortController identity. The backend route determines `completed`, `user_cancelled`, `client_disconnected`, or `failed` from the terminal path and persists it through `repository.create_message`.

## Decisions

1. Add one nullable `termination_reason` column to `messages`.

   Rationale: it is the smallest durable distinction that survives reload without inventing a run table.

   Alternatives considered:
   - Client-only stopped IDs: rejected because reload loses them.
   - New run/event tables: rejected as unnecessary for the confirmed P0 defect.

2. Keep queues in their existing owners.

   Rationale: both surfaces already preserve per-conversation/thread queues; tests should lock this down rather than introduce a new store.

3. Use deterministic reconciliation, not claimed live resume.

   Rationale: current Chat SSE lacks replay identifiers. Conversation-scoped AbortController identity and server-persisted terminal truth provide the honest smaller contract.

## Blast Radius

### Touched runtime areas
- Voice hook, Chat/Clinical composers, Chat stream hook and area.
- Message migration, repository, route, API type, and message rendering.

### Untouched runtime areas
- Retrieval/tool implementation, citation framing, Clinical approvals/evolution persistence, auth, and patient isolation.

## Verification Strategy

- Component tests prove voice cancellation focus, IME, Escape, and caret insertion.
- Hook/route/repository tests prove settled cancellation, stale stream isolation, and durable terminal reasons.
- Existing queue, Clinical, RAG, and approval tests remain green.
- Docker runs the application; Playwright CLI verifies visible desktop/mobile interaction without relying on unit mocks for layout.
