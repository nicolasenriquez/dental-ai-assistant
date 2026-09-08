# Clinical Assistant

This is an isolated clinical workflow slice. It owns clinical thread state,
patient context sanitization, typed SSE lifecycle events and pending approval.
It reuses `services/clinical_evolutions.generate_draft()` for the clinical
writing contract and `db/evolutions_repo.py` for the final transactional
evolution insert.

The Library RAG runtime, prompt, tools and conversation tables are deliberately
not imported here. Activity is ephemeral; only safe messages, pending actions
and durable evolutions are persisted.
