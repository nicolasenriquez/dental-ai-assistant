# Independent implementation-readiness review — 2026-10-17

## Verdict

**78/100. Needs specification revision before unconditional Implementation Ready.** This review supersedes the earlier readiness assessment, not the reviewed product requirements. The earlier readiness.md label remains historical and should be corrected when these findings are resolved. No application changes or proposed fixes have been implemented by this review.

The requested standard is that no material product, data-integrity or integration decision is delegated implicitly to the implementation agent. Ordinary implementation choices (private function names, local decomposition, current Alembic head) need not be exhaustively prescribed. Future fail-first tests being unexecuted is expected at planning time and is not itself a defect.

## Scoring rubric

| Dimension | Maximum | Earned | Assessment |
|---|---:|---:|---|
| Scope and product behavior | 20 | 18 | Clear exclusions, reuse and explicit deletion meaning. |
| API and projection contracts | 20 | 15 | Strong foundations; selected-day events and read-model units need closure. |
| Data integrity and compatibility | 20 | 15 | Atomicity/receipts/ownership covered; cross-store identity and shared lock order incomplete. |
| UX, modals and motion | 15 | 13 | Dirty drafts, focus, reduced motion and responsive acceptance are explicit. |
| Executable dependency plan | 15 | 9 | Acyclic graph still permits a verification task before its actual prerequisite; incompatible green checkpoints. |
| Verification and traceability | 10 | 8 | Good real-DB/browser distinctions and acceptance matrix; several decisive compatibility cases absent. |
| **Total** | **100** | **78** | **Do not begin unconditional implementation from this plan yet.** |

## Findings

### F1 — High: operation identity across old/new receipt stores is not specified

[deletion-design.md](../deletion-design.md), lines 66–68, chooses patient_clinical_commands and promises conflict when an operation is reused for another resource/action. However, the inspected condition correction implementation resolves old operations from patient_tooth_condition_revisions (app/backend/db/patient_conditions_repo.py:278–289). Treatment commands use patient_clinical_commands (patient_treatments_repo.py:137–163), with existing hashes that must remain replayable.

The new deletion lookup alone cannot identify an operation previously committed in the condition-correction store. Its unique constraint does not span both stores. The retirement endpoint's 410 rule also needs an explicit decision for an operation already used by a different new command. The draft does not define cross-store lookup/namespace precedence or exact canonical hash serialization/versioning for the new commands while preserving legacy hashes.

Closure: choose and document one collision policy across both stores (including owner/path checks and mismatch precedence), immutable hash fields/serialization, old receipt lookup and lock/recheck sequence. Add tests reusing a legacy condition-correction operation for a new delete, and the reverse. Preserve exact legacy replay without converting old corrections to deletion. No receipt migration or hash rewrite may be assumed.

### F2 — High: deletion's transaction sequence does not reconcile shared lock order

[deletion-design.md](../deletion-design.md):66 says resource lock precedes capability validation. Existing treatment commands take the operation advisory lock, then an associated plan aggregate lock, then the treatment row lock (app/backend/db/patient_treatments_repo.py:152–169 and following). New deletion must preserve the existing rule that plan-linked/performed evidence cannot be removed, including concurrent associations/transitions.

The plan says to preserve eligibility but does not choose whether deletion reuses that aggregate lock protocol, how association eligibility is rechecked or what serializes a concurrent link. A resource-first implementation that later acquires a plan lock can conflict with the incumbent order; an implementation that omits association synchronization can leave a time-of-check gap. This is a planning risk, not a demonstrated runtime deadlock in unimplemented code.

Closure: document the exact shared lock ordering and association revalidation for eligible/unlinked and protected/linked records, or a proven minimal alternative. Add delete-versus-link/transition concurrent real-Postgres tests and non-mutation assertions. This safeguards retained evidence; it does not authorize plan authoring.

### F3 — High: execution graph and green checkpoints are inconsistent

[tasks.md](../tasks.md):86 requires 3.7 to verify earlier/current History. Slice 5 is blocked only by 3.6 and 3.3 (line 133), so the declared graph allows 3.7 before History UI task 3.2. Acyclicity alone does not prove semantic prerequisites.

Additionally, 1.6 includes the legacy 410/replay contract, while 2.6 says to pass 1.6 before 2.8 implements that retirement. The stated green checkpoint cannot pass as a whole at that point.

Closure: add History completion to the 3.7 prerequisite, or split its current-only and History proof explicitly; split the UI deletion and retirement test checkpoints so each implementation slice has an achievable green gate. Recheck topological order and actual prerequisite coverage, not only task-ID membership.

### F4 — Medium: selected-day changes lack a bounded, complete read contract

[design.md](../design.md):76 defines the event GET with dentition/epoch/cursor/limit, while line 147 and H5 require changes for a directly selected day. The snapshot GET supports at but does not return that day's event set. A date outside the loaded event window can therefore display its snapshot without a specified way to retrieve a complete selected-day change list.

The agent would have to choose between draining unrelated event pages, adding a date filter/API or treating partial loaded events as the day list. Those choices affect observable completeness and API compatibility. The prose in design.md:147 also omits deleted from its action list while normative H5 includes it.

Closure: select a bounded day-filtered event read or explicitly specified traversal/completeness model. Define independent pagination/counts, epoch binding and empty-versus-not-loaded behavior for exact-day links, including deleted events. Add a deep-link test whose date is outside the first event page.

### F5 — Medium: snapshot inclusion/count semantics need one explicit state table

[design.md](../design.md):92–98 gives a generic snapshot item and says deleted snapshots are audit-only, while planned historical evidence is rendered in addition to chart-eligible existing/performed procedures. It does not explicitly state whether planned marks contribute to charted_records/affected scope or whether tombstones are returned in snapshot items versus only the event API. Different reasonable adapters would disagree on visible marks, item pagination and counts.

Closure: define a record-kind/state/provenance/deleted eligibility table for snapshot inclusion, mark rendering, record count, charted count, affected-teeth/arches and deleted count. Supply typed response examples for active/resolved/deleted findings, existing/planned/performed/cancelled/legacy-error procedures and an empty/partial projection. This does not require a new taxonomy or plan commands.

## Secondary tightening

- Identify the exact condition action/revision integrity checks and DTO unions to extend: 0024_condition_corrections.py:34–50 and routes/patient_conditions.py:62–66 currently reject or omit deleted. The plan anticipates action/DTO expansion, so this is an implementation checklist precision improvement, not a newly discovered missing deletion feature. Decide whether deletion revisions keep legacy correction operation fields null and use the separate receipt table, or explicitly change those constraints.
- Quantify the volume/latency or query-plan acceptance for rebuilding a full revision-set epoch on every page. Bounded response size does not by itself bound aggregation work. Avoid inventing a second store without evidence.
- Reconcile active shared changes at implementation entry; that normal baseline gate does not certify a specific build now.

## Evidence and limits

Reviewed proposal, design, deletion-design, all five capability deltas, tasks, readiness and acceptance matrix, with targeted source checks of condition/treatment services, routes, revisions, migrations, cursor transport and shared command locking. No browser round trip can resolve these unimplemented backend/spec contracts, so prior reference captures were not relabelled as target proof.

Re-ran `openspec validate replicate-diagnosis-history --strict`: passed. Structural validator also passes (26 tasks, 27 requirement entries, links/consolidated spec and acyclic graph). These results validate syntax/structure and do not refute the semantic findings above. No target runtime suite or application implementation was executed.

## Exit criteria for the next review

1. F1–F3 closed with explicit compatibility/concurrency decisions, test cases and feasible task order.
2. F4–F5 resolved consistently across design, normative requirements, examples and tasks.
3. Secondary checklist decisions recorded where they affect response/schema behavior.
4. Regenerate consolidated spec and re-run strict and structural validation, then independently reread the remaining decision points.
5. Update the readiness label only after closure; do not award 100 merely because the validator passes. Implementation and release verification remain later separately authorized work.
