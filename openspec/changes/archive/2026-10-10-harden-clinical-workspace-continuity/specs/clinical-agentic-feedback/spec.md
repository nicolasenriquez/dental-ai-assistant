## MODIFIED Requirements

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

## ADDED Requirements

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
