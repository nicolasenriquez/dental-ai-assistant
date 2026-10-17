# Explicit deletion from the odontogram

## Decision and scope

The user confirmed that current dental records are demo data and that removal must mean Eliminar, without classifying the entry as human error. This change retires correction mutations outright. It does not need a compatibility bridge for retrying historical correction operations. Existing saved demo evidence remains readable; no reset, receipt migration or snapshot relabelling is required.

An owned, non-deleted active or resolved finding is eligible. A procedure is eligible only when provenance is observed_existing, state is existing and no plan item references the procedure or any ancestor through supersedes_id. Other procedure states/provenances and entered_in_error findings are read-only for this action. Resolver remains the action for a condition that is no longer clinically active.

Delete targets one saved resource UUID, not every mark on a tooth. Confirmation uses its saved surfaces and complete bridge/arch membership. A bridge disappears across all members; other resources remain. Removing only one surface is an ordinary explicit edit. An immutable-identity change requires explicit deletion and a separate creation; there is no automatic replacement or two-command transaction.

Deletion sets a tombstone and appends one deleted revision. It does not physically purge the record, members, notes or prior snapshots, and there is no restoration UI. These rules apply to new records after cutover even if demo fixtures are later replaced.

## Demo cutover, with no legacy command bridge

Default: retain the existing database. This planning work executes no data reset. For future verification, use an isolated scratch Postgres database and synthetic fixtures; a fresh scratch database replaces broken fixtures without touching the user's running database, auth, chat, RAG or Drive records.

Both existing correction POST endpoints remain as small authenticated retirement stubs. Validate path UUIDs, session, parent ownership and exact resource ownership; then return HTTP 410 with detail {code: correction_workflow_retired, message: "Este flujo fue retirado. Usa Eliminar desde el registro guardado."}. Do not parse a correction body, look up an operation, replay a receipt or perform a mutation. Previously committed, unknown and mismatched correction payloads all receive 410 after ownership succeeds. Missing/foreign resources remain 404, missing sessions 401 and malformed path UUIDs 422. GET revision/history endpoints remain readable.

Remove active Registrar por error, correction/replacement wizard and error-based Deshacer callers. Keep stored enums, historical reasons/links and legacy read DTOs. Never reinterpret a legacy entered_in_error revision as deleted. Old correction service/repository mutation functions may be removed once no runtime/test consumer remains; history helpers stay where still used. No production-client continuity is promised for the retired operation.

New delete commands use patient_clinical_commands, whose namespace is (owner_user_id, operation_id). Existing active treatment, note and plan operations already in that table retain their original hash formats and receipts. Retired condition-correction operations belong to their old revision-table namespace; they are not imported or consulted. Reusing an old revision-table operation UUID in the active table has no legacy meaning. Reusing any UUID already in the active table for a different command returns 409 idempotency_conflict. This explicit namespace boundary removes F1 without a second receipt store or compatibility adapter.

Cutover is one coordinated demo-runtime update. Stop old writers, deploy the complete deletion-aware application and migration, then reload browser clients before enabling user interaction. Do not mix an old writer with the new schema/application. Existing plan endpoints are not added to the UI or expanded; their guarded readers/writers remain protected. If actual non-demo clinical data or a live-client continuity requirement is discovered at task 0.2, stop this change for a new migration decision. Do not reset or silently apply demo-only retirement assumptions to it.

## Modal behavior

```text
Saved record -> Editar -> Eliminar -> one confirmation
                              Cancelar -> same editor/draft/focus
                              Eliminar -> frozen command
                                            success -> refresh + close + Ver historial
                                            uncertain/conflict -> retain + reconcile
```

Every eligible saved editor exposes Eliminar separately from Guardar/Cancelar. Unsaved creation/surface pickers and History expose no deletion action. Confirmation starts on Cancelar, suspends the parent trap, consumes Escape and restores the parent draft/focus on cancellation. Backdrop follows the same policy. Busy/uncertain work cannot be dismissed as an uncommitted action. Keep resource name/FDI through exit; successful deletion returns focus to the tooth or stable chart heading.

Example title: `¿Eliminar Caries de la pieza 16 (M, O)?`

Copy: `Se quitará del odontograma y de los registros actuales. El historial conservará la eliminación, su autor y fecha. Esta acción no tiene restauración desde la aplicación.` No reason field is shown or required.

For a dirty editor add `Los cambios sin guardar no se aplicarán si eliminas el registro.` Confirm deletes the saved base with its reviewed revision, without saving local edits. Cancel retains all edits, scroll and selected context. Only authoritative deletion discards the edit draft.

Success: `Registro eliminado del odontograma.` Offer Ver historial, never Deshacer/Restaurar. If deletion committed but refresh failed, retain the receipt, explain the confirmed deletion and retry GET only. An already-deleted conflict says `Este registro ya fue eliminado` after authoritative reconciliation.

## HTTP and command identity

```text
POST /api/patients/{patient_id}/conditions/{condition_id}/delete
POST /api/patients/{patient_id}/dental-treatments/{treatment_id}/delete
Body: {operation_id: UUID, expected_revision: integer >= 1}; forbid extra fields.
200, first success and exact replay:
{operation_id: UUID, resource_kind: "condition"|"procedure", resource_id: UUID,
 action: "deleted", revision: integer >= 2, revision_id: UUID,
 deleted_at: UTC ISO timestamp, actor: {user_id: UUID, display_name: string|null}}
```

Authority comes from the session/path. Normalize UUIDs with str(UUID(value)), revision as an integer and action as the literal deleted. New-command hash input is exactly {version:1, kind:resource_kind, action:"deleted", patient_id:canonical_UUID, resource_id:canonical_UUID, expected_revision:integer}. Hash UTF-8 json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False) with hashlib.sha256. operation_id selects the receipt and is not part of this hash. Reuse the existing canonical JSON helper, without modifying older command hashes.

Check authorization and source existence before revealing any receipt. In a READ COMMITTED write transaction, take the existing pg_advisory_xact_lock(hashtextextended(owner + "/" + operation_id, 0)) before clinical row locks, then look up the active receipt. Matching hash returns its immutable stored 200 result even after later deletion; mismatching hash returns 409. No new clinical work occurs on replay.

For a new operation, lock the source FOR UPDATE, check deletion/revision/eligibility, increment revision, set the paired deletion metadata and updated actor/time, append before/after deleted revision and insert the receipt in that one transaction. Use one clock_timestamp value for updated_at, deleted_at, revision.changed_at and receipt.deleted_at. Roll back every change if any insert fails. The common operation advisory lock serializes same-operation commands across resources; source row locks serialize distinct-operation edit/resolve/delete races.

Error detail is an object with code. Precedence after ownership and active-receipt lookup: record_deleted (409, existing owned tombstone); revision_conflict (409, current owned representation); resource_read_only (409, current owned representation); otherwise commit. Invalid bodies return 422; unauthenticated 401; missing/foreign parent or resource 404. An idempotency_conflict exposes no other command's receipt or content.

After a definitive stale-revision rejection, preserve the draft and require fresh source review plus explicit confirmation before using a new operation ID. Never rebase deletion automatically. After response loss, retain the original operation/body and retry it identically; a current read alone is not proof that this operation committed. A confirmed command followed by failed reads retries only those reads.

## Procedure and note concurrency

Delete never acquires a plan aggregate lock. After the operation lock and replay lookup, lock the procedure FOR UPDATE, then read its owned association/ancestry without a plan lock. Check deleted/revision/eligibility in the stated error precedence. A protected-work rejection takes no plan lock and changes no plan state. No delete path may acquire a plan lock after a treatment row lock.

This minimal protocol relies on an inspected current invariant: the only plan-item insertion, patient_clinical_plans_repo._author(add_item), creates a new planned procedure UUID in the same transaction; it cannot attach an existing observed UUID. Existing plan corrections also create a new replacement UUID and do not rewrite item treatment_id. Record that invariant in a source/behavior regression test. If a caller that attaches an existing observed UUID appears, block its use until a shared locking protocol is designed. Do not add such a caller in this change.

Therefore an unlinked eligible observed UUID cannot become plan-linked through an incumbent public command while deletion runs. For linked/protected fixtures, delete versus stage execution/correction always rejects delete; incumbent plan-first writers continue with their existing locks. Verify this concurrently in scratch Postgres, plus an add-item test proving its new UUID cannot be the deletion target. No plan feature is introduced.

Procedure-context note creation/edit/delete must authorize, take its operation advisory lock, resolve any exact active receipt, lock the procedure FOR KEY SHARE and check deleted_at before note row locks/writes. For an edit/delete, obtain the immutable procedure ID from the owned saved note, never the body. Hold the procedure lock to transaction end. Delete's FOR UPDATE conflicts with this lock: a note that commits first remains readable; a deletion that commits first causes new contextual note work to fail 409 resource_read_only. Exact prior note receipts may still replay before terminal guards. Delete never locks/updates note rows, avoiding an inverse lock order. General/tooth/other-resource notes keep their existing policy.

## Schema and read changes

Add deleted_at TIMESTAMPTZ and deleted_by_user_id UUID REFERENCES users(id) to findings/procedures, both null or both non-null. Add deleted to condition and procedure revision action constraints and to the condition revision>1 integrity check. Condition deletion revisions keep legacy operation_id/correction_reason/command_snapshot/replacement fields null, so ck_condition_correction_metadata remains unchanged. The active receipt lives only in patient_clinical_commands. Procedure deletion reason is null. Extend current/revision DTO unions and snapshot whitelists with the paired nullable metadata. Do not remove old enum values or rewrite old snapshots; missing deletion keys mean null.

Change the active condition unique predicate and duplicate checks to status='active' AND deleted_at IS NULL. List endpoints, including status=all, exclude tombstones. Exact owned GET returns a read-only tombstone. Prevent edit/resolve/new contextual writes on a tombstone. Old create replay must never repaint one as current; a new same-key record gets a new UUID. Keep all related notes/members/revisions. Procedure notes show Procedimiento eliminado and no contextual write controls. Activity shows one deleted event without note content in titles/URLs.

The history inclusion/count contract is [history-read-contract.md](history-read-contract.md). Historical queries select deletion state from eligible snapshots, never current-row flags. A deletion-aware reader/guard version is the rollback floor once deletion writes exist; do not run destructive down migrations or roll back to a binary that ignores tombstones. No second snapshot store, generic event bus or compatibility bridge is added.

## Required proof

Tasks 1.5/3.6 cover atomicity, error precedence, active-table replay collisions, retired correction 410 for prior/new payloads, row races, protected-plan invariants, linked-note locking, exact DTO/action constraints, old-create non-resurrection and unchanged unrelated data. Tasks 1.6/3.7/3.8 cover dirty cancellation, exact Caries/bridge deletion, current/history reload, focus and zero active error-removal callers. These are future implementation gates, not executed proofs in this document.
