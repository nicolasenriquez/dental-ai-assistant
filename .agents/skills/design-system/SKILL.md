---
name: design-system
description: Use for design-token authoring, theme migration, Figma adapters, visual parity, or shared UI decisions in this repository.
---

# Design System

Use the canonical token seam before editing a theme or introducing a visual
constant.

## Routing

1. Read `docs/design/index.md`.
2. Select the visual register: `product` for `twenty-ui`/`twenty-front`,
   `marketing` for the websites.
3. For product UI, read `docs/design/design-system.md` and the matching guide
   under `docs/design/patterns/` when the task involves interaction behavior.
4. Search `packages/twenty-ui/src/theme/`,
   `packages/twenty-ui/src/theme-constants/`, and nearby components before
   adding a token or primitive.
5. Keep component-specific decisions local to the component package.

Never load the complete pattern library for a normal implementation task. Open
one `docs/design/patterns/library/*.md` leaf only when a named pattern needs
deeper review.

## Authoring contract

- Treat the existing Twenty UI theme and token seams as the source of truth:
  `packages/twenty-ui/src/theme/` and
  `packages/twenty-ui/src/theme-constants/`.
- Reuse existing theme constants and CSS variables before introducing a new
  visual constant.
- Use the package's existing Nx targets when source changes require validation;
  do not invent targets that are not present in the workspace.
- Preserve product light/dark and marketing light/muted/dark mode parity.
- A semantic change needs design and frontend review.
- Preserve `--t-*`, `.light`, `.dark`, `themeCssVariables`, and `ThemeProvider`
  until a migration proves public parity.

## Pattern-knowledge contract

- Repository code, package contracts, existing Twenty primitives, and the
  Mercado Público feature contract take precedence over external guidance.
- Apply a pattern only after inspecting the current implementation and checking
  its `Applies When` and `Do Not Apply When` sections.
- Use repository tokens and existing primitives. Do not import external pixel
  values, radii, shadows, gradients, glassmorphism, or parallax recipes.
- Pattern posture is guidance, not permission to add an unrelated interaction.

## Visual acceptance

Check keyboard states, reduced motion, contrast, responsive behavior, and
Storybook/visual snapshots for affected components. Never invent metric values
or use color as the only carrier of meaning.

For detailed vocabulary, deprecation, and Figma guidance, load the references
only when the task needs them:

- `references/decision-guide.md`
- `references/figma.md`
