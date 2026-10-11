## ADDED Requirements

### Requirement: Contextual Assistant Sheet width ownership
The contextual Assistant SHALL retain its established tablet Sheet border-box width of `min(88vw,560px)` independently of the shared primitive's Drive-specific default styling. Its existing caller SHALL own this layout locally, without changing other Sheet consumers, modal naming/focus, local scrolling, required controls, runtime state or breakpoint policy. The correction SHALL reuse the allowlisted Radix Sheet and introduce no dependency or persistence change.

#### Scenario: Tablet contextual Sheet follows its established formula
- **WHEN** the contextual Assistant opens at 768 or 1023 CSS px viewport width
- **THEN** its settled dialog border-box width equals `min(88vw,560px)` within 2 CSS px, all required controls remain reachable, and the shared Drive width does not override the contextual caller

#### Scenario: Contextual mode changes across its boundaries
- **WHEN** the viewport crosses 767/768 or 1023/1024 CSS px while existing unsent work is present
- **THEN** the incumbent full-route, modal Sheet and nonmodal panel policy remains intact, with named modal/focus containment and return, deliberate local scrolling and preserved text/caret/context/queue/voice/runtime state; layout reflow alone neither submits nor cancels clinical work

#### Scenario: Other Sheet consumers retain their geometry
- **WHEN** Drive or the professional-profile Sheet renders after the contextual layout refinement
- **THEN** each retains its incumbent width, named title, close/focus and scroll behavior, and the contextual sizing rule does not enlarge or restyle those consumers

### Requirement: Pane-aware clinical writing layout
The clinical composer SHALL adapt to its available container width in full, contextual and Sheet compositions. When input and controls cannot share a usable writing row, the textarea SHALL occupy an independent row across the available inner writing width and controls SHALL wrap below it. Required voice, execution, send/queue and source-removal actions SHALL remain usable without horizontal page overflow, preserving the existing autosize, keyboard, caret, voice, Stop and queue contracts.

#### Scenario: Narrow pane inside a desktop viewport
- **WHEN** the contextual Assistant is used at 1024×768 or in an available pane between 420 and 520 px wide
- **THEN** typing a multi-line clinical note uses the available writing row instead of a toolbar-compressed sliver, and all required controls remain reachable

#### Scenario: Tablet Sheet and mobile
- **WHEN** the Assistant renders in its 768×1024 Sheet or at 390×844 and 360×800
- **THEN** input and controls fit their container, content scrolls vertically as needed, and coarse-pointer controls retain at least the existing 44 px target contract

#### Scenario: Reflow while editing or dictating
- **WHEN** pane width changes while text, selection, a removable source, queued work or any voice lifecycle state is present
- **THEN** reflow preserves that work and selection, keeps relevant voice/Stop/cancel controls accessible, and neither submits nor cancels runtime work

### Requirement: Individual unsent queue removal
The Assistant SHALL expose visible `Quitar` controls with distinct accessible names for individual unclaimed queued messages. Removal SHALL use the existing stable-ID queue and preserve remaining order, attachments, composer drafts and artifact buffers. The dispatcher claim is the boundary after which removal is unavailable; removal SHALL NOT cancel an active turn or call clinical/provider endpoints. Queue callbacks SHALL retain original thread/patient ownership and not resurrect removed entries. Bulk clearing is outside this requirement.

#### Scenario: Remove one queued entry
- **WHEN** the clinician removes an unclaimed entry while other messages and attachments are queued
- **THEN** only that ID disappears, the counter updates immediately, remaining entries retain their order/context, and unrelated drafts and sources remain intact

#### Scenario: Active response continues
- **WHEN** an entry is removed while a response is streaming or stopping
- **THEN** the active turn continues under its existing Stop semantics and no cancel, submit, patient-change or export request is made by removal

#### Scenario: Dispatcher races with removal
- **WHEN** dispatch and individual removal compete for the same entry
- **THEN** removal before claim prevents send and later resurrection; claim first makes the entry non-removable and exposes truthful delivery state without pretending to cancel already-started work

#### Scenario: Failed queued delivery and explicit removal
- **WHEN** send rejects a claimed entry, the original entry is restored once and the clinician removes it or retries remaining work
- **THEN** restoration retains original identity/order/context, retry requires canonical same-thread reconciliation, removing the final entry clears only obsolete queue failure feedback/lock, and no removed entry is dispatched again

#### Scenario: Thread or patient changes during completion
- **WHEN** queue delivery completes after a thread/patient transition or Area unmount
- **THEN** it cannot restore, remove, unlock or dispatch work in the new scope, retained original-context entries remain isolated, and claimed delivery is reconciled rather than silently cancelled

### Requirement: Accessible unsent-work context decision
The existing original-context unsent-work decision SHALL use one focus-managed modal alert dialog with a linked name and description identifying the origin, requested target and affected unsent text, attached sources and queue entries. It SHALL offer safe remain, preserve-and-change and explicit discard-and-change choices, with initial focus on remain and a visually distinct destructive choice. It SHALL preserve the incumbent context guard and successful-transition commit semantics.

#### Scenario: Change or remove a patient with unsent work
- **WHEN** changing patient A to B or to no patient conflicts with unsent original-context work
- **THEN** the modal opens with focus on `Mantener paciente`, traps Tab and Shift+Tab, prevents background interaction, describes the target and discard consequences, and submits or saves no clinical content

#### Scenario: General origin and safe dismissal
- **WHEN** the origin is explicitly patient-less or the clinician presses Escape or the remain choice
- **THEN** wording truthfully identifies the general context, dismissal leaves context and all work unchanged, returns focus to the initiating or stable patient control, and does not fall through to underlying voice cancellation or Stop

#### Scenario: Preserved work after successful change
- **WHEN** the clinician selects `Conservar y cambiar` and the guarded patient update succeeds
- **THEN** the modal closes, workspace selection changes, and text, sources and queued messages remain bound to their original context without automatic dispatch

#### Scenario: Discard commits only with successful change
- **WHEN** the clinician selects `Descartar y cambiar`
- **THEN** duplicate decisions are blocked while pending, and only a confirmed successful transition clears the affected origin slot's text, sources and queue entries; historical artifact edit buffers remain intact

#### Scenario: Transition fails or an upstream guard cancels
- **WHEN** a requested preserve/discard transition fails or an existing upstream navigation guard is cancelled
- **THEN** previous context and all work remain recoverable, discard has not committed, and the decision offers a safe exit or retry with one active modal focus owner

### Requirement: Truthful retained composer origin
The composer SHALL announce and display the origin of its current unsent work independently of the active workspace patient. Patient-bound retained work SHALL retain its authorized patient label; retained patient-less work SHALL remain explicitly general. Presentation SHALL NOT change dispatch context, reassign work, expose raw identifiers or weaken the existing mismatch lock.

#### Scenario: Retained patient work with another or no active patient
- **WHEN** A's work is retained while B or no patient is active
- **THEN** composer accessible name, explanatory text and placeholder identify the retained clinical origin, a guarded restore action remains available, and send/automatic queue dispatch stay blocked until compatible context is explicitly restored

#### Scenario: Retained general work with a patient active
- **WHEN** an explicitly general draft or queued message is retained while a patient is active
- **THEN** it remains labeled as general, restoration can explicitly select no patient through the existing guard, and it is not implicitly converted into the patient's clinical note

#### Scenario: Return to the origin
- **WHEN** the guarded restore succeeds
- **THEN** original text, sources and queue entries remain available under the restored context, normal dispatch restrictions still apply, and no message is automatically created by the restore choice

### Requirement: Visible-viewport clinical editing continuity
The full and contextual Assistant SHALL keep the focused writing position and required composer actions reachable within the usable visible viewport when the software keyboard, browser chrome or orientation changes. If header, sources, queue and writing controls exceed available height, the affected clinical container SHALL provide deliberate local scrolling instead of clipping controls or moving the background page. It SHALL preserve native zoom, text selection, draft, caret, context, queue, voice and runtime state without submission, cancellation or artificial transition delays caused by viewport changes.

#### Scenario: Software keyboard opens and closes
- **WHEN** the clinician focuses the composer and the software keyboard changes the visible viewport, then closes it
- **THEN** the editing caret and required controls remain reachable without dismissing the keyboard, focus and draft stay intact, and the layout returns without a forced page zoom restriction or a new clinical/provider request

#### Scenario: Short landscape viewport and orientation change
- **WHEN** orientation or browser chrome reduces usable height while the full Assistant or contextual Sheet contains a long patient name and an unsent note
- **THEN** the current writing position, patient identity and relevant Stop/voice/cancel controls can be reached through the clinical container, sheet/background scroll remain separate, and reflow does not reset clinical work

#### Scenario: Sources and queued work compete for height
- **WHEN** five allowed attached sources, up to three queued messages and a multi-paragraph note coexist in a constrained visible viewport
- **THEN** source/queue controls and writing remain accessible through bounded local scrolling, existing textarea autosize limits and dispatch restrictions remain intact, and no content or work is discarded to obtain space

#### Scenario: Compact header with a long patient identity
- **WHEN** the full Assistant renders the independent audit's long authorized patient identity at 390×900 with Drive disconnected, and the same identity is checked in narrow full/contextual compositions
- **THEN** the patient/header region between the banner and transcript occupies less height than its measured 237.58 px audit baseline at 390×900 and measures at most 213.58 CSS px after C7, meeting the approved minimum 24 CSS px reduction against that historical fixture, without merely hiding or moving its content into the transcript; measure from banner border-box bottom to transcript border-box top before and after with matched identity, font, viewport, banner/work/disclosure state, and recheck after C7; complete identity remains readable inline or through visible keyboard/touch disclosure, patient selection remains a separate guarded action, navigation and required composer controls/caret remain reachable with existing coarse-pointer targets, and reflow/disclosure preserves focus, work, context and runtime state without a new clinical/provider request

PMAX-004 acceptance note: the user approved this target, based on the existing `spacing.xl` interval, without claiming experimentally validated feasibility. Record C0 before/after measurements separately; an already-satisfied target needs regression proof, not another correction. If the target cannot be achieved without sacrificing complete identity access, separate guarded patient selection, focus/work/caret continuity, required actions or existing 44 px coarse-pointer targets, stop the correction and request a revised acceptance decision rather than weaken those guarantees.

### Requirement: Viewport-bounded clinical context modal
The unsent-work context modal SHALL fit the usable viewport and expose its complete patient/target/consequence description and all permitted choices through contained scrolling and wrapping actions. Its portaled controls SHALL satisfy the existing 44 px coarse-pointer target contract independently of clinical-area ancestry. Layout changes and long pending/error feedback SHALL preserve the existing safe initial focus, modal focus management, return focus and transition commit policy.

#### Scenario: Long identities in a narrow or zoomed dialog
- **WHEN** patient identities approach the accepted name limits and the context decision opens at 320 px width, in a short viewport or at 200% browser zoom
- **THEN** full authorized identity and consequences remain readable through modal scrolling, permitted actions wrap without horizontal overflow, and the safe remain choice is reachable without background-page scrolling

#### Scenario: Coarse pointer with content in a portal
- **WHEN** the context decision's controls render in the existing dialog portal under a coarse pointer
- **THEN** each actionable target measures at least 44×44 px despite being outside `.clinical-assistant-area`, with visible separation and no change to other dialogs' styles or behavior

#### Scenario: Pending or failed change expands dialog content
- **WHEN** transition status/error text grows or the usable viewport changes while the decision remains open
- **THEN** the focused permitted control stays reachable, description/status can be read, the background stays inert, and the existing context/work/commit policy remains unchanged

### Requirement: Unambiguous attached-source identification
The clinical composer SHALL expose the complete authorized display name of each attached source by inline wrapping or contained source-list scrolling, without relying on hover, an inaccessible tooltip or removal to reveal its suffix. Source names SHALL remain associated with their exact stable removal action. Long unbroken names and the allowed source count SHALL keep writing and controls reachable without changing source identity, content, order, attachment limits or send semantics.

#### Scenario: Filenames differ only at the end
- **WHEN** two selected sources share a long prefix and differ by version or filename suffix
- **THEN** a pointer, touch or keyboard user can distinguish both complete display names before removal or submission, and removing one changes only that source ID

#### Scenario: Long unbroken name at accepted limits
- **WHEN** an attached source has a long unbroken display name up to the accepted 500-character limit in a narrow pane
- **THEN** its complete authorized name remains readable through wrapping/contained scrolling, the remove action stays usable, and neither it nor the composer causes horizontal page overflow

#### Scenario: Maximum sources with ongoing work
- **WHEN** five sources coexist with typed text, queued work or mocked voice activity and the pane reflows
- **THEN** names and controls remain reachable under the visible-viewport contract, text/caret/work stay intact, and inspection or source removal does not submit a turn or issue a new source/provider request
