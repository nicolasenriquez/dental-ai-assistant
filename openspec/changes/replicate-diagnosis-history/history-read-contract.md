# History read contract

This document fixes F4/F5 and is part of the implementation contract. The two GET endpoints remain in routes/patient_dental_history.py. Ownership and repeatable-read rules in design.md apply to every response.

## Queries and date selection

| Endpoint | Query contract |
|---|---|
| GET /api/patients/{patient_id}/dental-history | dentition required (permanent/primary), day optional YYYY-MM-DD, epoch optional, cursor optional, limit default 50, range 1..100. |
| GET /api/patients/{patient_id}/dental-history/snapshot | dentition required, at optional YYYY-MM-DD, epoch optional, cursor optional, limit default 100, range 1..100. |

Omitted day returns the patient/dentition audit timeline across all dates. A supplied day returns only events from that clinical day, using start inclusive and next-day start exclusive in America/Santiago. Do not scan unrelated timeline pages to find an exact day's changes. day and at are separate endpoint parameters, not synonyms. Reject extra query names, malformed/nonexistent/future dates and invalid dentitions with 422. A valid date before the earliest evidence returns an honest empty projection/list, not a validation error or fabricated baseline. Today is a valid day; results contain evidence committed in the read transaction.

On initial History entry, load the unfiltered event page to obtain epoch, then the snapshot and, if at exists, day=at events with that epoch. A new date refresh may obtain a new epoch through its first snapshot, then load the matching day events. Stage the requested chart/day set until matching epoch responses succeed; each dataset retains its own selected date, pending/error/partial status. A failed later chart page retains the previous complete chart with its original label. Never label old data with the newly selected date. Day events may paginate independently with Cargar más cambios; their count and loaded count stay visible. A failure is not an empty day.

The timeline is the unfiltered paginated event stream grouped by clinical_date. The selected-day panel has its own cursor and total_events for day=at, including deleted events. Show `Cambios del DD mes AAAA`, `{loaded} de {total} cambios` and an explicit unavailable/partial message on error. With no at, hide the selected-day panel and label the chart Estado actual; the timeline/audit list remains available. A requested day outside loaded timeline pages still loads its snapshot and changes directly. Never fabricate a timeline marker from current data.

## Response shapes

All UUIDs are canonical strings, revisions/counts integers, UTC timestamps timezone-bearing ISO strings and nullable keys explicitly null. actor is {user_id:UUID, display_name:string|null}. Display names are authorized current name resolution, not a claim about historical professional credentials.

```text
EventsPage {
 selection:{day:date|null, timezone:"America/Santiago",
            start_inclusive:UTC_timestamp|null, cutoff_exclusive:UTC_timestamp|null},
 items:Event[], next_cursor:string|null, total_events:int>=0,
 epoch:string, timezone:"America/Santiago", read_at:UTC_timestamp
}
Event {
 event_id:UUID, resource_kind:"condition"|"procedure", resource_id:UUID,
 revision:int>=1, action:"created"|"edited"|"resolved"|"corrected"|"deleted",
 changed_at:UTC_timestamp, clinical_date:date, actor:Actor,
 before:ClinicalSnapshot|null, after:ClinicalSnapshot
}
SnapshotPage {
 selection:{at:date|null, timezone:"America/Santiago", cutoff_exclusive:UTC_timestamp|null},
 items:SnapshotItem[], next_cursor:string|null, epoch:string, read_at:UTC_timestamp,
 counts:{records,findings,procedures,charted_records,affected_teeth,affected_arches,deleted_records}:int>=0,
 coverage:{state:"complete"|"partial",earliest_recorded_at:UTC_timestamp|null,
           warnings:("missing_initial_revision"|"orphan_revision")[]}
}
SnapshotItem {
 resource_kind:"condition"|"procedure", resource_id:UUID, revision:int>=1,
 changed_at:UTC_timestamp, snapshot:ClinicalSnapshot, chart_eligible:boolean
}
```

ClinicalSnapshot is discriminated by its containing resource_kind, not a new clinical taxonomy. A condition snapshot uses the incumbent ConditionSnapshot fields (dentition, tooth_fdi, condition_code, surfaces, note, status), plus deleted_at/deleted_by_user_id. Procedure snapshots preserve the existing saved public treatment snapshot fields and types, including variant/catalog identity, label/category/type, scope, dentition, arch, teeth with roles/surfaces, provenance/state, note, supersedes_id and any recorded execution evidence, plus deletion metadata. Retain public stored fields from that revision; do not join today's row to fill missing historical labels, surfaces, note or execution. Never expose owner_user_id, command_snapshot, payload_hash or raw operation bodies in these reads. Legacy missing nullable deletion metadata normalizes to null. Unknown legacy public aliases follow the existing presentation registry and partial-evidence policy.

before/after event snapshots may contain tombstones; snapshot-page items never contain a tombstone. Creation has before=null. New deletion has action=deleted and an after snapshot with both deletion fields set; its clinical status is unchanged. Returned snapshot items are only the latest eligible non-deleted revision of each resource, ordered by (resource_kind, resource_id) ascending. Deleted count is computed separately from the same latest-eligible set before filtering tombstones. It is a cumulative number of resources deleted as known at that selection, not a number of events on the selected day.

## State and count table

All rows refer to the latest eligible revision under the selected date/current cutoff. Historical labels never enable commands. `R` means the unique record total and its finding/procedure subtotal. `C` means charted_records and affected scope totals.

| Kind and state | In snapshot items / R | Render on History chart / C | deleted_records |
|---|---|---|---|
| Finding active, non-deleted | yes | yes, active mark | 0 |
| Finding resolved, non-deleted | yes | no | 0 |
| Finding entered_in_error, non-deleted | yes, legacy label | no | 0 |
| Procedure existing, non-deleted | yes | yes, existing mark | 0 |
| Procedure planned, non-deleted | yes | yes, retained planned mark | 0 |
| Procedure performed, non-deleted | yes | yes, performed mark | 0 |
| Procedure cancelled, non-deleted | yes, historical label | no | 0 |
| Procedure entered_in_error, non-deleted | yes, legacy label | no | 0 |
| Either kind, deletion metadata set | no | no | 1 |
| Unknown/missing initial evidence | only proven eligible revisions; coverage partial | only proven eligible drawable state | only proven deletion evidence |

records=findings+procedures counts all non-deleted snapshot items across all pages, not loaded rows. charted_records counts unique drawable kind/resource IDs, including historical planned marks. affected_teeth counts distinct (dentition,tooth_fdi) among drawable member/tooth snapshots. A bridge contributes one record, one charted record and its distinct member teeth. affected_arches counts distinct (dentition,arch) for drawable whole-arch procedures. Do not expand an arch into guessed affected teeth or use FDI zero. Counts use the complete eligible dataset within that response's transaction. Partial legacy coverage means counts describe known evidence, not certified complete clinical reality; label Según el historial disponible.

## Epoch, cursors and errors

Use one owner/patient/dentition-wide epoch across both endpoints, filtered/unfiltered events and all dates. Compute SHA-256 using Python hashlib over canonical sorted JSON of all scoped revision (kind,id) pairs plus sorted coverage markers (kind,resource_id,missing_initial,orphan), with sorted keys and compact separators. Sort revisions and markers by kind then canonical UUID. No wall-clock maximum, new persisted epoch store or revision backfill is required. Coverage markers include known current dental resources with no revision=1 and revisions missing a current parent; do not fabricate a snapshot from a marker. Read all these inputs, selection, totals and coverage in the same read-only repeatable-read transaction.

Reuse the base64url cursor transport in patients/cursors.py. Decoded fields are exactly {v:1,reader:"events"|"snapshot",owner_id,patient_id,dentition,day:null|date,at:null|date,epoch,after}. Events after is [UTC_timestamp,resource_kind,event_id] and follows descending event ordering; snapshot after is [resource_kind,resource_id] and follows ascending item ordering. Events require at=null; snapshots require day=null. Validate every type, UUID, timezone-bearing timestamp, nonempty epoch and endpoint/query binding. Authorization always runs independently; a cursor is not a permission token. Cursor length is bounded at 2048 characters. An epoch inside a cursor must match the explicit epoch if both are present.

404 hides unknown/foreign parents. Missing session returns 401. Invalid query/cursor/binding returns 422 invalid_history_query or invalid_cursor; a valid epoch that differs from the transaction's computed epoch returns 409 history_changed. Do not merge pages or issue mutations on recovery. Exact same epoch across old/new clinical dates is permitted; date is bound by the cursor, not included in the dataset epoch.

## Examples and performance gate

[history-examples.json](audit/history-examples.json) supplies synthetic state/count cases, a deletion event and empty/partial response examples. It is a contract fixture, not a real patient capture or implemented endpoint output. Implementation HTTP tests must assert the same state table and query shapes, including a day outside the first event page, more than one page within a day, zero matching events, stale epoch and a second-owner cursor.

Seed 10,000 scoped revisions in scratch Postgres, warm each read shape five times and measure 20 event/snapshot requests with limit=100 and selected-day/unfiltered variants. Record query plans and p95 server time; acceptance is p95 <=1000ms on the identified local Docker test runtime, no N+1 record-history fetches and no repeated per-item full-table scan. This is a future gate, not a measured claim. If it fails, optimize the same projection/indexes and rerun; do not add a snapshot/epoch store or silently weaken consistency. Record a scoped performance decision before widening that architecture.
