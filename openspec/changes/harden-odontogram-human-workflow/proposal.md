## Why

The audited odontogram persists records safely but the human workflow makes error correction look like clinical resolution, loses visual tooth selection at common widths, obscures authorship and offers conflict recovery without field comparison. Close these observable gaps before introducing agent writes.

## Investigation / Current State

- Real UI/API/Postgres baseline proves explicit save, ownership, expected_revision, atomic revisions, idempotent retry and recurrence identity. It does not prove future corrections or agent tools.
- Piece controls disappear when chart width is below720px, including1280px desktop under the two-column layout.
- The predecessor explicitly required resolve-and-create for an immutable-field mistake. The user now approved entered-in-error correction with mandatory reason and optional atomic replacement.
- Accounts expose no verified professional name; UUID-backed account labels are the safe current alternative.

## What Changes

- Add an explicit correction command, entered_in_error terminal status, reason, linked optional replacement and retry receipt.
- Show current active conditions by default, keep explicit historical views and deep links, display actual author identity safely.
- Preserve visual tooth selection through responsive rearrangement; compact irrelevant fields without hiding clinical content.
- Replace generic rebase with base/local/current comparison and deliberate field choices.
- Persist safe ficha tab/subview/resource URL context; preserve existing draft guards.
- Add a small patient-condition application boundary shared by existing HTTP commands; no agent adapter in this change.
- Add scoped regressions and update only documentation reflecting shipped behavior in future closeout.

## Capabilities

### New Capabilities

- `odontogram-human-workflow`: correction lifecycle and audit receipt, current/history reading, safe actor rendering, responsive selection, explicit conflict review and patient navigation continuity.

### Modified Capabilities

None of the synchronized canonical capabilities is replaced. This new delta explicitly refines the condition contracts introduced by completed `dentalpin-inspired-clinical-workspace`, whose files and task history remain unchanged.

## Change Profile

- Profile: mixed-change.
- Runtime API/persistence/UI corrections with documentation and verification updates at closeout. Phase1 fail-first coverage is mandatory.

## Out Of Scope

Agent tools, autonomous writes, LLM odontogram context, proposal/approval runtime, taxonomy expansion, required surfaces, mixed-dentition combined view, examination/normal-health inference, procedures/plans/billing, profile management, event bus, ORM replacement, broad UI redesign or decorative motion.

## Ownership and Test Seam

- Highest existing Seam: authenticated patient-condition HTTP and rendered patient diagnosis workflow.
- Owning Module: patients/conditions and patient workspace.
- Interface: existing catalog/conditions/revisions/Activity plus additive correction command.
- Highest test Seam: real UI→HTTP→Postgres; component tests for field diff, spatial selection and navigation.
- Adapter: FastAPI route and typed frontend API client; asyncpg repository remains persistence adapter.
- Depth / Leverage / Locality: centralize human commands without duplicating transaction rules; keep SQL in db and UI intent in patient components.

## Prior Art and First Proof

- `test_clinical_workspace_live.py`: lifecycle/retry/ownership, concurrency, revision rollback and overlapping surfaces.
- `PatientDiagnosis.test.tsx`: draft/no write, explicit resolution, conflicts and complete paged reads; `PatientOdontogram.test.tsx`, `PatientActivity.test.tsx`, existing patient E2E.
- First failing proofs: correction yields error status rather than resolved with optional replacement all-or-nothing;1280/390 visual selection without FDI reselection; concurrent remote surface/local note retained after explicit comparison.

## Execution Order Decision

Required: yes. Six bounded slices; correction UI, current/history and conflict recovery must understand the new terminal correction status. Visual selection and safe URL context can be verified independently. Integrated verification follows all slices.

## Impact

Patient condition domain/service/repository/routes, one additive migration, Activity mapping, typed client, patient diagnosis/chart/history/activity/navigation components and scoped tests. Auth, exports, Drive, clinical evolution approval and model prompts remain unchanged.

## Verification Policy

Fail-first external behavior at chosen seams; real Postgres for atomicity, constraints and races. All browser writes use owned disposable data. Baseline successes are not implementation proof. Six exact sizes and two-owner failures are required. Artifact validation does not imply shipped behavior.

## Notes

- Human D-01: flow first; IA roadmap separate. D-02: entered-in-error, mandatory reason, optional linked atomic replacement.
- Audit/commits/proof limits and finding disposition are in investigation.md and evidence.md.
- No implementation SDLC map or issue tracker was used; traceability refers to OD findings and requirement IDs, not invented tickets.
- Full spec is the authoritative capability delta plus top-level spec.md index. Implementation is deferred.

- Subsequent reference gaps G01–G09 are bounded refinements in R9/R13–R15 and visual-contract.md, mapped to existing slices without expanding clinical taxonomy or agent scope.
- Isolated synthetic HTML guides composition; rendered-reference validation remains separate from future production evidence.
