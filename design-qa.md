# Clinical Assistant design QA

Reference: supplied Codex-inspired Clinical Assistant visual contract and the existing Dental AI Assistant shell.

Primary viewport: 1440 × 900. Additional viewports: 1024 × 900 and 390 × 844.

| State | Screenshot | Expected behavior | Observed behavior | Difference | Severity | Fix |
| --- | --- | --- | --- | --- | --- | --- |
| Empty assistant | `artifacts/clinical/01-assistant-empty.png` | Quiet workspace, clear patient-first action, persistent composer | Empty state and clinical composer render inside the existing shell | No material difference | low | none |
| Patient selected | `artifacts/clinical/02-patient-selected.png` | Active patient remains visible with masked RUT and clear control | Patient chip, masked RUT, select and clear affordance are visible | Mask follows the repository's existing dotted mask format | low | preserve domain mask |
| Draft with review flags | `artifacts/clinical/05-clinical-draft-review-flags.png` | One structured artifact, editable fields, restrained review area | Draft fields and review flag render as one artifact; source edits mark it stale | Date metadata is not shown on the draft card | medium | follow-up polish |
| Approval pending | `artifacts/clinical/07-approval-pending.png` | Exact preview, patient context, explicit save actions | Inline approval card shows patient, final payload and both actions | None after JSONB hydration fix | low | none |
| Approval after refresh | `artifacts/clinical/08-approval-refresh.png` | Pending approval is reconstructed without the old SSE stream | Refresh restored the exact pending proposal and sidebar warning | None | low | none |
| Saved result | `artifacts/clinical/09-evolution-saved.png` | In-place success state with a ficha link | Deterministic save produced a linked evolution result | Resolved result is intentionally not hydrated as a card after refresh | low | saved record remains available in ficha |
| Saved result at narrow desktop | `artifacts/clinical/09-evolution-saved-1024.png` | Same hierarchy with reduced gutters | No horizontal overflow observed | None | low | none |
| Saved result on mobile | `artifacts/clinical/09-evolution-saved-mobile.png` | Composer and approval/result remain usable without horizontal scroll | Shell collapses and composer remains visible; controls wrap safely | Sidebar is collapsed to its existing menu affordance | low | none |
| Voice permission failure | Browser snapshot, 1440 × 900 | Safe recoverable message; no auto-send | `El navegador no permitió usar el micrófono.` appears as an alert and composer remains usable | Recording state requires a granted microphone fixture | medium | validate with mocked MediaRecorder in browser suite |

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

Final status: blocked

Blockers: the normal stack and the Whisper profile were validated with Docker, including the internal Whisper health endpoint and the absence of a host port mapping. The browser matrix still needs a deterministic granted-microphone fixture plus streaming/queue/scroll captures; real audio transcription was not exercised in this run. The implementation is safe to continue validating when those fixtures are available.
