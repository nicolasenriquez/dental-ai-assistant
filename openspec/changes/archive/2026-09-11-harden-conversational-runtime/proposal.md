## Why

Voice cancellation can leave the composer without deterministic focus/caret ownership, and Chat cancellation is represented only in client memory even though partial assistant content is persisted. Reload can therefore erase the visible meaning of Stop.

## Investigation / Current State

- `useVoiceDictation` invalidates stale work correctly but leaves cancellation in a sticky `cancelled` state.
- Chat and Clinical composers submit during IME composition and only Clinical handles Escape, from the textarea.
- Chat and Clinical already own queues; cancellation must preserve them.
- Clinical SSE already has scoped event IDs and sequence deduplication; Chat uses the legacy token protocol.
- `messages` has no terminal-status column, while `routes/messages.py` persists partial text from `finally`.

## What Changes

- Add a small shared composer selection helper and deterministic voice handback behavior.
- Make Enter IME-safe and Escape cancel active voice interactions in both composers.
- Persist a minimal `termination_reason` on Chat assistant messages and expose it through existing message APIs.
- Settle cancelled client runs, preserve queues, and reject stale stream writes through existing conversation ownership.
- Add lifecycle regression tests and Docker/Playwright verification.

## Change Profile

- Profile: runtime-change
- Why this profile fits: user-visible interaction, transport, persistence, and reload behavior change.

## Out Of Scope

- Adopting AG-UI, LangGraph, assistant-ui, CopilotKit, or another state library.
- Rewriting the working Clinical domain protocol or implementing fake resumable SSE.

## Impact

- Affects Chat and Clinical composer interaction, Chat streaming state, and Chat message persistence.
- Affects frontend unit/component tests, backend tests, Docker runtime, and Playwright validation.
- Does not change retrieval, citation framing, patient isolation, or approval authorization.

## Verification Policy

- Add fail-first coverage at the owning interaction and persistence boundaries.
- Verify cancel-to-type, IME, caret insertion, Stop reload, queue survival, and stale-result rejection directly.
- Run focused tests before the full repository suite and Docker/Playwright checks.

## Ownership and Test Seam

- Highest existing Seam: composer props/hooks and the `/api/conversations/{id}/messages` SSE endpoint.
- Owning Module: `useVoiceDictation`, composer components, `useStreamingResponse`, and message repository/route.
- Interface: voice callbacks, textarea selection, stream result, and persisted Message shape.
- Highest test Seam: component interaction plus HTTP/repository contract tests.
- Adapter: existing MediaRecorder, shared SSE consumer, and asyncpg repository.
- Depth / Leverage / Locality: fixes shared owners once while preserving domain-specific Clinical behavior.

## Prior Art and First Proof

- Prior art: existing voice stale-result tests, Chat queue tests, Clinical event reducer tests, and message route tests.
- First failing behavior or contract proof: cancel recording then type without another click; reload a stopped partial answer and retain its terminal meaning.

## Execution Order Decision

- Required: yes
- Why: persistence expands before API/client consumption, while interaction hardening can be verified independently before shared contract cleanup.

## Notes

- Context: derived from the attached implementation handoffs and verified against local HEAD `039ee6c`.
- Assumptions: server disconnect is the narrowest currently reliable cancellation signal; explicit live resume remains unsupported.
- Boundaries: no new framework or state library; existing SSE framing remains backward compatible.
