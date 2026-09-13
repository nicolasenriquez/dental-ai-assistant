## MODIFIED Requirements

### Requirement: Structured activity presentation
The system SHALL render each clinical activity as a compact unboxed item whose icon follows structured status and whose label remains exact backend-provided text. Activity presentation SHALL NOT infer progress from labels. A separate clinical artifact lifecycle MAY render a semantic stepper only from persisted draft, approval, and canonical-result state.

#### Scenario: Activity is pending or running
- **WHEN** activity status is `pending` or `running`
- **THEN** the row shows the existing aria-hidden `Spinner` beside the exact label

#### Scenario: Activity completes, fails, or is declined
- **WHEN** activity reaches a terminal structured status
- **THEN** its existing completion, failure, or neutral-decline icon and tone render without changing the exact label

#### Scenario: Label resembles reasoning text
- **WHEN** an activity label contains arbitrary reasoning-like words
- **THEN** presentation uses only item type/status and performs no substring inference

#### Scenario: No measured activity progress exists
- **WHEN** runtime exposes only discrete activity status
- **THEN** the activity list renders no percentage, progress bar, fabricated description, or activity-derived stepper; any clinical lifecycle stepper is driven only by persisted artifact state

### Requirement: Assistant draft artifact hierarchy
The system SHALL present an assistant-mode evolution as one persistent artifact keyed by stable artifact/evolution identity. It SHALL compose provenance, draft content, confirmation boundary, canonical result, and optional Drive state without a duplicate standalone approval prompt or receipt, while preserving edit and regeneration behavior.

#### Scenario: Fresh or edited draft renders
- **WHEN** an assistant draft is available
- **THEN** the artifact shows `Evolución propuesta`, one quiet `Borrador asistido` provenance label, the correct lifecycle state, timestamp, fields, review flags, and one contextual next action

#### Scenario: Draft needs regeneration
- **WHEN** `stale=true`
- **THEN** the same artifact shows `Necesita regeneración` and preserves existing regenerate behavior

#### Scenario: Draft is prepared for approval
- **WHEN** the draft is valid and preparation is idle
- **THEN** `Preparar para guardar` advances the same artifact to review without persisting the evolution

#### Scenario: Manual artifact is rendered
- **WHEN** mode is `manual`
- **THEN** existing manual heading, fields, date/source controls, save behavior, and copy remain unchanged

### Requirement: Approval status hierarchy with preserved modal
The system SHALL preserve the native focus-managed confirmation dialog as the explicit human approval boundary while rendering its trigger/footer, saving state, canonical success, decline, and failure inside the same clinical artifact. It SHALL expose at most one dominant action and SHALL NOT render a separate prompt or terminal receipt.

#### Scenario: Approval awaits confirmation
- **WHEN** approval status is `pending`
- **THEN** the artifact footer exposes the review action and the dialog offers `Volver a editar` and `Guardar evolución` with `Requiere confirmación`

#### Scenario: Approval is auto-opened
- **WHEN** pending approval has `autoOpen=true`
- **THEN** the existing native modal opens through current focus management without rendering another prompt

#### Scenario: Save is running
- **WHEN** approval status is `running`
- **THEN** content remains visible, cancellation is prevented, actions are disabled, and exactly one saving spinner is shown

#### Scenario: Save completes
- **WHEN** approval status is `completed`
- **THEN** the same artifact becomes `Guardada`, removes approval controls, conditionally links `Ver en ficha` only when a resource ID exists, and presents Drive state separately

#### Scenario: Approval is declined or unavailable
- **WHEN** approval is `declined` or `failed`
- **THEN** the same artifact shows the existing neutral decline or unavailable message and no confirmation controls

### Requirement: Artifact progress is accessible and responsive
The artifact SHALL derive a non-interactive semantic `draft|review|saving|saved` lifecycle without persisting an `artifact_stage` field. Stage precedence is: locally in-flight resolve request means `saving`; otherwise a canonical approved result/evolution means `saved`; otherwise pending approval means `review`; otherwise an existing draft means `draft`. It SHALL announce independent Drive `pending|syncing|synced|failed|unknown` changes politely and remain usable at 390 pixels without horizontal overflow.

#### Scenario: Persisted objects overlap during hydration
- **WHEN** draft, approval, and canonical result data coexist
- **THEN** the precedence mapping yields one deterministic stage and creates no additional persisted stage field

#### Scenario: Drive remains in progress after save
- **WHEN** the canonical evolution is saved and Drive work continues
- **THEN** clinical progress remains `Guardada`, the composer is available, and Drive status is secondary

#### Scenario: Reduced motion is requested
- **WHEN** `prefers-reduced-motion: reduce` applies
- **THEN** artifact, connector, and status transitions are disabled without hiding state changes

## ADDED Requirements

### Requirement: Live and hydrated artifacts converge
The transcript SHALL reconstruct the same artifact identity, clinical stage, content, contextual actions, and optional Drive state from live SSE or hydrated persisted actions without persisting a frontend-only view model.

#### Scenario: Thread refreshes
- **WHEN** a live or completed clinical thread is hydrated
- **THEN** it renders the same single artifact and no duplicate approval or result item
