## Context

Clinical Assistant already separates runtime state into typed transcript items. Presentation currently begins only when the first SSE item arrives, so an optimistic user message can sit without immediate response feedback. Activity rendering is semantically adequate but visually generic. Draft and approval surfaces expose correct workflows but do not express provenance and lifecycle with consistent hierarchy.

The highest existing Seam is the transcript/component interface, not the reducer or SSE protocol. `ClinicalTranscript` can derive the transient gap from `busy && latestItem?.type === 'user'`; activities already carry sufficient status; draft and approval components already own their visual state. Lower runtime seams would add state that the UI does not need.

## Goals / Non-Goals

**Goals**

- Distinguish thinking, structured processing, clinical artifact, approval, saving, and completion using existing structured state.
- Give immediate accessible feedback after user submission without inventing backend semantics.
- Preserve voice, draft editing, modal confirmation, persistence, scroll-follow, and responsive behavior.
- Keep one dominant active signal and one obvious next action per state.
- Produce deterministic component and browser proof before reviewing visual baselines.

**Non-Goals**

- New application state, event fields, progress values, workflow stages, or tool taxonomy.
- Composer, message scroller, backend, persistence, API, or design-system migration.
- Replacing native approval dialog with an inline card.

## Boundary and Ownership

### Transcript feedback

`ClinicalTranscript` is the owning Module. Its Interface remains `items`, `busy`, and current callbacks. It computes `showThinking` locally from existing inputs and renders it after mapped turn groups inside the transcript stack. Existing `useChatAutoFollow` and `useConversationViewportCache` remain untouched.

This Seam has high Leverage because every clinical turn crosses it, high Locality because no caller changes, and sufficient Depth because the component hides the distinction between transient reasoning feedback and persisted/streamed items. The React component is the Adapter from runtime union to accessible DOM.

### Activity presentation

`ClinicalTranscript` maps `pending`/`running` to shared `Spinner`, `completed` to `Check`, and `failed`/`declined` to `CircleX`, preserving the exact backend label. New item-like classes own layout and tone. No string inspection or description synthesis is permitted.

### Draft artifact presentation

`EvolutionReviewArtifact` remains the single Module for manual and assistant review. Only `mode="assistant"` changes. Its Interface and callbacks remain stable. It derives visible description from existing booleans with precedence `stale -> Necesita regeneración`, `edited -> Editada`, otherwise `No guardada`; it renders constant provenance badge `Borrador asistido` and keeps timestamp/review flags.

`ClinicalDraftItem` remains a thin Adapter and is not duplicated. Manual evolution mode and all field/source/date/regeneration behavior remain unchanged.

### Approval presentation

`ApprovalRequestItem` remains the owning Module for pending prompt, native modal dialog, saved receipt, and terminal rows. Existing status is mapped once:

```text
pending   -> Requiere confirmación
running   -> Guardando
completed -> Guardada
declined  -> Descartada
failed    -> No disponible
```

The pending prompt remains `Guardado pendiente`; modal title remains `Confirmar guardado`; actions remain `Volver a editar` and `Guardar evolución`. During `running`, modal stays open, both actions stay disabled, badge contains the only active spinner, and primary button text becomes `Guardando…` without another spinner. Completed receipt links to the evolution only when `result_resource_id` exists. Declined and failed states contain no approval controls.

### Styling

`globals.css` owns narrowly prefixed styles. Existing root tokens are reused: `--surface-1`, `--surface-2`, `--border`, `--text-*`, `--success`, `--warning`, and `--danger`. No undefined shadcn-style token is introduced.

The existing `@keyframes shimmer` serves skeleton blocks and is not reused as an implicit text utility. A dedicated `clinical-thinking-shimmer` rule uses background-clipped text and a dedicated keyframe. Its reduced-motion branch removes animation/background clipping and restores readable `--text-secondary` color.

## Decisions

1. Derive thinking only from `busy && latestItem?.type === 'user'`.

   Rationale: `send` sets streaming and appends the optimistic user item before awaiting SSE. First decoded response changes latest item, so existing state precisely bounds the gap.

   Alternatives considered:
   - Infer thinking from activity labels. Rejected because labels are untyped backend text.
   - Add reasoning kind to SSE/runtime. Rejected because no backend state is needed and protocol changes are out of scope.

2. Use shimmer for initial thinking and spinner only for active structured work.

   Rationale: separate signals clarify reasoning wait versus observable activity without fake progress.

   Alternatives considered:
   - Spinner for all waits. Rejected because it collapses distinct states.
   - Skeleton/progress bar. Rejected because no known loading shape or numeric progress exists.

3. Keep activities unboxed and data-faithful.

   Rationale: activity is low-weight operational feedback, not an artifact. Existing label/status is sufficient.

4. Keep one artifact implementation and derive assistant hierarchy from current fields.

   Rationale: `ClinicalDraftItem` already delegates correctly. Constant provenance and derived lifecycle description improve clarity without lifecycle state changes.

5. Preserve native approval modal and current action labels.

   Rationale: existing focus, auto-open, cancel protection, and Playwright contracts are behavior, not decoration. User clarification selected smallest safe visual-only path. `Volver a editar` accurately avoids implying deletion.

   Alternatives considered:
   - Replace with inline approval cards. Rejected because it changes interaction and focus semantics.
   - Hybrid modal plus replacement lifecycle cards. Rejected because it adds duplicate presentation paths without product need.

6. Rename assistant draft transition to `Preparar para guardar`.

   Rationale: action prepares approval and does not persist. User clarification selected accurate expectation-setting copy.

7. Do not initialize shadcn or add dependencies.

   Rationale: no `components.json` exists and current components/tokens satisfy the requirement. Another active OpenSpec change may later add shadcn for an unrelated Drive workspace; this change neither depends on nor modifies that plan.

8. Treat visual snapshot updates as reviewed release evidence.

   Rationale: platform-dependent pixels are not a substitute for behavior. Linux baseline changes follow no-update run, diff inspection, desktop/mobile review, accessibility/console checks, and explicit file selection.

## Blast Radius

### Touched runtime areas

- Clinical transcript transient status and activity markup.
- Assistant-mode evolution artifact heading/action copy.
- Approval prompt/dialog/receipt/terminal visual hierarchy.
- Focused clinical CSS and intentional Linux clinical snapshots.

### Untouched runtime areas

- Backend, Whisper, SSE schema/parser, clinical reducer/runtime types, agent loop, persistence, authentication, API client, and database.
- Chat and Clinical composers, voice/autosize hooks, voice components, MessageScroller behavior, and patient controls.
- Manual evolution artifact behavior and unrelated application UI.
- Active `google-drive-managed-workspace` artifacts.

## Verification Strategy

- `ClinicalTranscript.test.tsx` first proves thinking entry/exit, absence for all non-user latest items, exact activity labels, and icon mapping through accessible/component behavior.
- `ApprovalRequestItem.test.tsx` first proves modal preservation, status copy, one saving spinner, disabled actions, terminal control removal, and conditional saved destination.
- Existing `EvolutionReviewArtifact.test.tsx` gains assistant-mode proof for constant provenance, derived lifecycle descriptions, warning/edit behavior, and `Preparar para guardar` callback while retaining field-edit tests.
- `tests/clinical-assistant.spec.ts` proves user -> thinking -> activity -> draft -> prepare -> modal pending -> saving -> saved with mocked SSE/API only. Browser proof keeps existing dialog semantics and synthetic patient content.
- Protected composer/voice tests run unchanged. Linux frozen install, type-check, Biome, targeted/full Vitest, build, Docker voice health, API health, clinical Playwright, desktop/mobile inspection, and console/network/accessibility review form the integrated gate.

## Execution Dependencies

- Agent feedback and clinical artifact hierarchy are independent after scope lock and may proceed in parallel.
- Integrated CSS cleanup and validation require both slices.
- Snapshot updates require passing functional behavior plus manual approval of each intentional Linux diff.
