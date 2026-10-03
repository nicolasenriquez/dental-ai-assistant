# Frontend Architecture

Ownership and dependency model for `app/frontend/src`. This file is about **structure**.
Visual language lives in `DESIGN.md`; behavioral rules live in `docs/design/UX_PRINCIPLES.md`.

## Layers

```
pages/                     route surfaces
        │
components/<domain>/       domain components (clinical-assistant, clinical, drive, sidebar, voice)
        │
components/patterns/       cross-domain interaction patterns (EmptyState, ErrorState, LoadingState)
        │
components/ui/             shared primitives (Button, alert-dialog, sheet, resizable, scroll-area)
        │
lib/ tokens + clients       globals.css tokens, tailwind.config.js semantic colors, lib/cn.ts
```

Dependencies point downward only. A primitive never imports a domain component; a pattern never
imports clinical or Drive logic; a page never styles raw values where a primitive exists.

## Layer reference

| Layer | Purpose | Allowed dependencies | Prohibited | Examples | When a new file belongs here |
|---|---|---|---|---|---|
| `pages/` | Route-level assembly, data fetching via hooks | Domain components, hooks, typed clients | Business logic duplication | `Patients.tsx`, `ClinicalAssistant.tsx` | A new route or route-level workflow |
| `components/<domain>/` | Domain UI for one feature area | Patterns, primitives, hooks, typed clients, `lib/` | Other domains' internals | `drive/DriveWorkspace.tsx`, `clinical-assistant/ClinicalTranscript.tsx` | A component that needs domain state or API types |
| `components/patterns/` | Repeated interaction structure, no domain logic | Primitives, `lib/` | Domain hooks/API types (clinical, Drive) | `EmptyState.tsx` | The same interaction structure appears 3+ times with the same intent |
| `components/ui/` | Generic primitives, a11y ownership | `lib/cn.ts`, tokens | Domain knowledge; product-specific copy | `Button.tsx`, `alert-dialog.tsx` | A primitive is added to the allowlist test first (`drivePrimitiveAllowlist.test.ts`) |
| `lib/` | Typed clients, token-consuming helpers | — | React components | `api.ts`, `cn.ts`, `sse.ts` | Logic is reusable outside React or is the single API boundary |
| tokens | `globals.css` `:root` + `tailwind.config.js` | — | Feature-specific values | `--accent` → `primary` | A value is used by 3+ surfaces and carries semantic meaning |

## Extraction rule

Extract on **repeated intent**, not repetition alone. Current justified extractions:

- `Button` — 11 legacy CSS button families (`primary-button`, `clinical-*`, `drive-btn*`), 100+ call sites.
- `EmptyState` — chat, clinical assistant, patients, Drive, video library, admin.
- Dialog classes — `dialog-*` are shared; Drive-specific wrappers pass their own classes via `className`.

Do not extract a single consumer, a one-off visual, or two similar-looking components that serve
different purposes.

## Current migration state

- `primary-button` is retired: `Button variant="primary"` emits `btn-primary`.
- `clinical-*` and `drive-btn*` families still exist and are emitted by `Button` variants
  (`clinical`, `clinicalSecondary`, `drive`, `driveSecondary`, `driveIcon`). Their CSS removal is
  staged per family.
- `EmptyState` covers chat and clinical assistant empty states; remaining surfaces migrate when touched.

## Enforcement

- Import-order and lint: `bunx biome lint src`.
- Primitive allowlist: `app/frontend/src/__tests__/drivePrimitiveAllowlist.test.ts`.
- Layer-direction CI check: planned (see the design-system plan); until it exists, review is the gate.
