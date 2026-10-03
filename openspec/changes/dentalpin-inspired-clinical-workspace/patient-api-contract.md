# Patient notes, conditions and activity API contract

Normative companion to the delta spec and `patient-clinical-contract.md`. Runtime endpoints do not exist yet. JSON uses snake_case, UUID strings, UTC RFC3339 timestamps and null explicitly. Ordinary fetch stays in `lib/api.ts`. Every patient/resource/revision read and write checks authenticated ownership and matching parent before returning content. New request DTOs reject unknown fields. All new timestamps persist as TIMESTAMPTZ. No new auth mechanism.

## Common pagination and errors

List envelope is `{items: T[], next_cursor: string|null, total: number}`. `limit` defaults to 20 and accepts 1–50. Total is matching records before cursor, not page length. Cursor is base64url UTF-8 JSON with version1, bound to requested patient and filters. Validate UUIDs, enum, timestamp and all keys; malformed/mismatched cursor returns 422. Cursor contains only identifiers/timestamps/enums, never body/contact. It does not authorize anything; every query reapplies ownership.

| List | Order / cursor keys after common version/patient/filter |
| --- | --- |
| Notes | `updated_at DESC, id DESC`; cursor `updated_at,id` |
| Note/condition revisions | `revision DESC, id DESC`; cursor `resource_id,revision,id` |
| Conditions | `tooth_fdi ASC, created_at ASC, id ASC`; cursor `tooth_fdi,created_at,id`; filter dentition/status |
| Activity | `occurred_at DESC, kind ASC, event_id DESC`; cursor `occurred_at,kind,event_id`; filter requested kind |

Changing a filter resets cursor. Conditions query accepts `dentition=permanent|primary` (optional, omission both) and `status=all|active|resolved` (default all). Revision reads require the owned resource; no revision from another parent. Mutable lists are not snapshot-isolated across requests; refreshed pages may reflect newer writes. UI deduplicates by ID and restarts at page1 after its own mutation.

404: `{"detail":{"code":"not_found","message":"Registro no encontrado"}}`. No existence disclosure for foreign IDs, including globally colliding create UUIDs. 409: `{"detail":{"code":"revision_conflict","current_revision":3,"resource_id":"00000000-0000-4000-8000-000000000001"}}`. Other conflict codes: `active_condition_exists` with owned `existing` ConditionResponse; `idempotency_conflict` with resource_id; `condition_resolved` with current_revision. UI translates codes into Spanish recovery; no raw exceptions. 422 retains FastAPI validation envelope with `detail[].loc,msg,type` and loc identifying body/query fields. Validate allowed surfaces, body length, immutability and expected_revision before persistence; no partial writes.

## DTOs

```ts
interface Actor { user_id: string; display_name: string | null }
interface NoteResponse {
  id: string; patient_id: string; body: string; revision: number;
  created_by: Actor; updated_by: Actor; created_at: string; updated_at: string;
}
interface ConditionResponse {
  id: string; patient_id: string; dentition: 'permanent' | 'primary';
  tooth_fdi: number; condition_code: string; surfaces: ('M'|'D'|'O'|'V'|'L')[];
  note: string | null; status: 'active' | 'resolved'; revision: number;
  created_by: Actor; updated_by: Actor; created_at: string; updated_at: string;
}
interface ConditionSnapshot {
  dentition: 'permanent' | 'primary'; tooth_fdi: number; condition_code: string;
  surfaces: ('M'|'D'|'O'|'V'|'L')[]; note: string|null; status: 'active'|'resolved';
}
interface NoteRevision {
  id: string; note_id: string; revision: number; action: 'created'|'edited';
  previous_body: string|null; new_body: string; actor: Actor; changed_at: string;
}
interface ConditionRevision {
  id: string; condition_id: string; revision: number;
  action: 'created'|'edited'|'resolved'; before: ConditionSnapshot|null;
  after: ConditionSnapshot; actor: Actor; changed_at: string;
}
interface ActivityItem {
  event_id: string; resource_id: string; kind: 'evolutions'|'notes'|'diagnoses';
  action: 'created'|'edited'|'resolved'; occurred_at: string; actor: Actor|null;
  title: string; tooth_fdi: number|null; href: string;
}
```

Actor is authenticated actor ID, never request-supplied. Display name is existing authorized user display name or null, not email fallback. Activity actor may be null for legacy evolution provenance; never fabricate one. Resolve creates a condition revision with action resolved. Activity titles are fixed Spanish action labels, e.g. `Nota editada`, `Condición resuelta`, `Evolución guardada en ficha`; condition label/tooth may supplement without free-text notes.

## Endpoint inventory and payloads

Prefix `/api/patients`. All single-resource GETs return NoteResponse or ConditionResponse. POST returns201 for first creation,200 for identical retry; PATCH returns200. List/revision endpoints use common envelope. Note/condition revision1 is created in the resource creation transaction.

| Method/path | Body / query | Response |
| --- | --- | --- |
| GET `/condition-catalog` | None | CatalogResponse below; static route before patient catch-all |
| GET `/{patient_id}/notes` | limit,cursor | NoteResponse page |
| GET `/{patient_id}/notes/{note_id}` | None | NoteResponse |
| POST `/{patient_id}/notes` | `{id,body}` | NoteResponse |
| PATCH `/{patient_id}/notes/{note_id}` | `{expected_revision,body}` | NoteResponse |
| GET `/{patient_id}/notes/{note_id}/revisions` | limit,cursor | NoteRevision page |
| GET `/{patient_id}/conditions` | dentition,status,limit,cursor | ConditionResponse page |
| GET `/{patient_id}/conditions/{condition_id}` | None | ConditionResponse |
| POST `/{patient_id}/conditions` | `{id,dentition,tooth_fdi,condition_code,surfaces?,note?}` | ConditionResponse; default surfaces[], note null, status active |
| PATCH `/{patient_id}/conditions/{condition_id}` | `{expected_revision,surfaces?,note?,status?}` | ConditionResponse; at least one mutable field required |
| GET `/{patient_id}/conditions/{condition_id}/revisions` | limit,cursor | ConditionRevision page |
| GET `/{patient_id}/activity` | kind=all/evolutions/notes/diagnoses,limit,cursor | ActivityItem page |

Note body required, trimmed1–4000; condition note trimmed0–1000, blank→null. Surfaces unique, canonical M,D,O,V,L order. PATCH omission preserves existing values; explicit null clears only note; surfaces cannot be null. `status` accepts only resolved for transition from active. Immutable fields sent in PATCH return422. Notes body cannot be null. `expected_revision` positive integer required. No-op PATCH returns current resource without revision/event; stale expected_revision still follows retry/conflict rules below.

```json
{"id":"00000000-0000-4000-8000-000000000001","body":"Nota sintética de ejemplo"}
```

```json
{"id":"00000000-0000-4000-8000-000000000002","dentition":"permanent","tooth_fdi":36,"condition_code":"caries","surfaces":["M","O"],"note":null}
```

```json
{"expected_revision":1,"status":"resolved"}
```

CatalogResponse: `{version:1,conditions:[{code,label_es,surface_codes:[]}...]}`. Exactly the twelve codes/labels in patient-clinical-contract; four surface-enabled codes expose M,D,O,V,L, others[]. Code unknown→422. Frontend owns fixed visual symbol mapping by code, not backend SVG or CSS. Catalog version changes only via future explicit contract revision.

## Retry and concurrency

Client generates crypto.randomUUID once per create draft and keeps UUID + normalized payload frozen while result is uncertain. No server key table needed. POST checks owned existing UUID: compare submitted normalized payload to immutable creation revision1 snapshot (not subsequently edited state). Same owner/parent and same creation payload returns current resource200, no new revision/event. Different creation payload409 idempotency_conflict. Foreign UUID404. Concurrent identical POSTs serialize through PK constraint and reread; concurrent different UUIDs for same active condition serialize through partial UNIQUE identity constraint and one returns409 active_condition_exists. Resource and revision writes commit together.

PATCH normally applies only when expected_revision equals current revision. If current revision is exactly expected_revision+1 and its latest revision represents the same normalized requested changes from expected_revision, return current resource200 as response-lost retry without another revision. Otherwise stale revision returns409, even if some current fields happen to match. A new concurrent writer is never silently acknowledged as the caller's retry. Two identical concurrent PATCHes may share one applied update; two different PATCHes cannot both overwrite the same revision. Content changes after an uncertain attempt require refresh/rebase, not changing retry payload.

## Activity examples and deep links

```json
{"items":[
  {"event_id":"00000000-0000-4000-8000-000000000012","resource_id":"00000000-0000-4000-8000-000000000001","kind":"notes","action":"edited","occurred_at":"2026-10-02T15:01:00Z","actor":null,"title":"Nota editada","tooth_fdi":null,"href":"/patients/00000000-0000-4000-8000-000000000099?tab=info&note=00000000-0000-4000-8000-000000000001"},
  {"event_id":"00000000-0000-4000-8000-000000000011","resource_id":"00000000-0000-4000-8000-000000000001","kind":"notes","action":"created","occurred_at":"2026-10-02T15:00:00Z","actor":null,"title":"Nota creada","tooth_fdi":null,"href":"/patients/00000000-0000-4000-8000-000000000099?tab=info&note=00000000-0000-4000-8000-000000000001"}
],"next_cursor":null,"total":2}
```

Null actors illustrate legacy/provenance-unavailable Activity shape only; new persisted notes/conditions require actor IDs and must supply them. Decoded activity cursor example: `{v:1,patient_id:"...",filter:"all",occurred_at:"2026-10-02T15:00:00Z",kind:"notes",event_id:"..."}`. Actual cursor uses valid full UUIDs. Totals remain2 even when cursor page contains one remaining event. Order tie tests include same timestamp and distinct revision IDs for the same resource.

Evolution href keeps `/patients/:patientId/evolutions/:evolutionId`. Notes/conditions use `?tab=info&note=:id` / `?tab=clinical&condition=:id`. Target reload selects tab, fetches exact owned resource independent of paginated list, selects correct dentition and focuses record. Invalid query UUID or inaccessible resource shows named not-found recovery within the ficha; patient header remains if patient itself is accessible. Changing a local tab clears stale focused-resource query; ordinary local tab changes need not persist to URL. Activity links open latest resource and offer its revision history; this slice does not replay historical chart state.
