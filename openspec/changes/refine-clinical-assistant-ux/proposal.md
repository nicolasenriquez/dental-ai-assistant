## Why

The 2026-10-10 UX audit found a patient-change decision without modal focus protection, a contextual composer reduced to 24.85 px of writing width, and recovery flows that duplicate errors or lose the clinician's place. These findings are present in the inspected continuity implementation and need bounded corrections with evidence tied to the build actually tested.

## What Changes

- Make the existing unsent-work decision an accessible modal with initial focus on `Mantener paciente`, explicit consequences, and safe dismissal. Preserve the existing original-context policy.
- Reflow the composer according to available pane width and announce a retained draft's origin independently of the current patient.
- Separate thread-load failure from a successful empty thread; expose a read-only retry on the same thread and give each failed operation one feedback owner.
- Show the review recovery dock when its destination is outside the visible transcript. Show the full Assistant header's `Pendientes` entry when the sidebar does not already offer a visible usable entry.
- Refresh the already-open pending-work window without collapsing it to page one, preserving reading position and keyboard focus while reconciling authoritative results.
- Make artifact headings follow their containing page or section. Show evolution date and time as `DD mes AAAA · HH:mm`, preserving the current abbreviated Spanish month and timezone behavior, and update the conflicting design sentence.
- Extend DE01 with measurable compact-header acceptance for long patient names, retaining complete authorized identity and required controls. Add C7 for distinguishing clinical conversation rows using existing non-content metadata and for preventing the mobile navigation trigger from covering the disconnected-Drive banner in Assistant views.
- Add a build-provenance verification gate and direct regression coverage for every changed behavior. Cover all findings R01–R11, including the navigation observation R10.
- Add C6 after C1–C5 for three source-backed design-engineering gaps: visible-viewport editing with the mobile keyboard, bounded context-modal content and portaled touch targets, and distinguishable attached-source names. Keep the existing motion policy and require reproduction before any corrective application edit.

## Capabilities

### New Capabilities

None. This change refines existing workflows.

### Modified Capabilities

- `conversational-runtime`: available-width composer layout, accessible original-context decisions, truthful retained-work labeling, visible-height continuity and compact long-identity headers.
- `clinical-agentic-feedback`: recoverable thread loading, operation-owned failure feedback, conditional review recovery, composition-aware headings, and evolution date/time consistency.
- `clinical-workspace-discovery`: pending-list continuity, visibility-aware access to `Pendientes`, distinguishable conversation collisions and mobile navigation/banner coexistence.

The delta files add uniquely named requirements to these capabilities. They do not replace requirements being completed by `harden-clinical-workspace-continuity`.

C6 adds only frontend requirements to `conversational-runtime`; the other two capability deltas retain their existing requirements and scenarios except for the documented PMAX refinements. PMAX-004 adds a DE01 acceptance scenario to `conversational-runtime`. C7 adds conversation identification and banner/navigation coexistence requirements to `clinical-workspace-discovery`. PMAX-001 remains the C5 acceptance extension in `clinical-agentic-feedback`.

## Impact

Frontend owners are `ClinicalAssistantArea`, `ClinicalComposer`, `ClinicalTranscript`, `ClinicalEvolutionArtifact`, `EvolutionReviewArtifact`, `useClinicalAssistant`, `useClinicalPendingWork`, and `ClinicalPendingWork`. Composition callers, the existing sidebar visibility state, and evolution date consumers need targeted review. PMAX refinements also touch the clinical header/patient trigger, `ClinicalThreadList` through `WorkspaceThreadList`/`ConversationRow`, and `AppShell` composition with `DriveBootstrapBanner`. Reuse existing Radix dialog/Button primitives, semantic tokens, typed clients, shared date helpers, and component/browser tests.

No new endpoint, database migration, provider, state library, UI dependency, clinical persistence path, or SSE protocol is planned. The approval, canonical reconciliation, original-patient restrictions, voice lifecycle, Stop/queue semantics, owner scoping, and independent Drive state remain protected contracts.

Shared-file implementation is gated on closure and reconciliation of `harden-clinical-workspace-continuity`; its open validation gates are not satisfied by this audit or by this specification. Source/served-build provenance is checked before runtime evidence is accepted.

## Notes

- Independent shadcn audit on 2026-10-10: `docs/audit/2026-10-10-shadcn-independent/`. Add only SHADCN-003 contextual Sheet width ownership to C1 and SHADCN-002 single contextual shell title/hierarchy to C5. The established `min(88vw,560px)` width and named Sheet are retained; no global primitive defaults, dependency, runtime or clinical policy change is authorized. SHADCN-001/004/005 are already covered by C2/C5/C0 and create no duplicate tasks. Served/local asset differences still require C0 before attributing symptoms or fixes to current source. Tasks 1.4 and 5.6 remain future implementation work.

- The user's follow-up authorizes additive PMAX-002/003 planning and more precise PMAX-004 compact-header acceptance. The former audit exclusions describe the narrower audit scope, not the current authorized scope. PMAX-002 will use a presentation-only collision discriminator, not clinical previews. PMAX-003 covers Assistant/Pending shell composition with cross-page regression checks, not a global redesign or OAuth change. PMAX-005 and clinical evolution previews remain excluded. C7 follows C6 and precedes integrated verification; all existing task IDs/states remain intact. Implementation is still a separate decision.

- Independent UI/UX Pro Max audit on 2026-10-10: `docs/design/audits/assistant-independent-uiux-pro-max-2026-10-10/`. Its original refinement added only PMAX-001: one C5 acceptance scenario and task 5.5 for distinct consulted evolutions with coincident displayed timestamps, using existing result data and exact links without clinical preview/API/SSE expansion. That audit's frozen findings and narrower scope decisions remain historical evidence. The subsequent user authorization expands planning as described above; it does not authorize application implementation.

- Source: `docs/design/audits/assistant-ux-full-review-2026-10-10/`, especially `05_IMPECCABLE_SHAPE_TO_BE.md`, `07_FINDINGS_TRACEABILITY.md`, and `08_OPENSPEC_CANDIDATES.md`. Findings are R01–R11; historical F01–F10 are preserved regression context, not new bugs.
- The user chose a new complete change with small deliveries; an accessible modal with `Mantener` as the safe choice; duplication reduced according to visibility with access and recovery preserved; and abbreviated month plus time with a DESIGN.md correction. The review stays in one context without sub-agents.
- Audit observations used an authenticated native Codex browser and isolated synthetic API fixtures. They do not establish real database atomicity, provider behavior, assistive-technology conformance, physical-device usability, or measured performance.
- OpenSpec schema is `spec-driven`. This request creates planning artifacts only. Application edits, implementation, spec synchronization, archival, deployment, commits, and tracker publication are separate actions.
- Final Emil review on 2026-10-10 inspected HEAD `4957faf3ca38079ac0745f0b234e8ef9bd69b5ad` on `feat/ai-assisted-evolutions`. All eight requested skills were loaded; four were used for scoped analysis. The inventory, gap classification, source locations and motion verdict are in design.md. A limited authenticated visual check used the playwright-cli workflow through the native Codex browser's documented Playwright API; it did not reproduce hardware keyboard, populated-source or future-modal cases. No prototype or application edit was performed.
- At this later review, continuity reports 31/31 checked tasks. Its release-gate README still explicitly excludes screen readers, real-device keyboards/touch and real provider writes, and records stale baseline/e2e follow-up. This update does not certify those gates or bypass C0 reconciliation.
