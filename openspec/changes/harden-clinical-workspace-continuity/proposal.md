## Why

The Patients audit of 8 October 2026 and Clinical Assistant audit of 9 October 2026 identify clinical-state mislabeling, lost edits, cross-thread cancellation effects, and review or save-recovery dead ends at checkout `7345f7a2e762220a19c638709e85d1b92ca70fed`. Fixing these continuity failures before visual refinements lets clinicians inspect records, switch tasks, and explicitly approve an evolution without losing work or confusing its patient, saved status, or history.

## What Changes

Prioritize P1 corrections in two separately verifiable workstreams. Finding and slice IDs below are qualified by audit because both reports reuse the same identifiers.

| Workstream | Proposed outcome | Audit coverage |
|---|---|---|
| Assistant cancellation | A late Stop success/error/cleanup for thread A cannot abort, reset, or repaint thread B. Stop targets the current response; queued work remains available under existing dispatch rules. | Assistant F01, F07; S1 and copy portion of S7 |
| Assistant editing and review | Unapplied field/source edits survive internal navigation in authenticated memory until applied or explicitly discarded. Closing an approval dialog returns to an operable review with visible confirmation/edit actions and useful focus, without approving or declining. | Assistant F04–F05; S2/S4 |
| Assistant patient identity | An artifact retains its historical owner-scoped patient independently of the workspace selector. Patient changes/removal cannot silently transfer unsent text, attachments, queued messages, or edit buffers. Patient-less queue recovery uses the same explicit context policy. | Assistant F02–F03, F08; S3/S6 |
| Assistant save recovery | Distinguish expired approval, canonical save failure and uncertainty. Add explicit owner-scoped draft recovery preserving terminal actions, verify canonical state first, and require fresh human approval before a new save. Keep Drive recovery separate. | Assistant F06; S5 |
| Patient state and interaction | Render every existing treatment state truthfully, including `performed` as "Realizado", separately from allowed actions. Distinguish historical record focus from operative tooth selection; provide predictable modal Escape/focus return and clear multi-piece members without disarming the tool or writing. | Patients F01–F04; S1/S2; T01–T04 |
| Patient history and notes | Keep legacy plan evidence read-only and accessible through existing links without presenting plan authoring as a daily mode. Canonicalize resource URLs, focus exact note/plan targets, and retain available declared note-actor names with trustworthy UUID fallbacks. | Patients F07, F09–F10, F12; S3/S5; T07/T09/T10/T12 |
| Bounded presentation | Propose a compact category selector, contextual catalog search, complete variant labels, and concept-level legend descriptions. Clarify Stop/queue copy and meet the existing 44px coarse-pointer contract. Assistant starter/header density changes follow functional verification and design approval. | Patients F05–F06/F08; S4; T05/T06/T08. Assistant F07/F09/F10; S7 |

Add the explicitly authorized `POST /api/clinical-actions/{action_id}/recover-draft` contract without breaking existing endpoints or adding a schema migration. Preserve direct chart recording under the existing active-tool contract, explicit saves for stored-record edits, human approval for evolutions, retry identities, revision checks, owner scope, history, and the incumbent visual system.

### Non-goals and deferred findings

- No plan authoring restoration, plan API freeze, historical deletion, taxonomy change, new clinical state, or universal pre-save confirmation for chart activation.
- No new state/UI library, model provider, SSE protocol, browser-persisted clinical buffers, Drive synchronization redesign, or durable-worker refactor.
- Patients F11/S6/T11 (durable evolution authorship) remains deferred pending an approved actor definition and reliable provenance investigation. Never infer author from owner or backfill unknown history. Any required schema change needs separate approval and an additive migration plan.
- Patients O01 (initial quadrant redesign) remains deferred; O02 (floating Notes overlap) requires a reproducible obstruction before entering scope. Performance optimization requires measurement, not audit-derived claims.

## Capabilities

### New Capabilities

None. This change repairs and clarifies existing clinical workflows rather than adding a feature area.

### Modified Capabilities

- `conversational-runtime`: make Stop completion/cleanup isolation explicit and define the approved original-context policy for patient-bound and patient-less unsent/queued work.
- `clinical-agentic-feedback`: extend artifact continuity to unapplied edit buffers and historical patient identity; retain review triggers after dismissal; distinguish canonical failure/expiry from uncertainty; add the approved explicit draft-recovery contract while preserving generic frozen-artifact and human-approval protections.
- `odontogram-human-workflow`: clarify saved-treatment state presentation versus command capability, separate record reference from operative selection, and specify guarded modal closure and multi-piece selection reset.
- `clinical-workspace-discovery`: specify canonical exact-resource navigation/focus, qualified read-only plan history, consistent available note attribution, and compact searchable catalog composition without changing catalog identity or clinical command semantics.
- `dental-diagnosis-workspace`: adapt palette/responsive requirements to the approved compact composition and retire the outdated plan-authoring CTA requirement while preserving historical links.
- `patient-clinical-treatment-plans`: align historical UI and the already implemented creation HTTP410 with current Product policy, without freezing existing stored-plan commands.
- `patient-dental-clinical-notes`: preserve current free-text, pre-typing hover and explicit candidate-selection behavior instead of restoring retired template controls during note work.

Concurrent work archived `mirror-dental-diagnosis-workspace` as `2026-10-09-mirror-dental-diagnosis-workspace` during planning and added its capability specs to the main tree. These deltas account for that baseline and resolve relevant older mirrored UI requirements against current `PRODUCT.md`, the 7 October surface decisions and existing code. This planning work did not perform the archive or edit those main specs.

## Impact

### Ownership and verification seams

- Assistant owner: `ClinicalAssistantArea`, `useClinicalAssistant`, transcript/artifact/review components and their existing runtime/memory interfaces. Observe caller-visible behavior through `useClinicalAssistant.test.ts`, `ClinicalAssistantArea.test.tsx`, `ApprovalRequestItem.test.tsx`, and `EvolutionReviewArtifact.test.tsx`, followed by deterministic browser races and navigation checks.
- Patients owner: `PatientDiagnosis`, `useDentalWorkspace`, existing dental modal/presentation components, ficha routing, Activity, and dental-note detail. Prove behavior through existing diagnosis/treatment/Activity tests, typed-client/HTTP tests where links or metadata change, and browser T01–T12 cases applicable to the included scope. T11 remains deferred with F11.
- Backend recovery owner: existing clinical route/service/repository boundaries, observed through HTTP contracts and isolated live PostgreSQL concurrency/rollback tests. Reuse existing typed clients and historical-patient reads; only the approved recovery contract adds an endpoint. Keep SQL in `db/` and require security-sensitive review.
- Reuse semantic tokens and allowlisted primitives. Approved local composition changes update the affected `.impeccable/surfaces/` brief; only shared visual decisions update `DESIGN.md`.

### Evidence and acceptance gates

Assistant F01/F04/F05 have compiled-checkout browser reproductions. F02/F03/F06 were observed with a served bundle that does not hash-match checkout and have static corroboration; repeat them against matching checkout assets before accepting their implementation diagnosis. Existing passing tests and fixtures are not new regression proofs.

Each included finding needs a fail-first regression and direct behavior proof. Integration must cover late Stop callbacks, dirty navigation, A/B/null patient transitions, approval dismissal, failure before/after commit, genuine expiry, stale hashes, duplicate clicks/two tabs, and saved evolution with failed/unknown Drive export. Patient proof preserves all catalog IDs, FDI anatomy, zero writes from inspection/closure/navigation, revision history, exact links beyond page one, and existing dirty/busy/uncertain guards.

Use synthetic fixtures that cannot fall through to real APIs. Real atomicity, ownership, idempotency and response-loss proof requires a migrated isolated PostgreSQL environment. Clinical/Drive writes and provider UAT need separate environment-owner consent. Browser checks cover 1440×900, 1024×768, 768×1024, 390×844 and 360×800 plus applicable existing spec sizes, keyboard/focus, coarse targets, zoom/reflow and reduced motion. Screen-reader and real-device keyboard checks remain explicit gates, not claims inferred from screenshots. Run the full repository validation suite before implementation completion.

### Planning status and decisions

**Status: Implementation Ready.** Proposal, seven capability delta specs, design and bounded tasks cover the included findings. Implementation remains a separate decision; no runtime tests, clinical writes, spec sync or archive have been performed by this planning work.

The user's "proceed" approved planning the proposed scope and recommended original-context policy. The subsequent "yes", following the Spanish recovery recommendation, explicitly authorized the narrow backend recovery contract for specification. General consultation and general sources remain supported; unsent work keeps its original chosen context. Compact catalog and bounded density use the existing visual system.

Repository verification confirmed that historical patient metadata already exists in `get_thread_response` and `ClinicalTurnArtifact.patient`. Canonical failed/expired artifacts, however, cannot use pending-only `return_to_editing` or draft-only preparation. The approved separate recovery operation preserves terminal action history, checks canonical result/ownership/current state, restores retained content without overwriting it and requires a new approval. It never reopens approved/declined actions, retries an uncertain save blindly or bypasses approval. The detailed endpoint, transaction, conflict and idempotency rules are in `design.md` and the clinical feedback delta.

No material decision remains open. Matching-checkout reproductions, real database proof, consent for provider writes and assistive-technology/device verification are explicit implementation/release gates, not evidence already collected.

Use the current memory-only privacy contract for unapplied buffers: internal navigation preservation, no promised reload survival, and cleanup at logout. Pausing the entire queue, freezing legacy plan mutation APIs, and durable evolution authorship are outside this proposal; they do not block the included corrections.

### Sources

- [Assistant audit and evidence limits](../../../docs/design/audits/assistant-2026-10-09/README.md), [Shape](../../../docs/design/audits/assistant-2026-10-09/05_ASSISTANT_UX_SHAPE_PROPOSAL.md), [slices](../../../docs/design/audits/assistant-2026-10-09/06_ASSISTANT_IMPLEMENTATION_PLAN.md), and [finding traceability](../../../docs/design/audits/assistant-2026-10-09/07_ASSISTANT_TRACEABILITY_MATRIX.md).
- [Patients audit](../../../docs/design/audits/patients-2026-10-08/README.md), [Shape](../../../docs/design/audits/patients-2026-10-08/05_UX_SHAPE_PROPOSAL.md), [slices](../../../docs/design/audits/patients-2026-10-08/06_IMPLEMENTATION_PLAN.md), and [finding traceability](../../../docs/design/audits/patients-2026-10-08/07_TRACEABILITY_MATRIX.md).
- Governing contracts: `PRODUCT.md`, `DESIGN.md`, `docs/design/UX_PRINCIPLES.md`, the two affected surface briefs, and existing OpenSpec capabilities. Audits provide evidence and proposals, not authority to override those contracts.
