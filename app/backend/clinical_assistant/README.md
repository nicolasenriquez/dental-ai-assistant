# Clinical Assistant

This is an isolated clinical workflow slice. It owns clinical thread state,
patient context sanitization, versioned SSE lifecycle events and approval history.
It reuses `services/clinical_evolutions.generate_draft()` for the clinical
writing contract and `db/evolutions_repo.py` for the final transactional
evolution insert.

The Library RAG runtime and conversation tables are deliberately not imported
here. Activity is ephemeral. Safe messages and owner-scoped pending actions are
persisted, with resolved approval payloads retained so a refreshed thread keeps
its decision history.

Every stream event uses schema version 1 and carries an event id, monotonic
sequence, thread id, turn id, item id, item type, status, and a data object.
Clients discard events that fail validation or belong to another thread or turn.
