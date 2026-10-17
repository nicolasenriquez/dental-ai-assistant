# Final planning audit — 2026-10-17

Scope: Diagnosis and History, including odontogram, saved-record editors, deletion, notes, conditions summary and motion. No application implementation, source clinical save or confirmed deletion was performed. Treatment Plans and Appointments are excluded; legacy plan evidence stays readable.

## Decisions and critical findings

| Priority | Finding | Plan disposition |
|---|---|---|
| High | Previous removal semantics required recording error, unlike the requested Eliminar. | Replaced by X1–X6 and deletion-design.md: exact saved UUID deletion with independent deleted audit; no reason or error status. |
| High | Removing an overlay alone leaves records/counts/notes and historical projections inconsistent. | Tombstone, revision and receipt commit atomically; update current readers, uniqueness, Activity and related-note access. Past snapshots use then-eligible revisions. |
| High | Source History opens an editor with enabled Save/Delete. | H4 strictly forbids commands/composers in History; future browser mutation trap required. Do not copy this defect. |
| High | Source selected Oct 3 while State at displayed 10/2/2026. | H2 requires one America/Santiago date interpretation across labels and cutoff, including DST. |
| High | A dirty modal could save edited surfaces before deleting, or cancel could lose draft. | Delete saved revision only; explicit unsaved-edit message, cancel preserves draft, no autosave. |
| High | Old clients/binaries could recreate error-removal or expose deleted records. | X6 retires new legacy operations with 410, preserves exact committed receipts; deletion-aware rollback floor required. |
| Medium | Source Escape closed the surface picker and disarmed its tool. Nested propagation could discard unrelated state. | Top overlay consumes Escape; nested cancellation returns to preserved parent with one active trap. |
| Medium | Reference modal reported no aria-modal; visual presence alone does not prove accessible modality. | Target requires semantic dialog, focus ownership, keyboard and screen-reader verification. |
| Medium | Missing initial revisions and later commits can produce deceptively complete historical pages. | Partial coverage, coverage-aware epochs, explicit stale refresh and no cross-epoch assembly. |
| Medium | Animation timing can conceal title reset or focus races. | Stable identity through exit, wait for settled focus, reduced-motion and responsive gates. |

## Fresh reference verification

Authenticated inspection used the native Codex in-app browser and its Playwright locator interface against the reference on localhost:3000. Standalone Playwright CLI was also exercised in an isolated session; it redirected to login. No auth state or cookies were copied. CLI evidence proves only that public/login session, not authenticated clinical behavior.

| Evidence | Action/result |
|---|---|
| [Saved editor](evidence/01-reference-editor-actions.png) | Opened existing Pulpitis record on tooth 43; Delete/Cancel/Save visible. This is not a saved Caries deletion proof. |
| [Confirmation footer](evidence/02-reference-delete-confirmation-footer.png) | Delete opened one confirmation naming Pulpitis/tooth 43 and warning it cannot be undone; Cancel initially focused. Cancel returned to editor; settled focus returned to Delete. Final Delete was never activated. Crop intentionally excludes record header. |
| [Unsaved surfaces](evidence/03-reference-surface-modal-unsaved.png) | Caries tool on tooth 11: zero selections disabled Confirm; M/O enabled it with count 2; deselecting both disabled it. Escape exited without saving. |
| [History dates](evidence/04-reference-history-dates.png) | Home/ArrowRight on timeline produced Oct 3 marker and State at 10/2/2026. |
| [History write controls](evidence/05-reference-history-write-controls.png) | Historical tooth/record activation opened editor with enabled Save/Delete. Closed without writes. |
| [CLI snapshot](evidence/cli-public-login.yml) | Separate CLI session reached login, captured public controls, then closed that session only. |

Reference modal computed motion was 200ms ease-out scale-in. The reference catalog/tooth feedback described in the recovered investigation is historical evidence, not a newly measured complete motion inventory. Proposed 0.98 modal scale is a target design choice. An immediate focus check during transition was inconclusive; stable post-transition focus was correct and is not reported as a defect.

All five retained image crops were visually inspected. They exclude patient header/identifiers and saved note contents. Recovered reference text is under reference/; its old binary captures are unavailable and are not fresh evidence.

## Verification limits and release gates

The target runtime on ports 8000/8001 was unavailable during this audit. No target behavior, migration, real-DB persistence, mobile hardware, 200% native zoom, screen-reader output or lost-response recovery is certified here. Reference interaction is evidence for design decisions only. The source's final deletion request/storage semantics remain unverified because deletion was not confirmed.

Every target acceptance case below remains planned until implementation and scoped synthetic-data verification. OpenSpec validation certifies artifact structure, not working UI. Do not mark future tasks complete based on these reference screenshots.

See [acceptance matrix](acceptance-matrix.md), [deletion contract](../deletion-design.md), [tasks](../tasks.md) and [readiness](../readiness.md).
