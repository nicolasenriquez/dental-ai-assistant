# Component and design-system review

## Discovery

Skill: `.agents/skills/shadcn/SKILL.md`; no explicit skill version in its frontmatter. Read composition, styling and Base/Radix rules. No `components.json` was found. This is a Vite SPA with local selected primitives, not a fully generated current shadcn preset. No aliases are configured; imports are relative.

Package declarations: React 18.3, TypeScript 5.4, Vite 5.2, Tailwind 3.4; Bun scripts; Radix Dialog/AlertDialog ^1.1.23 and ScrollArea ^1.2.18; react-resizable-panels ^4.12.4; Lucide ^1.41.0. Declared ranges are not an assertion that each lower bound is the exact served dependency version. Installed resizable declarations use v4 Group/Panel/Separator and string-percentage sizing. The app's wrappers and local reference use the same resizable generation.

`bunx --bun shadcn@latest info --json` and `bunx --bun shadcn@latest docs sheet alert-dialog resizable` both failed before inspection with `EPERM accessing temporary directory`. No package install, environment repair or initialization was attempted. Used the authorized local checkout and fetched official component docs instead. No CLI-generated project context or preset detection is claimed.

Reference checkout: `C:/Users/nenri/OneDrive/Desktop/proyectos/pry-ai-evaluator/references/ui`; revision `c2a67849be260701852b0977ba15eb5f3a0ce2a4`. Read only; no update or dirty-tree cleanup.

## Existing inventory and compatibility

| Existing implementation | Contract / recommendation |
|---|---|
| `components/ui/Button.tsx` | Local variants primary/clinical/clinicalSecondary/drive/driveSecondary/driveIcon. Retain; upstream `size`, `outline` and loading props are not its API. |
| `components/ui/sheet.tsx` | Radix Root, Content/Portal/Overlay, Title and one built-in Close. Retain; layout ownership needs local correction. It has no upstream `showCloseButton` prop. |
| `components/ui/alert-dialog.tsx` | Existing Radix decision overlay. Reuse for C2; explicitly test rendered role/title/description and safe focus. Wrapper defaults to dialog role, so its name alone does not prove alert-dialog semantics. |
| `components/ui/resizable.tsx` | Thin v4 Group/Panel/Separator exports. Retain compatible API; no v3 numeric percentage examples. |
| `components/ui/scroll-area.tsx` | Existing Radix viewport/scrollbar composition. No new scroll library justified. |
| `patterns/EmptyState.tsx` | Existing shared empty-state pattern. Correct contextual heading composition locally. Do not add upstream Empty just for stylistic conformity. |
| Clinical patient picker / Drive section tabs | Existing native/ARIA implementations and tests. Search empty and Escape worked. No Command, Combobox or Tabs dependency is justified by this pass. |

The allowlist in `drivePrimitiveAllowlist.test.ts` explicitly forbids generated Tabs, Command, Combobox, Card, Table, Input and other unapproved UI files. This project contract takes precedence over the skill's general preference for upstream components. Retain native controls and wrappers unless a specific authorized requirement needs more.

Tokens live in `styles/globals.css` and Tailwind's semantic mapping: background, surface, foreground, muted, border, action, danger, warning. Inter/JetBrains Mono and ink/slate/blue language are established. No alternate theme, new palette, toast library or global radius refactor is proposed. Pages → domain → pattern → primitive → token remains one-way.

## Finding-to-pattern analysis

| Finding | Outcome | Exact support and boundary |
|---|---|---|
| SHADCN-001 | Correct composition, already specified | `apps/v4/registry/bases/radix/ui/alert-dialog.tsx` and `examples/alert-dialog-example.tsx`: named/described decision with cancel/action. Existing C2 determines three choices and transition policy; upstream example does not specify clinical semantics. |
| SHADCN-002 | Simplify repeated shell title | `apps/v4/content/docs/components/radix/sheet.mdx`, `registry/bases/radix/ui/sheet.tsx`, `examples/sheet-example.tsx`: SheetContent owns a named SheetHeader/SheetTitle. Keep that title; subordinate hierarchy is independent product/semantic reasoning. |
| SHADCN-003 | Correct layout composition | Same Sheet source accepts caller className; skill styling rules permit className for layout. Existing app formula supplies the precise width, not an upstream B2B aesthetic rule. A local modifier/variant must own width without overriding other consumers. |
| SHADCN-004 | Retain navigation with visibility policy | Existing Button/Link and shell state suffice. shadcn does not prescribe removing duplicate navigation; this is existing product policy, not a library mandate. |
| SHADCN-005 | Retain components; verification gate | `content/docs/components/radix/resizable.mdx` and `registry/bases/radix/ui/resizable.tsx` establish current Group/Panel/Separator compatibility. No migration is needed; provenance is operational reasoning. |

Upstream uses consolidated `radix-ui`, `cn` package aliases and current styling conventions. The app imports separate `@radix-ui/react-*`, its local cn helper and Tailwind 3. Do not copy those upstream import paths, CSS generation, animations or new props into this project.

Primary references fetched during this pass: [shadcn Sheet](https://ui.shadcn.com/docs/components/radix/sheet), [shadcn AlertDialog](https://ui.shadcn.com/docs/components/radix/alert-dialog), [shadcn Resizable](https://ui.shadcn.com/docs/components/radix/resizable), [Radix Dialog](https://www.radix-ui.com/primitives/docs/components/dialog). Sheet's documented composition supports preserving a named modal; it does not substantiate the application's exact width or every focus behavior without testing.
