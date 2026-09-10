## Why

Clinical Assistant already has mature voice capture and clinical state machinery, but its visible feedback does not distinguish the initial reasoning wait, structured activity, draft review, approval, saving, and completion clearly enough. This change adds deterministic presentation over existing state while protecting the voice-composer baseline delivered by commit `c2f27c2`.

## Investigation / Current State

- Commit `c2f27c2` is an ancestor of the current `feat/ai-assisted-evolutions` branch. Both composers keep their textarea mounted, use `useAutosizeTextarea` with a 144 px cap, remain editable during voice work, block submit while voice is in flight, and expose visible `Detener` controls.
- `ClinicalAssistantArea` passes `busy=true` while the clinical runtime is `streaming` or `saving`. `useClinicalAssistant.send` sets `streaming` and appends the optimistic user item before awaiting the SSE response.
- `ClinicalTranscript` knows `items`, `busy`, and `latestItem`. It currently has no transient feedback between optimistic user submission and the first structured item.
- `ClinicalActivityItem` contains only `label` and `pending | running | completed | failed | declined`; no reasoning/tool kind exists. Current backend labels and event statuses are authoritative.
- `ClinicalTranscript` already renders running activity with shared `Spinner`, terminal success with `Check`, and failure/decline with `CircleX`. `Spinner` is already `aria-hidden`.
- `ClinicalDraftItem` delegates assistant draft rendering to `EvolutionReviewArtifact`; assistant and manual modes share that component.
- `ApprovalRequestItem` currently uses a pending prompt, focus-managed native modal dialog, saved receipt link, and terminal status row. Existing Playwright coverage depends on the dialog contract.
- `globals.css` has a skeleton-only `shimmer` keyframe, not a reusable text-shimmer utility. Global reduced-motion rules already suppress animation, but this change will give the text shimmer an explicit static fallback.
- No `components.json`, Radix/shadcn dependency, or general tooltip primitive exists. Sidebar-only `data-tooltip` CSS is not a reusable component contract.
- `ClinicalTranscript.test.tsx` and `ApprovalRequestItem.test.tsx` do not exist. `EvolutionReviewArtifact.test.tsx`, protected voice tests, and `tests/clinical-assistant.spec.ts` provide prior art.
- Active change `google-drive-managed-workspace` is separate and remains untouched. It may later overlap `ClinicalTranscript` and `globals.css`, so implementation must preserve newer local work rather than replacing files.

## What Changes

- Show accessible `Pensando…` text shimmer only while the runtime is busy and the latest transcript item is the submitted user item; remove it as soon as any structured response item arrives.
- Refine structured activity rows into compact, unboxed icon-and-label items using only existing status and label data.
- Refine assistant-mode `EvolutionReviewArtifact` hierarchy with a constant quiet `Borrador asistido` badge, existing-state description, and the accurate primary transition label `Preparar para guardar`.
- Preserve the current approval prompt and native modal workflow while adding deterministic status hierarchy for pending, saving, saved, declined, and failed states. Keep modal action labels `Volver a editar` and `Guardar evolución`.
- Add fail-first component tests, extend deterministic clinical Playwright coverage, protect all voice-composer tests, and review only intentional Linux visual changes before updating snapshots.
- Remove only legacy CSS selectors proven to have no runtime or test consumer after the presentation changes.

## Capabilities

### New Capabilities

- `clinical-agentic-feedback`: deterministic thinking, activity, assistant-draft, approval, saving, and completion presentation for the existing Clinical Assistant runtime.

### Modified Capabilities

- None. Existing `patient-dental-evolutions` persistence, generation, human-review, and save requirements remain unchanged; this change adds Clinical Assistant presentation requirements over those contracts.

## Change Profile

- Profile: `runtime-change`
- Why this profile fits: visible UI behavior, accessibility announcements, interaction copy, and visual regression baselines change even though application state and persistence do not.

## Out Of Scope

- Backend, Whisper, clinical runtime types, SSE event schema, agent/tool loop, approval persistence, RUT handling, authentication, database, and API client changes.
- Reimplementing or migrating `ChatInput`, `ClinicalComposer`, `ComposerShell`, voice hooks, autosize, waveform, or voice status behavior unless validation exposes a regression against `c2f27c2`.
- shadcn initialization, `components.json`, dependencies, InputGroup, MessageScroller, Bubble/Message migration, AI SDK, new tooltip/card/spinner packages, or a broad design-system migration.
- Label-text heuristics, synthetic activity kinds, fake percentages, skeletons for reasoning/processing, or a derived workflow stepper.
- Real patient data, real speech, real clinical writes, and unrelated test repairs.

## Impact

- Expected source surface: `ClinicalTranscript.tsx`, `ApprovalRequestItem.tsx`, assistant-mode presentation in `EvolutionReviewArtifact.tsx`, and focused rules in `globals.css`.
- Expected tests: new component tests, additive `EvolutionReviewArtifact` assertions, existing protected voice tests, and deterministic clinical Playwright snapshots only where reviewed intent changes pixels or accessibility output.
- No dependency, backend, deploy, persistence, protocol, or composer source changes are expected.

## Ownership and Test Seam

- Highest existing Seam: user-visible Clinical Assistant transcript and approval interaction rendered by `ClinicalTranscript` from existing `items` and `busy` inputs.
- Owning Module: `ClinicalTranscript` owns transient and activity presentation; `EvolutionReviewArtifact` owns assistant draft hierarchy; `ApprovalRequestItem` owns approval prompt, modal, receipt, and terminal presentation.
- Interface: existing component props, `ClinicalTranscriptItem` discriminated union, `ClinicalItemStatus`, and current callbacks. No caller learns a new runtime contract.
- Highest test Seam: React Testing Library component behavior for controlled props/status transitions, then mocked `tests/clinical-assistant.spec.ts` browser flow for complete visible lifecycle.
- Adapter: existing React component boundaries, shared `Spinner`/Lucide icons, and `globals.css`; no new library adapter.
- Depth / Leverage / Locality: presentation remains beside the state it interprets, while callers, reducers, transport, and persistence stay unchanged. Component tests cross the highest seam that can prove each state without coupling to internal CSS implementation.

## Prior Art and First Proof

- Prior art: `ClinicalComposer.test.tsx`, `VoiceDictationStatus.test.tsx`, `VoiceWaveform.test.tsx`, `useAutosizeTextarea.test.tsx`, `EvolutionReviewArtifact.test.tsx`, and mocked approval/voice flows in `tests/clinical-assistant.spec.ts`.
- First failing behavior or contract proof: `ClinicalTranscript` does not render `Pensando…` for `busy + latest user`; no component test proves thinking exits on first activity or exact activity status mapping; approval has no unit contract for status badges or one-spinner saving; assistant artifact tests do not prove its provenance/status hierarchy or `Preparar para guardar` action.

## Verification Policy

- Add focused failing component tests before source edits and preserve behavioral assertions rather than replacing them with snapshots.
- Run protected voice tests before and after presentation work; any failure in that baseline is in scope only when introduced or reproducibly caused by this change.
- Build and run type-check, lint, targeted tests, full Vitest, and frontend build in Linux with frozen dependencies; Docker app build remains the production-surface proof.
- Run clinical Playwright without snapshot updates first, inspect expected/actual/diff, manually review desktop and mobile with synthetic data, then update only approved Linux snapshots and rerun.
- Treat unrelated `VideoExplorer` failures as pre-existing only when reproduced on starting SHA; do not modify that module.

## Execution Order Decision

- Required: yes
- Why: two independent presentation slices may proceed after their own fail-first proofs, but both must converge before CSS cleanup, protected regression checks, and visual baseline approval.

## Notes

- Context: no implementation SDLC map was used. Handoff source is the user-provided Unified P1 Voice Composer Validation + Agentic Chat UX Polish brief, normalized against current local source.
- Clarification: `grill-with-docs` resolved approval presentation in favor of preserving the existing prompt plus focus-managed modal, saved receipt, and terminal row rather than replacing them with inline cards.
- Clarification: modal actions remain `Volver a editar` and `Guardar evolución`; `Descartar` is rejected because current decline behavior returns to editable draft and must not imply draft deletion.
- Clarification: assistant draft transition becomes `Preparar para guardar` because it opens approval and does not persist yet.
- Assumptions: all new user-facing copy is Spanish; backend-provided activity labels remain exact; the existing skeleton shimmer is not suitable for text status; Linux snapshots are authoritative for intentional updates.
- Boundaries: this specification ends at Implementation Ready. Voice baseline is validated, not rebuilt; implementation remains deferred.
