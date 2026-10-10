## MODIFIED Requirements

### Requirement: W2 Spanish illustrated palette and truthful indicators
The workspace SHALL expose eight categories and every enabled catalog variant with its full Spanish label, independently authored icon, compact consistent operation dimensions and accessible tool selection state. Category navigation SHALL use a labelled subordinate control distinct from the active tool. High-volume categories SHALL offer contextual search without duplicating catalog authority. The workspace SHALL preserve all twelve findings and 63 treatment variants, applicability and stable IDs.

#### Scenario: Select a surface tool
- **WHEN** the clinician selects Caries or a surface-bearing therapeutic variant
- **THEN** the compact operation gains an active treatment and aria-pressed, its surface-support indicator is explained as Admite superficies, and no persisted-use state is inferred from that indicator

#### Scenario: Card and preview parity
- **WHEN** a concept operation is selected and a tooth is hovered
- **THEN** the existing anatomical preview, clinical symbol, palette/layer roles and reduced-motion behavior remain coherent; no usage counter is added and hover performs no write

#### Scenario: Compact variant discovery
- **WHEN** category search narrows the operation list
- **THEN** complete variant labels, stable catalog order and applicability remain available, category navigation does not arm a tool, and an active tool or dirty draft is not silently replaced

### Requirement: W5 Responsive accessible workflow
The workspace SHALL place Permanente/Temporal inside the chart panel, preserve eight anatomical profiles and both arches/FDI with local chart scrolling on narrow views, keep actionable targets at least44px and support keyboard, tap, 200% zoom and reduced motion. Saved-record editing SHALL use a domain modal and tooth inspection a contextual popover; Sheet SHALL remain the narrow notes presentation. The existing editable notes composer SHALL survive rail/Sheet transitions and use the current available-width breakpoint rather than restoring an obsolete source layout.

#### Scenario: Narrow viewport
- **WHEN** the available patient content cannot fit the current chart and notes-rail composition
- **THEN** Notas opens the existing notes Sheet, compact operations wrap or stack with full labels, chart/modal controls remain reachable and the clinical draft survives the layout change

#### Scenario: Keyboard and reduced motion
- **WHEN** the clinician activates a tooth/tool with the keyboard and prefers reduced motion
- **THEN** focus is visible and restored on close, state feedback is immediate and no decorative entrance or chart scaling runs

## REMOVED Requirements

### Requirement: W6 Diagnosis-to-plan continuity
**Reason**: Current PRODUCT.md and the 7 October patient surface decision retire plan authoring and daily planning modes. The older mirrored diagnosis CTA must not require restoration of retired UI.
**Migration**: Preserve stored plan IDs, revisions and authorized legacy links as read-only historical evidence. New plan creation continues returning the already implemented HTTP 410. Existing plan mutation APIs are not broadly frozen or removed by this requirement retirement.
