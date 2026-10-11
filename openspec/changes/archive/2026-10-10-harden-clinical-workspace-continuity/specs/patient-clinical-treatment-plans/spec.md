## MODIFIED Requirements

### Requirement: P1 Atomic draft plan authoring
New clinical plan creation SHALL remain retired with HTTP410, and the patient workspace SHALL NOT expose creation or authoring controls. Stored plans, items, stages and revisions SHALL remain readable through authorized historical links. Existing item/stage/update commands SHALL retain their currently implemented owner, revision, replay and atomicity protections without a new blanket mutation freeze. A treatment SHALL belong to at most one plan item. Existing title, note, anatomy and stage validation limits SHALL remain unchanged.

#### Scenario: Add scoped procedure
- **WHEN** an existing supported legacy command accepts a bridge variant with valid teeth/roles for an owned stored plan
- **THEN** treatment, members, plan item, initial stage, aggregate revision and command receipt commit together or none commit; no authoring UI is restored by preserving that API behavior

#### Scenario: Reload draft
- **WHEN** a stored draft plan is opened through a legacy link after browser reload
- **THEN** its saved item order, variants, anatomy, notes and stages are shown read-only, no plan is created and no clinical write occurs merely from opening history

#### Scenario: Creation is retired
- **WHEN** a client requests new plan creation
- **THEN** the existing HTTP410 retirement response remains and no plan, item, receipt or revision is created

### Requirement: P6 Guarded accessible clinical plan UI
Stored plan links SHALL remain within the patient workspace as explicitly historical read-only evidence, without Planificación/Planes as daily authoring modes. Authorized exact links, dirty navigation guards for other active work, Spanish status/history, anatomical evidence and accessible destination focus SHALL remain available. General notes SHALL retain their own resource and the existing dental clinical-note composer/feed SHALL remain available in its supported contexts. This UI policy SHALL NOT freeze all legacy plan mutation APIs or erase stored data.

#### Scenario: Switch patient with unsaved plan item
- **WHEN** navigation from a legacy plan view encounters retained dirty work from an existing supported workflow
- **THEN** the existing save/discard/remain guard protects that work and no plan UUID, tooth selection or note leaks into the other patient; no new plan editor is introduced

#### Scenario: Historical plan destination
- **WHEN** an authorized legacy plan URL opens
- **THEN** the exact plan and revisions are labelled as historical read-only evidence, focus reaches the destination once, and no create/edit/execute controls or write requests are produced by this historical UI
