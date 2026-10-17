# Backend deletion review: tasks 2.7 and 2.8

## Verdict

Task 2.7 is acceptable as an expand-first prerequisite, not as a completed deletion feature. No blocking defect was found in its schema, current-read filtering, exact tombstone reads or note guards. Task 2.8 is implemented and its retirement subset is green. Delete writers remain task 2.5.

## Task 2.7 critique

- **Schema and evidence:** migration 0033 pairs nullable deletion metadata, retains legacy correction constraints/indexes, permits `deleted` revisions and frees only tombstoned active condition keys. Current lists/counts omit tombstones; exact owned reads and prior snapshots remain available. Live tests cover these boundaries and retained note/Activity reads.
- **Lock proof was incomplete:** prior coverage did not directly demonstrate note edit/delete parent locking. Added `test_note_context_waits_for_parent_and_rechecks_tombstone`, parameterized over create/edit/delete. Each test observes a real PostgreSQL blocker while another transaction holds the procedure `FOR UPDATE`, commits a tombstone, then proves the note command rejects without a receipt or note revision. It also proves an exact already-committed note-create receipt still replays after parent deletion.
- **Migration evidence was overstated:** the earlier task note implied a no-op downgrade/re-upgrade had been proved. Corrected it. A no-op downgrade retains the schema but changes Alembic's version stamp; 0033's upgrade is not idempotent. Do not use `downgrade` followed by `upgrade` as a recovery procedure. The supported rollback is application rollback to a deletion-aware reader/guard floor with schema retained.
- **Future writer dependency:** the note guard's `FOR KEY SHARE` must conflict with the delete writer's explicit source `FOR UPDATE`. A plain non-key tombstone UPDATE is not a substitute. The added tests use the required source lock; the actual writer/races remain intentionally red until 2.5.
- **Scope limit:** SQL tombstone fixtures prove storage/read/guard behavior, not atomic delete timestamps, receipt hashing, eligibility or temporal History HTTP behavior. Those remain their assigned tasks.

## Task 2.8 implementation

Both correction POSTs have no body parameter. Authentication and UUID validation remain FastAPI dependencies; the existing owned exact-read boundary returns 404 for absent, wrong-parent or foreign resources before the route returns 410 `correction_workflow_retired`. Bodies are not parsed, operations are not looked up for replay, and no correction command runs.

Removed correction input models, the condition correction service/repository writer, and treatment correction/replacement/plan-reopening mutation branches. The treatment adapter rejects any action other than create/edit before accessing the command store. Legacy schema, enums, replacement links, correction metadata and revision readers remain.

Updated obsolete new-correction tests to assert retirement. Historical condition correction/replacement fixtures now seed synthetic pre-retirement evidence directly; the migration test verifies retained reads rather than invoking a retired writer. The retirement live test retains both condition revision-based evidence and a matching treatment active-table receipt, checks exact/changed/unknown/malformed attempts all return 410, and verifies the stored receipt and historical procedure snapshots remain unchanged. Existing plan completion, optimistic edit races and protected write behavior remain covered.

## Verification

Synthetic rows only, isolated `ai_tutor_deletion_live` at migration 0033. Running `dynachat` remains at 0032; `/api/health` returns 200. No reset, runtime rollout or provider call.

- Backend: Ruff lint and format clean; mypy clean, 255 source files.
- Full default pytest: **1116 passed / 242 skipped / 24 expected failures**. All failures are the unimplemented delete POST contract cases owned by 2.5.
- Six live suites (workspace, treatments, plans, author names, dental notes, deletion): **74 passed / 9 expected failures**. All failures require the absent delete writer; correction retirement, note-lock additions and legacy reads pass.
- Frontend unchanged: TypeScript and Biome clean; **105 Vitest files / 1041 tests passed**. This does not prove new browser behavior.
- OpenSpec strict validation and plan audit pass after task evidence updates.

## Cutover limits

Legacy frontend correction callers remain until 2.6. Do not treat their passing incumbent frontend tests as proof of the new delete journey, or roll out this intermediate backend as a coordinated cutover. Stop old writers, migrate, and reload coordinated clients only when the replacement slice is ready. No receipt bridge, reset, destructive schema reversal or commit was performed.
