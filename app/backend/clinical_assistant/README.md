# Clinical Assistant

This is an isolated clinical workflow slice. It owns clinical thread state,
patient context sanitization, versioned SSE lifecycle events and approval history.
`agent.py` configures the shared bounded loop in `llm/tool_loop.py` with five
clinical tools: safe patient context, recent evolutions, draft creation, draft
updates, and save preparation. General conversation does not require a selected
patient. Patient-specific tools reject calls without an owner-scoped patient.

Draft tools reuse `services/clinical_evolutions.generate_draft()` for the
clinical writing contract. A save-preparation tool may create a pending action,
but only the existing approval endpoint can execute the final transactional
insert through `db/evolutions_repo.py`. The model never receives a direct save
tool.

The Clinical Assistant and Library RAG chat share only the provider-compatible
tool loop. Their prompts, tools, storage and SSE adapters remain separate.
Activity is ephemeral. Safe messages and owner-scoped pending actions are
persisted, with resolved approval payloads retained so a refreshed thread keeps
its decision history. Conversational edits reuse the active artifact id, so the
frontend updates one card instead of appending draft copies.

Every stream event uses schema version 1 and carries an event id, monotonic
sequence, thread id, turn id, item id, item type, status, and a data object.
Clients discard events that fail validation or belong to another thread or turn.
