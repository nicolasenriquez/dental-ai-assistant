## ADDED Requirements

### Requirement: Truthful observed-treatment state presentation
All existing treatment representations SHALL distinguish `existing`, `planned`, `performed`, `cancelled` and `entered_in_error` through exhaustive Spanish status presentation independent of command permissions. `performed` SHALL read `Realizado`, not `Registrado por error`, even when read-only. This clarification applies to existing treatment evidence and SHALL NOT introduce plan authoring, new states or a new execution workflow.

#### Scenario: Performed evidence in every representation
- **WHEN** the same performed treatment is read in the chart, list, tooth inspection, saved-record editor or whole-arch strip
- **THEN** every applicable view and accessible label describes it as Realizado and preserves its UUID, provenance and read-only command policy

#### Scenario: Five existing states
- **WHEN** each existing treatment state is rendered
- **THEN** its own truthful label/symbol appears, read-only reasons do not change that label, planned/cancelled work is not added to daily diagnosis merely by this presentation fix, and reading emits no mutation

### Requirement: Historical reference is not operative tooth selection
The diagnosis workspace SHALL maintain inspected historical resource context independently of transient operative selection. Closing inspection SHALL clear only inspection/operative intent as applicable, preserving exact resource history and its explicit reference marker. Hover and keyboard focus SHALL NOT write or arm a tool.

#### Scenario: Activity link followed by inspection closure
- **WHEN** Activity opens a stored condition/treatment and the clinician closes its tooth inspection
- **THEN** the historical reference remains available without a pressed operative tooth or an armed write intent

#### Scenario: Ordinary inspection closure
- **WHEN** a tooth is inspected without an active tool and the inspection is closed or canceled
- **THEN** no saved evidence changes, no tool is activated, and focus returns to its connected tooth trigger or a stable workspace fallback

### Requirement: Guarded dental dialog lifecycle
Surface, scope and saved-record modals SHALL handle Escape, Tab/Shift+Tab, backdrop interaction and focus restoration throughout their lifetime, not only while a panel child owns focus. Closing SHALL use existing dirty/busy/uncertain command rules. Nonmodal tooth inspection SHALL retain its nonmodal semantics rather than acquiring a second focus trap.

#### Scenario: Outside click before Escape
- **WHEN** a surface or scope modal remains open after clicking outside its panel and Escape is pressed
- **THEN** the applicable cancel/dirty decision runs even if focus moved to the document body and focus returns to a connected initiating control after closure

#### Scenario: Dirty saved-record editor
- **WHEN** a changed saved record is closed or navigated away from
- **THEN** save/discard/remain controls protect local content; canceled navigation leaves the same draft and no write occurs merely because of the close gesture

#### Scenario: Busy or uncertain command
- **WHEN** a clinical command is running or its outcome is uncertain
- **THEN** closure cannot discard its frozen operation identity/payload or claim to undo a possibly committed write; existing verification/conflict recovery remains available

### Requirement: Clear multi-piece members without disarming the tool
A multi-piece draft SHALL offer an explicit member reset when members or an incomplete range exist. Reset SHALL clear selected members, role drafts and range anchor while preserving the selected tool and selection mode. It SHALL NOT write, change clinical meaning, or affect a frozen uncertain command.

#### Scenario: Incomplete range reset
- **WHEN** the first bridge endpoint was selected and the clinician clears members before choosing another range
- **THEN** the new range starts from the new endpoint with no stale anchor, follows existing same-arch/dentition validation, and creates no write until the existing explicit scope confirmation

#### Scenario: Free selection reset
- **WHEN** selected members are cleared in free-selection mode
- **THEN** the tool and mode remain active, member/role selection is empty, and no stored treatment or revision changes
