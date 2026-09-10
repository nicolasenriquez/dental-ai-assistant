## 0. Investigation and Scope Lock

- [ ] 0.1 Record branch, starting SHA, dirty files, active OpenSpec files, `components.json`/installed primitive state, and `c2f27c2` ancestry; inspect `ClinicalTranscript`, clinical runtime item types, SSE event order, shared Spinner, current CSS tokens, and transcript tests to reconfirm the highest transcript Seam before editing.
  Traceability: proposal `Investigation / Current State`, `Ownership and Test Seam`, and requirements `Protected voice-composer baseline`, `Transient thinking feedback`, and `Structured activity presentation`; locks Slice 1 without changing runtime contracts.

- [ ] 0.2 Inspect `ClinicalDraftItem`, assistant/manual paths in `EvolutionReviewArtifact`, `ApprovalRequestItem`, existing component tests, and clinical Playwright dialog/receipt behavior; preserve recorded grill decisions and inventory every overlapping local or active OpenSpec change before editing.
  Traceability: proposal `Notes`, design `Draft artifact presentation` and `Approval presentation`, and requirements `Assistant draft artifact hierarchy` and `Approval status hierarchy with preserved modal`; locks Slice 2 and prevents stale handoff assumptions.

## 1. Contract Coverage (Failing First)

- [ ] 1.1 Add failing `ClinicalTranscript.test.tsx` coverage for `busy + latest user`, exit on first activity, absence for assistant/draft and non-busy user, exact label preservation, pending/running Spinner, completed Check, failed CircleX, and declined terminal presentation without label heuristics.
  Traceability: requirements `Transient thinking feedback` and `Structured activity presentation`; first external DOM proof for Slice 1.
  Blocked by: 0.1.

- [ ] 1.2 Add failing `ApprovalRequestItem.test.tsx` and assistant-mode `EvolutionReviewArtifact.test.tsx` coverage for constant provenance badge, lifecycle description precedence, `Preparar para guardar`, preserved modal/actions/auto-open, pending/running/completed/declined/failed copy, one running spinner, disabled actions, terminal control removal, and conditional resource link while retaining existing edit tests.
  Traceability: requirements `Assistant draft artifact hierarchy` and `Approval status hierarchy with preserved modal`; first external DOM proof for Slice 2.
  Blocked by: 0.2.

- [ ] 1.3 Extend mocked clinical Playwright fixtures/assertions so the current flow fails first on missing `Pensando…`, explicit activity transition, new artifact hierarchy, modal status, one saving signal, and saved completion while preserving native dialog semantics and using synthetic data only.
  Traceability: requirement `Deterministic accessible validation`; first browser-level lifecycle proof for integrated Slice 3.
  Blocked by: 1.1 and 1.2.

## 2. Implementation

### Agent feedback

- [ ] 2.1 In `ClinicalTranscript`, derive thinking exactly from `busy && latestItem?.type === 'user'`, render its polite status after mapped groups inside the stack, and convert activities to compact status-classed media/label markup; add dedicated text-shimmer, item layout, failure/decline tone, wrapping, and explicit reduced-motion fallback in `globals.css` using existing tokens only.
  Traceability: requirements `Transient thinking feedback`, `Structured activity presentation`, and `Scoped dependency-free presentation`; completes Slice 1 without changing item types, labels, scrolling hooks, or SSE.
  Blocked by: 1.1.

### Clinical artifact hierarchy

- [ ] 2.2 Refine assistant mode in `EvolutionReviewArtifact` to show `Evolución propuesta`, derived lifecycle description, constant quiet `Borrador asistido`, preserved timestamp/flags, and `Preparar para guardar`; refine `ApprovalRequestItem` with one status mapping across prompt/modal/receipt/terminal states, preserve modal/actions/focus behavior, keep one running spinner in badge, avoid missing-resource routes, and add responsive existing-token CSS without changing callbacks or persistence.
  Traceability: requirements `Assistant draft artifact hierarchy`, `Approval status hierarchy with preserved modal`, and `Scoped dependency-free presentation`; completes Slice 2 while leaving manual mode and approval workflow intact.
  Blocked by: 1.2.

### Integration contract

- [ ] 2.3 After both presentation slices, search every listed legacy voice/activity/artifact selector across source and tests; delete only definitions with proven zero consumers, preserve uncertain/shared selectors, and reconcile any newer `google-drive-managed-workspace` or user changes without overwrite, dependency addition, or unrelated CSS modernization.
  Traceability: requirements `Protected voice-composer baseline` and `Scoped dependency-free presentation`; contracts only proven dead presentation code after both consumers are stable.
  Blocked by: 2.1 and 2.2.

## 3. Verification

- [ ] 3.1 Run focused `ClinicalTranscript` tests and inspect rendered accessibility semantics to prove thinking lifecycle, exact activity labels, structured status icons, wrapping, and static reduced-motion meaning without duplicate spinner announcements.
  Traceability: Slice 1 checkpoint; directly proves requirements `Transient thinking feedback` and `Structured activity presentation`.
  Blocked by: 2.1.

- [ ] 3.2 Run focused `ApprovalRequestItem`, `EvolutionReviewArtifact`, and existing `ClinicalDraftItem` tests to prove assistant hierarchy, preserved edits/warnings, accurate prepare transition, native modal behavior, one saving spinner, terminal states, and saved destination handling.
  Traceability: Slice 2 checkpoint; directly proves requirements `Assistant draft artifact hierarchy` and `Approval status hierarchy with preserved modal`.
  Blocked by: 2.2.

- [ ] 3.3 In Linux with frozen dependencies, run TypeScript, Biome, new focused tests, protected `ChatInput`, `ClinicalComposer`, `VoiceDictationStatus`, `VoiceWaveform`, and `useAutosizeTextarea` tests, full Vitest, and frontend build; rebuild with `just dev-down` then `just dev-up-voice`, verify Postgres/app-blue/Whisper health and `GET /api/health = 200`, and confirm backend/dependencies/protocol/OpenSpec artifacts outside this change remain untouched.
  Traceability: requirements `Protected voice-composer baseline`, `Scoped dependency-free presentation`, and `Deterministic accessible validation`; integrated static, unit, build, and Docker gate for Slice 3.
  Blocked by: 2.3, 3.1, and 3.2.

- [ ] 3.4 Run Linux clinical Playwright without snapshot updates, inspect every expected/actual/diff, manually verify `/chat` and `/assistant` or `/a/:threadId` at 1440x1000 and 390x844, inspect focus/live regions/reduced motion/console/network, approve exact intentional Linux files, update only those snapshots, and rerun clinical Playwright; classify unrelated failures only with starting-SHA evidence.
  Traceability: requirement `Deterministic accessible validation`; final browser, visual, accessibility, and no-real-write checkpoint for Slice 3.
  Blocked by: 3.3.

## 4. Release Hygiene and Closeout

- [ ] 4.1 Inspect final diff and produce implementation evidence using the handoff report sections; list each CSS selector decision and snapshot decision, confirm `google-drive-managed-workspace` and all pre-existing OpenSpec files remain semantically unchanged, update docs/changelog only if shipped behavior requires it, run requirement-to-proof audit, and run `openspec validate clinical-agentic-ux-polish` before preparing sync/archive state.
  Traceability: all `clinical-agentic-feedback` requirements; keeps documentation, scope audit, artifact validation, and closeout after runtime and visual proof.
  Blocked by: 3.4.

## Execution Order

### Slice 1 - Agent feedback

- Tasks: `0.1 -> 1.1 -> 2.1 -> 3.1`
- Checkpoint: optimistic user submission alone shows accessible reduced-motion-safe `Pensando…`; first structured item replaces it; every activity maps status without changing exact label or runtime contract.
- Blocks: Slice 3.

### Slice 2 - Clinical artifact hierarchy

- Tasks: `0.2 -> 1.2 -> 2.2 -> 3.2`
- Checkpoint: assistant draft exposes provenance, lifecycle, and accurate prepare action; approval retains focus-managed modal and current actions while pending/running/terminal status hierarchy and one-spinner saving are deterministic.
- Blocks: Slice 3.

### Slice 3 - Integrated regression and visual proof

- Tasks: `1.3 -> 2.3 -> 3.3 -> 3.4 -> 4.1`
- Checkpoint: protected voice, focused/full frontend, Docker health, synthetic browser lifecycle, accessibility, console/network, scope audit, and only explicitly approved Linux snapshots pass.
- Blocked by: Slice 1 and Slice 2.
- Blocks: None.
