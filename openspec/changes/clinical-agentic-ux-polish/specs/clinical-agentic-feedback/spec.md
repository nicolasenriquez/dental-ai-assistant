## ADDED Requirements

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
The system SHALL render each clinical activity as a compact unboxed item whose icon follows structured status and whose label remains exact backend-provided text.

#### Scenario: Activity is pending or running
- **WHEN** activity status is `pending` or `running`
- **THEN** the row shows the existing aria-hidden `Spinner` beside the exact label

#### Scenario: Activity completes
- **WHEN** activity status is `completed`
- **THEN** the row shows an aria-hidden completion icon beside the exact label

#### Scenario: Activity fails
- **WHEN** activity status is `failed`
- **THEN** the row shows an aria-hidden failure icon and stronger error tone beside the exact label

#### Scenario: Activity is declined
- **WHEN** activity status is `declined`
- **THEN** the row shows an aria-hidden terminal icon without presenting intentional decline as a destructive failure and preserves the exact label

#### Scenario: Label resembles reasoning text
- **WHEN** an activity label contains words such as `pensando`, `analizando`, or any other arbitrary text
- **THEN** presentation uses only structured item type/status and performs no label substring inference

#### Scenario: No measured progress exists
- **WHEN** runtime exposes only discrete activity status
- **THEN** UI renders no percentage, progress bar, synthetic stepper, or fabricated activity description

### Requirement: Assistant draft artifact hierarchy
The system SHALL present assistant-mode clinical drafts as one review artifact with distinct provenance, lifecycle description, content, and next action while preserving all edit and regeneration behavior.

#### Scenario: Fresh assistant draft
- **WHEN** assistant artifact is neither stale nor edited
- **THEN** heading shows `Evolución propuesta`, lifecycle description `No guardada`, quiet badge `Borrador asistido`, existing timestamp, fields, and review-flag count

#### Scenario: Assistant draft is edited
- **WHEN** `edited=true` and `stale=false`
- **THEN** lifecycle description is `Editada` and provenance badge remains `Borrador asistido`

#### Scenario: Assistant draft is stale
- **WHEN** `stale=true`
- **THEN** lifecycle description is `Necesita regeneración`, existing stale warning remains visible, and regenerate behavior remains unchanged

#### Scenario: Draft is ready for approval preparation
- **WHEN** draft is non-empty, no field edit is active, and preparation is idle
- **THEN** primary transition is visibly labelled `Preparar para guardar` and invokes existing prepare callback without directly persisting an evolution

#### Scenario: Manual artifact is rendered
- **WHEN** `EvolutionReviewArtifact` mode is `manual`
- **THEN** existing manual heading, fields, date/source controls, save behavior, and copy remain unchanged

### Requirement: Approval status hierarchy with preserved modal
The system SHALL preserve the current approval prompt and native modal interaction while presenting one deterministic status per approval state.

#### Scenario: Approval awaits confirmation
- **WHEN** approval status is `pending`
- **THEN** existing `Guardado pendiente` prompt and `Confirmar guardado` dialog remain, dialog shows quiet `Requiere confirmación` badge, and actions are `Volver a editar` and `Guardar evolución`

#### Scenario: Approval is auto-opened
- **WHEN** pending approval has `autoOpen=true`
- **THEN** existing native modal opens through its current focus-managed behavior without rendering a duplicate prompt

#### Scenario: Save is running
- **WHEN** approval status is `running`
- **THEN** dialog remains open, cancellation is prevented, actions are disabled, badge shows one spinner with `Guardando`, and primary button shows `Guardando…` without a second spinner

#### Scenario: Save completes with resource
- **WHEN** approval status is `completed` and `result_resource_id` exists
- **THEN** approval controls and dialog are absent, receipt shows `Evolución guardada`, quiet `Guardada` status, existing patient/date context, and `Ver en ficha` link to exact resource

#### Scenario: Save completes without resource
- **WHEN** approval status is `completed` and `result_resource_id` is absent
- **THEN** completion remains visible and accessible without constructing a route containing a missing resource ID

#### Scenario: Approval is declined
- **WHEN** approval status is `declined`
- **THEN** dialog and approval controls are absent, neutral terminal presentation shows `Descartada` and `No se realizaron cambios.` without destructive error emphasis

#### Scenario: Approval is unavailable
- **WHEN** approval status is `failed`
- **THEN** dialog and approval controls are absent and error presentation shows `No disponible` and `Esta confirmación expiró o ya no puede recuperarse.`

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
