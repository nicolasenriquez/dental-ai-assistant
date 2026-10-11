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
