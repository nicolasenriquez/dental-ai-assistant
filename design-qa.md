# Clinical Assistant design QA

Reference: supplied Codex-inspired Clinical Assistant visual contract and the existing Dental AI Assistant shell.

## Clinical Evolution card polish — 2026-09-26

Scope (approved focused matrix): the single clinical evolution artifact inside `/assistant`, aligned to the supplied card mockup without a parallel card or a second state machine. Card surface (radius 13, gradient surface, `rgba(255,255,255,.11)` border, `0 12px 35px rgba(0,0,0,.18)` shadow, 760 px cap); kicker + title + masked-patient metadata; the `Borrador › Revisión › Guardada` breadcrumb replaced by one stage chip (`Borrador`, `Revisión`, `[spinner] Guardando…`, `Guardada`, amber `Necesita regeneración`), keeping `data-clinical-stage` and `aria-current="step"`; review-count chip in the header wired to the same flags disclosure; five-field grid (152 px desktop / 128 px tablet / stacked mobile) with inline edit, focus entering the textarea and returning to the same `Editar` trigger; stale strip inset; unified footer geometry; compact `•••` overflow trigger; embedded approval order corrected to secondary → primary. Manual evolution flow (`NewEvolution`) untouched; clinical fields and review-flag data unchanged; no heuristic flag → field mapping.

| Evidence source | Result | Scope |
| --- | --- | --- |
| Vitest | 548/548 passed | New review-chip disclosure, field focus return, edited-stale regenerate confirmation and sync-error retry tests plus the existing clinical suites |
| `bun run type-check` | passed | Frontend |
| Biome on changed files | passed | `globals.css`, `EvolutionReviewArtifact.tsx/.test.tsx`, `ClinicalEvolutionArtifact.tsx/.test.tsx`, `ApprovalRequestItem.tsx`, `ClinicalAssistant.drive.test.tsx`; the repo-wide run still reports only the pre-existing CRLF checkout drift on untouched files |
| Playwright `clinical` project, mocked browser against the isolated Docker rebuild (`localhost:8001`, win32 host run) | 27/27 passed (one new test) | `clinical evolution keeps inline field focus and review disclosure`; 12 win32 baselines refreshed; a second run without `--update-snapshots` passed identically |
| Viewports | 1440 × 1000, 1024 × 900, 390 × 844 | Full-page snapshots for draft, review, saved and Drive surfaces; reduced-motion matrix passed unchanged |

Deviation from the handoff's 18-state fixture matrix (agreed scope): the surfaces this pass changes are covered by the refreshed baselines plus the new browser focus/disclosure test; Drive terminal states keep their existing deterministic fixtures and were re-verified unchanged. Repo copy labels were kept (`Observación de revisión`, `Ver evidencia`, `Editar nota original`) so contract and e2e selectors stay stable. `Ctrl/Cmd+Enter` and `Escape` field shortcuts were not added (optional in the handoff). Five container-generated `*-linux.png` snapshots produced during an earlier container attempt were removed from the index and disk; only win32 baselines are updated. No live clinical write was performed; mocked browser evidence only.

## Visual fidelity pass — brand, composer, clinical header · 2026-09-26

Scope: clinical sidebar brand mark adopts the mockup literals (25 px, radius 8, `145deg #6790ff → #315fe7`, `0 6px 18px rgba(49,95,231,.24)`); the clinical composer takes the mockup surface (radius 15, `rgba(255,255,255,.11)` border, `rgba(18,23,32,.96)` background, deeper shadow, focus border `rgba(92,129,255,.58)` + 2 px `rgba(79,124,255,.13)` ring); the `/assistant` sidebar drops the redundant "Conversaciones" section title through a new `showHeaderTitle` opt-out that defaults to the shared behavior; the clinical workspace header becomes 52 px on desktop.

| Evidence source | Result | Scope |
| --- | --- | --- |
| Vitest | 544/544 passed | New `showHeaderTitle` opt-out regression test plus the existing clinical progress, composer, queue, sidebar and Drive suites |
| `bun run type-check` | passed | Frontend |
| Biome on changed files | passed | `WorkspaceThreadList.tsx`, `WorkspaceThreadList.test.tsx`, `ClinicalThreadList.tsx`; the repo-wide run still reports the pre-existing CRLF checkout drift on untouched files |
| Playwright `clinical` project, mocked browser on the isolated Docker rebuild (`localhost:8001`, win32 host run) | 26/26 passed | 8 baselines refreshed: `assistant-draft/review/saved-desktop`, `drive-browser/document/document-details/documents-browser-desktop`, `clinical-empty.aria.yml` (loses the removed section title). Mobile baselines unchanged |
| Mobile regression, caught and fixed before refresh | — | The first 52 px header override also applied at `max-width: 767px`, clamping the designed multi-row mobile header to 52 px; the Drive utility then overflowed under the transcript and intercepted clicks. Scoping the override to `min-width: 768px` restored the mobile header; the 390 × 844 click-intercept and harness tests pass again |

The Playwright actions above are **mocked browser** evidence on an isolated local stack rebuilt from this checkout. No live clinical write was performed and the shared Google-mode instance is not claimed for this pass.

## Interaction and layout refinement — 2026-09-26

Scope: clinical content width capped at 820 px inside `/assistant` only; turn progress gained the divider/dots treatment with a neutral pulse; elapsed stays at 0 s until the matching user turn is hydrated and hides while stopping; clinical user bubbles use the 74 % / 92 % widths; the Drive accessory content enters with a 200 ms opacity/translate motion; the collapsed clinical rail exposes the running indicator beside the pending dot; the dictation transcription timer is hidden from live announcements; the Drive separator regression now resizes with keyboard and pointer while a turn is streaming.

| Evidence source | Result | Scope |
| --- | --- | --- |
| Vitest | 540/540 passed | Progress elapsed/hydration/stopping, dwell, composer matrix, queue rules, collapsed rail indicator, dictation timer |
| `bun run type-check` | passed | Frontend |
| Biome (`bun run lint`, changed files) | passed | All touched TS/TSX files; the repo-wide run still reports the pre-existing CRLF checkout drift on ten untouched files |
| Playwright `clinical` project against the isolated Docker app on `localhost:8001` | 26/26 passed | Mocked clinical routes and browser-streamed SSE: retained turn through Drive open/close/resize (keyboard `ArrowLeft` plus 48 px pointer drag), history scroll, reduced motion at 1440 × 1000, 1024 × 900 and 390 × 844 |
| Desktop win32 snapshots | 3 refreshed, 6 unchanged | `assistant-draft/review/saved-desktop` refreshed for the intentional 820 px geometry; `drive-conflict`/`drive-error` passed unchanged once the Drive entrance animation stopped using `animation-fill-mode: both`, which had kept a composited layer and shifted text anti-aliasing during capture |

The Playwright actions above are **mocked browser** evidence on an isolated local stack. The shared Google-mode instance on `localhost:8000` was not rebuilt and is not claimed for this pass; no live clinical write was performed. Linux variants of the three refreshed snapshots do not exist in the repository, so only the win32 baselines were updated.

## Demo-state visual check — 2026-09-26

The HTML contains five prototype controls (`Respuesta`, `Esperando`, `Card clínica`, `Dictado`, `Vacío`). They are not a mode switcher in `/assistant`; the app shows the corresponding states through the clinical workflow. The approved scope used the HTML for behavior and hierarchy while retaining the app's own components and tokens.

| Prototype state | Isolated app evidence (Playwright CLI, mocked clinical routes) | Native browser evidence | Visual difference |
| --- | --- | --- | --- |
| Vacío | Empty assistant capture at 1440 × 1000 | Shared Google app and signed-in isolated app both showed the empty assistant | Heading and helper copy differ; prototype's safety line is not present |
| Respuesta | `.playwright-cli/assistant-answer-qa.png` | Existing shared conversation showed assistant prose | App uses its own prose/actions presentation |
| Esperando | `.playwright-cli/assistant-waiting-qa.png` showed `Trabajando · 5 s`, activity label, sidebar glyph and stable Stop/Encolar controls | Not exercised on the shared app | App uses the implemented progress block; prototype's timed sample labels are illustrative |
| Card clínica | `.playwright-cli/assistant-draft-qa.png` showed a structured draft without duplicate assistant prose | Existing shared conversation showed a saved clinical artifact | App keeps the five-field artifact, review workflow and current styling, rather than the prototype card layout/copy |
| Dictado | `.playwright-cli/assistant-dictation-qa.png` showed recording controls with a simulated microphone | Not exercised on the shared app | App's recording/transcription status follows its own voice workflow |

The native browser inspected the shared Google app **read only** (empty, response, saved artifact and Drive split); that instance was not rebuilt from the current checkout. The signed-in isolated app was also opened in the native browser for the empty state. Playwright CLI rendered the current isolated build with mocked clinical routes for the active and draft states, and a simulated `MediaRecorder` for dictation. The `.playwright-cli/` captures are local, ignored QA artifacts. These captures prove state presentation, not live clinical persistence or real microphone permissions. The HTML was inspected as source; automatic approval review rejected opening its local `file://` URL after the browser policy blocked it, so no rendered pixel-parity claim is made.

## Interaction polish verification — 2026-09-25

| Evidence source | Result | Scope |
| --- | --- | --- |
| Vitest with fake timers and component/hook tests | 539/539 passed | Elapsed `0 → 2 → 5 s`, 300 ms label dwell, hydration, active-turn and terminal state, composer controls, queue cap and patient conflict, Stop draft preservation, no progress-label auto-follow |
| Playwright `clinical` project against isolated Docker app on `localhost:8001` | 26/26 passed with isolated local auth setup; SSE rechecked 2026-09-26 | Mocked clinical API and browser-streamed SSE: turn start and activity observed before Drive open/close, response afterward; history scroll and jump, focus return, reduced motion, 1440 × 1000, 1024 × 900 and 390 × 844 |
| Desktop visual snapshots | 7 refreshed and passed | The 12 px Drive divider intentionally shifts the accessory panel a few pixels; its visible rule measured 1 px in the browser |
| Native browser on shared Google app | Read-only inspection before this code was built | Confirmed existing shell and Drive behavior only; no post-change or real clinical-write pass is claimed |
| Attached HTML | Source inspected; `file://` access blocked by native browser policy | Used for behavior and hierarchy, without a rendered pixel comparison |

The Playwright clinical actions above use mocked routes and a browser-side SSE stream in an isolated local app. They do not verify the shared Google instance or live clinical persistence. The historical observations below belong to earlier QA passes and retain their original evidence labels.

Primary viewport: 1440 × 1000 (Playwright clinical project). Additional viewports: 1024 × 900 and 390 × 844. Native Codex browser: 561 × 898 CSS px at device scale 1.5.

| State | Screenshot | Expected behavior | Observed behavior | Difference | Severity | Fix |
| --- | --- | --- | --- | --- | --- | --- |
| Empty assistant | `artifacts/clinical/01-assistant-empty.png` | Quiet workspace, clear patient-first action, persistent composer | Empty state and clinical composer render inside the existing shell | No material difference | low | none |
| Patient selected | `artifacts/clinical/02-patient-selected.png` | Active patient remains visible with masked RUT and clear control | Patient chip, masked RUT, select and clear affordance are visible | Mask follows the repository's existing dotted mask format | low | preserve domain mask |
| Draft with review flags | `tests/__snapshots__/clinical-assistant.spec.ts-snapshots/clinical-draft-clinical-linux.png` | One structured artifact, editable fields, restrained review area | Shared `EvolutionReviewArtifact` renders the five fields, source note, date and review state | None in deterministic capture | low | none |
| Source edit / stale | `tests/__snapshots__/clinical-assistant.spec.ts-snapshots/clinical-editing-clinical-linux.png` | Source edit makes the proposal stale and exposes regeneration | Source editing persisted through the artifact PATCH contract and disabled preparation until regeneration | None | low | none |
| Approval pending | `tests/__snapshots__/clinical-assistant.spec.ts-snapshots/clinical-approval-pending-clinical-linux.png` | Exact preview, patient context, explicit save actions | Inline approval card shows patient, final payload and both actions | None after JSONB hydration fix | low | none |
| Approval resolved receipt | `tests/__snapshots__/clinical-assistant.spec.ts-snapshots/clinical-approval-resolved-clinical-linux.png` | Compact receipt with date and ficha link | Resolved approval is compact and links to the saved evolution | None | low | none |
| Second turn / grouped transcript | `tests/__snapshots__/clinical-assistant.spec.ts-snapshots/clinical-second-turn-clinical-linux.png` | Turns remain visually grouped and ordered | Two turns render in chronological groups without technical identifiers | None | low | none |
| Saved result on mobile | `tests/__snapshots__/clinical-assistant.spec.ts-snapshots/clinical-mobile-clinical-linux.png` | Composer and approval/result remain usable without horizontal scroll | 390 × 844 capture keeps the patient selector, composer and single primary action usable | Long artifact content requires normal transcript scrolling | low | preserve scroll clearance |
| Voice permission failure | Browser snapshot, 1440 × 900 | Safe recoverable message; no auto-send | `El navegador no permitió usar el micrófono.` appears as an alert and composer remains usable | Recording state requires a granted microphone fixture | medium | validate with mocked MediaRecorder in browser suite |
| Patient status panel | Native Chrome via CDP, 1440 × 1000, 1024 × 900, 390 × 844 | Wide anchored patient context directly above composer | Panel stays composer-width, exposes only masked patient context, remains open while typing, closes with Escape, and has no horizontal overflow | Stable workspace hierarchy preserves composer state across breakpoint changes | medium | fixed and regression-tested |

## Interaction evidence

- Docker application: `app-blue` + Postgres healthy; Alembic applied migration `0017` at startup; `/api/health` returned `200`.
- Playwright container: `mcr.microsoft.com/playwright:v1.62.1-noble`; credential-free mocked clinical coverage passed `20/20`. Full `bun run e2e:clinical` did not complete within its `120000 ms` timeout after 23 tests, so no full-E2E pass is claimed.
- Native Codex browser: inspected AX tree and screenshot at 561 × 898 CSS px; selected the synthetic QA patient, composed a note, sent it, observed the draft runtime, reloaded, verified artifact rehydration, edited the source note, observed `Necesita regeneración`, and regenerated the same artifact.
- Native browser console: no errors on the valid thread. A deliberate invalid-thread probe produced the expected `404` for the nonexistent thread; it was not used as a pass signal.
- Playwright CLI refinement pass: rebuilt Docker runtime, installed authenticated clinical API mocks, opened the patient status surface at 1440 × 1000, 1024 × 900, and 390 × 844, typed with the panel open, verified Escape closure, measured `scrollWidth === clientWidth` on mobile, and observed zero console errors or warnings.
- Native Chrome Google session: authenticated manually, selected the real patient, opened and dismissed the patient status panel, and checked 1440 × 1000, 1024 × 900, and 390 × 844. With one stable `AppShell` workspace hierarchy, `Responsive state check` remained in the composer across `1440 → 1024 → 390 → 1440` and horizontal overflow remained false. Current post-login console: zero errors and zero warnings.
- Credential-free mocked clinical suite: `20/20` passed with `--project=clinical --no-deps --grep-invert "locks clinical patient|reuses one empty conversation"`. Full password setup remains incompatible with the configured `AUTH_MODE=google`, where local email/password controls are intentionally unavailable.
- The native `Confirmar y guardar` action was not pressed. It is a real clinical write and requires just-in-time confirmation before execution.

## Primary-flow score

| Criterion | Score (0–2) |
| --- | ---: |
| Hierarchy | 2 |
| Spacing | 2 |
| Readability | 2 |
| Density | 2 |
| Alignment | 2 |
| State clarity | 2 |
| Interaction clarity | 2 |
| Motion | 1 |
| Scroll continuity | 1 |
| Product consistency | 2 |
| Total | **18 / 20** |

No scored category is 0. Motion and scroll received 1 because the stable browser captures did not exercise the full streaming and reading-history matrix.

Final result: passed

Remaining coverage: the visual run does not exercise real microphone permissions or a native clinical save confirmation, and full password-backed clinical E2E remains incomplete. Dictation remains covered by existing voice tests; native save was intentionally skipped because it writes a clinical evolution.
