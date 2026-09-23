## ADDED Requirements

### Requirement: Curated terminology catalog
The system SHALL maintain a versioned and checksummed global dental terminology catalog in PostgreSQL with atomic concepts, preferred Spanish and English terms, normalized aliases, descriptive alias types, definitions, domain/category metadata, and source identifiers from the committed curated dataset. V1 SHALL assign `term` language `es`, `term_en` language `en`, and every string in `aliases[]` language `und` without language inference. Normalized lookup values SHALL be allowed to map to multiple active concepts. Synchronization SHALL preserve removed concept identities as inactive while excluding them from resolution and grounding.

#### Scenario: Fresh deployment starts
- **WHEN** migrations complete and application startup synchronizes the committed catalog
- **THEN** all valid concepts and aliases are available atomically before clinical requests are served

#### Scenario: Dataset validation fails
- **WHEN** the bundled dataset has an unsupported schema version, canonical SHA-256 different from its committed reviewed digest, duplicate concept ID, structurally invalid entry, unknown source identifier, incompatible catalog schema, or transactional synchronization failure
- **THEN** synchronization rolls back and startup fails without exposing a partial catalog

#### Scenario: Legacy alias language is imported
- **WHEN** V1 imports any string from an entry's `aliases[]`
- **THEN** it persists `language=und` and does not infer language from spelling, capitalization, vocabulary, locale, or similarity to `term` or `term_en`

#### Scenario: Catalog schema is inspected
- **WHEN** terminology tables and constraints are inspected
- **THEN** `clinical_terms` contains dataset concept ID, preferred/normalized ES and EN terms, definition, domain, category, source IDs, metadata, dataset schema version/checksum, `status` constrained to `active|inactive`, and timestamps; `clinical_term_aliases` contains term ID, display/normalized alias, language, descriptive alias type, and timestamp; preferred normalized values are non-unique, alias uniqueness is `(term_id, normalized_alias, language)`, and alias lookup index is non-unique `(normalized_alias, language)`

#### Scenario: Future dataset carries structured aliases
- **WHEN** a later dataset schema represents aliases with explicit value, language, or type
- **THEN** support requires that schema's own reviewed import contract and V1 does not synthesize those fields into the supplied string-array dataset

#### Scenario: Legitimate normalized value maps to multiple concepts
- **WHEN** `dental crown`, `root canal`, or `endodoncia` normalizes to entries belonging to different concept IDs
- **THEN** synchronization persists every concept mapping and does not reject or flatten the ambiguity

#### Scenario: Aliases collapse within one concept
- **WHEN** aliases such as `braquet` and `bráquet` normalize to the same value for one concept and language
- **THEN** synchronization stores one deterministic lookup row for that concept while the committed dataset retains the original spellings

#### Scenario: Dataset version and checksum are unchanged
- **WHEN** another application replica starts with the same schema version and canonical content checksum
- **THEN** synchronization takes the catalog advisory lock, detects no change, skips replacement work, and exposes the same active catalog

#### Scenario: Canonical checksum is computed
- **WHEN** startup validates catalog integrity
- **THEN** it parses and validates JSON without coercing, dropping, adding, or reordering values; serializes the complete parsed document with sorted object keys, separators `,` and `:`, Unicode preserved rather than ASCII-escaped, original array order preserved, UTF-8 encoding without BOM or trailing newline; and compares lowercase SHA-256 hexadecimal output to the committed reviewed digest

#### Scenario: Source formatting or object key order changes
- **WHEN** two valid JSON files differ only by insignificant whitespace or object key order
- **THEN** canonical checksum is identical, while any array-order or value change affects checksum

#### Scenario: Reviewed dataset removes a concept
- **WHEN** changed valid catalog no longer contains a previously stored `dataset_concept_id`
- **THEN** synchronization retains its row and provenance with `status=inactive`, excludes its preferred terms and aliases from exact/fuzzy lookup and grounding, and does not expose it as an active candidate

#### Scenario: Reviewed dataset reintroduces a concept
- **WHEN** a later valid catalog contains an inactive `dataset_concept_id`
- **THEN** synchronization updates the same concept identity, replaces its aliases with current normalized aliases, and sets `status=active`

#### Scenario: Concurrent replicas synchronize changed data
- **WHEN** multiple replicas start concurrently with changed catalog content
- **THEN** a stable transaction-scoped PostgreSQL advisory lock serializes synchronization and each replica observes one complete catalog version

#### Scenario: Dataset recommends vector retrieval
- **WHEN** dataset metadata contains `recommended_retrieval` or `recommended_top_k`
- **THEN** runtime retains those values only as source metadata and does not enable embeddings, vector search, or top-k model selection

#### Scenario: Runtime catalog read fails
- **WHEN** a terminology repository query fails after successful startup
- **THEN** normal safe tool failure handling contributes no terminology evidence, exposes no fabricated definition, and preserves original wording or requests focused clarification when meaning is material

#### Scenario: Auto-ground allowlist diverges from catalog
- **WHEN** any of `TAD`, `TMJ`, `CBCT`, or `BOP` is missing as an exact `und` alias, belongs only to an inactive concept, or maps to more than one active concept after normalization
- **THEN** catalog validation fails and application startup stops before serving clinical requests

### Requirement: Conservative batched terminology resolution
The system SHALL resolve `1..8` raw dental expressions per call through deterministic normalization, exact preferred-term lookup, and exact alias lookup before considering fuzzy candidates. `MAX_TERMINOLOGY_TERMS` SHALL equal `8`; a ninth raw term SHALL be rejected rather than truncated. Only exact preferred-term or alias results SHALL be authoritative matches. Eligible fuzzy candidate generation SHALL use `FUZZY_MIN_RATIO=0.88` and return at most `FUZZY_MAX_CANDIDATES=3` deduplicated concepts.

#### Scenario: Preferred Spanish term matches
- **WHEN** an input normalizes to one preferred Spanish term
- **THEN** the resolver returns `matched` with that concept, `match_type=exact`, confidence `1.0`, definition, aliases, metadata, and source identifiers

#### Scenario: English term or alias matches
- **WHEN** an input normalizes to one preferred English term or one alias
- **THEN** the resolver returns `matched` with the canonical concept and identifies whether the match was an exact preferred term or alias

#### Scenario: Exact expression maps to multiple concepts
- **WHEN** one normalized preferred term or alias maps to more than one concept
- **THEN** the resolver returns `ambiguous` with every exact candidate and no authoritative definition

#### Scenario: Case accents and punctuation vary
- **WHEN** inputs differ only by case, accents, surrounding punctuation, hyphen spacing, or repeated whitespace
- **THEN** deterministic normalization produces the same exact lookup key

#### Scenario: Fuzzy candidates exist
- **WHEN** no exact match exists for an eligible non-acronym input of at least five normalized characters and `SequenceMatcher(None, normalized_input, normalized_candidate).ratio()` is at least `0.88`
- **THEN** each active concept receives its maximum ratio across normalized preferred ES/EN and alias forms, and resolver returns up to three concept-deduplicated `ambiguous` candidates ordered by that ratio descending then stable concept ID ascending, without authoritative definition or automatic replacement

#### Scenario: Short input is not fuzzy eligible
- **WHEN** normalized input has fewer than five characters, including `TMD`, `TMJ`, `PD`, or `PS`
- **THEN** resolver uses exact preferred/alias lookup only and does not produce a fuzzy candidate

#### Scenario: Acronym-shaped input is not fuzzy eligible
- **WHEN** original input is a compact uppercase token of at least two alphabetic characters after removing only periods and hyphens, such as `TAD`, `T.A.D.`, `TMJ`, or `BOP`
- **THEN** resolver uses exact preferred/alias lookup only regardless of normalized length

#### Scenario: Longer misspelling has a candidate
- **WHEN** eligible input such as `braquett`, `periodontitiss`, or `maloclusion` has no exact match but reaches ratio `0.88`
- **THEN** resolver may return `ambiguous` candidates but never `matched`

#### Scenario: Term is absent
- **WHEN** no exact or plausible controlled candidate exists
- **THEN** the resolver returns `not_found` without fabricating a definition

#### Scenario: Batch contains duplicates
- **WHEN** multiple inputs normalize to the same lookup key
- **THEN** raw inputs still count toward eight-term schema limit, while resolver performs one lookup and returns one deterministic result for that normalized expression

#### Scenario: Batch exceeds fixed limit
- **WHEN** tool arguments contain nine or more raw terms
- **THEN** argument validation rejects the call and does not silently truncate or execute a partial batch

#### Scenario: Mixed known and unknown batch
- **WHEN** the batch contains `TAD` and `IZC`
- **THEN** `TAD` returns the matched temporary anchorage concept, `IZC` returns `not_found`, and no result or later generation invents an expansion for `IZC`

### Requirement: Reviewed terminology pre-resolution
Before invoking the clinical agent, the system SHALL pre-resolve only exact token-boundary occurrences from the reviewed V1 allowlist `TAD`, `TMJ`, `CBCT`, and `BOP`. Descriptive `alias_type=abbreviation` classification SHALL NOT grant auto-ground permission. Pre-resolution SHALL require a unique concept, perform no fuzzy matching, exclude generic, ambiguous, context-dependent, non-allowlisted, and substring-only aliases, and consume no model tool call.

#### Scenario: Allowlisted unique abbreviation is present
- **WHEN** current input contains allowlisted `TAD`, `TMJ`, `CBCT`, or `BOP` at an exact token boundary and lookup maps it to one concept
- **THEN** its exact matched concept enters turn terminology evidence before the model runs without consuming tool budget

#### Scenario: Uppercase abbreviation is not allowlisted
- **WHEN** current input contains uppercase `LPD`, `ATM`, `OPG`, `OPI`, `TTM`, `TMD`, `PS`, or `PD`
- **THEN** automatic scanning adds no terminology evidence solely from capitalization or abbreviation classification

#### Scenario: Generic alias is present
- **WHEN** current input contains a generic alias such as `pieza`, `raíz`, `resina`, or `cap`
- **THEN** automatic scanning does not add terminology evidence solely from that alias

#### Scenario: Abbreviation is ambiguous
- **WHEN** an abbreviation lookup maps to multiple concepts
- **THEN** automatic scanning adds no authoritative evidence and leaves resolution or clarification to the agent path

#### Scenario: Expression resembles a known abbreviation
- **WHEN** text only fuzzily resembles a known abbreviation or occurs inside another token
- **THEN** automatic scanning makes no correction and adds no terminology evidence

#### Scenario: Allowlisted letters occur inside another token
- **WHEN** letters such as `TAD` occur only inside a longer token
- **THEN** token-boundary scanning does not auto-ground that occurrence

### Requirement: Runtime-scoped multi-capability routing
The Clinical Assistant SHALL allow one turn to use zero or more patient-history, terminology, draft, revision, and save-preparation capabilities while application runtime retains ownership of user, patient, thread, turn, and artifact scope. Model-facing patient-context confirmation SHALL NOT duplicate patient-selected state already supplied by runtime.

#### Scenario: General conversation needs no capability
- **WHEN** the clinician asks a general question that does not require patient data, terminology resolution, or structured clinical work
- **THEN** the assistant may answer normally without a patient and without a tool call

#### Scenario: Self-contained current note requests a draft
- **WHEN** the current note fully states the relevant clinical facts and requests an evolution
- **THEN** the assistant creates a draft without retrieving patient history

#### Scenario: Current request depends on previous care
- **WHEN** the request explicitly depends on a previous session, chronology, prior symptoms, or prior treatment
- **THEN** the assistant may retrieve approved history for only the active owner and patient before answering or drafting

#### Scenario: Turn needs history terminology and drafting
- **WHEN** one request contains an abbreviation, an explicit prior-session reference, and a request for an evolution
- **THEN** the assistant may use all three capabilities in the same bounded turn without directly persisting an evolution

#### Scenario: Model attempts to select identity scope
- **WHEN** tool arguments include or imply another owner, patient, thread, or turn
- **THEN** handlers ignore model-selected identity and use authenticated runtime scope or reject the operation

#### Scenario: Patient state needs enforcement
- **WHEN** the system state reports no selected patient and the model invokes a patient-bound capability
- **THEN** that concrete handler returns the existing patient-required failure without a separate `get_patient_context` tool call

### Requirement: Bounded turn grounding
The system SHALL create fresh grounding for every turn, cap patient evidence at three active-patient approved evolutions, and include only authoritative matched terminology concepts.

#### Scenario: Patient history populates grounding
- **WHEN** scoped history retrieval succeeds
- **THEN** grounding contains at most three evolutions, deduplicated by evolution ID, preserving clinical date and ordered chronologically for generation

#### Scenario: History tool repeats
- **WHEN** the model invokes history retrieval more than once in one turn
- **THEN** grounding remains the same bounded deduplicated evidence set and does not grow with duplicate copies

#### Scenario: Terminology lookup repeats or overlaps pre-resolution
- **WHEN** pre-resolution and one or more terminology calls match the same concept
- **THEN** grounding retains one terminology evidence item for that concept ID

#### Scenario: Terminology is unresolved
- **WHEN** lookup returns `ambiguous` or `not_found`
- **THEN** the outcome remains available for response handling but does not enter authoritative terminology grounding

#### Scenario: Next turn begins
- **WHEN** a new clinical turn starts in the same thread
- **THEN** grounding starts empty and receives no patient or terminology evidence from the prior turn

### Requirement: Clinical tool budget remains bounded
The Clinical Assistant SHALL retain a maximum of four model tool calls per turn and SHALL keep legitimate compound workflows within that cap by removing redundant model-facing patient-context confirmation.

#### Scenario: Simple draft
- **WHEN** a self-contained note requests a draft
- **THEN** draft creation requires one model tool call

#### Scenario: History and draft
- **WHEN** a turn requires patient history and draft creation
- **THEN** workflow requires at most two model tool calls

#### Scenario: Terminology and draft
- **WHEN** a turn requires explicit terminology lookup and draft creation
- **THEN** workflow requires at most two model tool calls

#### Scenario: History and terminology draft
- **WHEN** a turn requires patient history, terminology lookup, and draft creation
- **THEN** the workflow requires at most three model tool calls

#### Scenario: Compound draft and save preparation
- **WHEN** a turn requires history, terminology lookup, draft creation, and approval preparation
- **THEN** the workflow completes within four model tool calls and persistence still waits for explicit clinician approval

#### Scenario: Deterministic pre-resolution seeds evidence
- **WHEN** reviewed allowlisted terminology pre-resolves before agent execution
- **THEN** it consumes zero model tool calls

#### Scenario: Documented V1 workflow is planned
- **WHEN** implementation enumerates normal draft, history, terminology, draft revision, and save-preparation paths
- **THEN** no legitimate documented flow depends on a hidden fifth model tool call

#### Scenario: Tool cap is exhausted
- **WHEN** four model tool calls have executed
- **THEN** the existing bounded loop prevents another tool call and requires a final response from available results

### Requirement: Existing cancellation remains coherent for grounding work
History retrieval, terminology resolution, and draft generation SHALL remain inside the existing cancellable clinical worker. Explicit Stop after turn claim SHALL enter stopping state, request backend cancellation, and reconcile persisted truth without introducing automatic cancellation on ordinary disconnect. This change SHALL NOT define pre-claim cancellation durability, completion-versus-cancellation race policy, or process-restart recovery.

#### Scenario: Stop during grounding work
- **WHEN** the clinician presses Stop during history, terminology, or draft execution after turn claim
- **THEN** backend work is cancelled where supported, the active turn lock clears, and persisted outcome is recoverable as `CLINICAL_TURN_CANCELLED`

#### Scenario: Stop is pressed twice through the UI
- **WHEN** one Stop request is already in progress
- **THEN** the UI prevents another user-triggered Stop request and keeps one stopping indication

#### Scenario: Stop completes
- **WHEN** cancellation reaches persisted terminal state
- **THEN** the note remains available, retry or queued-message behavior follows existing contracts, and no orphan running indicator remains


### Requirement: Epistemically separated grounding
Clinical Assistant drafting SHALL provide current input, patient evidence, and terminology evidence as distinct labeled categories, and each category SHALL support only its permitted claims.

#### Scenario: Current input establishes current finding
- **WHEN** the current input explicitly documents a present finding
- **THEN** the draft may represent that finding as current while preserving negation, attribution, laterality, and uncertainty

#### Scenario: Historical fact is not current
- **WHEN** patient evidence documents an old finding that current input does not activate
- **THEN** the draft does not state that finding as current

#### Scenario: History resolves explicit reference
- **WHEN** current input refers to the same item or condition from a previous session and scoped patient evidence identifies it
- **THEN** the draft may use the historical record to resolve the reference while retaining its historical provenance

#### Scenario: Terminology normalizes concept meaning
- **WHEN** an exact terminology match defines an abbreviation or synonym
- **THEN** the assistant may use the canonical meaning but does not infer patient-specific location, side, time, symptom, procedure, or diagnosis

#### Scenario: Unknown terminology is material
- **WHEN** terminology returns `not_found` and exact meaning materially changes interpretation or drafting
- **THEN** the assistant preserves the original wording or asks one focused clarification and does not invent a definition

#### Scenario: Ambiguous terminology is material
- **WHEN** terminology returns `ambiguous` with multiple plausible candidates and the distinction materially changes clinical meaning
- **THEN** the assistant asks one focused clarification and does not choose a candidate arbitrarily

### Requirement: Quiet terminology support
Successful internal terminology resolution SHALL remain invisible in the clinical transcript unless the clinician explicitly asks about the term or ambiguity requires clinician action. Quiet behavior SHALL be controlled by explicit tool presentation policy rather than inferred from labels or tool output text.

#### Scenario: Known abbreviation supports drafting
- **WHEN** a known abbreviation resolves exactly during evolution preparation
- **THEN** terminology `tool_start` and `tool_done` produce no activity item, no generic completion message is rendered, and the structured artifact remains the primary result

#### Scenario: Clinician asks for a definition
- **WHEN** the clinician explicitly asks what a cataloged term means
- **THEN** the assistant may answer with its curated definition and source metadata through the existing assistant-message path

#### Scenario: Clarification is required
- **WHEN** unresolved terminology materially blocks safe interpretation
- **THEN** the existing assistant-message path presents a concise actionable clarification without exposing tool names, similarity scores, or internal routing

#### Scenario: Non-quiet tool executes
- **WHEN** history, draft, revision, or save-preparation tools execute
- **THEN** their presentation follows the modified `clinical-agentic-feedback` semantic activity contract

### Requirement: Grounding cannot authorize persistence
Grounding capabilities SHALL NOT persist clinical records. Generated or revised evolutions SHALL use the existing clinician review and explicit approval contract before deterministic persistence.

#### Scenario: Grounded draft succeeds
- **WHEN** history or terminology evidence contributes to a valid draft
- **THEN** the system creates only a reviewable artifact and no evolution row

#### Scenario: Save is requested conversationally
- **WHEN** the clinician asks to save an active draft
- **THEN** the model can only prepare the existing approval request and cannot execute persistence

#### Scenario: Approval is absent or declined
- **WHEN** explicit approval has not occurred or the clinician declines
- **THEN** no canonical evolution is created

### Requirement: Grounding observability protects clinical privacy
The system SHALL capture allowlisted structured operational evidence sufficient to evaluate routing, waiting, cancellation, reconciliation, and grounding without logging raw RUTs, full notes, full patient history, source documents, tool arguments, provider error text, or hidden model reasoning. Failure classification SHALL use bounded values `routing`, `retrieval`, `grounding`, `generation`, `tool`, `transport`, `presentation`, or `side_effect`.

#### Scenario: Grounding capability executes
- **WHEN** history or terminology lookup runs
- **THEN** safe telemetry may record turn/thread identifiers, selected capability, presentation class, latency, tool-call count, budget state, evidence count, lookup status, and match type

#### Scenario: Turn is cancelled or reconciled
- **WHEN** explicit cancellation or transport reconciliation occurs
- **THEN** telemetry records safe outcome, attempt count, latency, and bounded failure class without clinical payload content

#### Scenario: Clinical content reaches an error path
- **WHEN** lookup, generation, or tool execution fails
- **THEN** logs contain a safe error category and no raw clinical payload or provider exception text exposed to the model or client

#### Scenario: No telemetry backend supports a proposed metric
- **WHEN** implementation would require a new metrics, tracing, queue, or analytics stack solely for this change
- **THEN** the system uses existing structured logging and defers the new infrastructure until a concrete operational requirement justifies it
