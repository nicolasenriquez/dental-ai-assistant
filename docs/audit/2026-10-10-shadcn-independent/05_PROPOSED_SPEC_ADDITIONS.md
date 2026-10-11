# Implementation-ready additions

## SHADCN-003: Contextual Sheet width ownership

Problem: tablet dialog is 460 px wide, despite the established `min(88vw,560px)` contextual contract. Screenshot 16 and geometry JSON reproduce the mismatch. The existing shared Sheet injects a Drive width class; a caller utility alone has not established width ownership.

Solution: retain the existing Radix Sheet and add the smallest caller-specific layout override/variant needed to give ContextualAssistant its existing formula. Do not change the default Drive/profile width or add a component. Exact CSS technique follows the paired-build reproduction, not this audit's hypothesis alone.

New requirement: `Contextual Assistant Sheet width ownership` in conversational-runtime. Task: 1.4, after 1.1–1.3 and before C6. Priority P2; effort 2/5; risk Medium.

Acceptance:

1. At 768 and 1023 CSS px viewport widths, dialog border-box width equals `min(88vw,560px)` within 2 CSS px. Capture viewport and bounding box from the same settled state/build.
2. The contextual modifier cannot change the incumbent Drive/profile Sheet widths. Preserve named title, one close control, focus containment/return, contained scrolling and required coarse targets.
3. Across 767/768 and 1023/1024 breakpoints, full-route/Sheet/nonmodal-panel selection remains incumbent; no clinical text/context/queue/voice state is lost, sent or cancelled by layout reflow. Existing context acquisition is not relabeled as a layout-only action.
4. Retain C1 writing acceptance and the C6 usable-height gate. More width does not justify hiding controls or clinical identity.

References: local shadcn `apps/v4/registry/bases/radix/ui/sheet.tsx` and `apps/v4/content/docs/components/radix/sheet.mdx` at `c2a67849…`; app surface brief and ContextualAssistant supply the exact formula. See 02 for API compatibility and official links.

## SHADCN-002: Single contextual Assistant shell title

Problem: contextual wrapper and embedded Area each render `Asistente clínico` as h2; the empty-state heading is another h2. Screenshot 15/16 and the heading JSON establish this independently of artifact content.

Solution: keep the outer contextual h2/SheetTitle as sole visible shell title; prevent the embedded header from repeating the same title. Keep patient identity and necessary controls. Empty-state heading is h3 below that h2. Full Assistant retains h1/empty h2. Existing contextual artifact h3/field h4 remains intact.

New requirement: `Single contextual Assistant shell title` in clinical-agentic-feedback. Task: 5.6, after 5.1–5.5 and before C6. Priority P2; effort 2/5; risk Low, with named-modal regression checks.

Acceptance:

1. Desktop panel and tablet Sheet each expose one visible `Asistente clínico` shell heading at level 2, with empty-state heading at level 3. No duplicate hidden heading is added to compensate; necessary existing region names remain.
2. Sheet stays named by its title and preserves close/Escape/return focus. Full route retains h1/empty h2. Contextual artifacts remain h3/field h4 and manual composition remains unchanged.
3. Text/context/buffers and exact destinations are unchanged. Removing repeated copy neither submits a turn nor initiates an export.

Reference: same named Sheet composition. The single-title and subordinate-heading choices are product/semantic reasoning, not an upstream mandate to restructure all pages.

## Existing work to retain

SHADCN-001 uses tasks 2.1–2.4, including safe initial focus, failure recovery and dispatch locks. SHADCN-004 uses 5.3, including the rail/mobile fallback and focused-entry handoff. SHADCN-005 uses 0.1–0.2. Do not generate three more tasks for them.

Quick, bounded implementation candidates after C0 are width ownership and title composition. Context decisions, error ownership, pagination and shell changes carry more regression risk and require their existing targeted tests. Current source already contains protections that the old served bundle may lack; reproduce before choosing a GREEN edit, and record a no-op if a matched build satisfies acceptance.
