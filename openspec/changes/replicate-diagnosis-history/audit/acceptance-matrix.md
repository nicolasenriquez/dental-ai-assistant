# Target acceptance matrix

All rows: **PLANNED / NOT EXECUTED**. Reference observations are separately recorded in README.md. Use synthetic owned test records and an isolated runtime; no real patient deletion is needed.

| ID | Required proof | Requirements | Tasks |
|---|---|---|---|
| A01 | Saved Caries modal exposes Eliminar; unsaved picker and History do not. | X1,H4 | 1.6,3.7 |
| A02 | Cancel/backdrop/Escape preserve dirty note/surfaces, parent focus and tool; no writes/autosave; no duplicate traps. | X2,D4 | 1.6,3.7,3.4 |
| A03 | Confirm names saved UUID/label/surfaces, warns about draft, no reason field; one pending command despite double click. | X1-X3 | 1.5,1.6,3.6,3.7 |
| A04 | Delete one of several tooth conditions, including overlapping surfaces; preserve all other saved UUIDs/marks/counts. | X1,X4 | 3.6,3.7 |
| A05 | Bridge deletion names all members, removes one shared procedure; whole-arch label never uses FDI zero. | X1,X4 | 3.6,3.7 |
| A06 | Active/resolved findings and observed-existing procedures eligible; protected planned/performed/cancelled/legacy-error procedures read-only. | X1,X5 | 1.5,3.6 |
| A07 | Ownership 404; invalid payload 422; stale revision 409; no automatic delete rebase; foreign receipt discloses nothing. | X3 | 1.5,3.6 |
| A08 | Same operation exact replay returns original receipt; altered hash conflicts; new operation already deleted conflicts; racing delete/edit atomic. | X3 | 1.5,3.6 |
| A09 | Response lost freezes operation; retry same ID; committed-delete refresh failure retries GET only; no false success. | X2-X3 | 3.6,3.7 |
| A10 | New UUID may use deleted active clinical key; old create replay never resurrects; constraints and duplicate queries agree. | X4 | 2.7,3.6 |
| A11 | Patient/tooth notes remain; procedure notes retain deleted context; no new note context on deleted procedure; Activity shows deletion. | X4-X5 | 3.6,3.7 |
| A12 | Before deletion date chart retains original; after date current omits it; deleted action/actor/time audit remains; resolve differs from delete. | X5,H1-H2,H5 | 3.1,3.7 |
| A13 | Missing revision partial coverage, zero history, orphan changes, day/DST, equal timestamps, cross-patient responses and late commits. | H1-H3,H6 | 1.1,3.1,3.2 |
| A14 | Exact-date reload/back/forward; matching timeline labels; pagination failure preserves last complete chart and its date; mutation trap zero. | H2-H5,D1 | 3.2 |
| A15 | No new recording-error wizard/undo/callers; new legacy operations 410; prior exact receipt replay and replacement history remain. | X6 | 2.8,3.8 |
| A16 | Deletion-aware migration/readers precede writers; retained snapshots; compatible rollback does not resurrect or purge. | X4-X6,H6 | 2.7,3.6 |
| A17 | Accordion counts unique/filter-aware, 12 findings/63 incumbent variants retained; direct vs surface creation unchanged; one notes draft. | D2-D3 | 3.3 |
| A18 | Stable leaving title, 150/200ms scoped timing, reduced motion, Tab/focus/aria modality, 390/768/1440 widths and 200% zoom. | D4 | 3.4 |
| A19 | Synthetic create/edit/delete/reload/as-of across actual UI/HTTP/Postgres, full validation suite and build. | All | 3.5 |

No acceptance of an unexecuted row is implied by planning readiness. Report unavailable native/mobile/assistive-technology checks explicitly when executing these tasks.
