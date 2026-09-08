# Clinical Assistant design QA

Reference: supplied Codex-inspired Clinical Assistant visual contract and the existing Dental AI Assistant shell.

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

## Interaction evidence

- Docker application: `app-blue` + Postgres healthy; Alembic applied migration `0010` at startup; `/api/health` returned `200`.
- Playwright container: `mcr.microsoft.com/playwright:v1.62.1-noble`; clinical E2E passed with eight deterministic `toHaveScreenshot` snapshots.
- Native Codex browser: inspected AX tree and screenshot at 561 × 898 CSS px; selected the synthetic QA patient, composed a note, sent it, observed the draft runtime, reloaded, verified artifact rehydration, edited the source note, observed `Necesita regeneración`, and regenerated the same artifact.
- Native browser console: no errors on the valid thread. A deliberate invalid-thread probe produced the expected `404` for the nonexistent thread; it was not used as a pass signal.
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

Remaining non-blocking coverage: the visual run does not exercise real microphone permissions or a native clinical save confirmation. Dictation remains covered by the existing voice tests; the native save was intentionally skipped because it writes a clinical evolution.
