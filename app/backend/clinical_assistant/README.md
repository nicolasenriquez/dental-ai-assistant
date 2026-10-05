# Clinical Assistant

This is an isolated clinical workflow slice. It owns clinical thread state,
patient-context sanitization, versioned SSE lifecycle events, and approval
history. The Clinical Assistant and Library RAG chat share only the bounded
provider-compatible tool loop; they do not share prompts, storage, retrieval,
or SSE adapters.

`agent.py` exposes four model-facing tools: recent evolutions, bounded dental
term lookup, draft creation/update, and save preparation. General conversation
does not require a selected patient. Patient-specific handlers use only the
authenticated owner and active patient bound by the runtime. The turn receives
fresh grounding: at most three distinct patient evolutions, matched terminology
only, and exact pre-resolution of the reviewed TAD/TMJ/CBCT/BOP aliases. History
is queried only when requested for a longitudinal task. The assistant passes
explicitly labeled current input, patient evidence, and terminology evidence to
draft generation; the separate manual evolution path keeps its prior bounded
history behavior. A glossary definition is never a patient fact.

`TOOL_PRESENTATION_POLICY` is the sole activity mapping: term lookup is silent,
history is progress, draft work is an artifact, and save preparation is a human
gate. Running work can show compact status after 300 ms; completed activities
do not compete with artifacts. Drive status remains a separate, secondary
background state. Unexpected SSE/reader failure triggers a GET of the persisted
thread before showing failure; a still-active detached turn continues through
the existing poll. No replay endpoint or durable run table was added.

The save-preparation tool can create a pending action, but only the approval
endpoint can execute the final transactional evolution insert. The model never
receives a direct save tool. Resolved approval payloads remain persisted, and
conversational edits reuse the active artifact ID so the frontend updates one
card. Every stream event uses schema version 1 with event ID, monotonic
sequence, thread/turn/item IDs, type, status, and data; clients discard events
that fail validation or belong to another thread or turn.

See [clinical grounding operations](../../../docs/clinical-grounding.md) for
catalog synchronization, provenance/release hold, privacy-safe telemetry, and
the deferred `improve-clinical-run-lifecycle` boundary.
