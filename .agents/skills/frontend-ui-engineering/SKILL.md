---
name: frontend-ui-engineering
description: Builds production-quality, accessible, responsive user-facing UIs using this repository's frontend architecture and design system.
---

# Frontend UI Engineering

Build user-facing UI that is accessible, responsive, state-complete, and native
to this repository. Inspect the existing implementation before adding a new
component, state model, route, or visual treatment.

## Repository routing

1. Read the root `AGENTS.md` and `index.md`.
2. Read the closest package contracts. For product UI, this normally includes
   `packages/twenty-front/AGENTS.md`, `packages/twenty-front/CONTEXT.md`,
   `packages/twenty-ui/AGENTS.md`, and `packages/twenty-ui/CONTEXT.md` as
   applicable.
3. Read `docs/design/index.md` and `docs/design/design-system.md`.
4. Load only the matching pattern guide:

| Task signal | Load |
| --- | --- |
| tables, records, selection, pagination | `docs/design/patterns/data-dense-surfaces.md` |
| search, query, filters, result discovery | `docs/design/patterns/search-filter-discovery.md` |
| forms, validation, editing, uploads | `docs/design/patterns/forms-and-editing.md` |
| loading, errors, empty states, notifications | `docs/design/patterns/feedback-and-recovery.md` |
| delete, archive, undo, irreversible actions | `docs/design/patterns/destructive-and-reversible-actions.md` |
| modal, drawer, menu, tooltip, disclosure | `docs/design/patterns/overlays-and-disclosure.md` |
| navigation, tabs, command menu | `docs/design/patterns/navigation.md` |
| animation, transitions, reduced motion | `docs/design/patterns/motion.md` |
| spacing, color, hierarchy, visual polish | `docs/design/patterns/visual-foundations.md` |

For Mercado Público, also read
`docs/design/patterns/mercado-publico-application.md`. Open a `patterns/library/` leaf only
for a named pattern. Never load all 73 leaves for ordinary implementation.

## Authority and application

Follow `docs/governance/documentation-authority.md` for source authority. For
this corpus, existing repository code and package contracts are canonical;
official WCAG, WAI-ARIA, and platform specifications are primary for platform
behavior; DesignMotionHQ is a secondary discovery source.

Before applying a pattern:

1. State the user problem.
2. Inspect the current implementation and nearby behavior.
3. Search `packages/twenty-ui` for an existing primitive.
4. Read the matching thematic guide.
5. Check applicability and normativity.
6. Resolve conflicts using repository authority and accessibility standards.
7. Define loading, data, empty, filtered-empty, error, pending, and recovery
   states that the interaction needs.
8. Implement the smallest repository-native change.
9. Verify behavior, keyboard access, responsive behavior, and state recovery.

`REQUIRED`, `RECOMMENDED`, `CONTEXTUAL`, and `HEURISTIC` are not interchangeable.
`AVOID` and repository prohibitions are hard constraints unless the closest
repository contract explicitly provides an exception.

## Repository implementation rules

- Keep application logic in `twenty-front` and shared primitives in
  `twenty-ui`.
- Use React, TypeScript, Jotai, Apollo GraphQL, Vite, Lingui, and the existing
  Twenty routing and data conventions.
- Use Linaria in `twenty-front` and the existing styling conventions in
  `twenty-ui`; do not introduce a second styling system.
- Reuse existing Twenty components before creating primitives.
- Keep filters, pagination, sorting, and shareable view state in the existing
  URL/state model where the feature contract requires it.
- Do not invent schema shapes, metrics, scores, recommendations, or fallback
  data when the backend does not provide them.
- Use optimistic UI only for low-risk, reversible mutations with reliable
  rollback and reconciliation.
- Do not create hover-only critical actions or inaccessible custom controls.

## Accessibility and responsive behavior

Use WCAG 2.2 AA as the baseline. Preserve semantic HTML, visible focus,
keyboard operation, correct labels, status/error announcements, modal focus
management, 200% zoom, and reduced-motion behavior. Load
`references/accessibility-checklist.md` for a detailed checklist.

Design for the repository's existing responsive behavior. For dense product
surfaces, preserve readable data and task completion at narrow widths instead
of applying generic card-grid recipes.

## Verification

For an affected UI surface, verify the relevant combination of:

- initial loading and stable data;
- empty, filtered-empty, and error states;
- pending, retry, rollback, or recovery behavior;
- keyboard traversal and visible focus;
- URL, filter, sorting, selection, or pagination preservation;
- narrow viewport and 200% zoom behavior;
- light/dark token parity and reduced motion.

Use focused component or end-to-end tests when runtime behavior changes. A
documentation-only change does not require product test suites.
