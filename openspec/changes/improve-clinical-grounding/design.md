## Context

Clinical Assistant uses `clinical_assistant.agent` and `clinical_assistant.service` over the shared bounded tool loop. Tool handlers close over `ClinicalTurnContext`, so authenticated owner, active patient, thread, turn, and artifact identity remain application-controlled. Draft creation delegates to `services.clinical_evolutions.generate_draft()`, which is also used by the manual patient-evolution workspace and currently loads three approved evolutions internally.

The highest existing Seam is the clinical tool handler map: model-selected semantic capabilities enter there, runtime scope is injected there, and tests can observe tool results and draft effects without changing HTTP or SSE contracts. The highest test Seam is the existing agent/service contract test harness with a fake tool loop and fake structured provider.

This change must preserve the manual generation contract, clinical approval boundary, patient ownership, RUT redaction, and separation from generic video RAG.

## Current Runtime Assessment

```text
frontend send + optimistic user item
        |
        v
POST turn -> detached in-process turn_runner task
        |
        +--> versioned SSE subscriber (ephemeral realtime)
        |
        +--> persisted user turn outcome, assistant message,
        |    artifact, approval action, and patient switch
        |
        `--> GET thread hydration (authoritative reconciliation)
```

- Turn lifecycle truth is split intentionally: `clinical_threads.active_turn_id` is the current execution lock; the claimed user message stores `running|completed|failed` plus safe error code; artifacts and actions own their domain lifecycles.
- Component unmount or SSE disconnect aborts only the subscriber. The detached worker continues and persisted state can later hydrate. Process restart does not resume the in-memory worker and remains outside this change.
- Explicit Stop calls the existing cancellation endpoint, cancels the worker task, clears the active lock, and persists `failed / CLINICAL_TURN_CANCELLED` once the turn was claimed. Stop before claim and completion/cancellation race policy need broader lifecycle hardening and are not redesigned here.
- Activities and SSE sequence/event IDs are ephemeral. Messages, artifacts, pending/resolved actions, turn outcomes, and Drive export state are durable.
- Clean SSE EOF and explicit abort call thread hydration. Unexpected reader/network errors currently do not; this is the minimal reconciliation defect included here.
- Every current `tool_start` / `tool_done` becomes activity. Tool labels are domain-oriented, but activity IDs are not persisted and live activity may differ from hydrated presentation.
- Tool budget is four. At exhaustion the shared loop sets `tool_choice=none`, adds the existing Spanish cap instruction, and asks for a final response rather than failing the turn.
- Canonical evolution and export intent commit before external Drive I/O. Drive sync runs after response, persists independent status, and does not keep the composer blocked. Durable worker recovery and live export completion refresh remain broader follow-up work.

## Goals / Non-Goals

**Goals**

- Resolve curated dental preferred terms and aliases deterministically in batches.
- Return explicit `matched`, `ambiguous`, and `not_found` outcomes without turning weak candidates into definitions.
- Pre-resolve only reviewed V1 allowlisted abbreviations before the agent so grounding does not depend entirely on model uncertainty detection.
- Let Clinical Assistant retrieve approved active-patient history only when the model selects that capability.
- Carry selected patient and terminology evidence into drafting as distinct epistemic categories.
- Keep successful terminology work quiet while surfacing clinically material ambiguity through normal assistant prose.
- Keep legitimate multi-concept lexical ambiguity representable and preserve the existing four-call tool budget.
- Preserve review, approval, and deterministic persistence.

**Non-Goals**

- Embeddings, vector search, semantic fallback, RRF, or query-rewrite retry in V1.
- Changes to manual patient-evolution history loading.
- Patient-document or general clinical-reference retrieval.
- Voice transcript correction.
- New frontend event, state, or card types.
- New provider, model, dependency, or agent framework.
- New run persistence, SSE replay protocol, lifecycle endpoint, background-job platform, export worker, or frontend runtime model.
- Process-restart continuation or exact replay of ephemeral activity history.

## Boundary and Ownership

### Terminology Catalog Module

`backend.db.terminology_repo` owns SQL and transactional catalog synchronization. A new `backend.clinical_assistant.terminology` module owns normalization, deterministic ranking, and typed lookup results. Its Interface accepts a bounded list of raw terms and returns outcomes; it knows nothing about patients, threads, drafts, or model messages.

### Clinical Runtime Module

`backend.clinical_assistant.service` owns turn-local evidence. A lean `TurnGrounding` value, implemented as a small dataclass or equivalent typed local structure, contains `patient_evidence` and `terminology_evidence`. It is created fresh for each turn, populated by deterministic pre-resolution and successful tools, and passed to drafting without becoming a persisted source of truth. The model cannot provide owner or patient identifiers.

### Draft Generation Module

`backend.services.clinical_evolutions` remains the structured generation boundary. Its Interface expands to accept optional explicit grounding for Clinical Assistant. Calls that omit explicit grounding retain existing manual behavior; Clinical Assistant always supplies explicit evidence, including empty history.

### Presentation Adapter

`backend.clinical_assistant.agent` remains the model-tool Adapter. One `TOOL_PRESENTATION_POLICY` map is the only presentation-class source of truth; `silent` is derived from that map and no separate `QUIET_TOOLS` set exists. The policy prevents terminology activity while preserving execution and errors. Existing assistant prose, artifact, approval, and error outputs remain unchanged. Existing runtime suppression of final assistant prose after draft or approval effects remains the primary anti-duplication guard; prompt wording is defense-in-depth only.

### Authoritative Reconciliation Adapter

`useClinicalAssistant` continues treating `GET /api/clinical-threads/{thread_id}` as authoritative state. All stream termination paths, including unexpected transport failure, reconcile persisted messages, artifacts, actions, and turn outcome before selecting idle, streaming, or failed UI state. No event replay, cursor, status endpoint, or persisted activity log is added.

## Alias Language Policy

The V1 dataset contract is `schema_version`, `dataset_id`, `locale`, `secondary_language`, `sources`, and `entries`. Each entry contains `id`, `term`, `term_en`, `aliases[]`, `definition`, `metadata.domain`, `metadata.category`, `metadata.tags`, `metadata.source_ids`, and optional metadata. `recommended_retrieval`, `recommended_top_k`, and `recommended_embedding_template` remain non-normative source metadata.

Importer language assignment is structural, never heuristic:

```text
term       -> es
term_en    -> en
aliases[]  -> und
```

`und` means undetermined or language-neutral legacy alias. Runtime exact lookup queries preferred Spanish, preferred English, and `und` aliases without making language precedence semantically authoritative. The importer MUST NOT infer alias language from spelling, capitalization, vocabulary, or locale. A future dataset schema may replace alias strings with `{value, language, type}`, but V1 does not require or synthesize that shape.

## Auto-Ground Allowlist Policy

Alias classification and auto-ground permission are separate. Import may classify a compact uppercase source alias as `alias_type=abbreviation`, but only an explicit reviewed V1 allowlist may activate deterministic pre-resolution. The allowlist is derived from the committed curated dataset and reviewed as product data; it is not generated from capitalization or length.

The reviewed V1 allowlist from the supplied dataset is exactly `TAD`, `TMJ`, `CBCT`, and `BOP`. An alias auto-grounds only when it is in that set, matches the original input at an exact normalized token boundary, maps to exactly one concept, is not generic vocabulary, is not ambiguous, and is not context-dependent under reviewed V1 policy. `LPD`, `ATM`, `OPG`, `OPI`, `TTM`, `TMD`, `PS`, and `PD` remain non-allowlisted in V1; exact lookup remains available. Non-allowlisted uppercase aliases, generic aliases, collisions, and partial substrings add no evidence. Pre-resolution performs no fuzzy matching and consumes zero tool calls.

## Short-Token / Acronym Fuzzy Exclusion

Fuzzy search is ineligible when normalized input length is less than five characters or original input is acronym-shaped. Acronym-shaped means one compact uppercase token after removing only periods and hyphens, with at least two alphabetic characters; examples include `TAD`, `T.A.D.`, `TMJ`, `BOP`, and `PD`. Ineligible input uses exact preferred/alias lookup only.

Eligible longer misspellings such as `braquett`, `periodontitiss`, or `maloclusion` may produce fuzzy candidates after exact lookup fails. V1 fixes `FUZZY_MIN_RATIO = 0.80` using `difflib.SequenceMatcher(None, normalized_input, normalized_candidate).ratio()` and `FUZZY_MAX_CANDIDATES = 3`. Candidate concepts are deduplicated, ranked by ratio descending then stable concept ID ascending, and truncated to three. The ratio is candidate-generation heuristic, not clinical confidence. Fuzzy results are always `ambiguous`, never `matched`, and expose no authoritative definition. Thus `TMD` cannot fuzzy-resolve to `TAD`, `TMJ` cannot fuzzy-resolve to `TMD`, and `PD` cannot fuzzy-resolve to `PS`.

## OpenSpec Ownership

- `clinical-grounding` owns terminology catalog/resolution, allowlisted pre-resolution, conditional history, turn grounding, model-visible clinical tools, budget, quiet terminology classification, grounding cancellation coverage, and epistemic separation.
- `clinical-agentic-feedback` owns changed user-visible activity semantics and changed unexpected-stream-error hydration because its existing requirements own structured activity, artifact hierarchy, transcript scrolling, and live/hydrated convergence.
- Optimistic local echo, detached worker survival, artifact prose suppression, approval-gated persistence, canonical save ordering, and secondary Drive state are regression locks. They do not modify `conversational-runtime`, `patient-dental-evolutions`, or `google-drive-managed-workspace`.

## Test Classification

- New fail-first contracts: catalog import/resolution, language assignment, ambiguity/dedupe, allowlisted auto-grounding, acronym fuzzy exclusion, quiet terminology, conditional history, bounded grounding, `TAD en IZC`, and hydration after unexpected SSE/reader failure.
- Regression locks expected to pass before implementation: optimistic local echo, detached worker survival after subscriber loss, artifact final-prose suppression, approval-gated persistence, canonical save before Drive I/O, and Drive remaining secondary.
- May-fail hardening verified before assumptions: Stop during new terminology/history paths, compound four-call budget, remount/reload during new grounding, stable scrolling, and activity transitions around new tools.

## Catalog Availability Policy

V1 fails closed at deployment when the bundled catalog is malformed, its canonical checksum is invalid, source references are invalid, migration/catalog schema is incompatible, or transactional synchronization fails. Backend does not serve requests with a partial or internally inconsistent bundled catalog.

A runtime terminology read failure after successful startup is different: it follows normal safe tool failure handling, contributes no terminology evidence, and never causes a fabricated definition. The assistant preserves original wording or asks one focused clarification when exact meaning is material. Runtime read failure does not mutate or silently disable the validated catalog.

Canonical checksum bytes are defined exactly as: parse JSON; validate supported schema without coercing, dropping, adding, or reordering values; serialize the complete parsed document with Python-equivalent `json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False)`; preserve every array's source order; encode the resulting string as UTF-8 with no BOM and no trailing newline; compute SHA-256; compare lowercase hexadecimal digest to the committed reviewed digest. Object key order and insignificant source whitespace therefore do not affect checksum; array order does.

Startup validation also requires every `AUTO_GROUND_ALIASES` value to exist as an exact `und` alias and resolve to exactly one active concept after normalization. Missing, inactive, or cross-concept ambiguous allowlisted aliases are catalog validation failures and block startup.

## Decisions

1. Use dedicated relational terminology tables, not video `chunks`.

   Rationale: glossary entries are atomic concepts with aliases and provenance. Video tables are global, English-oriented, timestamp-shaped, and semantically wrong for clinical terminology.

   Alternatives considered:
   - Reuse video RAG tables.
     - Rejected because their schema, authorization, citations, and chunk semantics do not match terminology.
   - Store one JSON blob.
     - Rejected because aliases need indexed normalized lookup, concept-scoped duplicate protection, and preserved cross-concept ambiguity.

2. Treat committed dataset as authoritative global catalog and synchronize it transactionally at startup after migrations.

   Rationale: all deployments need the same 161-entry catalog; a versioned file preserves reviewable provenance while idempotent synchronization avoids a 161-entry handwritten migration. A reviewed expected SHA-256 digest is committed alongside the dataset. Synchronization uses the exact canonical JSON byte contract above, compares its digest to that manifest before database work, acquires a transaction-scoped PostgreSQL advisory lock, compares schema version plus checksum, and skips unchanged work. A reviewed dataset update changes both content and expected digest; changed valid content is mirrored in one transaction. Concurrent replicas cannot interleave catalog writes. Manifest mismatch, invalid bundled integrity, or failed synchronization blocks startup; runtime lookup failure after successful startup remains a safe capability failure.

   Alternatives considered:
   - Embed all terms in Alembic migration.
     - Rejected because large data payload obscures schema migration and is difficult to review or update.
   - Require a manual import command.
     - Rejected because a fresh deployment could silently run without grounding data.

3. Use two tables and preserve legitimate lexical ambiguity.

   `clinical_terms` stores stable dataset concept ID, preferred Spanish and English terms, normalized preferred forms, definition, domain, category, source IDs, metadata, dataset schema version, dataset checksum, status, and timestamps. Preferred normalized fields are indexed but not globally unique because `dental crown` legitimately resolves to both `anat.crown` and `restoration.crown`.

   `clinical_term_aliases` stores term ID, one stable display alias, normalized alias, language, and descriptive alias type. V1 imports all legacy `aliases[]` rows with `language=und`; language is never guessed. Its constraint is `UNIQUE(term_id, normalized_alias, language)` and its lookup index is `(normalized_alias, language)`. Normalized aliases remain non-unique across concepts so `root canal` and `endodoncia` can return multiple candidates.

   Before persistence, the importer normalizes and deduplicates aliases within each `(term_id, language)` group. Thus `braquet` and `bráquet` produce one persisted lookup row while original spellings remain available in the committed source dataset.

   Synchronization mirrors the reviewed dataset's active catalog without deleting historical concept identities. Entries present in the new dataset are upserted with `status=active` and have their aliases replaced by that entry's current normalized alias set. Previously stored concepts absent from the new dataset become `status=inactive`; their rows and provenance remain, but preferred terms and aliases belonging to inactive concepts are excluded from exact lookup, fuzzy candidate generation, allowlist validation, and turn grounding. If the same `dataset_concept_id` returns in a later reviewed dataset, synchronization updates it and reactivates it.

   Rationale: uniqueness protects duplicate rows, not vocabulary meaning. Ambiguity is domain data and must reach the resolver rather than fail migration or synchronization.

4. Use standard-library normalization and matching.

   Normalization applies Unicode case folding, accent removal, punctuation-to-space conversion, whitespace collapse, and trimming. Lookup collects active candidates across Spanish preferred terms, English preferred terms, and `und` aliases. Exactly one concept produces `matched`; multiple concepts produce `ambiguous`, even for exact text. After exact failure, each active concept's fuzzy score is the maximum `SequenceMatcher` ratio across its normalized preferred ES/EN and alias forms. At most three concepts with score `>= 0.80` are returned, only when normalized input has at least five characters and original input is not acronym-shaped. Fuzzy candidates produce `ambiguous`, never `matched`, in V1.

   Rationale: 161 concepts do not justify embeddings, another dependency, or another database. Conservative fuzzy handling avoids declaring an unevaluated score clinically authoritative.

5. Use a conservative deterministic safety net plus one batched terminology tool.

   Before the agent runs, the service scans current input for exact token-boundary matches against `AUTO_GROUND_ALIASES = {"TAD", "TMJ", "CBCT", "BOP"}`, reviewed from the committed dataset. Startup validates each value as one exact `und` alias of exactly one active concept. Import policy may derive descriptive `alias_type=abbreviation` from conservative compact uppercase source aliases, but classification never grants auto-ground permission. Automatic grounding additionally excludes generic, ambiguous, context-dependent, non-allowlisted, and substring-only matches. The scan performs no fuzzy matching and spends no tool call.

   `MAX_TERMINOLOGY_TERMS = 8`. `lookup_dental_terms` accepts one through eight raw `terms`; schema validation rejects a ninth term rather than truncating. It returns one result per deduplicated normalized input, so duplicates count toward the raw input limit but produce one lookup result. Exact result payload includes concept ID, preferred terms, matched term, definition, aliases, domain/category, source IDs, match type, and confidence `1.0`. Unknown input returns `not_found`; fuzzy or multiple exact collisions return `ambiguous` with candidates but no authoritative definition. The tool remains available for explicit questions, non-auto-grounding vocabulary, and unresolved expressions.

   Rationale: the safety net covers only forms explicitly approved from the curated dataset, with `TAD` as a required fixture, without treating uppercase or compact spelling as clinical certainty. One additional batch tool keeps non-allowlisted or unresolved expressions model-selectable.

6. Capture bounded grounding in turn-local handler state.

   `TurnGrounding.patient_evidence` holds at most three approved evolutions from the active owner and patient, preserves `evolution_at`, orders evidence chronologically for generation, and deduplicates by evolution ID. Repeated history calls replace or merge to the same bounded set; they never accumulate unbounded prompt content.

   `TurnGrounding.terminology_evidence` accepts only `matched` results, deduplicates by concept ID, and keeps one stable record per concept. `ambiguous` and `not_found` results remain tool outcomes for model handling but never enter authoritative grounding. Grounding resets at turn start. `create_evolution_draft` passes the bounded collections to structured generation. Tool arguments never contain identity scope.

   Rationale: smallest change at existing Seam; no router, manager, registry hierarchy, or persistent grounding model is needed.

7. Preserve manual generation through an explicit service distinction.

   The structured drafting service distinguishes omitted grounding from explicit empty grounding. Manual callers omit grounding and retain the current bounded history load. Clinical Assistant supplies a grounding object, so an empty patient-evidence list means no history is loaded.

   Rationale: avoids silently changing `NewEvolution` and the existing `patient-dental-evolutions` specification.

8. Separate evidence categories in provider payload.

   Clinical Assistant drafting sends `CURRENT_INPUT`, `PATIENT_EVIDENCE`, and `TERMINOLOGY_EVIDENCE`. Prompt rules define what each category may establish. Terminology cannot establish patient attributes; history remains historical unless current input explicitly activates it.

   Rationale: labeled evidence is simpler and safer than one context blob.

9. Keep frontend and SSE contracts unchanged.

   Successful terminology lookup emits no activity row. If a result is ambiguous or unknown and meaning matters, the model responds through the existing assistant-message path. Draft, approval, and result artifacts retain current behavior.

   Rationale: invisible support is product goal; no new UI type is needed to achieve it.

10. Keep `MAX_CLINICAL_TOOL_CALLS = 4` and remove redundant model-facing patient confirmation.

   The system state already tells the model whether a patient is selected, and every patient-bound handler validates runtime context again. `get_patient_context` therefore leaves the model-facing tool catalog; its authorization checks are not removed from concrete handlers. Expected budgets are: draft `1`; history + draft `2`; terminology + draft `2`; history + terminology + draft `3`; and history + terminology + draft + prepare save `4`. Deterministic abbreviation pre-resolution consumes no tool call.

   Rationale: raising the cap would permit more looping without adding capability. Removing one redundant tool keeps legitimate compound turns within the existing safety bound.

11. Treat dataset retrieval recommendations as non-normative metadata.

   The committed dataset's `recommended_retrieval` and `recommended_top_k` fields are retained as source metadata for provenance but are not read by runtime policy. Product architecture defined here selects deterministic lexical resolution for V1.

   Rationale: content metadata must not silently enable embeddings or override evaluated application contracts.

12. Classify capability presentation with one small policy map.

   `TOOL_PRESENTATION_POLICY` is the only model-tool presentation policy and maps:

   ```text
   lookup_dental_terms          -> silent
   get_recent_evolutions        -> progress
   create_evolution_draft       -> artifact
   update_evolution_draft       -> artifact
   prepare_evolution_save       -> human_gate
   ```

   The map also owns domain labels for progress-capable tools. Quiet behavior is exactly `presentation_class == silent`; no parallel set or inference exists. The map does not become a generic tool framework. `silent` emits no activity. `progress` emits truthful running/completed activity. `artifact` may show compact preparation while running, then the artifact becomes primary. `human_gate` yields existing approval semantics. `background` is reserved for existing non-tool domain lifecycle such as post-save Drive export, which remains attached to the evolution/export object and is not entered in the tool map.

   Rationale: user presentation should follow semantic outcome, not expose implementation names or force every tool into one card shape.

13. Keep activity truthful, compact, and ephemeral.

   Runtime exposes only known discrete states, so UI may show domain text such as `Revisando antecedentes…` or `Preparando evolución…`, never percentages, internal arguments, provider waits, or chain-of-thought. After artifact or approval completion, completed activity collapses to a compact summary or disappears; hydration may omit it entirely because durable domain state is authoritative. Existing viewport-follow logic must continue respecting users who scrolled away from the end.

   Rationale: progress explains meaningful waiting; results own durable visual space.

14. Reconcile transport failure through existing persistence before retry.

   On clean EOF, abort, component remount, reload, or unexpected SSE/network error, the client requests authoritative thread state. If persisted state says completed or exposes an artifact/action, UI renders that truth and does not offer duplicate retry. If the same turn remains active, existing active-turn polling continues. If persistence confirms failed, UI shows the safe recoverable error. Subscriber loss never calls cancellation implicitly.

   Rationale: one missing `load()` path, not missing runtime infrastructure, causes current SSE/persistence disagreement.

15. Preserve current cancellation and background boundaries; add proof, not infrastructure.

   New history and terminology work remains under the existing cancellable worker task. Stop immediately enters `stopping`, invokes existing backend cancellation, reloads persisted truth, and leaves any already committed artifact/action governed by its own domain state. Canonical save remains foreground and approval-gated. External Drive work remains post-response background state attached to the approved artifact/action and cannot convert an already committed clinical record into a failed save.

   Rationale: current boundaries are sound for this change. Pre-claim cancellation durability, completion-vs-cancel races, restart survival, export completion push, and durable export recovery require separate lifecycle design.

16. Add allowlisted structured logs before adding a telemetry stack.

   Existing Python logging records stable event names and bounded fields only. Initial questions are: which capability adds latency, which capability over-activates, where turns fail, and whether transport reconciliation recovers persisted work. Fields may include `thread_id`, `turn_id`, capability name, presentation class, status, latency bucket/value, call count, budget exhaustion, evidence count, terminology result status/match type, cancellation outcome, reconciliation outcome, artifact outcome, retry count, and failure class.

   Failure classes are bounded to `routing`, `retrieval`, `grounding`, `generation`, `tool`, `transport`, `presentation`, and `side_effect`. Logs exclude raw RUT, notes, history, documents, tool arguments, provider exception text, secrets, and hidden reasoning. No new metrics/tracing vendor or high-cardinality labels are introduced.

   Rationale: structured logs answer active product questions using existing infrastructure; dedicated metrics can follow only when operations has a concrete backend and dashboard need.

## Tool Budget

```text
normal draft                                      1 / 4
history + draft                                  2 / 4
terminology + draft                              2 / 4
history + terminology + draft                    3 / 4
history + terminology + draft + prepare save     4 / 4
```

`get_patient_context` is removed from model-visible tools. Missing patient state still returns deterministic handler errors for patient-bound capabilities. Tests must prove cap behavior and ensure no hidden fifth call is required for the compound flow.

## Agent Activity Semantics

```text
silent internal read
  -> no transcript item

meaningful wait starts
  -> one domain-labeled running activity

artifact or gate completes
  -> artifact/approval becomes primary
  -> completed activity collapses or disappears

recoverable failure
  -> local safe error/retry at owning semantic surface
```

Activity phase never replaces turn lifecycle. A turn can remain `running` while activity changes from history retrieval to draft preparation. No progress percentage is shown without measured progress.

## Foreground vs Background Side Effects

Foreground work includes active-patient clarification, history needed for the answer, draft generation, clinician approval, and canonical evolution persistence. Background work includes existing post-save Drive synchronization and future non-critical indexing only after separate design. Async execution never authorizes patient switching, approval, clinical persistence, treatment decisions, or unspecified external writes.

Canonical outcome and secondary state remain visually separate:

```text
Clinical evolution: saved
Drive export: pending | syncing | synced | failed | unknown
```

Drive failure belongs to the approved artifact/action export state and retry path, not a contextless toast and not the canonical save outcome.

## Reconciliation Assessment

### Add to this change

- Hydrate persisted thread truth after unexpected SSE/network errors using the existing GET contract.
- Verify detached work survives subscriber/component loss and later appears through hydration.
- Verify active-turn polling and failed-turn recovery remain coherent for new grounding paths.
- Verify Stop during history, terminology, and draft work reaches existing persisted cancellation semantics.

### Follow-up proposal: `improve-clinical-run-lifecycle`

- Pre-claim Stop durability and explicit completion-vs-cancellation race policy.
- SSE reattachment/replay, persisted event cursors, or new authoritative status endpoints.
- Process-restart resumption, worker heartbeats, and stale-lease redesign.
- Durable background export worker/sweeper, stale-worker fencing, export completion push/polling, and reconnect-triggered retry.
- Drive workspace close/reopen restoration, manual draft-seed replay, and standalone evolution export-status APIs.

These items require new state or transport ownership and would make terminology/history grounding no longer independently shippable.

## Data Flow

```text
clinical user message
        |
        v
reviewed allowlisted abbreviation scan (no tool budget)
        |
        `--> unique matches seed turn-local TERMINOLOGY_EVIDENCE
        |
        v
agent chooses zero or more additional capabilities
        |
        +--> get_recent_evolutions
        |       `--> repository filters owner + active patient
        |                 `--> turn-local PATIENT_EVIDENCE
        |
        +--> lookup_dental_terms([terms])
        |       `--> normalize -> exact preferred/alias
        |                 +--> exact: TERMINOLOGY_EVIDENCE
        |                 `--> ambiguous/not_found: non-authoritative result
        |
        `--> create_evolution_draft
                `--> CURRENT_INPUT + selected evidence categories
                         `--> structured draft artifact
                                  `--> review -> approval -> persistence
```

## Migration Plan

1. Expand: create catalog tables and indexes without changing clinical runtime.
2. Synchronize: assign `es`, `en`, and `und` language structurally; normalize and deduplicate within concepts; validate source references and legitimate cross-concept collisions; compare canonical SHA-256 to the committed expected digest; take an advisory lock; and atomically load changed reviewed content. Fail startup rather than expose invalid or partial bundled catalog state.
3. Integrate: add reviewed-allowlist pre-resolution, fixed resolver/batch constants, sole `TOOL_PRESENTATION_POLICY`, and batched tool; remove redundant model-facing patient confirmation while retaining runtime patient checks.
4. Migrate Clinical Assistant drafting to explicit turn-selected grounding while manual generation keeps omitted-grounding behavior.
5. Contract: verify no other Clinical Assistant path loads history unconditionally and no terminology result bypasses typed status checks.

Rollback removes runtime use first. Catalog tables may remain inert during application rollback; a later migration may remove them only after older deployments no longer reference them.

## Risks / Trade-offs

- [Dataset provenance or redistribution restriction] -> preserve source IDs/URLs, document paraphrased-definition policy, and require provenance/licensing review before production release.
- [Catalog startup synchronization failure blocks application] -> validate in tests and one transaction; failure is preferable to silently incomplete clinical grounding.
- [Concurrent replicas race during synchronization] -> serialize by stable transaction-scoped PostgreSQL advisory lock and compare schema version plus checksum under that lock.
- [Legitimate alias collision rejected or flattened] -> use concept-scoped uniqueness and return `ambiguous` whenever one normalized expression maps to multiple concepts.
- [Generic or uppercase alias false activation] -> automatic scan requires the reviewed allowlist plus unique exact token-boundary mapping; descriptive abbreviation classification grants no permission.
- [Short-token fuzzy false positive] -> inputs shorter than five normalized characters and acronym-shaped originals skip fuzzy matching; eligible candidates require ratio `>= 0.80`, cap at three, and remain non-authoritative.
- [Removed concept remains resolvable] -> absent reviewed entries become inactive, all lookup paths filter active status, and stable identity/provenance remain for audit and reactivation.
- [Allowlist drifts from catalog] -> startup requires every allowlisted value to resolve as one exact `und` alias of one active concept.
- [Model skips needed history tool] -> strengthen tool descriptions and routing fixtures; do not compensate by unconditional retrieval.
- [Model calls history unnecessarily] -> routing fixtures and telemetry measure false activation; runtime still limits evidence to active owner/patient.
- [Historical facts become current] -> labeled payload, prompt contract, and generation tests assert epistemic separation.
- [Unknown term hallucination] -> `not_found` carries no definition, and prompt requires preservation or focused clarification.
- [Cross-patient leakage] -> candidate generation remains inside mandatory owner and patient SQL predicates; video RAG queries are never reused.
- [In-process dataset drift across replicas] -> each replica synchronizes the same committed dataset version transactionally before serving requests.
- [SSE reports failure after persisted completion] -> reconcile every stream termination against existing thread hydration before exposing retry.
- [Cancellation races with committed effects] -> preserve committed artifacts/actions, hydrate authoritative state, and defer broader race semantics to lifecycle follow-up.
- [Activity overwhelms result] -> finite presentation classes, quiet reads, truthful labels, and artifact-first completed presentation.
- [Sensitive telemetry leakage] -> stable allowlisted fields and bounded failure classes; never log clinical payloads or provider text.
- [Drive scope expands grounding change] -> add regression proof for existing independence only; defer execution/recovery redesign.

## Verification Strategy

- Resolver unit tests cover normalization, preferred terms, `und` aliases, within-concept dedupe, real cross-concept collisions, eight-term rejection boundary, reviewed allowlist scanning, token boundaries, non-allowlisted uppercase/generic exclusions, short/acronym fuzzy exclusions, `0.80` threshold, three-candidate deterministic order, and unknown terms.
- Repository/synchronization tests prove exact canonical JSON bytes, digest mismatch failure, advisory locking, checksum/version skip, transactional synchronization, inactive/reactivation semantics, allowlist validation, concept-scoped alias uniqueness, and non-unique cross-concept lookup indexes; live tests prove catalog constraints.
- Golden routing fixture `TAD en IZC` proves `TAD=matched`, `IZC=not_found`, no invented `IZC` expansion, and no false all-or-nothing lookup behavior.
- Agent tests prove `1..8` batched schema, sole presentation-map quiet behavior, visible normal clarification path, unchanged artifact prose suppression, and the four-call compound budget.
- Service/generation tests prove self-contained assistant drafts issue no history query, explicit history reaches only `PATIENT_EVIDENCE`, terminology reaches only `TERMINOLOGY_EVIDENCE`, and manual generation behavior remains unchanged.
- Security tests prove cross-owner and cross-patient history cannot enter evidence.
- Mocked Playwright scenarios prove known terminology stays quiet, unknown terminology produces no invented definition, and artifact/approval flow remains unchanged.
- Frontend tests prove immediate local echo, no progress chrome for short silent work, domain labels for perceptible work, completed activity de-emphasis, stable scrolled-away viewport, and hydration after transport error.
- Cancellation tests cover Stop during history/terminology/draft paths, duplicate UI Stop suppression, persisted cancellation, reload, and queued/new-message recovery without defining new lifecycle states.
- Drive regressions prove canonical save returns before external sync, composer unblocks while export remains pending, failure remains local to export state, and thread hydration owns retryable background outcome.

## Slice Dependencies

- Catalog foundation enables resolver integration.
- Routing and grounding integration depends on typed resolver behavior.
- Browser closure depends on integrated runtime behavior.
- Full verification depends on all implementation slices.

## Open Questions

None. Alias language, auto-ground eligibility, short-token/acronym fuzzy exclusion, fuzzy threshold/candidate cap, batch limit, canonical checksum bytes, inactive replacement semantics, allowlist validation, presentation ownership, capability ownership, test classification, and catalog availability are locked above. `IZC` and any other absent concept intentionally return `not_found` until a separately reviewed dataset update adds them.
