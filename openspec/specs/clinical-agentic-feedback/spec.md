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
The system SHALL render each clinical activity as a compact unboxed item whose icon follows structured status and whose label remains exact backend-provided text. Activity presentation SHALL NOT infer progress from labels. A separate clinical artifact lifecycle MAY render a semantic stepper only from persisted draft, approval, and canonical-result state.

#### Scenario: Activity is pending or running
- **WHEN** activity status is `pending` or `running`
- **THEN** the row shows the existing aria-hidden `Spinner` beside the exact label

#### Scenario: Activity completes, fails, or is declined
- **WHEN** activity reaches a terminal structured status
- **THEN** its existing completion, failure, or neutral-decline icon and tone render without changing the exact label

#### Scenario: Label resembles reasoning text
- **WHEN** an activity label contains words such as `pensando`, `analizando`, or any other arbitrary text
- **THEN** presentation uses only structured item type/status and performs no label substring inference

#### Scenario: No measured activity progress exists
- **WHEN** runtime exposes only discrete activity status
- **THEN** the activity list renders no percentage, progress bar, fabricated description, or activity-derived stepper; any clinical lifecycle stepper is driven only by persisted artifact state

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
The system SHALL preserve the native focus-managed confirmation dialog as the explicit human approval boundary while rendering its trigger/footer, saving state, canonical success, decline, and failure inside the same clinical artifact. It SHALL expose at most one dominant action and SHALL NOT render a separate prompt or terminal receipt.

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
- **THEN** the same artifact shows the existing neutral decline or unavailable message and no confirmation controls

#### Scenario: Approval is unavailable
- **WHEN** approval status is `failed`
- **THEN** the same artifact shows the existing neutral decline or unavailable message and no confirmation controls

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
The system MUST implement this polish through existing frontend primitives and MUST NOT widen application contracts.

#### Scenario: No shadcn configuration exists
- **WHEN** implementation preflight finds no `components.json`
- **THEN** it does not run shadcn initialization/add commands and adds no UI dependency

#### Scenario: Another change adds shadcn first
- **WHEN** current local tree later contains `components.json` or overlapping Clinical Assistant edits
- **THEN** implementation inspects and preserves newer work but still introduces no dependency or component migration solely for this change

#### Scenario: Presentation consumes runtime
- **WHEN** thinking, activity, artifact, or approval state renders
- **THEN** no backend, Whisper, SSE schema, clinical runtime type, API client, persistence, authentication, or database change is required

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
The transcript SHALL reconstruct the same artifact identity, clinical stage, content, contextual actions, and optional Drive state from live SSE or hydrated persisted actions without persisting a frontend-only view model.

#### Scenario: Thread refreshes
- **WHEN** a live or completed clinical thread is hydrated
- **THEN** it renders the same single artifact and no duplicate approval or result item

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
