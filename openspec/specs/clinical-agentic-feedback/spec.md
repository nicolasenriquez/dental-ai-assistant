## Purpose

Deterministic, accessible presentation for the Clinical Assistant runtime: transient thinking feedback, structured activity rows, assistant-draft provenance and lifecycle, approval status hierarchy, and dependency-free scoped implementation over the existing transcript/component seam.

## Requirements

### Requirement: Protected voice-composer baseline
The system MUST preserve the shared voice-composer behavior established by commit `c2f27c2` while adding Clinical Assistant presentation polish.

#### Scenario: Textarea remains available during voice work
- **WHEN** Chat or Clinical Composer is requesting microphone permission, recording, stopping, or transcribing
- **THEN** its existing textarea remains visible and editable, submit remains blocked, and Clinical Composer patient controls remain blocked

#### Scenario: Voice lifecycle remains explicit
- **WHEN** dictation is recording
- **THEN** the composer keeps visible `Detener` and cancel controls, uses the real media stream for its existing waveform, and never auto-submits transcribed text

#### Scenario: Shared autosize remains bounded
- **WHEN** typed or transcribed content changes either composer textarea
- **THEN** both use the single existing `useAutosizeTextarea`, grow to at most 144 px, and use internal vertical scrolling beyond the cap

### Requirement: Transient thinking feedback
The system SHALL show a transient accessible `Pensando…` status only between an accepted clinical user submission and the first structured response item.

#### Scenario: User submission awaits first response
- **WHEN** `ClinicalTranscript` is busy and its latest item is type `user`
- **THEN** it renders `Pensando…` after mapped turn groups inside the transcript stack with `role="status"`, `aria-live="polite"`, and accessible label `El asistente está preparando una respuesta`

#### Scenario: First structured item arrives
- **WHEN** latest item becomes activity, assistant, draft, approval, result, or error
- **THEN** `Pensando…` is absent even if transcript remains busy

#### Scenario: Runtime is not busy
- **WHEN** latest item is user but transcript is not busy
- **THEN** `Pensando…` is absent

#### Scenario: Thinking motion is allowed
- **WHEN** user has not requested reduced motion and thinking is visible
- **THEN** only the `Pensando…` text uses a subtle dedicated shimmer with no spinner, progress bar, skeleton, glow, or pulse

#### Scenario: Reduced motion is requested
- **WHEN** `prefers-reduced-motion: reduce` applies
- **THEN** thinking text remains readable in a static secondary color with shimmer animation and clipping removed

### Requirement: Structured activity presentation
The system SHALL classify model-tool execution through one runtime-owned `TOOL_PRESENTATION_POLICY` using finite classes `silent`, `progress`, `artifact`, and `human_gate`; `background` SHALL describe existing non-tool domain lifecycle. Quiet behavior SHALL mean the mapped class is `silent`; no separate quiet-tool set or label/output inference SHALL exist. It SHALL render visible clinical activity as compact unboxed items driven by structured status and domain-semantic labels, SHALL NOT infer progress from labels, and SHALL NOT expose raw tool names, arguments, provider operations, loop iterations, percentages without measured progress, or hidden reasoning. The V1 policy SHALL map `lookup_dental_terms` to `silent`, `get_recent_evolutions` to `progress`, `create_evolution_draft` and `update_evolution_draft` to `artifact`, and `prepare_evolution_save` to `human_gate`. Existing post-save Drive export SHALL remain secondary `background` domain state outside that model-tool map.

#### Scenario: Silent terminology work executes
- **WHEN** `lookup_dental_terms` starts, succeeds, or returns no authoritative match
- **THEN** no activity row or generic completion message is created, while material ambiguity may use the existing assistant-message path

#### Scenario: Patient history retrieval is perceptible
- **WHEN** `get_recent_evolutions` has actually started and remains pending while the clinician waits
- **THEN** at most one activity uses truthful domain text such as `Revisando antecedentes…` and no raw tool name or fabricated percentage

#### Scenario: Draft work is perceptible
- **WHEN** `create_evolution_draft` or `update_evolution_draft` has actually started and remains pending
- **THEN** compact activity may use `Preparando evolución…` until the artifact is available

#### Scenario: Artifact or gate becomes available
- **WHEN** draft activity produces an artifact or save preparation produces the existing approval gate
- **THEN** artifact or approval becomes primary and completed activity collapses to a compact summary or disappears

#### Scenario: Short response needs no progress chrome
- **WHEN** a turn completes without a perceptible `progress` or `artifact` operation
- **THEN** transcript adds no unnecessary activity card or competing loader

#### Scenario: Activity terminal status renders
- **WHEN** visible activity completes, fails, or is declined before a durable artifact replaces it
- **THEN** its existing structured completion, failure, or neutral-decline icon and tone render without label substring inference

#### Scenario: Drive remains secondary background state
- **WHEN** canonical save is complete and existing Drive export remains pending, syncing, synced, or failed
- **THEN** Drive state remains attached to the clinical artifact and does not become model-tool activity or a contextless toast

### Requirement: Assistant draft artifact hierarchy
The system SHALL present an assistant-mode evolution as one persistent visible `ClinicalEvolutionArtifact` keyed by stable artifact/evolution identity. It SHALL be the only spatial representation of that evolution and preserve its React key, transcript position, patient context, semantic heading, accessible label, content container, and identity while composing provenance, confirmation, canonical result, and optional Drive state. Wrapping separately visible draft, approval, and result cards does not satisfy this requirement.

#### Scenario: Fresh or edited draft renders
- **WHEN** an assistant draft is available
- **THEN** the artifact shows `Evolución clínica`, patient/date context, one quiet draft/provenance status, content, source, review flags, optional `Regenerar`, and primary `Revisar y guardar`

#### Scenario: Assistant draft is stale
- **WHEN** `stale=true`
- **THEN** lifecycle description is `Necesita regeneración`, existing stale warning remains visible, and regenerate behavior remains unchanged

#### Scenario: Draft is prepared for approval
- **WHEN** the draft is valid and preparation is idle
- **THEN** `Revisar y guardar` advances the same artifact to review without persisting the evolution

#### Scenario: Lifecycle transitions or rehydrates
- **WHEN** the evolution moves through draft, review, saving, saved, refresh, navigation, return-to-edit, reconnect, retry, or verification
- **THEN** no separate draft, approval, or canonical-result card represents it simultaneously

#### Scenario: Manual artifact is rendered
- **WHEN** `EvolutionReviewArtifact` mode is `manual`
- **THEN** existing manual heading, fields, date/source controls, save behavior, and copy remain unchanged

### Requirement: Approval status hierarchy with preserved modal
The system SHALL preserve the native focus-managed confirmation dialog as the explicit human approval boundary while rendering its trigger/footer, saving state, canonical success, decline, and failure inside the same clinical artifact. It SHALL expose at most one dominant action and SHALL NOT render a separate prompt or terminal receipt. Initial auto-opening SHALL NOT remove permanent review triggers. Failure presentation SHALL distinguish canonical failure/expiration from an unverified transport outcome and offer only state-safe recovery.

#### Scenario: Approval awaits confirmation
- **WHEN** approval status is `pending`
- **THEN** the artifact footer exposes primary `Confirmar guardado`, secondary `Seguir editando`, and copy in overflow; confirmation opens the existing dialog with `Volver a editar` and `Guardar evolución`

#### Scenario: Approval is auto-opened
- **WHEN** pending approval has `autoOpen=true`
- **THEN** existing native modal opens through its current focus-managed behavior without rendering a duplicate prompt

#### Scenario: Save is running
- **WHEN** approval status is `running`
- **THEN** content remains visible, cancellation is prevented, actions are disabled, and exactly one saving spinner is shown

#### Scenario: Save completes
- **WHEN** approval status is `completed`
- **THEN** the same artifact becomes `Guardada`, removes approval controls, conditionally exposes primary `Ver en ficha`, keeps infrequent actions in overflow, and presents Drive state separately without a success receipt

#### Scenario: Approval is declined
- **WHEN** approval status is `declined`
- **THEN** the same artifact shows the existing neutral decline or unavailable message and no confirmation or recovery-to-draft controls

#### Scenario: Approval is unavailable
- **WHEN** authoritative state confirms save failure or expiration
- **THEN** the same artifact labels that outcome accurately, preserves content, removes the old confirmation controls, and offers explicit draft recovery only when the backend recovery contract permits it

#### Scenario: Approval dialog is dismissed
- **WHEN** a pending auto-opened dialog closes through Escape, its close control or return to review
- **THEN** closing does not approve, decline or discard; visible confirmation/edit triggers remain, focus returns to a connected trigger, and the dialog can be reopened without a reload or automatic reopening loop

#### Scenario: Resolve outcome is uncertain
- **WHEN** a save request loses its authoritative response
- **THEN** the artifact offers verification and hydrates canonical state before offering another write; a failed verification retains content and does not label the action expired

### Requirement: Artifact progress is accessible and responsive
The artifact SHALL derive a non-interactive semantic `draft|review|saving|saved` lifecycle without persisting an `artifact_stage` field. Stage precedence is: locally in-flight resolve request means `saving`; otherwise a canonical approved result/evolution means `saved`; otherwise pending approval means `review`; otherwise an existing draft means `draft`. The visual lifecycle has only `Borrador`, `Revisión`, and `Guardada`; saving replaces the last label with `Guardando…` and one inline spinner. It SHALL announce independent Drive changes politely and remain usable at 390 pixels without horizontal overflow.

#### Scenario: Persisted objects overlap during hydration
- **WHEN** draft, approval, and canonical result data coexist
- **THEN** the precedence mapping yields one deterministic stage and creates no additional persisted stage field

#### Scenario: Drive remains in progress after save
- **WHEN** the canonical evolution is saved and Drive work continues
- **THEN** clinical progress remains `Guardada`, the composer is available, and Drive status is secondary

#### Scenario: Drive state renders
- **WHEN** Drive is pending, syncing, synced, known failed, connection-required, or unknown
- **THEN** it shows the copy and state-safe action defined in `design.md`; reconnect is derived only from `failed + DRIVE_CONNECTION_REQUIRED`, not a new `DriveExportState.status`, while other safe failed states use `Reintentar` and unknown uses `Verificar`

#### Scenario: Reduced motion is requested
- **WHEN** `prefers-reduced-motion: reduce` applies
- **THEN** artifact, connector, and status transitions are disabled without hiding state changes

### Requirement: Scoped dependency-free presentation
The system MUST implement Clinical Assistant presentation through existing frontend primitives and MUST NOT widen application contracts except for the explicitly approved canonical approval recovery operation. That extension MUST preserve generic frozen-artifact checks, owner scope, human approval, existing SSE and persistence/export boundaries and MUST NOT introduce a new UI dependency, runtime framework or schema migration without separate authorization.

#### Scenario: No shadcn configuration exists
- **WHEN** implementation preflight finds no `components.json`
- **THEN** it does not run shadcn initialization/add commands and adds no UI dependency

#### Scenario: Another change adds shadcn first
- **WHEN** current local tree later contains `components.json` or overlapping Clinical Assistant edits
- **THEN** implementation inspects and preserves newer work but still introduces no dependency or component migration solely for this change

#### Scenario: Presentation consumes runtime
- **WHEN** thinking, activity, artifact, or approval state renders
- **THEN** it consumes the existing typed runtime and retains Whisper, SSE schema, authentication and database contracts; only the separately specified recovery operation requires a new backend route/service/repository/client path

### Requirement: Deterministic accessible validation
The system SHALL prove changed behavior at component and mocked browser seams and SHALL approve visual baselines only after deterministic Linux review.

#### Scenario: Component contracts run
- **WHEN** focused Vitest executes
- **THEN** thinking entry/exit, every activity status, draft hierarchy/action, every approval status, one saving spinner, terminal control removal, and conditional resource link are directly asserted

#### Scenario: Voice regression suite runs
- **WHEN** presentation changes are complete
- **THEN** existing ChatInput, ClinicalComposer, VoiceDictationStatus, VoiceWaveform, and autosize tests pass unchanged or any introduced regression is fixed without rebuilding voice architecture

#### Scenario: Clinical browser flow runs
- **WHEN** mocked clinical Playwright exercises a synthetic turn
- **THEN** it observes user submission, thinking, running/completed activity, draft, preparation, modal confirmation, saving, and completion without real clinical writes or data

#### Scenario: Visual comparison initially fails
- **WHEN** clinical Playwright reports snapshot differences
- **THEN** no snapshot is updated before expected/actual/diff inspection, desktop 1440x1000 and mobile 390x844 review, accessibility tree review, and console/network checks

#### Scenario: Intentional visual change is approved
- **WHEN** a specific Linux snapshot difference matches reviewed scope
- **THEN** only that Linux snapshot is updated and clinical Playwright is rerun; Windows and unrelated ARIA snapshots are not mass-refreshed

#### Scenario: Existing unrelated failure occurs
- **WHEN** full validation fails in unrelated code
- **THEN** implementation records it as pre-existing only after reproducing it on starting SHA and does not modify unrelated modules

### Requirement: Live and hydrated artifacts converge
The transcript SHALL reconstruct the same artifact identity, clinical stage, content, contextual actions, and optional Drive state from live SSE or authoritative persisted thread hydration without persisting a frontend-only view model. Every clinical stream termination path, including clean EOF, abort, component remount, reload, and unexpected reader/network failure, SHALL hydrate existing thread state before declaring failure or offering retry. Subscriber loss SHALL NOT implicitly cancel detached server work.

#### Scenario: Thread refreshes
- **WHEN** a live or completed clinical thread is hydrated
- **THEN** it renders the same single artifact and no duplicate approval or result item

#### Scenario: Stream ends without final event
- **WHEN** SSE closes after the server persisted a message, artifact, action, or terminal outcome but client missed the final event
- **THEN** thread hydration reconstructs persisted state and selects the corresponding existing runtime state

#### Scenario: Reader reports transport failure
- **WHEN** a network or SSE reader error occurs
- **THEN** client first hydrates thread state and renders persisted completion or failure instead of immediately offering duplicate retry

#### Scenario: Persisted turn remains active
- **WHEN** hydration finds the same active turn still running after subscriber loss
- **THEN** existing active-turn polling continues until persisted terminal state becomes available

#### Scenario: Component unmounts during execution
- **WHEN** Clinical Assistant unmounts or its reader aborts without explicit Stop
- **THEN** detached server work continues and later mount or reload reconstructs persisted messages, artifacts, actions, and outcome

#### Scenario: Ephemeral activity is unavailable after hydration
- **WHEN** interruption or reload loses transient activity rows
- **THEN** durable semantic results render coherently without event replay, cursor, heartbeat, persisted activity log, or new runtime state model

### Requirement: Transcript scrolling preserves reading intent
The clinical transcript SHALL preserve stable row identity, streaming anchoring, hydration/restoration, large-artifact stability, and a keyboard-accessible `Ir al final` control without changing reducer ownership or persisting backend scroll state.

#### Scenario: User reads earlier content during streaming
- **WHEN** new tokens or artifact state arrive while the viewport is away from the latest turn
- **THEN** the transcript does not force-scroll and offers `Ir al final`

#### Scenario: Focused scroller primitive is evaluated
- **WHEN** implementation considers replacing custom scrolling
- **THEN** the existing reducer remains message-state authority, the primitive owns scrolling only, and focused tests must prove equivalent streaming, hydration, keyboard, and restoration behavior before adoption

### Requirement: Visual refinement preserves the incumbent system
The clinical artifact SHALL use existing typography and color tokens, subtle borders, low elevation, and 120–180 ms non-layout transitions. Strong shadows remain limited to overlays/floating controls, unknown/reconnect uses attention color, red is reserved for real errors, and reduced motion removes optional transforms/crossfades without changing focus or scroll behavior.

#### Scenario: Focused UI primitive needs a package
- **WHEN** an inspected primitive would add frontend files or dependencies
- **THEN** it may be adopted only under the documented dependency gate, only when used by this change, and never as a theme, framework, state, styling, animation, provider, or runtime replacement

### Requirement: Clinical artifact uses an inline content-first grammar
`ClinicalEvolutionArtifact` SHALL be the only high-emphasis structured surface for one clinical job and SHALL behave as an inline document-like work artifact in the assistant reading column. Clinical content MUST dominate state, primary action, secondary metadata, and container decoration. Assistant prose MUST remain conversational, and operational activity MUST remain unboxed or artifact-integrated.

#### Scenario: Artifact renders its internal hierarchy
- **WHEN** draft, review, saving, saved, provenance, or Drive information is visible
- **THEN** one low-chrome container orders title/state, compact patient/date metadata, optional lifecycle, clinical body, optional provenance, optional Drive row, and actions without nested metadata, source, Drive, lifecycle, or footer cards

#### Scenario: Assistant explains the artifact
- **WHEN** assistant prose appears before or after a clinical artifact
- **THEN** the prose remains in the shared reading column without an automatic card wrapper or duplicate artifact padding

### Requirement: Artifact actions and terminal states stay quiet
The artifact SHALL expose at most one filled primary action, keep secondary actions accessible through existing quieter treatments, retain visible recovery actions, and remove all actions and overflow while saving. Saving and canonical success MUST update the same mounted artifact without replacing content, moving transcript position, creating peer cards, or using full-card semantic-color fills.

#### Scenario: Saving begins
- **WHEN** the resolve request is locally in flight
- **THEN** the artifact preserves its body and geometry, shows compact inline progress, and renders no actionable or disabled footer collection

#### Scenario: Canonical save completes
- **WHEN** the canonical evolution is saved
- **THEN** the same artifact becomes visually calmer with small success text/icon, no celebratory receipt, and Drive as one compact secondary row

#### Scenario: Secondary utilities are revealed
- **WHEN** pointer hover or keyboard focus enters the artifact
- **THEN** utilities may gain emphasis, but primary and required recovery actions remain visible and no capability is hover-only

### Requirement: Artifact density adapts without changing workflow
The lifecycle SHALL remain semantic, non-interactive, and subordinate to content. Desktop and mobile layouts SHALL use existing spacing and width tokens, avoid duplicate wrapper padding and horizontal overflow, and preserve stable scroll geometry. Mobile may stack a full-width primary action over quieter secondary controls.

#### Scenario: Compact lifecycle treatment is evaluated
- **WHEN** the bounded visual pass compares three-stage and title/status-only presentation
- **THEN** either may be selected only when accessible stage meaning, stage derivation, artifact identity, saving, and approval behavior remain unchanged

#### Scenario: Reduced motion applies
- **WHEN** artifact state changes under reduced-motion preference
- **THEN** status remains immediately readable, focus and announcements persist, and no information depends on transition, transform, or layout animation

#### Scenario: Historical collapse is evaluated
- **WHEN** primary density work is complete and an older saved artifact is manually collapsed
- **THEN** current/newly saved artifacts remain expanded, collapse state stays frontend-local, internal sections remain non-collapsible, and clinical state and focus remain stable

### Requirement: Unapplied artifact edits survive internal navigation
Assistant field and source-note edit buffers SHALL have one authenticated-memory owner keyed by thread, artifact and edit target. Applying SHALL use the existing draft-update path; unsubmitted buffer text SHALL NOT become approved or canonical evolution content. Explicit cancel/discard SHALL abandon only the selected edit. Dirty guards and unload protection SHALL include these buffers.

#### Scenario: Navigate and return before Apply
- **WHEN** a clinician edits a field or source note without applying and visits Pending Work, another thread, or the ficha before returning
- **THEN** the same artifact/target retains its buffer and editing state, or navigation first requires conscious discard; silent loss is forbidden

#### Scenario: Apply or cancel
- **WHEN** the clinician applies the buffer or explicitly cancels it
- **THEN** Apply retains the buffer until the update succeeds and Cancel leaves the persisted draft unchanged, with useful focus restoration

#### Scenario: Pending update or changed server draft
- **WHEN** navigation, hydration or a newer canonical draft arrives while an edit or its update is unresolved
- **THEN** local text is retained and the UI requires reconciliation rather than silently replacing newer server data with an old buffer

#### Scenario: Memory lifetime
- **WHEN** the user logs out or confirms a dirty hard reload
- **THEN** unapplied text is cleared with authenticated memory and is not recovered from localStorage, sessionStorage or IndexedDB

### Requirement: Historical patient identity belongs to the artifact
An artifact SHALL render its historical patient from existing owner-scoped artifact/action data, independently of the workspace selector. Identity SHALL use masked identifiers and SHALL NOT substitute the active patient for a different historical patient.

#### Scenario: Workspace changes or clears patient
- **WHEN** artifact A is displayed while workspace patient becomes B or null
- **THEN** A retains its historical patient, content and destination in draft, review and saved states

#### Scenario: Historical identity is unavailable
- **WHEN** the owned historical-patient read is missing or fails
- **THEN** the artifact labels identity unavailable, retains its content, blocks new preparation/confirmation until identity is resolved, and never describes the artifact as a patient-less consultation or substitutes another patient

### Requirement: Explicit canonical approval recovery
The backend SHALL expose an authenticated owner-scoped operation to recover retained draft content after canonical approval failure or expiration without approving, preparing a save, persisting an evolution or triggering Drive export. Recovery SHALL preserve terminal action identity, status, hash and timestamps. Approved or declined actions SHALL NOT be reopened. Generic artifact update, regeneration and save preparation SHALL continue rejecting terminal failed artifacts until this operation explicitly restores draft status.

#### Scenario: Recover a known failed or expired approval
- **WHEN** the latest action for an owned artifact is canonically failed or expired, the artifact is failed with the expected version, retained content is valid, no approved result exists and no conflicting work is active
- **THEN** recovery restores that same artifact to draft without changing its patient or content, preserves the terminal action, and requires a fresh prepared action and explicit human approval before a save

#### Scenario: Save already committed
- **WHEN** authoritative action history identifies an approved evolution for the artifact
- **THEN** recovery returns the exact saved identity for display without reopening the artifact, creating another approval, repeating a clinical write or retrying export

#### Scenario: Ineligible or inaccessible source
- **WHEN** an action is declined or still pending, has no valid retained artifact, is superseded, or conflicts with a newer artifact version or active work
- **THEN** recovery rejects without changing content, actions or clinical data and the UI offers authoritative reread
- **WHEN** action, thread, artifact or patient belongs to another owner
- **THEN** recovery returns 404 without disclosing metadata or existence

#### Scenario: Duplicate recovery and later edits
- **WHEN** identical recovery requests race or a successful recovery response is lost
- **THEN** they restore at most one draft; subsequent recovery of an already restored current artifact returns its current identity without overwriting later edits

#### Scenario: Old recovery after a new approval
- **WHEN** an earlier failed action is used for recovery after a newer approval/action exists for the same artifact
- **THEN** the old operation cannot reset the new review, saving, failed or saved state; an approved result is displayed, otherwise a conflict requires reread

#### Scenario: Concurrent save or unavailable database
- **WHEN** recovery cannot acquire the required lifecycle locks or cannot establish authoritative state
- **THEN** no partial recovery commits, no write is retried automatically, and the client verifies state before attempting recovery again

#### Scenario: Fresh approval and Drive separation
- **WHEN** a recovered draft is reviewed, freshly prepared and explicitly approved
- **THEN** existing hash/revision/idempotent save protections apply, the old action stays terminal, and a subsequent failed or unknown Drive export does not undo the saved evolution
