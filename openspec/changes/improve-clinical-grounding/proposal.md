## Why

Clinical Assistant already protects patient ownership and approval-gated writes, but evolution drafting always loads three prior evolutions even when the current note is self-contained, and no curated terminology capability exists. This creates unnecessary disclosure to the model and leaves abbreviations or unfamiliar terms vulnerable to unsupported interpretation.

## Investigation / Current State

- `clinical_assistant.agent` owns the clinical prompt and five model-selected tools over the shared bounded tool loop.
- `clinical_assistant.service` runtime-binds owner, thread, turn, patient, and artifact identities; the model cannot supply those identities.
- `services.clinical_evolutions.generate_draft()` currently loads three approved evolutions for every draft, while `get_recent_evolutions` separately exposes the same owner/patient-scoped history as an agent tool.
- `patients_repo.get_recent_approved_evolutions()` filters by owner and patient before returning approved `final_text`; the existing video RAG repository has no equivalent patient scope and is unsafe for clinical history.
- No dental terminology catalog, resolver, or terminology tool exists.
- The supplied catalog contains legitimate normalized collisions across concepts (`dental crown`, `root canal`, and `endodoncia`) plus aliases that collapse within one concept after accent normalization (`braquet` / `bráquet`).
- `MAX_CLINICAL_TOOL_CALLS` is four, while `get_patient_context` duplicates the selected-patient state already included in the system message and consumes budget needed by history, terminology, draft, and save preparation.
- Every current tool emits activity events; quiet terminology therefore requires an explicit presentation policy.
- Artifact generation already suppresses trailing generic assistant prose at runtime, and persistence remains available only after explicit clinician approval.
- Clinical turns already run in detached in-process tasks, survive SSE subscriber loss, persist messages/artifacts/actions/outcomes, and reconcile through thread hydration after clean EOF, abort, remount, or reload.
- Unexpected SSE reader/network errors currently skip authoritative thread hydration, so the UI can report failure after the server already persisted a completed result.
- Explicit Stop cancels the worker and persists `CLINICAL_TURN_CANCELLED` after claim; activities remain ephemeral while messages, artifacts, approvals, turn outcomes, and Drive export state are durable.
- Canonical clinical save already commits before external Drive I/O, and Drive export runs as a secondary background task whose durable state belongs to the approved evolution/action.

## What Changes

- Add a versioned, checksummed dental terminology catalog whose schema preserves legitimate many-to-many normalized matches and deduplicates aliases only within one concept and language.
- Add deterministic terminology resolution for at most eight raw terms per call, with exact preferred-term and alias matches, fuzzy candidates fixed at ratio `>= 0.88` and at most three concepts, and typed `matched`, `ambiguous`, or `not_found` outcomes.
- Add a cheap pre-agent scan limited to reviewed V1 aliases `TAD`, `TMJ`, `CBCT`, and `BOP` when they uniquely match exact token boundaries, plus a quiet batched `lookup_dental_terms` tool for additional model-selected resolution.
- Make patient-history retrieval conditional: drafting receives only history selected during the current agent turn, rather than loading history unconditionally.
- Define bounded per-turn grounding with capped, chronological, deduplicated patient evidence and matched-only, concept-deduplicated terminology evidence.
- Preserve the four-call tool budget by removing redundant model-facing patient-context confirmation rather than raising the cap.
- Serialize startup synchronization with a PostgreSQL advisory lock, exact canonical JSON SHA-256 bytes, inactive preservation for removed concepts, allowlist/catalog validation, and unchanged schema-version/checksum skipping.
- Classify model tools as `silent`, `progress`, `artifact`, or `human_gate` through one `TOOL_PRESENTATION_POLICY`, with clinician-facing labels only and no parallel quiet-tool set; retain `background` for existing non-tool domain state.
- Keep meaningful running activity truthful and compact, then let the artifact, approval, or canonical result become the primary surface after completion.
- Reconcile every terminated clinical stream, including transport errors, against existing persisted thread state before declaring the turn failed or offering retry.
- Add privacy-safe structured telemetry for capability selection, latency, budget use, grounding outcomes, cancellation, reconciliation, and bounded failure categories.
- Add regression coverage proving normal UI interruption does not cancel detached clinical work and secondary Drive export does not block continued clinical conversation.
- Add fail-first routing, grounding, terminology, and owner/patient isolation coverage.
- Preserve normal conversation, clinical SSE schemas, artifact UI, approval workflow, persistence transaction, provider, and existing video RAG.

## Capabilities

### New Capabilities

- `clinical-grounding`: Conditional patient-history use and conservative terminology grounding for clinical conversation and evolution drafting.

### Modified Capabilities

- `clinical-agentic-feedback`: refine structured activity presentation around finite semantic classes and require existing thread hydration to reconcile unexpected SSE/reader failure before failed/retry UI state.

### Ownership Classification

- New `clinical-grounding`: terminology storage/resolution, reviewed auto-grounding, conditional history, turn-local evidence, model-visible tool catalog, four-call budget, quiet terminology policy, grounding cancellation coverage, and epistemic separation.
- Modified `clinical-agentic-feedback`: user-visible activity hierarchy and unexpected stream-error reconciliation because that capability already owns structured activity, live/hydrated convergence, artifact priority, and transcript scrolling.
- Regression proof only: optimistic local echo, detached worker survival after subscriber loss, artifact final-prose suppression, approval-gated persistence, canonical save before Drive I/O, and secondary Drive state. `conversational-runtime`, `patient-dental-evolutions`, and `google-drive-managed-workspace` receive no changed requirement.

## Change Profile

- Profile: runtime-change
- Why this profile fits: the change adds persistent catalog data and modifies clinical model routing and generation inputs without changing the public HTTP or SSE transport shape.

## Ownership and Test Seam

- Highest existing Seam: clinical tool effects and generated draft returned by `ClinicalAssistantService.stream_turn()`.
- Owning Module: `backend.clinical_assistant` owns routing and runtime scope; `backend.services.clinical_evolutions` owns structured draft generation; `backend.db` owns catalog and history queries.
- Interface: model tools receive semantic arguments only, while handlers inject authenticated owner and active patient context and return typed evidence.
- Highest test Seam: existing clinical agent and generation contract tests with provider/tool-loop fakes, plus live repository tests for SQL scope.
- Adapter: shared `llm.tool_loop.stream_tool_loop`; no new agent framework or provider adapter.
- Depth / Leverage / Locality: one resolver and one scoped runtime evidence path improve conversation and drafting while preserving authorization and persistence and limiting UI work to existing activity and hydration seams.

## Prior Art and First Proof

- Prior art: `test_clinical_agent.py`, `test_clinical_generation_contract.py`, `test_clinical_assistant_contract.py`, and `test_clinical_assistant_repo_live.py` already verify tool effects, structured model inputs, runtime behavior, and owner-scoped persistence.
- First failing behavior or contract proof: a self-contained draft currently calls `get_recent_approved_evolutions`; normalized catalog collisions cannot satisfy global alias uniqueness; every tool emits visible activity; `TAD en IZC` has no deterministic mixed `matched` / `not_found` contract; and a legitimate four-capability turn can exceed budget if redundant patient-context confirmation runs.

## Out Of Scope

- Embeddings, vector search, RRF, or corrective query rewriting for terminology.
- Semantic search over patient history or patient documents.
- Clinical-reference search, web fallback, or another vector database.
- Automatic correction of voice transcripts.
- New evidence cards, frontend state types, or arbitrary model-generated UI.
- New agent frameworks, models, providers, or direct model-controlled persistence.
- Adding glossary concepts not present in the supplied curated dataset; absent terms such as `IZC` remain `not_found` until separately sourced and reviewed.
- Automatic scanning of generic aliases such as `pieza`, `raíz`, `resina`, or `cap`.
- Treating the dataset's `recommended_retrieval` or `recommended_top_k` metadata as runtime architecture or policy.
- New SSE event types, status endpoints, persisted run tables, replay cursors, generic job/queue infrastructure, or another client runtime.
- Process-restart resumption for active turns or exports, durable export workers, export-completion push, and generic background-job recovery; these require a separate `improve-clinical-run-lifecycle` proposal if prioritized.
- Arbitrary generative UI, one card per tool call, fake percentage progress, raw tool names, chain-of-thought display, or toast-only ownership of durable outcomes.
- Redesigning existing Drive workspace close/reopen state, export reconnect recovery, stale-worker fencing, or manual Drive draft-seed behavior in this grounding change.

## Impact

- Adds one Alembic migration, one committed terminology dataset, and repository access under `app/backend/db/`.
- Changes clinical tool registration, turn-local evidence orchestration, and the internal structured draft service interface used by Clinical Assistant.
- Adds backend tests and focused frontend/browser scenarios; frontend work is limited to existing clinical activity rendering and existing GET-based reconciliation, with no new event or state type.
- Does not modify generic Chat RAG tables, retrieval tools, citations, SSE framing, authentication, approval execution, or evolution persistence.

## Verification Policy

- Add fail-first coverage at the clinical agent, generation service, resolver, and owner/patient repository boundaries.
- Prove self-contained notes perform no history query and explicit historical references can use only active-patient evidence.
- Prove terminology evidence cannot create patient facts and unknown or ambiguous terms remain non-authoritative.
- Prove `TAD en IZC` yields a matched `TAD`, a `not_found` `IZC`, and no invented expansion; prove real normalized collisions return `ambiguous` without import failure.
- Prove only explicitly reviewed, unique, token-boundary aliases auto-ground without spending tool budget; classification alone, generic aliases, ambiguous aliases, partial substrings, and non-allowlisted uppercase abbreviations do not.
- Prove short or acronym-shaped input never enters fuzzy matching, ratio below `0.88` returns no fuzzy candidate, eligible fuzzy output contains at most three deterministic non-authoritative concepts, and fuzzy matching never returns `matched`.
- Prove terminology batches accept at most eight raw terms and reject a ninth without truncation.
- Prove canonical JSON hashing ignores whitespace/object-key order but preserves array order, removed concepts become lookup-ineligible inactive rows, reintroduced concepts reactivate, and allowlist/catalog divergence blocks startup.
- Prove history + terminology + draft + save preparation fits the unchanged four-call cap and no documented V1 flow requires a hidden fifth call.
- Prove local echo is immediate, short turns avoid unnecessary progress chrome, long grounding work uses domain labels, successful terminology stays quiet, completed activity yields visual priority to the artifact, and scrolling remains stable.
- Prove Stop during new grounding paths reaches coherent persisted cancellation, detached work survives component/SSE loss, and unexpected stream errors hydrate persisted truth before exposing retry.
- Prove canonical save remains authoritative and slow or failed Drive export remains secondary, durable, retryable, and non-blocking.
- Run focused suites before full backend/frontend validation; do not substitute broad-suite success for the scoped contract proofs.

## Execution Order Decision

- Required: yes
- Why: catalog persistence, runtime tool integration, conditional history, and browser closure are separate vertical slices with real schema and service dependencies.

## Notes

- Context: based on current branch `feat/ai-assisted-evolutions`, current clinical runtime, supplied implementation handoff, and supplied `dental-ai-basic-glossary-es-cl` dataset.
- Assumptions: the supplied glossary is curated product input; implementation must preserve its schema version and source identifiers and complete provenance/licensing review before production distribution.
- Boundaries: PostgreSQL remains source of truth; exact preferred/alias matches alone are authoritative in V1; fuzzy results are clarification candidates, never automatic definitions.
- Dataset contract: V1 stores `term` as `es`, `term_en` as `en`, and every legacy string in `aliases[]` as `und`; importer never guesses alias language. A future schema may add structured alias language/type fields but is not required here.
- Availability: malformed, incompatible, or transactionally unsynchronizable bundled catalog state fails startup; a runtime lookup failure follows normal safe tool failure handling and cannot authorize a fabricated definition.
