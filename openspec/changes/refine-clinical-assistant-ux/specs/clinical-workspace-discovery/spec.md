## ADDED Requirements

### Requirement: Pending-work window continuity
The pending-work list SHALL preserve the successfully opened pagination depth, reading anchor and appropriate focus across export retry and visible-window refocus. Refresh SHALL reconcile an authoritative bounded window through fresh cursors from page one, deduplicate stable IDs, use server totals and publish complete results atomically. Resolved entries SHALL disappear, changed entries SHALL follow authoritative order, and failures SHALL retain the last complete window with truthful feedback. Existing groups, kind/patient/limit filters, owner scoping and exact-resource actions SHALL remain intact.

#### Scenario: Retry an export on a later page
- **WHEN** at least two pages are open and an export retry succeeds, fails or remains pending
- **THEN** the list refreshes up to the previously opened depth or the new end of list, preserves other current entries and reading position, updates/removes the retried row according to authoritative reads, and does not collapse to page one

#### Scenario: Focused row or action disappears
- **WHEN** an explicit retry removes the focused item or its retry action
- **THEN** focus moves to a usable action on the surviving row, otherwise the next surviving item, previous item or section heading in that order, and the change is announced without claiming an unsaved evolution

#### Scenario: Passive window refocus
- **WHEN** the visible browser window regains focus with multiple pages open
- **THEN** a coalesced bounded refresh keeps opened depth and the surviving reading anchor, and does not steal focus from the currently focused element

#### Scenario: Ordering or cursor changes
- **WHEN** updates insert, reorder or remove rows, or a cursor is rejected
- **THEN** refresh follows fresh response cursors and unique IDs, uses the new final cursor for load-more, restarts a rejected cursor chain at most once, and repeated failure reports an error instead of silently discarding loaded pages

#### Scenario: Partial refresh failure
- **WHEN** export retry succeeds but a subsequent pending read fails, including a later page
- **THEN** the last complete window stays available with a pending-read failure, the interface distinguishes that failure from export retry failure, and a partial first page is not presented as a complete refreshed window

#### Scenario: Stale request after scope change
- **WHEN** old refresh/load-more responses complete after patient, kind, limit or request generation changes
- **THEN** old results cannot replace or append to the current scope, and pending totals and action IDs remain API-backed

### Requirement: Patient-scoped pending evolution dismissal
The existing pending-work list SHALL offer exact-resource `Descartar` for eligible pending evolution approvals and recoverable draft/stale artifacts from patient summary and global views. The server SHALL authorize owner/patient/thread/action/artifact relationships, current state/hash/version, absence of incompatible approved results and exclusion of unsafe active turns. Approval rejection SHALL reuse decline with existing action audit; standalone draft discard SHALL be logical, terminal and auditable with a stable operation identity, actor and timestamp, without inventing an approval. Confirmation and canonical reconciliation SHALL precede removal or success claims. Approved ficha data, historical activity, original Drive documents, export state, active turns and unrelated work SHALL remain intact. PENDING-001's localized backend/status/receipt exception is approved for planning; implementation remains separately authorized.

#### Scenario: Patient summary opens individual pending work
- **WHEN** the clinician chooses `Ver pendientes` for patient A's review or recoverable-draft count
- **THEN** the existing pending list shows that patient and kind with API-backed total and exact `Revisar`/`Continuar` targets, without exposing another patient's items or adding discard controls to approved history

#### Scenario: Confirm an eligible pending approval
- **WHEN** a canonical owned thread read matches the selected action, thread, artifact, patient and current proposal_hash and the clinician confirms `Descartar`
- **THEN** server guards verify the selected relationships, hash, current artifact version and safe state, exactly that action and linked pending artifact become declined atomically, and the row is removed only after confirmation with existing resolver/time traceability, without evolution persistence or Drive export

#### Scenario: Cancel an accessible confirmation
- **WHEN** the clinician opens the consequence confirmation, uses keyboard/touch, presses Escape or chooses the safe cancel action
- **THEN** patient and exact selected work are identified, focus is contained and returned safely, and cancellation performs no write or loss of local work

#### Scenario: Draft dismissal does not emulate approval or deletion
- **WHEN** the clinician discards standalone recoverable draft work
- **THEN** the dedicated artifact command retires that work logically without creating an approval, deleting a thread, clearing clinical content or invoking return-to-editing/recover-draft

#### Scenario: Discard an eligible recoverable draft
- **WHEN** the clinician confirms a draft/stale artifact with a new operation ID and current canonical version and the server verifies all identities with no active turn, associated pending approval or approved result
- **THEN** only that artifact becomes discarded, its payload and unrelated buffers/history remain intact, and the canonical response contains the stored operation, actor and resolution timestamp

#### Scenario: Approved history and Drive work are protected
- **WHEN** discard targets an already-approved action/artifact, a saved evolution, a Drive export failure or an original Drive document
- **THEN** server-side eligibility prevents clinical discard of those resources, frontend offers no destructive action for them, and saved history, export status and Drive files remain unchanged

#### Scenario: Wrong owner or patient identity
- **WHEN** a forged request targets another owner's work or mismatches the selected patient/thread/action/artifact relationship
- **THEN** server-boundary checks reject the unauthorized or inconsistent resource without mutation or disclosure, regardless of frontend visibility, and no state is published in the current patient's view

#### Scenario: Duplicate execution or changed state
- **WHEN** confirmation is clicked twice or edit/prepare/approve/recover/expiry or an active turn changes eligibility between read and resolution
- **THEN** one resource-scoped operation runs, atomic state/version checks prevent invalid transitions, matching committed decline/hash or draft operation/identity/input returns its original receipt without mutation, different intents or reused cross-resource keys conflict, and approved work remains protected

#### Scenario: Lost response or failed canonical read
- **WHEN** either dismissal response is lost or network/canonical reconciliation fails
- **THEN** the row stays available with operation-specific uncertainty or failure, absence from a page alone is not success, and a read-only canonical receipt/state check confirms declined, discarded, approved, still eligible or unavailable state before a same-intent retry

#### Scenario: Refresh counts without losing the pending window
- **WHEN** confirmed dismissal removes a row on a later page or completes after the patient/kind scope changes
- **THEN** fresh-cursor C4 refresh updates list, filters, total and patient/global counts through authoritative reads while preserving opened depth, reading anchor and safe focus; late results cannot alter a new scope, and refresh failure preserves the last complete window with truthful stale feedback

#### Scenario: Full-precision version changes before confirmation
- **WHEN** an edit or regeneration changes the selected draft's canonical version after it was read for confirmation
- **THEN** dismissal reports stale conflict without losing the newer content, version precision is preserved, and the clinician must review the current resource before a new intent

#### Scenario: Delayed writer cannot reactivate discarded work
- **WHEN** an old worker, upsert, edit, preparation, recovery or status callback arrives after confirmed discard
- **THEN** the terminal artifact and its payload/receipt remain unchanged, it cannot return to recoverable or approval-required work, and no saved evolution or export is created from that callback

#### Scenario: Canonical dismissal reconciliation is read-only
- **WHEN** the client requests canonical identity or receipt state for dismissal while stale turns or expired approvals exist
- **THEN** the explicit read-only read performs no cleanup, preparation, approval, recovery or export write, retains stored receipt precision and actor/time, and absence or expiry alone does not prove dismissal

#### Scenario: Existing data and clients remain compatible
- **WHEN** the localized schema/backend change is rolled out with older artifact rows and legacy approval callers
- **THEN** existing statuses, payloads, approval semantics and history remain intact, legacy decline remains server-authorized, new discarded receipts are complete and unique for the owner, and rollback never reopens discarded work or destroys audit evidence

### Requirement: Visibility-aware pending navigation
The full Assistant SHALL suppress its redundant header `Pendientes` entry only while an equivalent direct sidebar destination is visibly usable. When that destination is absent, hidden or unavailable, the existing header entry SHALL remain directly accessible. Layout changes SHALL preserve a usable destination and keyboard focus without introducing routes or changing contextual navigation.

#### Scenario: Expanded sidebar offers the destination
- **WHEN** the full Assistant's expanded sidebar visibly exposes the direct pending-work entry
- **THEN** the redundant header entry is suppressed while the existing destination and URL remain directly accessible

#### Scenario: Rail, hidden sidebar or mobile drawer
- **WHEN** a rail does not expose pending work or the sidebar/mobile drawer is closed or hidden
- **THEN** the full Assistant retains its visible keyboard-accessible header `Pendientes` entry to the existing destination

#### Scenario: Navigation visibility changes during keyboard use
- **WHEN** sidebar visibility or responsive layout changes while the header entry is focused
- **THEN** it is not removed before a safe focus handoff, at least one applicable direct pending-work entry remains usable, and the contextual Assistant keeps its incumbent navigation

### Requirement: Distinguishable clinical conversation collisions
The clinical conversation list SHALL distinguish loaded threads with the same rendered title and update date/minute through a visible, accessible, presentation-only discriminator derived from their existing IDs and metadata. Collision ordinals SHALL be assigned deterministically within the unchanged complete loaded collision group, independently of search filtering, without displaying raw IDs, changing stored titles, list order, grouping, search semantics or resource identity. The discriminator SHALL NOT use clinical previews, message/source contents, model-generated labels, added patient identifiers or new reads. It is not a permanent conversation identifier or clinical priority.

#### Scenario: Same title and displayed minute
- **WHEN** at least two loaded clinical threads share a rendered title and displayed update date/minute, including exact timestamp ties
- **THEN** their visible row labels and accessible selection/menu names distinguish them using the assigned discriminator, selection and existing row actions retain the exact thread ID, and title/date/status remain readable without hover-only access

#### Scenario: Search, refresh and existing row actions
- **WHEN** the list is filtered, cleared, refreshed with the same collision-group membership, or reflowed between expanded sidebar and mobile drawer
- **THEN** each collision discriminator remains attached to the same thread ID, filtering does not renumber it, keyboard focus and active/running/pending state remain correct, and existing guarded selection, explicit rename/delete and search behavior are unchanged; membership/title/date changes may recompute presentation without mutating another resource

#### Scenario: Unique row and content privacy
- **WHEN** a row has no displayed-title/date collision or its existing API summary includes clinical preview content
- **THEN** unique rows keep their incumbent labels, no preview or additional patient/message/source content is rendered or added to accessible names, tooltips or telemetry by this refinement, and no clinical/provider request or title write is made to obtain distinguishing labels

### Requirement: Assistant mobile navigation and Drive banner coexistence
In full Assistant and Pending Work views, the shared shell SHALL reserve non-overlapping layout space for the existing mobile navigation trigger and the disconnected/connecting Drive banner. Complete state text and the existing connect control SHALL remain readable and keyboard/touch reachable without horizontal page overflow or suppressing the banner. Responsive changes SHALL preserve focus, clinical work and existing sidebar behavior and SHALL NOT start OAuth, acquire threads or initiate clinical/export actions. Shared-shell corrections SHALL preserve the incumbent Patients, contextual Assistant and legacy Chat behavior; no routes, auth policy or global shell redesign are introduced.

#### Scenario: Disconnected banner at narrow widths
- **WHEN** the sidebar is closed and the disconnected Drive banner appears in full Assistant or Pending Work at 360/390 px, including long state text and short landscape height
- **THEN** the navigation trigger's box intersects neither banner text nor the connect control, both destinations remain reachable with existing coarse-pointer target sizes, and text wraps without clipping or horizontal page overflow

#### Scenario: Sidebar, connection state and viewport change
- **WHEN** the sidebar opens/closes, the banner becomes connecting or disappears after a simulated authenticated status update, or the viewport reflows while an existing control is focused
- **THEN** focus remains usable, state text stays truthful, menu/connect actions keep their incumbent semantics, and layout changes alone trigger no OAuth handoff, thread acquisition, patient update, turn dispatch or export retry

#### Scenario: Shared-shell consumers retain behavior
- **WHEN** the same shell renders Patients, legacy Chat or a patient ficha with a contextual Assistant, with Drive connected or disconnected
- **THEN** their navigation, existing banner presentation, content access and contextual editing remain usable without new overlap or scroll/focus loss, and the correction adds no page-specific write behavior
