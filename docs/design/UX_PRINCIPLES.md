# UX Principles

Behavioral contract for the Dental AI Assistant interface. Translates recurring UX law into rules
an agent can apply. These are rules, not literature: when a rule and a habit disagree, the rule wins.
Visual language belongs to `DESIGN.md`; structure to `docs/design/frontend-architecture.md`.

## Decision complexity

- One dominant task per interaction region. If two tasks compete, split the region.
- Advanced actions appear progressively; do not surface every capability at once.
- Never expose internal agent/runtime complexity to clinicians (no tool names, no model IDs, no
  provider jargon in the UI).
- When context already determines the likely choice, use a safe default instead of asking.

## Action hierarchy

- One visually dominant action per decision group; everything else is secondary or a link.
- Controls must be easy to hit: minimum 44px touch targets (the global CSS enforces this on coarse
  pointers; do not fight it).
- Actions live next to the object they affect, not in distant toolbars.
- Icon-only actions require an accessible label and a truthful `title`.

## Information architecture

- Spacing communicates grouping before containers do. Prefer proximity over wrapping things in cards.
- Visually identical elements must behave identically; visually different elements must not.
- Avoid card-inside-card unless the nesting carries real hierarchy.
- Lists that mix statuses (running, awaiting approval, failed) must label the status in text, not color alone.

## System feedback

- Acknowledge every interaction immediately (pressed, queued, saving).
- Pending states are explicit: never leave an action's outcome ambiguous.
- Streaming must visibly distinguish active from completed output.
- Clinical runtime states (`streaming`, `stopping`, `awaiting_approval`, `saving`, `failed`) map to
  visible states; the UI reflects runtime state, it does not reinvent it.

## Error recovery

- Preserve user-entered content on every failure path.
- Prefer retry/restore/cancel over dead ends; every error offers the next step.
- Explain recovery in the interface language (Spanish, plain), never raw exception text.
- Risky or irreversible actions require explicit confirmation naming the patient and the consequence.

## Workflow continuity

- Interrupted clinical tasks remain resumable; unfinished state stays visible.
- Completion is explicit ("Guardada en ficha"), separate from Drive sync state.
- After completion, show what happened and what comes next (link to the saved evolution, export
  status, next action).
- Layout changes (breakpoint, panel open/close) must never silently cancel clinical runtime state.

## Conflict rule

When rules disagree, prioritize:

1. Clinical and user safety
2. Clarity
3. Accessibility
4. User control
5. Task completion
6. Visual elegance

## Applying this file

- New UI must satisfy the applicable rules above; cite the rule in review when a deviation is requested.
- Surface-specific behavior (for example the `/assistant` empty state or the Drive split) belongs in
  that surface's brief under `.impeccable/surfaces/`, not here.
