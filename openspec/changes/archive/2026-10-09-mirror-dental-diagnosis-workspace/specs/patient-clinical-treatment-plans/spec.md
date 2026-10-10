## ADDED Requirements

### Requirement: P1 Atomic draft plan authoring
The clinician SHALL create and resume patient-owned draft plans, add variant-aware planned procedures with one initial execution stage, order items, and edit/add pending stages while the reference permits editing; completed stages remain immutable. A treatment SHALL belong to at most one plan item. Titles, notes, anatomy and stages SHALL follow design.md limits.

#### Scenario: Add scoped procedure
- **WHEN** a bridge variant and valid teeth/roles are saved into a draft plan
- **THEN** the treatment, members, plan item, initial stage, aggregate revision and command receipt commit together or none commit.

#### Scenario: Reload draft
- **WHEN** a saved plan is reopened after browser reload
- **THEN** its item order, variants, anatomical scope, notes and stages are unchanged and no new plan is created.

### Requirement: P2 Explicit clinical confirmation and acceptance
Plans SHALL transition draft→pending through Confirmar and pending→active through Registrar aceptación; pending→draft SHALL allow revision before reconfirmation. Acceptance SHALL record actor/time and optional note as a clinician-entered event without claiming financial approval or consent signature. Clinical corrections SHALL preserve history without inventing extra plan transitions.

#### Scenario: Confirm empty plan
- **WHEN** Confirmar is requested for a plan with no eligible items or invalid stages
- **THEN**409 is returned and the plan remains draft.

#### Scenario: Accept pending plan
- **WHEN** the clinician explicitly records acceptance of a pending plan at its current revision
- **THEN** the plan becomes active with actor/time, no budget, appointment, payment or outgoing message is created, and execution actions become available.

### Requirement: P3 Staged execution and truthful completion
Only active plans SHALL execute pending stages. Completing/cancelling stages SHALL atomically update stage, item, therapeutic record, plan revision and history. Executed evidence SHALL remain immutable. Final item completion SHALL automatically complete an active plan only when every item is completed, matching the reference; cancelled items stay in the total and prevent auto-completion.

#### Scenario: Multi-stage procedure
- **WHEN** one of two pending stages is completed
- **THEN** the procedure remains planned and the UI shows one stage completed; only after no pending stage remains and at least one completed stage exists does it become performed with explicit completed-stage evidence.

#### Scenario: Partial execution
- **WHEN** one stage is completed and the final pending stage is cancelled
- **THEN** the item finalizes as completed with its performed evidence listing only completed stages; cancelled stages remain visible without an invented required partial_execution state.

#### Scenario: Automatic completion
- **WHEN** the last item of an active plan becomes completed and all items are completed
- **THEN** the plan becomes completed in the same clinical transaction, with history and source completion feedback; no extra Completar plan step is introduced.

#### Scenario: All work cancelled
- **WHEN** every item has only cancelled stages
- **THEN** the system offers clinical closure, shows no fabricated100% completed state and does not auto-complete the plan.

#### Scenario: Item shortcut advances next pending session
- **WHEN** an active two-session item with zero completed sessions invokes its item-level completion action
- **THEN** only its first pending session becomes completed, the item remains pending at1/2 and a second deliberate action is required for remaining work; the UI explains Completar siguiente sesión rather than promising the entire item is completed.

#### Scenario: Optional treatment note on execution
- **WHEN** a clinician confirms session completion with explicit optional clinical-note text
- **THEN** completion and a treatment-owned note commit atomically under one operation receipt; a failed note write rolls back both and an exact retry creates neither duplicate execution nor duplicate note.

### Requirement: P4 Closure reopening and archival
Draft/pending/active plans SHALL close with a source closure reason including expired; pending plans SHALL Reabrir to draft and closed plans SHALL Reactivar to draft. Completed plans SHALL archive to a read-only state and SHALL NOT reopen to draft. Prior closure/clinical history SHALL remain in revisions.

#### Scenario: Source reopening states
- **WHEN** Reabrir is invoked on pending or Reactivar on closed
- **THEN** the respective plan becomes draft with retained history; a completed-to-draft request fails409.

#### Scenario: Archived plan mutation
- **WHEN** a stage completion or plan edit is attempted on an archived plan
- **THEN**409 is returned with no clinical state change.

### Requirement: P5 Aggregate concurrency and revision history
All linked item/stage transitions SHALL serialize through the owning plan revision with stable lock order, owner/patient foreign keys, atomic receipts and append-only revisions. Patient activity SHALL expose safe resource events without private note text.

#### Scenario: Simultaneous closure and execution
- **WHEN** closure and stage completion race from the same plan revision
- **THEN** one valid command commits and the other returns409; no stage is executed after a committed closure and no orphan performed procedure remains.

#### Scenario: Replayed completion
- **WHEN** a completion command is retried after its committed response was lost
- **THEN** its stored receipt returns before current-revision validation and progress/history do not increment again.

### Requirement: P6 Guarded accessible clinical plan UI
Planificación and Planes SHALL remain within the patient workspace, use authorized deep links, guarded dirty navigation, explicit Spanish states/actions and contextual anatomical previews. General notes remain their existing resource; D04 dental diagnosis/treatment/plan notes SHALL use the mirrored editable compositor and linked feed.

#### Scenario: Switch patient with unsaved plan item
- **WHEN** the clinician requests another patient or clinical mode while a plan item draft is dirty
- **THEN** save/discard/remain protection runs and no plan UUID, tooth selection or note leaks into the other patient.
