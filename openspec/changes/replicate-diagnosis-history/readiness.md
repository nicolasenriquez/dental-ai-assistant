# Specification readiness

State: **Implementation Ready**. Planning review date: 2026-10-17, America/Santiago. Score: **95/100** after the five-gap closure. This certifies a complete specification under the user-confirmed dental demo scope; application implementation and release validation remain deferred.

## Complete artifacts

proposal.md locks Diagnosis/History scope and exclusions. design.md defines reuse, navigation, modal/motion behavior and temporal reconstruction. deletion-design.md defines the coordinated demo cutover, no correction replay, new-command hash, exact errors and procedure/note locking. history-read-contract.md defines day filtering, response types, state/count table, cursor format and timed volume gate. Five normative capability deltas are consolidated into spec.md. tasks.md contains 26 numeric tasks across five phases and six dependency-aware slices; only completed investigation 0.1 is checked.

The current assessment is [audit/gap-closure.md](audit/gap-closure.md). The earlier [78/100 review](audit/implementation-readiness-review.md) is marked historical. [audit/acceptance-matrix.md](audit/acceptance-matrix.md) contains 24 cases, distinguishing future target proof from prior reference evidence. Synthetic [history examples](audit/history-examples.json) are contract fixtures. Reference captures and recovery caveats remain unchanged.

## Decisions closed

- Eliminar deletes one saved eligible UUID from current views with a deleted audit, without mandatory reason or entered_in_error semantics. Resolver remains distinct.
- All owned correction POST calls return 410, including old operation payloads; legacy read evidence remains. There is no cross-store correction receipt bridge. Active command-table receipt formats are preserved and new delete hashes are explicit.
- Delete takes the common operation lock then the resource lock, rejects protected ancestry without plan locks and relies on the tested no-attach-existing-UUID invariant. Procedure-context writes take a parent reference lock before note writes.
- Selected-day changes use day filtering on the existing event API with independent pagination and coherent epochs. Snapshot counts and planned/deleted states have one explicit table.
- Backend retirement tests and UI replacement tests have separate green checkpoints. History UI precedes its use by task 3.7. The validator checks those edges and a negative regression, not just acyclicity.

## Validation

Strict OpenSpec, artifact status and the bundled audit/validate_plan.py must pass after this update. The validator checks task/requirement membership, sequential phases, Traceability/Notes, exact-once execution ordering, semantic dependency reachability, consolidated-spec parity, local links and state/count examples. Final command results are saved in validation-current.json. They do not certify implemented tasks or target behavior.

The user confirmed dental demo data. Keep the running database by default; synthetic proof uses an isolated scratch database. No reset command is part of implementation. At task 0.2 verify demo scope, active shared edits, migration head and build/runtime provenance. If non-demo clinical data or client continuity appears, stop before applying this demo-only cutover. This is an execution safety gate, not a delegated choice about how to migrate real data.

Use incumbent Bun/uv/FastAPI/asyncpg/Alembic and React/Tailwind. Preserve the catalog, anatomy, Evoluciones and legacy read evidence. No Treatment Plans/Appointments feature, attachment domain, recalls, whole-consultation deletion, new dependency or main-spec synchronization is included.

## Skill sequence

```text
[Ponytail + opsx: inspect] -> [five decisions recorded] -> [validate artifacts]
                                                                  |
                                                       [Implementation Ready: STOP]
```

No grill-with-docs interview was needed: the user's demo/removal decision and inspected writers resolved the material questions within the authorized scope.

## Actual slice order

```text
[0.1 -> 0.2] --+-> [1 Delete API + retirement] -> [2 History API] -> [3 History UI] --+
               |                |                                                   |
               +-> [4 Diagnosis notes/summary] ----------> [5 Delete UI + proof] <---+
                                                slice 1 also gates slice 5 |
                                                                          v
                                                               [6 Modal/motion proof]
                                                                          |
                                                               [Integrated gates + docs]
```

Slice 5 waits for 1, 3 and 4. Slice 6 waits for 3 and 5. tasks.md contains the numeric chains; no delegation is required or authorized. No application/migration/runtime test is claimed as executed. No clinical data was reset or deleted.
