# Implementation Report — clinical-agentic-ux-polish

**Plan**: `openspec/changes/clinical-agentic-ux-polish/tasks.md`
**Branch**: `feat/ai-assisted-evolutions`
**Status**: COMPLETE

## Summary

Deterministic presentation polish for the Clinical Assistant: transient accessible `Pensando…` feedback between optimistic user submission and the first structured item, status-classed compact activity rows, an assistant-draft hierarchy (`Borrador asistido` provenance + derived lifecycle + `Preparar para guardar`), and a one-spinner approval status hierarchy over the preserved native modal. Voice-composer baseline from `c2f27c2` is untouched.

## Tasks completed

- 0.1/0.2 investigation — scope locked, no runtime contract changes.
- 1.1 → `app/frontend/src/components/clinical-assistant/ClinicalTranscript.test.tsx` (CREATE)
- 1.2 → `app/frontend/src/components/clinical-assistant/ApprovalRequestItem.test.tsx` (CREATE); `app/frontend/src/components/clinical/EvolutionReviewArtifact.test.tsx` (UPDATE)
- 1.3 → `app/frontend/tests/clinical-assistant.spec.ts` (UPDATE)
- 2.1 → `app/frontend/src/components/clinical-assistant/ClinicalTranscript.tsx` (UPDATE); `app/frontend/src/styles/globals.css` (UPDATE)
- 2.2 → `app/frontend/src/components/clinical-assistant/ApprovalRequestItem.tsx` (UPDATE); `app/frontend/src/components/clinical/EvolutionReviewArtifact.tsx` (UPDATE)
- 2.3 → removed only zero-consumer CSS selectors.
- 3.1/3.2/3.3/3.4 → verification gates, see below.
- 4.1 → this report.

## Tests added

- `ClinicalTranscript.test.tsx` — 7 cases: thinking on busy+latest-user, exit on first activity, absence when idle, 5 status→class mappings with exact label preservation.
- `ApprovalRequestItem.test.tsx` — 6 cases: pending prompt + modal + actions, one running spinner + disabled actions, declined/failed terminal without controls, completed receipt link, no route without resource.
- `EvolutionReviewArtifact.test.tsx` — 4 additive cases: lifecycle matrix (`No guardada`/`Editada`/`Necesita regeneración` + `Borrador asistido`), prepare callback; existing edit/read-only tests retained.
- `tests/clinical-assistant.spec.ts` — synthetic two-turn flow: `Pensando…` entry/exit, draft hierarchy, `Preparar para guardar`, dialog `Requiere confirmación`, one saving spinner, terminal receipt; dictation scope-lock test unchanged and passing.

## Validation results

- Backend: not touched; `uv.lock`/`pyproject.toml` unchanged.
- TypeScript `tsc --noEmit` + Biome: pass (Linux container, frozen deps).
- Vitest: 275 tests pass (includes protected `ChatInput`, `ClinicalComposer`, `VoiceDictationStatus`, `VoiceWaveform`, `useAutosizeTextarea`).
- Production build: pass (Linux container).
- Docker: `just dev-up-voice` rebuild healthy; `GET /api/health` = 200.
- Clinical Playwright (Linux, pinned `playwright:v1.62.1-noble`): full two-turn flow passes; only pre-existing `clinical-empty.png` baseline fails — reproduced identically (9715 px) on a clean starting-SHA (`970cdaa`) worktree, classified unrelated.
- `openspec validate clinical-agentic-ux-polish`: valid.

## CSS selector decisions

Removed (zero consumers after refactor):

- `.clinical-activity-icon`, `.clinical-activity-icon--running` — superseded by structured status classes; last reference was the old activity markup.

Added (existing tokens only, no new variables):

- `.clinical-thinking` + `@keyframes clinical-thinking-shimmer` + `prefers-reduced-motion` static fallback.
- `.clinical-activity--active` / `--completed` / `--failed` / `--declined` — status tone on the shared `.clinical-activity` row.
- `.clinical-status-badge`, `.clinical-approval-terminal`, `.clinical-approval-terminal--failed`.
- `overflow-wrap: anywhere` on `.clinical-activity` (long backend labels wrap instead of overflow).

Kept (shared or uncertain — preserved per 2.3): `.clinical-activity`, `.clinical-artifact*`, all voice/composer/transcript selectors, `Spinner` animation, and the shared reduced-motion block (only the removed selector was dropped from it).

## Snapshot decisions

Updated (intentional, Linux only, after no-update inspection and manual review):

- `clinical-draft`, `clinical-editing`, `clinical-approval-pending`, `clinical-approval-resolved`, `clinical-second-turn`, `clinical-second-approval`, `clinical-mobile` — each contains reviewed scope: draft hierarchy, lifecycle copy, dialog badge, one-spinner saving, receipt, terminal states.

Kept:

- `clinical-sidebar-collapsed`, `clinical-empty.aria.yml` — pass unchanged (no content change).
- `clinical-empty.png` — reverted after update run; failure pre-existing (identical 9715 px diff at starting SHA), left failing by policy.
- All `*-win32.png` — untouched; Linux is authoritative per proposal.

## Deviations from the plan

- Spec assertion fix: `confirmation.getByText('Guardando')` → `{ exact: true }` (badge and button text both match the substring; strict-mode violation). Component untouched.
- `clinical-empty.png` classified unrelated instead of updated — required by verification policy (starting-SHA reproduction).
- `clinical-draft.png` update (earlier session note called it stale) proved intentional: it contains this change's draft hierarchy plus the same pre-existing baseline drift; approved as intentional because its content is in scope.

## Issues encountered

- Starting-SHA reproduction required a one-off worktree build (`dynachat-app:sha-evidence` against `deploy_default`); teardown complete.
- `app-baseline.spec.ts` Linux snapshots fail in the same pinned environment (pre-existing, unrelated module) — not modified, out of scope.

## Requirement → proof audit

| Requirement | Proof |
|---|---|
| Protected voice-composer baseline | 275 Vitest incl. voice suite unchanged; dictation Playwright test passes; zero composer/voice source diffs |
| Transient thinking feedback | `ClinicalTranscript.test.tsx` entry/exit/idle; spec `Pensando…` visible → count 0; reduced-motion CSS branch |
| Structured activity presentation | 5-status class matrix + exact label assertions; aria-hidden icons; no label inference |
| Assistant draft artifact hierarchy | lifecycle matrix + `Borrador asistido` + `Preparar para guardar` callback test; manual mode untouched |
| Approval status hierarchy with preserved modal | 6 approval tests (prompt/modal/actions/spinner/terminals/conditional link); native dialog preserved |
| Scoped dependency-free presentation | no `package.json`/`bun.lock`/`components.json` changes; only `globals.css` tokens |
| Deterministic accessible validation | component tests + mocked browser flow; snapshots updated only after inspection; unrelated failure SHA-classified |

## Closeout state

- `openspec validate clinical-agentic-ux-polish` → valid.
- `openspec/changes/google-drive-managed-workspace`, `openspec/specs/`, `openspec/config.yaml` → unchanged (git-clean).
- No changelog file exists; no user-facing docs describe these labels → no docs updates.
- Ready for `/opsx-sync-specs clinical-agentic-ux-polish` then `/opsx-archive`.
