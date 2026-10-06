# Evidence and finding disposition

## Baseline, not future implementation proof

Source: [audit report](C:/Users/nenri/.codex/visualizations/2026/10/05/01a10c97-3eb1-73c3-ab4b-6c9afab5a94a/auditoria-odontograma.md), [UI/API evidence](C:/Users/nenri/.codex/visualizations/2026/10/05/01a10c97-3eb1-73c3-ab4b-6c9afab5a94a/odontogram-evidence.json), [DB reconciliation](C:/Users/nenri/.codex/visualizations/2026/10/05/01a10c97-3eb1-73c3-ab4b-6c9afab5a94a/odontogram-db-evidence.json).

Previous audit: 11groups Playwright with real owned HTTP/Postgres,28 selected backend/12frontend tests. Four principal revisions and12Activity IDs reconciled. Six exact Assistant sizes. Piece controls measured32 at1440 and0 at1280/1024/768/430/390, with dropdown fallback. Environment removed; no shared clinical writes. This preparation phase runs artifact checks only.

| Finding | Disposition | Requirement/slice |
|---|---|---|
| OD01 | Approved correction≠resolution, required reason and optional atomic replacement | R1–R3/S1–S2 |
| OD02 | Visual controls restored across exact sizes | R6/S4 |
| OD03 | Safe actual actor UUID fallback; professional profile deferred | R5/S3 |
| OD04 | Active UI default, explicit history, no health inference | R4/S3 |
| OD05 | Field comparison required; suspected clobber awaits first proof | R8/S5 |
| OD06 | Taxonomy/procedure/examination research deferred | R12/closeout |
| OD07 | Applicable controls and selected FDI, compact mobile preview | R7/S4 |
| OD08 | Safe URL continuity/draft guards | R9/S6 |
| OD09 | Coexistence preserved; simultaneous mixed view deferred | R12/closeout |
| OD10 | Existing optional canonical surfaces preserved; clinical label changes deferred | R2/R12 |
| OD11 | Paging/incomplete-read fixtures1/50/51/500; no unmeasured speed promise | R10/integration |
| OD12 | Small shared condition application boundary, no framework/tool | R11/S1 |
| OD13 | IA approval/provenance roadmap only | R12/closeout |
| DP01 | Do not import ambiguous existing/performed taxonomy | R12 |
| DP02 | Shipped manual and verification-skill coverage | R10/closeout |
| DP03 | Preserve explicit commit and accessible controls | R1/R6–R7 |

## Future A–M Regression Matrix

Cleanup for every row: per-owner synthetic fixtures and teardown of verified own disposable project only; never shared volumes. UI/API/DB/audit assertions are independent.

| Case/layer | Precondition/action | UI expected | API expected | DB/audit expected |
|---|---|---|---|---|
| A E2E+DB | Empty patient;16CariesO, save/reload | Chosen piece, explicit saved |201/owned GET |1condition/rev1/actual actor; no draft write |
| B E2E+contract | O→M,O | Checks/drawing agree |200canonicalM,O |one revision |
| C E2E+contract | Whole-tooth code |Compact no-surfaces |[]valid; incompatible422 |created[]; no new obligations |
| D E2E+DB | Exact active duplicate |Retained draft/open owned existing |409duplicate |no duplicate/event; overlaps allowed |
| E E2E+DB |Edit note/surfaces;noop |Immutable identity/reload |expected_revision200 |increment once;noop/retry no event |
| F E2E+liveDB |Two-tab disjoint/same-field edits |Explicit base/local/current |409 then reviewed retry |remote untouched field retained |
| G E2E+liveDB |Resolve vs correct active/resolved |Distinct consequence/reason/cancel |Existing resolve/additive correction |Truthful status; optional replacement atomic |
| H E2E+DB |Recurrence/linked replacement |New identity/original accessible |newUUID201 |history conserved;supersedes link |
| I E2E |Bare URL/back/reload/dirty switch |Context preserved;cancel safe |owned exact-read |no navigation write |
| J API+liveDB |Actor2 uses actor1 IDs |No foreign data |404 tested paths |no mutation/disclosure |
| K E2E+contract |Permanent+primary51 |Correct per-piece dentition |invalidFDI/mismatch422 |coexistence;no mixed enum |
| L E2E6sizes |Every quadrant visual select |44px/no overflow/no reselection |reviewed piece saved |selection no write |
| M component/E2E/manual |Keyboard/focus/labels/contrast |Measured focus/state/a11y |none beforeSave |manual coverage labeled honestly |

Correction-specific proofs: replacement/revision failure rollback; duplicate rollback; identical operation retry stable receipt after replacement edits; frozen uncertain transport attempt; changed payload409; same-operation race one commit; distinct corrections/edit/resolve race; invalid reason/UUID/extra fields; foreign source/replacement UUID safe404; owner-scoped operation identity without disclosure of another owner's receipts; legacy null metadata/cursors; no automatic status migration.

Preserve explicit save, in-memory draft/guards, owner authorization, expected_revision, locks and atomic history, exact active uniqueness/overlap policy, no-op/retry policy, fresh recurrence identity, resolved readonly except distinct error annotation, Activity revision IDs and privacy. No auth/Drive/evolution/LLM expansion.

## Roadmap and proof limits

IA later requires shared application, minimal schemas/RBAC, immutable proposal, approval bound to patient/hash/revision, idempotency and attributable provenance. None is exposed as a tool here. Professional profile, taxonomy, combined mixed review, normal exam, plans/procedures and chart-wide replay need separate decisions. These are explicit deferrals rather than hidden unchecked tasks.

NOT VERIFIED in the audit: Pin writes/concurrency, large-volume speed, clinical nomenclature certification, real screen reader/contrast/virtual keyboard. Future verification must record actual coverage; spec validation cannot substitute for it.

## Subsequent reference closure and proof limits

G01–G09 map to R9/R13–R15 and existing S2/S3/S4/S6 in reference-gap-review.md. visual-contract.md defines the normative matrix; wireframes/odontogram-reference.html is synthetic composition only. wireframes/reference-check.json records96 rendered checks across six sizes, ten states, desktop panel open and primary fixtures. Screenshots review long names/notes, draft, conflict, correction and stale read. No production clinical write or runtime implementation was performed.

Future fail-first and integrated proofs must exercise all four command postconditions, confirmed-write/failed-GET versus uncertain-write feedback, exact result focus, stale patient responses, symbol/state separation, count units with incomplete paging, no hover mutation, anatomical quadrant order and existing clinical URL compatibility. Reference checks cannot replace these proofs. Real assistive technology and keyboard-on-device coverage must be reported explicitly.