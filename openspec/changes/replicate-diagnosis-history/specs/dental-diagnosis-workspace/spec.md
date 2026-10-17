## ADDED Requirements

### Requirement: D1 Clinical mode and route continuity
The patient workspace SHALL add Spanish Historial navigation beside incumbent Diagnóstico and Evoluciones, with explicit tab=clinical/clinical=history and an optional safe date/dentition query. Refresh, new-tab arrival and back/forward SHALL agree with visible selection. Existing clinical record/evolution/legacy plan links and transition guards SHALL remain supported. No Treatment Plans or Appointments authoring/navigation SHALL be introduced by this change.

#### Scenario: Reload an exact historical date
- **WHEN** an authorized patient link with tab=clinical, clinical=history and at=2026-10-03 is opened or reloaded
- **THEN** Historial and that date are selected, no current Diagnosis editor is created and no unrelated Summary tab is shown.

#### Scenario: Dirty or uncertain work on departure
- **WHEN** the clinician leaves Diagnosis for History with an edited record, note draft or uncertain command
- **THEN** the incumbent save/discard/stay or reconciliation policy executes before unmount, canceled navigation retains the same work and no command identity is regenerated or silently lost.

#### Scenario: Existing evolution or plan evidence link
- **WHEN** an incumbent evolution path or legacy plan link with history=1 is opened
- **THEN** its original read/approval/evidence contract remains intact and it is not reinterpreted as the new temporal dental mode.

### Requirement: D2 Grouped diagnosis summary and retained chart behavior
Diagnosis SHALL retain current anatomical charts, 32 permanent/20 primary FDI pieces, twelve findings, all enabled incumbent procedure variants, eight categories and direct-application and edit/resolve semantics plus explicit deletion. The grouped records summary SHALL be an accessible accordion with unique filter-aware record counts, individual identities/surfaces/states and explicit incomplete-read status. Tool selection, category navigation, inspection and hover SHALL NOT write.

#### Scenario: Collapse without discarding context
- **WHEN** the grouped summary is collapsed and reopened while a note draft or inspection context exists
- **THEN** expanded state and title/count remain truthful and the draft/context are not recreated or reassigned.

#### Scenario: Filtered or incomplete record set
- **WHEN** dentition/status changes or a later record page fails
- **THEN** the summary uses the selected filters, distinguishes records/teeth/arches, and does not certify a partial page as a complete total.

#### Scenario: Direct and modal application remain distinct
- **WHEN** an active whole-tooth tool, direct occlusal surface or lateral surface tool is used
- **THEN** existing direct-apply/Confirmar semantics and retry-safe command identities remain, zero selected modal surfaces disable Confirmar and a saved-record edit still requires Guardar.

### Requirement: D3 Contextual notes through one owner
Diagnosis SHALL expose contextual notes from grouped records through the existing note hook/composer and rail/Sheet. Procedure notes SHALL bind to the actual procedure; finding entry SHALL be labelled as patient/optional-tooth context rather than a fabricated per-condition note collection. Counts, templates and revisions SHALL follow the existing note APIs; procedure-context writes SHALL obey deletion-design.md parent-lock and tombstone guards while general/tooth note policy remains unchanged. No new attachment or recall affordance SHALL be added.

#### Scenario: Two findings on one tooth
- **WHEN** either finding opens tooth-context notes
- **THEN** the label/count states the tooth scope without attributing the shared collection exclusively to that condition and the condition's embedded Notes field remains separate.

#### Scenario: Resize with a dirty note
- **WHEN** available width crosses the existing 1160px rail threshold
- **THEN** the rail/Sheet presents the same draft, binding, attempt and feed, restores focus on close and does not open IA or create another composer.

#### Scenario: Save error or revision conflict
- **WHEN** a note or saved clinical record save fails/conflicts
- **THEN** its draft and stable operation/revision context remain available for the existing retry/reconciliation flow without double save, auto-save or silent discard.

### Requirement: D4 Scoped motion and guarded overlay lifecycle
Dental controls SHALL implement the 150ms card/tooth/category and 200ms pulp/modal contracts defined in design.md, with explicit reduced-motion behavior and no new global UI timing. Read-only History SHALL not arm tool previews. Nested delete/dirty confirmations SHALL suspend the parent trap/popover; close gestures SHALL preserve busy/uncertain/dirty rules and record identity until exit completes.

#### Scenario: Surface selection then cancellation
- **WHEN** a surface modal is opened, M/O selected and cancellation allowed
- **THEN** drawings/chips/count agree, only the modal owns trapped focus, exit never shows tooth zero and focus returns to a connected trigger or stable fallback without a clinical write.

#### Scenario: Nested Escape consumption
- **WHEN** Escape cancels an allowed delete confirmation above a dirty record editor
- **THEN** only the top confirmation closes, its parent draft and underlying tool intent remain intact, focus returns to Eliminar and the event does not dismiss the parent.

#### Scenario: Reduced motion
- **WHEN** reduced motion is enabled while a card, tooth, date or modal is activated
- **THEN** translation/scale/decorative pulses are absent, state and focus feedback remain immediate and required controls stay operable.

#### Scenario: Narrow content and dock
- **WHEN** the patient pane is narrow, zoomed to 200% or resized with Notes/Assistant available
- **THEN** 44px targets and focus remain reachable, independent floating actions have at least 8px separation clear of the dock, labels remain inspectable and page-level horizontal overflow is absent.

## MODIFIED Requirements

### Requirement: W3 Reference application and recovery
Hover, focus and tool activation SHALL NOT persist clinical data. D03 anatomical activation SHALL commit according to the reference: whole-tooth click or direct occlusal surface click applies; lateral surface-tool activation opens a compact selector and Confirmar applies. Saved-record editing SHALL use explicit save with revision/conflict protections and explicit confirmed deletion.

#### Scenario: Lateral surface selection
- **WHEN** Caries is selected and the lateral view of tooth16 is activated
- **THEN** a compact anatomical surface modal opens; selecting M/O and Confirmar creates exactly one finding, clears tool intent and displays its receipt without an extra Guardar step.

#### Scenario: Occlusal direct application
- **WHEN** Caries is selected and surface M of tooth16 is activated
- **THEN** one M finding is applied directly, using a stable create identity, without an intermediate editor or confirmation added to this source path.

#### Scenario: Whole-tooth direct application
- **WHEN** Pulpitis or bracket is selected and tooth16 is activated
- **THEN** the appropriate finding/procedure is committed directly, a pending operation blocks duplicate activation and success clears the tool; Eliminar registro opens the explicit deletion confirmation and retains a deleted audit event rather than creating entered_in_error.

#### Scenario: Timeout and edit cancellation
- **WHEN** an application response is uncertain or a saved-record edit is dirty
- **THEN** the exact operation/draft remains recoverable, retry does not duplicate, and dirty edit navigation offers save/discard/remain without changing the successful create flow.

### Requirement: W8 Deep Module ownership and shared caller Seam
The workspace SHALL expose coherent small Interfaces for dental interaction, presentation, notes, explicit deletion and historical plan reads as defined in this change design and deletion-design. UI callers SHALL emit intent and render committed models without duplicating transport/retry, visual registries or lifecycle rules. Callers and behavior tests SHALL cross the same public Seam; backend commands SHALL accept persistence dependencies and preserve server ownership/transaction invariants.

#### Scenario: Public journey through one owner
- **WHEN** PatientDetail renders diagnosis and the clinician inspects, applies, retries and opens the note rail
- **THEN** the public workspace Modules own the resulting state and commands, each gesture has one command owner, and switching rail/Sheet retains one composer without a duplicate request or binding reset.

#### Scenario: Shared clinical rendering
- **WHEN** a variant appears in palette, chart, legend and record history
- **THEN** they resolve one clinical/visual registry and preserved historical aliases without contradictory labels, scope or marks.

### Requirement: W9 Verified retirement without historical loss
The implementation SHALL perform the expand→migrate→contract cleanup in this change design and deletion-design after all replacement consumers pass the integrated journey. Superseded lower create-editor, forced focus, geometry and parallel palette/rail paths SHALL have zero active consumers and be removed. Historical conditions/general notes, IDs, revisions, legacy correction revision reads, new deletion retry and accessibility SHALL remain supported. This change SHALL NOT drop historical schema or depend on destructive migration rollback.

#### Scenario: Retire old create interaction
- **WHEN** integrated replacement tests pass and the removal slice is verified
- **THEN** tooth activation has one mirror interaction, no Cambiar pieza/lower create editor or forced-scroll path remains, and source searches plus browser replay identify no live consumer of the retired handlers.

#### Scenario: Existing data after cleanup
- **WHEN** the patient with pre-change findings, corrections and general notes reloads after cleanup
- **THEN** original IDs/revisions/history and authorized deep links remain reachable alongside eligible observed procedures, retained read-only plan evidence and dental notes; no new plan authoring is introduced.

#### Scenario: Application rollback
- **WHEN** application code is rolled back after new clinical records were written
- **THEN** new tables/revisions/receipts remain intact, a deletion-aware reader/guard floor remains in use and recovery does not execute a destructive down migration.
