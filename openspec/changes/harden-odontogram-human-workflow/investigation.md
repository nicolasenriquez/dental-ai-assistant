# Investigation and scope decisions

Status: **Implementation Ready at specification level**. Subsequent G01–G09 are closed in R9/R13–R15 and visual-contract.md. D-01/D-02 remain approved; runtime implementation is deferred.

## Evidence baseline

- Audit: [auditoria-odontograma.md](C:/Users/nenri/.codex/visualizations/2026/10/05/01a10c97-3eb1-73c3-ab4b-6c9afab5a94a/auditoria-odontograma.md).
- Assistant audited commit: `06b12bfaacdb23b33aa04306f617e6a22bd89e94`.
- DentalPin reference commit: `fc36a71bdf1778d45e44ed7f72fbd0536d0be842`.
- Observed Assistant proof: 11 Playwright scenario groups, six exact viewport sizes, real authenticated API and disposable Postgres; four revisions reconciled for the principal condition and 12 Activity event IDs reconciled against revision IDs.
- Tests actually run: 28 selected backend tests including live Postgres tests; 12 frontend tests. These are baseline results, not proof of changes in this new specification.
- DentalPin writes/concurrent mutation, high-volume performance, clinical terminology decisions, real screen reader and virtual keyboard remain unverified.

## Existing change boundary

`openspec list --json` reports `dentalpin-inspired-clinical-workspace` and `improve-clinical-grounding` complete. This new change must not reopen or rewrite their task completion records. Some older readiness prose describes their pre-implementation phase; task status and shipped source distinguish history from current behavior.

The predecessor `patient-clinical-contract.md` explicitly requires resolving an incorrect record and creating another to correct immutable tooth/dentition/code. OD-01 therefore proposes a product-contract change, not a claim that implementation violated that earlier requirement. It needs a recorded human decision before a replacement lifecycle is specified.

## Highest existing seams

- Owning Module: patient clinical conditions; patient workspace owns visual selection and navigation.
- HTTP Interface: catalog, patient condition POST/PATCH/GET/revisions and patient Activity GET via `routes/patient_conditions.py`, `routes/patient_activity.py`, and typed `lib/api.ts`.
- Persistence Adapter: `db/patient_conditions_repo.py` with ownership, expected_revision, row locking, condition/revision transaction and retry identity.
- Highest test Seam: authenticated UI → typed HTTP → patient condition repository → real Postgres, plus component tests for selected piece, draft, conflict and navigation behavior.
- Existing visual boundary: `PatientDiagnosis.tsx` and `PatientOdontogram.tsx`; piece controls use a 720px container threshold inside a two-column layout beginning at 960px.
- Depth / Locality / Leverage: preserve validated persistence invariants; change observable workflows at their owning seams. Introduce a shared application service only if approved scope needs it; do not replace asyncpg, add a plugin framework, or fork tool rules.

## Finding disposition under approved scope

| Findings | Candidate scope | Required decision or evidence |
|---|---|---|
| OD-01 | Correction distinct from resolution | Lifecycle, reason, replacement atomicity and compatibility with historical records. |
| OD-02, OD-07, OD-08 | Selection, editor density, URL continuity | Bounded UI contracts; preserve draft guards, accessible controls and explicit save. |
| OD-03 | Visible professional author | Authorized actor label and historical/deactivated-user representation. |
| OD-04 | Current vs historical view | Product default; no inference of normal examination from empty records. |
| OD-05 | Field-aware conflict review | Explicit local/server choice; no automatic clinical merge. |
| OD-06, OD-09, OD-10 | Taxonomy, mixed view, surface labels | Clinical scope/terminology decisions; not automatically new requirements. |
| OD-11 | Performance investigation | Large synthetic fixture first; no measured performance claim yet. |
| OD-12, OD-13 | Shared application seam, proposal/approval/provenance | Decide roadmap vs runtime tool scope before authoring. |
| DP-01–DP-03 | Reference cautions | Do not import ambiguous performed/existing taxonomy, immediate writes or inaccessible SVG interactions. |

## Resolved decision D-01 — Scope

Question presented to the user: what scope should the new OpenSpec cover?

1. **Recommended:** complete human workflow; agent tooling remains a separate roadmap.
2. Human workflow and agent tools in the same change.
3. UX improvements only, without changing clinical contracts.

User response: `go`, following the explicit recommendation and next clarification step. This accepts option 1: complete human workflow, with agent tooling kept as a separate roadmap. It does not authorize implementation or tool execution. No tool registration, autonomous write, proposal/approval runtime, treatment-plan engine, procedure entity or taxonomy expansion is included implicitly.

The future change will trace all audit findings: confirmed human-workflow defects are candidates for requirements; clinical taxonomy, simultaneous mixed-dentition view and unmeasured performance remain decision/research gates rather than invented implementation obligations. The final approved scope must make these dispositions explicit.

## Resolved decision D-02 — Correction semantics

Concrete scenario: Caries was entered for FDI 16 but should have been entered for FDI 26. Existing tooth/code identities are immutable. Which operation should replace the predecessor resolve-and-create policy?

1. **Recommended:** mark the original as entered in error, require a reason, and allow an optionally linked replacement saved atomically with that correction.
2. Mark the original as entered in error; a corrected record is created later through a separate operation.
3. Change tooth/code on the same condition identity while retaining a revision history.

User explicitly selected option 1: mark the original as entered in error and allow an optionally linked, atomic replacement, with mandatory reason. This supersedes the earlier resolve-and-create correction policy for future operations. It preserves original evidence and distinguishes a recording error from clinical resolution. Historical resolved records will not be automatically reclassified.

## Investigated defaults and bounded deferrals

### Resolved decision D-03: correction after concurrent resolution

The audit presented this concrete scenario: correction starts on an active revision, another session resolves it, and the correction receives409. Recommendation: retain reason and optional replacement, review the current resolved source and confirm a new correction attempt explicitly. User answered `proceed` to that recommendation on2026-10-06.

This approves recovery for the separate correction command against active or resolved sources. It does not permit ordinary editing/resolution of terminal records. A definitive conflict releases the rejected attempt; renewed confirmation freezes a new operation_id and latest expected_revision. Another conflict repeats review. entered_in_error sources allow identical committed-operation receipt recovery, not a new correction.

The canonical `clinical-workspace-discovery` requirement still prescribes resolve-and-create and resolved read-only behavior. A MODIFIED delta in this change replaces that policy without rewriting canonical or predecessor files during preparation.

- Correction may annotate an owned active or resolved original as entered_in_error; it cannot reopen or delete it. Already-entered-in-error originals reject new correction operations. Historical revisions stay intact. An identical operation retry returns its receipt before lifecycle checks.
- The users repository does not provide a verified professional name. Actor UUID remains authority; UI uses an explicit stable account identifier when display_name is absent. No account-profile feature, snapshot of invented name, email or RUT fallback is included.
- UI defaults to current active records while explicit historical views retain resolved/entered-in-error records. GET status=all keeps its all-record semantics; original cursor contract is expanded, not silently filtered.
- Clinical taxonomy, new surface obligations/labels, examination entities, simultaneous mixed-dentition display, procedures/plans and full-chart historical replay are deferred. Permanent/primary coexistence remains supported. These are validation-dependent expansions, not prerequisites for the approved correction workflow.
- Large-fixture behavior is verified for paging and complete reads; no unmeasured performance target or speculative optimization is specified.
- Agent proposal/approval/provenance and tools remain roadmap-only; this change adds no LLM context, tool registrations or autonomous writes.

The final design and requirements define concrete defaults, command contracts and deferrals. No material decision is hidden behind an implementation task.

## Readiness

- Complete `spec-driven` artifact set exists: README, proposal, design, top-level spec index, capability delta, tasks, evidence and readiness review.
- OpenSpec strict validation passed and status reports proposal/design/specs/tasks done;29 future tasks remain unchecked.
- Phases0–4, adjacent Traceability, fail-first seam proofs and acyclic Execution Order are present and checked.
- No production files, tests, migration, tools or predecessor change artifacts were modified. Implementation remains deferred.
