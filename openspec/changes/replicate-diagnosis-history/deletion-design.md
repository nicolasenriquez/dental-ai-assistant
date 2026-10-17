# Explicit deletion from the odontogram

## Decision and meaning

The user's 2026-10-17 instruction replaces new-use "Registrar por error" with **Eliminar**, following DentalPin's current-record interaction. This is a deliberate change to the previous plan and incumbent product/spec requirements. The new action removes a selected saved record from current chart/list and count calculations. It records deletion, not clinical error, cure or resolution.

Deletion uses a tombstone and an append-only `deleted` revision so History can still reconstruct what existed before removal. It does not physically purge the row, its clinical note, revision snapshots, author attribution or foreign-key references. This distinction is visible in confirmation copy; the product offers no restoration command in this scope. A new clinical record after deletion has a new UUID.

Legacy entered_in_error records, reasons and replacement links retain their original historical meaning. Do not migrate them to deleted, rewrite snapshots or display them as if the user had deleted them. Retire new recording-error mutations and their UI, while preserving exact replay of already committed operation receipts.

## Scope of the action

An owned, non-deleted active or resolved finding can be deleted. An owned, non-deleted `observed_existing`/`existing` procedure can be deleted. Planned/performed/cancelled/legacy-error procedures remain read-only under incumbent provenance policy; this feature must not cancel plan work or erase performed evidence. If permission/state changes while open, refresh capability and explain the restriction. History never offers deletion, even in its current-state position.

Delete targets **one resource ID**, not every condition on a tooth or the currently selected surfaces. Its confirmation names the saved record, FDI/surfaces or full procedure membership. A multi-tooth bridge is one procedure; deleting it removes its mark from all its members. The confirmation lists the entire affected scope. Other findings/procedures on those teeth remain. Whole-arch deletion identifies the arch and never invents FDI zero.

Removing only one surface is a normal explicit edit of that record, not this delete command. Marking a real condition as no longer present uses Resolver, not Eliminar. Immutable identity changes no longer invoke a new error/replacement wizard; the clinician explicitly deletes the old record and creates a new record separately. This is not represented as an atomic relocation or automatically retried two-command workflow.

## Modal flow and exact copy

```text
Tooth -> saved-record popover -> Editar condition/procedure
                                 |
                              Eliminar
                                 v
                 One named destructive confirmation
                 Cancelar                  Eliminar
                    |                         |
             same editor/draft      frozen delete command
                                      /            \
                              authoritative      uncertain/conflict
                                 success         retain + reconcile
                                    |
                  refresh current reads/counts, close editor
                  focus initiating tooth or stable fallback
```

Every eligible saved-record modal exposes a visible danger-style `Eliminar` separate from `Guardar` and `Cancelar`. No delete action appears in unsaved creation/surface-selection modals. Do not hide it exclusively in the lower record list or require the clinician to open a correction wizard.

Confirmation example: `Eliminar Caries de la pieza 16 (M, O)?` Supporting text: `Se quitará del odontograma y de los registros actuales. El historial conservará la eliminación, su autor y fecha. Esta acción no tiene restauración desde la aplicación.` No mandatory reason, no allegation that the original entry was wrong, no misleading statement that all clinical evidence is erased.

One confirmation owns focus; initial focus is Cancelar. Escape/backdrop/cancel return to the same editor with its draft, selected surfaces, scroll and trigger focus intact. Avoid a third redundant confirmation and duplicate traps. Retain the resource label/FDI until exit completes. Busy/uncertain requests cannot be dismissed as if nothing happened.

If the parent has unsaved edits, the confirmation says `Los cambios sin guardar no se aplicarán si eliminas el registro.` Delete operates on the **last saved record/revision**, not the edited local surfaces/note. Cancel retains those edits. Only an authoritative successful deletion discards the local edit draft. Do not auto-save it before deletion, silently replace it with a correction draft or combine save+delete.

Success message: `Registro eliminado del odontograma.` Provide `Ver historial`, not an unsupported restore action. If post-write reads fail, say deletion was confirmed but the current view could not refresh, keep the receipt and retry GETs only; do not offer a new delete as the read retry.

## Command Interface and ownership

Use existing patient condition/procedure route/service/repository ownership; do not add SQL to handlers or duplicate persistence into the History reader.

```text
POST /api/patients/{patient_id}/conditions/{condition_id}/delete
POST /api/patients/{patient_id}/dental-treatments/{treatment_id}/delete

Body, extra fields forbidden:
{ operation_id: UUID, expected_revision: integer >= 1 }

HTTP 200 on first success and exact replay, same immutable receipt:
{ operation_id, resource_kind, resource_id, action: "deleted",
  revision, revision_id, deleted_at: UTC timestamp, actor }
```

No reason field is required. Owner and actor come from the session, never the body. New no-replacement correction commands are not aliases for deletion, because their meaning differs.

Inside one transaction: verify the patient/owner, resolve a matching receipt, lock the resource, recheck the receipt under lock, validate expected revision and capability, advance revision, set deletion metadata, append before/after deletion revision and persist the immutable receipt. Reuse the existing `patient_clinical_commands` operation identity store for both new commands with kind/action/patient/resource/revision in the normalized hash. A receipt-insert race must roll back the whole losing transaction; no partial tombstone or double event.

Exact same operation/body returns its committed receipt even if the resource is already deleted. Reusing an operation for another resource/action/revision yields 409 idempotency_conflict. A new operation against a deleted row yields 409 record_deleted with owned read-only metadata. Stale revision yields 409 revision_conflict; do not automatically rebase and delete a newer clinical record. Foreign/unknown resources yield 404; invalid body yields 422. Check ownership on receipt replay too.

Lost response: retain UUID/body and offer identical retry/current-read reconciliation. Do not generate another operation, show false success, revert a possibly committed deletion or dismiss uncertain state. Race with edit/resolve/delete is serialized; only a matching current revision commits. If another delete won, show `Este registro ya fue eliminado` after authoritative reconciliation and disable further writes.

## Additive schema and compatibility

Add nullable `deleted_at TIMESTAMPTZ` and `deleted_by_user_id UUID REFERENCES users(id)` to findings and procedures, with a both-null-or-both-present constraint. `deleted` is a new revision action and a read-model lifecycle marker, **not a new clinical status meaning entered_in_error**. Deletion revision snapshots include deletion metadata. Add any minimal necessary paired integrity/receipt support in a new forward Alembic migration; no snapshot backfill or physical delete.

Replace the active condition identity unique index predicate with `status='active' AND deleted_at IS NULL`. Adjust duplicate checks, create-idempotency replay, edit/resolve/correction guards, exact reads, all current-list filters, notes-context writes, counts and Activity projection. Deleting an old UUID allows a new UUID with the same clinical key; retrying the old create must never reactivate the tombstone or report it as a fresh current save. Test this race, not only normal delete.

Current list endpoints exclude deleted rows even for their `all` clinical-status filter. Exact owned GET retains a tombstone-aware read-only representation for old links. History carries `deleted` events, actor/time and original snapshots; selection before deletion reconstructs the original, selection after deletion omits it from current marks/list. Never filter historical revisions using the current row's deleted_at, which would erase the past.

Finding/procedure DTOs add nullable deletion metadata. Old legacy snapshots with missing keys mean no deletion was recorded at that revision. `deleted_records` is a separate history count; current `records`, findings/procedures, chart and affected-scope totals exclude tombstones. Timeline event totals include the one deletion revision. The API must make these units explicit.

## Notes and references

Deleting a finding does not delete patient/tooth-scoped clinical notes. They are not owned exclusively by that finding. Deleting a procedure does not cascade-delete its linked notes; retain the procedure tombstone so links do not dangle. Current patient-level notes remain readable with `Procedimiento eliminado` context, but no new note may bind to a deleted procedure and its contextual editor is read-only. Current unbound/other-resource notes keep their existing edit/delete policy.

Activity adds a deletion action/link without clinical note content in its titles/URLs. Exact receipt/history links remain reachable. Auth and patient ownership do not change. Logs never contain patient identifiers, notes or command snapshots.

## Retire recording-error creation safely

1. Expand readers to understand nullable deletion markers and deletion revisions before enabling new writes.
2. Add deletion commands and replace active UI removal controls/after-create undo with the confirmed Eliminar journey.
3. Current correction endpoints reject **new** operations with HTTP 410 correction_workflow_retired. First resolve authorized exact committed receipts, which still replay unchanged; changed replay remains 409. Preserve legacy correction/replacement reads and exact receipt reconciliation.
4. Remove active new-use correction/replacement wizard and error-based undo callers after replacement journey tests pass. Do not remove historical enum values, SQL rows or DTO fields.

This is an intentional behavior change for active clients; document it as such. A new deployed writer cannot be rolled back to an old binary that ignores deleted_at: that binary could resurrect tombstones visually or in duplicate checks. Retain a compatible read/guard release as the rollback floor, or stop writes and ship a forward fix. Do not run destructive down migrations or claim arbitrary old-version rollback is safe.

## Required contract proofs

- Active Caries with saved M/O opens the exact edit modal and exposes Eliminar.
- Cancellation and Escape perform zero writes and retain dirty local note/surfaces.
- Confirmation creates one deletion revision/receipt and removes only that UUID's marks/rows/count contribution; another record on the tooth remains.
- Two identical retries/concurrent confirmations yield one deletion; incompatible replay rolls back.
- Delete versus edit/resolve and stale/already-deleted responses preserve current data and local recovery.
- Response loss and confirmed-delete/read failure preserve receipt and use the correct retry method.
- Before/after historical views, exact links, Activity, related notes and same-key new UUID remain truthful after reload.
- Foreign access, plan-linked/performed evidence, unsaved modal and History cannot invoke the command.
- Legacy entered_in_error data is unchanged; no new deletion is labelled or persisted as entered_in_error/corrected.
- Source visual proof validates only editor/delete-confirm/cancel interaction. Target behavior above requires future fail-first, real-DB and browser evidence; no deletion was executed in this audit.
