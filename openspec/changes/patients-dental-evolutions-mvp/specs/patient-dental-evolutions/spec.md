## ADDED Requirements

### Requirement: Authenticated patient directory
The system SHALL let an authenticated user list, search, create, and view only patients owned by that user.

#### Scenario: List owned patients
- **WHEN** an authenticated user requests `GET /api/patients`
- **THEN** the system returns only that user's patients with minimal response fields and masked RUT values

#### Scenario: Search owned patients
- **WHEN** an authenticated user submits a name or RUT as `{ "query": "..." }` to `POST /api/patients/search`
- **THEN** the backend interprets the term, searches only that user's patients, and returns minimal results with masked RUT values

#### Scenario: Sensitive search transport
- **WHEN** the professional searches with a RUT
- **THEN** the raw term appears only in the request body and not in the URL, query string, response, access log, application log, debug log, or error log

#### Scenario: Search does not require a client-side type
- **WHEN** the client submits one patient search query
- **THEN** the backend distinguishes a recognizable valid RUT from a name without requiring `search_type`

#### Scenario: Oversized search term is rejected
- **WHEN** the submitted patient search query exceeds 200 characters
- **THEN** the backend returns `422` without running a patient lookup

#### Scenario: Create a patient
- **WHEN** an authenticated user submits valid names, RUT, and an optional date of birth to `POST /api/patients`
- **THEN** the system creates a UUID patient owned by that user and returns its minimal representation

#### Scenario: Cross-owner patient is hidden
- **WHEN** an authenticated user requests a patient owned by another user
- **THEN** the system returns `404`

### Requirement: Chilean RUT normalization and privacy
The system MUST normalize and validate Chilean RUT input on the backend and SHALL never return its stored body or check digit as separate public fields.

#### Scenario: Accepted formatted RUT
- **WHEN** a user submits a valid RUT containing dots, a hyphen, spaces, or lowercase `k`
- **THEN** the system removes separators, stores the numeric body and uppercase check digit separately, and returns only a masked RUT

#### Scenario: Invalid RUT
- **WHEN** the submitted RUT has invalid format or fails the Modulo 11 check
- **THEN** the system returns `422` without creating a patient

#### Scenario: Duplicate owner RUT
- **WHEN** a user submits a RUT body already registered to that same owner
- **THEN** the system returns `409` with only the existing patient's minimal masked representation and creates no duplicate

#### Scenario: Duplicate patient recovery
- **WHEN** the client receives the same-owner duplicate response
- **THEN** it offers `Cancelar` and `Abrir paciente` without showing raw RUT or searching another owner's records

#### Scenario: Same RUT under another owner
- **WHEN** a different authenticated user submits the same valid RUT
- **THEN** the system permits a separate patient because uniqueness is scoped to the owner

### Requirement: Owner-bound evolution persistence
The system SHALL store evolutions by patient UUID and owner UUID, enforce matching patient ownership with a composite foreign key, and scope every evolution query to the authenticated owner.

#### Scenario: Save an owned evolution
- **WHEN** an authenticated user explicitly saves an evolution for that user's patient
- **THEN** the system stores its UUID, `evolution_at` from the client workspace, raw note, generated text, final text, owner, patient, `created_at`, and `updated_at`

#### Scenario: Save validates source and approved record
- **WHEN** a client submits a save request whose stripped `raw_note` is empty or exceeds 40,000 characters, or whose `final_text` is empty or whitespace-only
- **THEN** the backend returns `422` and creates no evolution row

#### Scenario: Clinical and technical timestamps remain distinct
- **WHEN** the system persists an evolution
- **THEN** `evolution_at TIMESTAMPTZ` records the selected clinical moment while `created_at` and `updated_at` record technical persistence events

#### Scenario: Stored text semantics
- **WHEN** an evolution is saved
- **THEN** `raw_note` represents the current professional source, `generated_text` represents the latest successful AI baseline for that source and remains non-authoritative client-submitted product provenance, and `final_text` represents the human-approved clinical record

#### Scenario: Intermediate generations are not retained
- **WHEN** more than one generation succeeds before save
- **THEN** persistence stores only the latest successful baseline in `generated_text` and does not retain earlier drafts

#### Scenario: Cross-owner evolution association
- **WHEN** a user attempts to save an evolution against another user's patient
- **THEN** the system returns `404` and stores nothing

#### Scenario: Cross-owner evolution read
- **WHEN** a user requests an evolution owned by another user
- **THEN** the system returns `404`

#### Scenario: No update or delete contract
- **WHEN** a client inspects the clinical HTTP API
- **THEN** the system exposes no `PATCH` or `DELETE` operation for patients or evolutions in v0.1

### Requirement: Idempotent explicit save
The system MUST create an evolution only after an explicit save action and MUST treat the client-generated UUID as an idempotency key bound to the submitted content.

#### Scenario: First save
- **WHEN** the client submits a new UUID with ISO 8601 `evolution_at`, `raw_note`, `generated_text`, and non-empty `final_text`
- **THEN** the system creates and returns the evolution

#### Scenario: Identical retry
- **WHEN** the client retries the same UUID with identical content and owner
- **THEN** the system returns the existing evolution without creating a duplicate

#### Scenario: Conflicting retry
- **WHEN** the client reuses an existing UUID with different content
- **THEN** the system returns `409` and preserves the original evolution

#### Scenario: Generate does not save
- **WHEN** generation succeeds or fails
- **THEN** the system does not create or update an evolution

### Requirement: Ordered approved history
The system SHALL expose a read-only evolution history ordered by `evolution_at DESC, created_at DESC` and derive each list preview from the beginning of `final_text`.

#### Scenario: View patient history
- **WHEN** an authenticated user requests `GET /api/patients/{patient_id}/evolutions`
- **THEN** the system returns that owned patient's evolutions in the required descending order with clinical date and time plus final-text previews

#### Scenario: Clinical time is presented locally
- **WHEN** the frontend renders an evolution timestamp
- **THEN** it displays `evolution_at` in the intended local timezone rather than raw UTC by reusing existing browser or DynaChat behavior

#### Scenario: View evolution detail
- **WHEN** an authenticated user requests `GET /api/evolutions/{evolution_id}` for an owned evolution
- **THEN** the system returns the dated approved record without an edit or delete action

### Requirement: Server-owned generation inputs
The system SHALL accept only `patient_id` and `raw_note` as canonical generation inputs, SHALL require `1 <= len(raw_note.strip()) <= 40_000`, and SHALL load a bounded longitudinal context directly from PostgreSQL after verifying ownership.

#### Scenario: Empty source is rejected before generation
- **WHEN** `raw_note` is empty or whitespace-only
- **THEN** the backend returns `422` before loading history or calling the provider

#### Scenario: Oversized source is rejected without truncation
- **WHEN** `raw_note` contains more than 40,000 characters
- **THEN** the backend returns `422` before loading history or calling the provider and does not truncate, summarize, or compress the source

#### Scenario: Source at the boundary is accepted
- **WHEN** stripped `raw_note` contains between 1 and 40,000 characters inclusive
- **THEN** request validation accepts the source for the normal generation flow

#### Scenario: Context is loaded from approved records
- **WHEN** an owner requests generation for a patient
- **THEN** the system selects at most the three most recent approved evolutions by `evolution_at DESC, created_at DESC` and sends that window from oldest to newest

#### Scenario: Fewer than three approved records
- **WHEN** the owned patient has zero, one, or two approved evolutions
- **THEN** the system sends only those available `final_text` records and does not fill the window with other patient data

#### Scenario: Sensitive and draft data are excluded
- **WHEN** the system builds the model input
- **THEN** it includes only up to three prior `evolution_at` values and approved `final_text` records plus the current raw note, excluding the current clinical timestamp, RUT in raw, normalized or masked form, first name, last name, birth date, prior raw notes, and prior generated drafts

#### Scenario: Patient discovery is disconnected from generation
- **WHEN** patient search has returned a patient and the professional later requests generation by patient UUID
- **THEN** no search query, search result, RUT, name, or demographic field enters the OpenRouter payload

#### Scenario: Current timestamp stays outside the model task
- **WHEN** the backend builds the current generation request and prompt
- **THEN** neither contains the current `evolution_at`, and the response contains no date or time field

#### Scenario: Client-supplied history is not accepted
- **WHEN** a client attempts to supply patient history or patient context in the generation body
- **THEN** the canonical generation contract does not use that content

#### Scenario: No retrieval system is introduced
- **WHEN** the backend selects longitudinal context
- **THEN** it uses a fixed database limit and no RAG, embeddings, semantic search, or browser-provided history

#### Scenario: Generate for foreign patient
- **WHEN** a user requests generation for another user's patient
- **THEN** the system returns `404` before calling the model

### Requirement: Guarded clinical drafting
The system MUST use a fixed backend prompt that treats clinical input as untrusted data, assigns supported content to five simple clinical fields, leaves unsupported fields empty, and preserves the provenance and uncertainty of current facts.

#### Scenario: Historical fact is inactive
- **WHEN** a prior approved evolution mentions pain and the current note does not activate that fact
- **THEN** no generated clinical field states current pain

#### Scenario: Explicit historical reference is resolved
- **WHEN** the current note says `sigue ruido izquierdo` and approved history identifies the referenced left-side noise
- **THEN** the model may use that history only to resolve the explicit reference

#### Scenario: Uncertainty and attribution are preserved
- **WHEN** the current note contains `sospecha de quistes subcondrales`, `paciente refiere`, or an attribution to an otorhinolaryngologist
- **THEN** the appropriate generated field preserves the uncertainty and attribution without promoting either to professional certainty

#### Scenario: Ambiguous fragment is flagged
- **WHEN** the current note contains a fragment such as `ROM leve` that cannot be interpreted without assumption
- **THEN** all clinical fields exclude it and a review flag copies that source fragment literally with a reason

#### Scenario: Hostile embedded instruction
- **WHEN** a current note or prior evolution contains an instruction that conflicts with the system prompt
- **THEN** the system treats it as clinical data and does not follow it as an instruction

#### Scenario: Unsupported clinical content
- **WHEN** the current note contains no diagnosis, treatment, procedure, examination, improvement, worsening, or follow-up statement
- **THEN** the model does not add any such content and leaves the corresponding fields empty

#### Scenario: Treatment is absent
- **WHEN** the current note contains no treatment or conduct
- **THEN** the model returns `treatment=""`

#### Scenario: Suspicion remains an assessment
- **WHEN** the current note contains `sospecha de quistes subcondrales`
- **THEN** the model places it in `assessment` and retains the word `sospecha`

### Requirement: Structured recoverable generation
The system SHALL make one non-streaming OpenRouter call with the existing centralized client and `CHAT_MODEL`, request a JSON-schema response, and validate it with Pydantic before returning it.

#### Scenario: Valid structured response
- **WHEN** OpenRouter returns strings for `context`, `findings`, `assessment`, `treatment`, and `follow_up` plus a valid `review_flags` array
- **THEN** the backend returns those values and permits any clinical string to be empty without returning a model-authored date or time

#### Scenario: Fully ambiguous response is valid
- **WHEN** all five clinical strings are empty and `review_flags` contains at least one valid literal source fragment and reason
- **THEN** the backend returns the structured response without forcing fabricated clinical text

#### Scenario: Empty generation is recoverable
- **WHEN** all five clinical strings are empty and `review_flags` is also empty for a non-empty source note
- **THEN** the backend returns a recoverable generation error and persists nothing

#### Scenario: Invalid model response
- **WHEN** OpenRouter returns no response, invalid JSON, missing structured keys, invalid flags, or data outside the schema
- **THEN** the backend returns a recoverable generation error and does not persist data

#### Scenario: UI composes the visible draft
- **WHEN** the backend returns a valid structured response
- **THEN** the UI labels the five clinical fields, keeps review flags separate, and omits empty clinical sections when composing `generated_text` and `final_text`

#### Scenario: Valid flag-only generation is not yet saveable
- **WHEN** generation returns five empty clinical fields and one or more valid review flags
- **THEN** the UI opens the review workspace, displays the flags and an explanation, and keeps `Guardar evolucion` disabled until at least one clinical field contains meaningful text

#### Scenario: Chat boundaries remain intact
- **WHEN** the system generates a dental evolution
- **THEN** it uses no Chat tool loop, SSE, RAG, citation parser, conversation persistence, or Chat quota

### Requirement: Human review and non-destructive regeneration
The system SHALL require human review before save and SHALL preserve current work across generation and regeneration failures.

#### Scenario: Clinical timestamp defaults locally
- **WHEN** the professional opens the new evolution form
- **THEN** the client captures the current local date and time once as `evolution_at`, displays it as compact metadata, and does not require normal interaction with date or time controls

#### Scenario: Clinical timestamp can be changed progressively
- **WHEN** the professional selects `Cambiar fecha y hora`
- **THEN** the UI reveals native date and time controls, accepts a correction before save, and keeps the selected value stable through generation and regeneration

#### Scenario: Clinical timestamp remains editable during review
- **WHEN** the professional changes `evolution_at` while reviewing generated fields
- **THEN** the UI retains the draft, does not mark it stale, and does not require regeneration because the timestamp is outside the model contract

#### Scenario: Model cannot change date
- **WHEN** generation returns a structured draft
- **THEN** the UI retains its `evolution_at` and ignores any provider attempt to create or alter a date or time

#### Scenario: Quick note receives initial focus
- **WHEN** the new evolution route opens
- **THEN** focus enters the `Nota rapida` textarea and the UI explains that the professional may paste or type notes for the application to organize

#### Scenario: Paste does not trigger generation
- **WHEN** the professional pastes content into the quick-note textarea
- **THEN** the UI preserves the content and does not call the generation endpoint until the professional activates `Redactar evolucion`

#### Scenario: Keyboard shortcut requests generation
- **WHEN** a valid note has focus and the professional presses `Ctrl+Enter` or `Cmd+Enter`
- **THEN** the UI performs the same explicit generation action as `Redactar evolucion`

#### Scenario: Successful first generation
- **WHEN** the professional selects generate from `editing_raw`
- **THEN** the UI enters `generating`, keeps the clinical timestamp and raw note visible, prevents note edits until the request finishes, announces `Redactando evolucion...`, and copies the five returned clinical fields into the review editor on the same route

#### Scenario: New and review are one workspace
- **WHEN** generation transitions from `editing_raw` through `generating` to `reviewing`
- **THEN** the route remains `/patients/:patientId/evolutions/new`, the professional is not asked to fill the five fields before generation, and the generated fields become the primary working area

#### Scenario: Review flags remain separate
- **WHEN** generation returns review flags
- **THEN** the UI shows them together in a dedicated `Informacion por revisar` region immediately after all structured clinical content and does not append them automatically to `final_text`

#### Scenario: Correct note and regenerate
- **WHEN** the professional selects `Corregir nota y regenerar`
- **THEN** the UI returns to the raw note without deleting the current draft and exposes no separate `Editar nota` action

#### Scenario: Changed source makes the draft stale
- **WHEN** the professional changes `raw_note` after a successful generation
- **THEN** the UI marks the current draft as stale and makes `Guardar evolucion` unavailable until generation succeeds for the changed source

#### Scenario: Successful regeneration establishes the latest baseline
- **WHEN** regeneration succeeds for the changed source and any required replacement confirmation is accepted
- **THEN** the UI replaces `generated_text` with the new successful baseline, clears the stale state, and permits review and explicit save

#### Scenario: Regeneration without human edits
- **WHEN** the professional requests regeneration and the current clinical fields still match the generated baseline
- **THEN** the UI calls the provider without opening a replacement confirmation

#### Scenario: Confirm before replacing human edits
- **WHEN** the professional requests regeneration after editing the current clinical fields
- **THEN** the UI opens the existing replacement-confirmation dialog before starting any provider request

#### Scenario: Cancel replacement confirmation
- **WHEN** the professional selects `Cancelar` in the replacement-confirmation dialog
- **THEN** the UI performs no provider call and preserves the raw note, generated baseline, human edits, timestamp, flags, and current workspace state

#### Scenario: Confirm replacement regeneration
- **WHEN** the professional selects `Regenerar` in the replacement-confirmation dialog
- **THEN** the UI starts exactly one provider call and replaces the baseline and fields only after a valid response succeeds

#### Scenario: Failed regeneration
- **WHEN** regeneration fails
- **THEN** the UI preserves `evolution_at`, changed raw note, prior structured draft, human edits, and review state, keeps save unavailable while stale, and offers a retry

#### Scenario: Explicit save
- **WHEN** the professional approves the edited clinical fields and selects save
- **THEN** the UI submits the UUID created once by `crypto.randomUUID()` and enters `saving`

#### Scenario: Empty clinical record cannot be saved
- **WHEN** all five reviewed clinical fields are empty or compose a whitespace-only `final_text`
- **THEN** the UI keeps save unavailable and the backend independently returns `422` without creating an evolution row if a client submits the request

#### Scenario: Manual clinical completion enables save
- **WHEN** a flag-only generation left all five fields empty and the professional enters meaningful content in any clinical field
- **THEN** the UI enables explicit save without requiring regeneration

#### Scenario: Failed save preserves work
- **WHEN** an explicit save fails
- **THEN** the UI preserves `evolution_at`, the original note, every generated field, every human edit, and the review flags while offering a retry

### Requirement: Patient-first application shell
The system SHALL open authenticated users at `/patients`, keep Chat available at `/chat` and `/c/:conversationId`, and preserve `/admin`.

#### Scenario: Root redirect
- **WHEN** an authenticated user navigates to `/`
- **THEN** the application redirects to `/patients`

#### Scenario: Shared navigation
- **WHEN** an authenticated user views the application shell
- **THEN** the sidebar lists `Pacientes` before `Chat`

#### Scenario: Conversation visibility
- **WHEN** a patient route is active
- **THEN** the sidebar does not show the conversation list

#### Scenario: Existing Chat route
- **WHEN** a user navigates to `/chat` or `/c/:conversationId`
- **THEN** Chat retains its existing RAG, quota, streaming, citation, and persistence behavior

### Requirement: Spanish accessible patient experience
The system SHALL provide Spanish patient pages at `/patients`, `/patients/:patientId`, `/patients/:patientId/evolutions/new`, and `/patients/:patientId/evolutions/:evolutionId` by composing existing DynaChat layout, form, dialog, toast, token, focus, and responsive patterns before creating a new visual primitive.

#### Scenario: Patient list rather than dashboard
- **WHEN** a user opens `/patients`
- **THEN** the UI presents a searchable patient list and creation action without synthetic dashboard metrics

#### Scenario: Search states use one field
- **WHEN** patient search is loading, empty, or fails
- **THEN** the UI keeps one `Buscar por nombre o RUT` field and shows the repository-native skeleton, `No encontramos pacientes`, or a retryable Spanish error without exposing transport details

#### Scenario: Saved evolution feedback
- **WHEN** an evolution save succeeds
- **THEN** the UI returns to the patient detail, announces and toasts `Evolucion guardada`, and places the new record first according to history order

#### Scenario: In-progress action availability
- **WHEN** generation or save is in progress
- **THEN** the UI disables only the action currently running and communicates status with visible text and `aria-live`

#### Scenario: One dominant action per evolution state
- **WHEN** the new evolution workspace is in `editing_raw` or `reviewing`
- **THEN** it presents `Redactar evolucion` or `Guardar evolucion` respectively as the single primary action and keeps correction actions secondary and close to the content they affect

#### Scenario: Character feedback appears only near the source limit
- **WHEN** `raw_note` contains fewer than 35,000 characters
- **THEN** the new-evolution workspace shows no permanent character counter unless the existing DynaChat textarea pattern requires one

#### Scenario: Near-limit source feedback
- **WHEN** `raw_note` contains at least 35,000 and at most 40,000 characters
- **THEN** the UI shows the current character count against 40,000 near the textarea

#### Scenario: Over-limit pasted source remains recoverable
- **WHEN** pasted `raw_note` exceeds 40,000 characters
- **THEN** the UI preserves the pasted text, displays `La nota supera el limite de 40.000 caracteres. Reduce el contenido antes de continuar.`, and keeps `Redactar evolucion` unavailable

#### Scenario: Keyboard and responsive use
- **WHEN** the patient flow is used by keyboard or at a supported narrow viewport
- **THEN** focus rings, modal behavior, navigation, forms, alerts, and actions remain operable and readable

#### Scenario: Desktop visual contract
- **WHEN** each of the six patient screens is rendered at 1440 by 900 pixels
- **THEN** its layout, hierarchy, primary action, secondary actions, loading, empty, and error states match the corresponding Markdown wireframe in `design.md`

#### Scenario: Repository visual authority
- **WHEN** an implementing agent chooses a patient UI treatment
- **THEN** it first uses an existing DynaChat component, pattern, or token and introduces no new design system or UI framework

### Requirement: Synthetic clinical evaluation
The system SHALL include automated synthetic cases and a manual OpenRouter runner that use no real clinical information.

#### Scenario: Automated prompt safeguards
- **WHEN** the backend test suite runs
- **THEN** it checks prompt structure, required prohibitions, five optional clinical strings, treatment absence, preserved suspicion, approved-history limit and order, no persistence, and mandatory or forbidden terms in synthetic cases

#### Scenario: Manual evaluation runner
- **WHEN** a developer runs the clinical evaluation script manually
- **THEN** it prints the synthetic input, approved history, generated draft, and review flags for human review and is not part of CI

### Requirement: Production clinical data gate
The system MUST use synthetic data for development and evaluation and MUST control external clinical generation with `CLINICAL_EXTERNAL_LLM_ENABLED`, which defaults to `false` in production.

#### Scenario: Synthetic development generation
- **WHEN** development, automated tests, or manual evaluation explicitly enable external generation and use synthetic fixtures
- **THEN** the system permits the configured generation path without attempting to classify the text as real or synthetic

#### Scenario: Unapproved production use
- **WHEN** `CLINICAL_EXTERNAL_LLM_ENABLED=false`
- **THEN** the clinical service returns a safe unavailable response before assembling or sending the external provider request

#### Scenario: Production enablement requires approval
- **WHEN** production is prepared to set `CLINICAL_EXTERNAL_LLM_ENABLED=true`
- **THEN** privacy, contractual, logging, retention, deployment, and data-processing review must already have explicit approval

#### Scenario: Gate scope
- **WHEN** the production review is not yet approved and the flag remains disabled
- **THEN** patient directory, local persistence, synthetic development, and automated evaluation remain in scope while external production processing of real clinical data remains blocked

### Requirement: Clinical data logging prohibition
The system MUST reuse existing logging and MUST NOT write raw identity, patient search terms, or clinical content to logs at any level.

#### Scenario: RUT search is sanitized
- **WHEN** `POST /api/patients/search` receives a synthetic real-looking RUT and succeeds or fails
- **THEN** captured access, application, debug, and error logs omit the request term and raw RUT while recording only permitted operational metadata

#### Scenario: Provider failure is sanitized
- **WHEN** OpenRouter fails while generating an evolution
- **THEN** logs contain a sanitized error category and permitted operational metadata but no raw RUT, clinical field, previous evolution, or complete provider body

#### Scenario: Validation failure is sanitized
- **WHEN** request or Pydantic response validation fails
- **THEN** info, warning, error, and debug logs omit `raw_note`, `generated_text`, `final_text`, previous evolutions, raw RUT, `rut_number`, and `rut_dv`

#### Scenario: HTTP logs avoid clinical data
- **WHEN** a clinical HTTP request completes or fails
- **THEN** access and application logs may identify the operation and internal UUIDs but contain no RUT or clinical text in paths, query strings, messages, request bodies, or response bodies
