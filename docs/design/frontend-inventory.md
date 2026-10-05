# Frontend Inventory (AS-IS)

Snapshot of the frontend visual system before the design-system migration. Facts only; update when
surfaces migrate. Contracts live in `DESIGN.md`, `docs/design/UX_PRINCIPLES.md`, and
`docs/design/frontend-architecture.md`.

## Foundations

- Tailwind 3.4, config with only `fontFamily`; semantic colors added additively (`background`,
  `surface`, `foreground`, `muted`, `border`, `primary`, `success`, `danger`, `error`, `warning`).
- Tokens: `globals.css` `:root` — `--bg`, `--surface-1/2`, `--border`, `--accent`, `--accent-dark`,
  `--accent-glow`, `--text-primary/secondary/tertiary`, `--user-bubble`, `--success`, `--danger`,
  `--error`, `--warning`, `--warning-bg/border`, `--code-surface`, `--conversation-*`.
- Single dark theme; no dark-mode toggle. Fonts: Inter, JetBrains Mono (via `index.html`).
- Motion: `motion/react` + 12 CSS keyframes; no shared duration/easing tokens yet.

## Primitives (`components/ui/`)

| File | Status |
|---|---|
| `Button.tsx` | Shared API; variants emit existing CSS families (stage 1) |
| `alert-dialog.tsx`, `sheet.tsx` | Radix wrappers; `dialog-*` classes are neutral now |
| `resizable.tsx`, `scroll-area.tsx` | Radix/re-resizable wrappers |
| Allowlist guard | `src/__tests__/drivePrimitiveAllowlist.test.ts` |

## Patterns (`components/patterns/`)

| File | Consumers |
|---|---|
| `EmptyState.tsx` | Clinical assistant, chat |

## Known drift (open)

- Button CSS families still to fold: `clinical-*` (8 raw sites), `drive-btn*` (Drive surfaces);
  `primary-button` retired → `btn-primary`.
- Dialogs: 5 custom overlays remain (`AddVideoModal`, `CitationModal`, `PatientFormModal`,
  `VideoExplorer`, `NewEvolution`) plus native `<dialog>` in `ApprovalRequestItem`.
- Skeletons: `.skeleton` (shimmer) and `.drive-file-skeleton` (pulse) coexist.
- Raw values: ~380 arbitrary Tailwind values remain in feature files; `text-white`/`bg-black/60`
  palette classes are intentional in places (overlay convention).
- Token swaps pending in clinical surfaces: `ApprovalRequestItem`, `EvolutionReviewArtifact`
  action buttons, `ClinicalTranscript` chrome.

## Evidence

- Playwright projects: `baseline`, `qa-baseline`, `clinical`, `drive-bootstrap`, `provider-smoke`
  (`app/frontend/playwright.config.ts`); snapshots in `app/frontend/tests/__snapshots__/`.
- Vitest: 65 files / 544 tests at last run.
