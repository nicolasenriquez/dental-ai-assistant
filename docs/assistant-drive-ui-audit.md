# Assistant + Drive UI/UX Audit

Baseline HEAD: `3b9710e6feb4d520200820b6ffdeb5fe30b2041c`  
Branch: `feat/ai-assisted-evolutions`  
Date: 2026-09-15

The audit covers the existing clinical workflow and Google Drive context panel. The local Assistant URL redirects to login without a session, so visual evidence comes from the committed clinical Playwright snapshots and the mocked clinical harness. No real Google requests were used.

| ID | State | Finding | Severity | Heuristic | Evidence | File | Resolution |
|---|---|---|---|---|---|---|---|
| A01 | Empty Assistant | Patient selection and composer are clear; Drive opening reduces the writing area noticeably. | P2 | Aesthetic/minimalist design | `plan-clinical-stable.png`, `plan-drive-open.png` | `AppShell.tsx` | Reduce document-mode split; retain compact Sheet. |
| A02 | Draft evolution | The five clinical fields are readable, but repeated Edit controls, metadata, lifecycle and utility actions compete with the clinical content. | P2 | Recognition rather than recall | `clinical-draft-clinical-win32.png` | `EvolutionReviewArtifact.tsx`, `globals.css` | Strengthen artifact hierarchy and subdue secondary controls. |
| A03 | Review / approval | Confirmation names patient and consequence; the dialog correctly interrupts a high-stakes save. | P3 | Error prevention | `clinical-approval-pending-clinical-win32.png` | `ClinicalEvolutionArtifact.tsx` | Preserve confirmation and make its primary action distinct. |
| A04 | Saving | Saving state and locked composer are explicit in existing code and tests. | P3 | Visibility of system status | `clinical-assistant.spec.ts` | `ClinicalEvolutionArtifact.tsx` | Preserve text and disabled contradictory actions. |
| A05 | Saved | Clinical save and Drive export have separate states, but the distinction can be more legible. | P2 | Visibility of system status | `clinical-assistant.spec.ts` | `ClinicalEvolutionArtifact.tsx` | Clarify status copy and terminal hierarchy. |
| A06 | Drive disconnected | Consent and continued use without Drive are explained. | P3 | User control and freedom | `drive-bootstrap.spec.ts` | `DriveWorkspace.tsx` | Preserve onboarding and recovery. |
| A07 | Drive connected / home | Connected status is visible; active patient context is missing from the top of the Drive panel. | P2 | Match with real world | `plan-drive-open.png` | `DriveWorkspaceHeader.tsx` | Show the already available patient context. |
| A08 | Drive browser | The import action is labeled inconsistently with its managed-copy operation. | P2 | Consistency | `DriveFileBrowser.tsx` | `DriveFileBrowser.tsx` | Name the copy operation explicitly. |
| A09 | Drive document | Selection and full-note insertion exist, but their labels do not say where content goes. | P2 | Recognition rather than recall | `DriveDocumentWorkspace.tsx` | `DriveDocumentWorkspace.tsx` | Name both actions as incorporation into the draft. |
| A10 | Drive dirty | Navigation guard offers save, discard and cancel. | P3 | User control and freedom | `ClinicalAssistant.drive.test.tsx` | `ClinicalAssistant.tsx` | Preserve without workflow changes. |
| A11 | Drive conflict | Local text is preserved and the current remote version can be inspected. | P3 | Error recovery | `DriveWorkspace.tsx` | `DriveWorkspace.tsx` | Preserve recovery and local text. |
| A12 | Drive error | Error explains local work is preserved, but generic title can obscure the failed operation. | P2 | Error recovery | `plan-drive-open.png` | `DriveWorkspace.tsx` | Keep operation-specific messages where available. |
| A13 | Export pending | Text status is present. | P3 | Visibility of system status | `clinical-assistant.spec.ts` | `ClinicalEvolutionArtifact.tsx` | Preserve. |
| A14 | Export syncing | Text status is present. | P3 | Visibility of system status | `ClinicalEvolutionArtifact.tsx` | `ClinicalEvolutionArtifact.tsx` | Preserve. |
| A15 | Export synced | The artifact links to the saved journal. | P3 | Visibility of system status | `clinical-assistant.spec.ts` | `ClinicalEvolutionArtifact.tsx` | Keep journal navigation; clarify clinical vs Drive outcome. |
| A16 | Export failed / unknown | Retry, reconnect and verify are distinct operations. | P3 | Error recovery | `clinical-assistant.spec.ts` | `ClinicalEvolutionArtifact.tsx` | Preserve these separate recovery paths. |

## Baseline verification

- `bun install --frozen-lockfile`: passed, no package changes.
- `bun run type-check`: passed.
- `bun run lint`: pre-existing import-order failure in `src/__tests__/authBootstrapMode.test.tsx`, outside this scope.
- `bun run test`: 61 files and 472 tests passed when run with host access. The sandbox attempt could not spawn esbuild (`EPERM`).
- `bun run e2e:clinical`: setup requires `E2E_USER` and `E2E_PASSWORD`; no credentials were supplied.
- `bunx playwright test --project=clinical --no-deps`: 14 passed, 2 pre-existing failures (dictation insertion order and concurrent empty-thread acquisition). Neither is a visual-change regression.

## Implementation result

The Assistant remains the primary surface: the normal split keeps 68/32 and the document split uses 56/44, with a 52% minimum for the clinical panel. At 1024 px and below, Drive becomes a modal Sheet. The five existing clinical fields, patient identity, accessible lifecycle, review controls and approval callbacks remain in place. Artifact hierarchy now emphasizes title, current state and next action; field editing and provenance are quieter but remain visible and keyboard accessible.

Drive shows the active patient and masked RUT, calls its Picker action “Abrir desde Drive”, its managed-copy action “Importar copia desde Drive”, and distinguishes selected text from a complete note when incorporating content. The source insertion format and dirty-state guard were retained. The saved artifact now states “Guardada en ficha” independently of Drive synchronization. Source-document errors identify the failed save; conflict presents one recovery notice and keeps the local buffer.

### Verification

- `bun run type-check`: passed after implementation.
- `bun run build`: passed with host access; sandbox-only esbuild spawn remains blocked by `EPERM`.
- Changed UI files pass targeted Biome. Full `bun run lint` remains blocked solely by the pre-existing import-order error in `src/__tests__/authBootstrapMode.test.tsx`.
- `bun run test`: 61 files, 472 tests passed.
- Clinical Playwright with the existing mocked harness and `--no-deps`: 19/22 passed in the full run before isolating the desktop Drive capture. The three failures were two baseline failures (dictation insertion order and concurrent empty-thread acquisition) and a screenshot affected by transient dimming of the clinical background. The Drive snapshot was scoped to the accessory panel and then passed without updating snapshots; the directed clinical and Drive flow passed 9/10 before that isolation. No backend or real Google traffic was used.
- Playwright CLI independently inspected the connected desktop panel and the 1024×768 Sheet accessibility tree, then captured the 390×844 Sheet. The browser reported zero console errors and one warning. The mobile panel had no horizontal clipping.
- The Impeccable detector reported six warnings in existing global CSS (side accent borders, Inter font, and layout-property transitions); none is introduced by this diff. Altering these shared styles would exceed this focused change.

### Visual matrix

“PASS” means that the exact viewport and state were exercised by the clinical Playwright test and its versioned snapshot. “Functional” means the state was asserted through an existing test without a snapshot at that viewport.

| State | 1440×1000 | 1024×768 | 390×844 |
|---|---:|---:|---:|
| Empty | PASS | PASS | PASS |
| Draft | PASS | PASS | PASS |
| Review | PASS | Not captured | Not captured |
| Saved | PASS | Not captured | Not captured |
| Drive disconnected | PASS | Not captured | Not captured |
| Drive connected | PASS | PASS | PASS |
| Document | PASS | PASS | PASS |
| Conflict | PASS | Not captured | Not captured |
| Error | PASS | Not captured | Not captured |

The browser tests also asserted no horizontal overflow at all three exact viewports, the 1024 px Sheet transition, document-mode Assistant majority, Drive selection reaching the composer with its source prefix, and mobile Sheet close/focus return. Conflict and save-error tests assert the edited local text remains in the document. Existing unit tests cover the dirty guard and recovery states; the full five-state Drive synchronization screenshot matrix was not added because the current fixture does not expose every transient state as a stable visual frame.

The pasted HTML mockup informed hierarchy only. No sample patient, fabricated evidence count, or extra workflow control was copied into production.
