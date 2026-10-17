# Specification readiness

State: **Implementation Ready**. Final planning audit: 2026-10-17, America/Santiago. This certifies specification completeness only; implementation remains deferred by the user.

## Artifacts

| Artifact | Result |
|---|---|
| proposal.md / design.md | Scope, existing owners, historical APIs, chart/notes reuse, dates, pagination, modals and motion. |
| deletion-design.md | User-requested Eliminar semantics, modal copy, exact-ID command, schema, receipts, conflicts, notes, legacy retirement and rollback floor. |
| specs/ (five capabilities) | 16 added, eight modified and three removed requirements; full modified bodies retained. |
| spec.md | Generated consolidated reading copy of all five normative delta files. |
| tasks.md | 26 tasks across five required phases and six slices; only completed investigation 0.1 is checked. |
| audit/README.md / acceptance-matrix.md | Critique, fresh reference proof/limits and 19 future target acceptance cases. |
| audit/evidence/ | Five visually reviewed privacy-scoped reference images, CLI public snapshot and sanitized SHA-256 manifest. |
| reference/ | Recovered original investigation text; unavailable old binaries explicitly identified. |
| audit/validate_plan.py | Dependency/link/task/consolidated-spec structural validator using Python standard library only. |

## Validation

- `openspec validate replicate-diagnosis-history --strict`: passed after deletion changes.
- `openspec status --change replicate-diagnosis-history --json`: isComplete=true; proposal/design/specs/tasks done means authored artifacts, not implemented tasks.
- Structural validator: 26 unique sequential numeric task IDs, Traceability on every task, Notes on checked task, exact-once Execution Order membership and acyclic dependency graph; 27 requirement entries across five capabilities; local Markdown links resolve; consolidated spec matches.
- Modified/removed requirement titles are checked against incumbent main capability specs; no main spec sync/archive is performed.
- Application tests, migrations, production build and target runtime journeys are **not executed**. No app implementation is included.

## Product decisions and proof limits

Use incumbent Bun/uv/FastAPI/asyncpg/Alembic, React/Tailwind, Spanish UI, twelve findings and 63 procedure variants. Preserve Evoluciones, independently authored anatomy and legacy evidence. No Treatment Plans/Appointments feature, attachment domain, recalls or whole-consultation deletion is added.

The latest explicit user decision supersedes the previous recording-error removal plan. Eliminar removes one saved eligible UUID from current views, preserves deletion history, requires no reason and creates no entered_in_error transition. Resolver remains a distinct clinical action. Legacy error/replacement data and exact committed receipts remain readable; new legacy mutations retire with 410. Deletion-aware reads/schema precede writers and define the safe rollback floor.

Authenticated reference inspection used native Codex browser/Playwright locators. Standalone CLI reached login; no authenticated CLI clinical proof is claimed. No final source deletion or clinical save was performed. Target runtime was unavailable. Source History write controls and date mismatch are defects explicitly excluded from target behavior. See audit/README.md for exact evidence and limitations.

No material product question remains under this scope. Shared active-change reconciliation, actual migration head and target build provenance remain mandatory implementation-entry checks in 0.2. Native zoom/mobile and accessibility checks must be reported as unverified if unavailable; reference captures do not discharge future target gates.

## Skill sequence

```text
[opsx: investigation] -> [audit and user decision] -> [requirements/tasks validation]
                                                               |
                                                               v
                                                  [Implementation Ready: STOP]
```

## Actual dependency order

```text
[0.1 -> 0.2] --+-> [1 Deletion persistence/API] -> [2 History API] -> [3 History UI] --+
               |               |                                                   |
               +-> [4 Diagnosis summary/notes] -> [5 Delete UI + legacy retirement] -+
                                                                                   v
                                                               [6 Overlays/motion]
                                                                                   |
                                                               [Integrated proof + closeout]
```

Slice 5 requires both slice 1 and slice 4. Slice 6 requires both slice 3 and slice 5. The complete numeric task chains are in tasks.md; this diagram is not delegation or authorization to implement. Main specs, application source, schema and unrelated active changes remain untouched.
