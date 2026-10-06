## Context and Ownership

The condition resource belongs to one owner/patient and already has a safe atomic revision repository. The user approved replacing the old resolve-and-create correction policy. Keep the highest HTTP/UI Seam and introduce only the patient-condition application Module needed to express the new command.

Interface: typed record/edit/resolve/correct calls. FastAPI and frontend client are Adapters; future agent adapters are excluded. Repository Depth comes from transaction, locking and receipt invariants, not exposing SQL to application callers. Locality remains within patients and its UI; Leverage is one correction workflow without a second rules path.

## Goals / Non-Goals

Goals: truthful correction semantics, auditable actor/reason, explicit current/history, accessible spatial selection, deliberate conflict choices and reload continuity. Non-goals are proposal.md exclusions; existing clinical and privacy guarantees remain.

## Decisions

### 1. Correction is a separate command

States: active permits edit/resolve/correct; resolved permits read and correct only; entered_in_error permits read only. Corrections to a resolved original annotate a recording error, never undo its previous revision. No automatic conversion of old resolved data. Original identity/FDI/code are retained; historical snapshots are not rewritten.

UI action `Corregir registro` opens a draft, mandatory reason and optional replacement. Review names masked patient context, original FDI/concept, consequence and replacement. `Guardar corrección` is the only commit. Cancel has no write. New replacement uses a new client UUID and same owner/patient; no bulk/cross-patient replace or reopen.

During saving and an uncertain transport outcome, freeze operation_id and the complete normalized command, including replacement UUID; retry the same body to obtain the receipt. Do not allow changing that frozen attempt until an authoritative success/error is received. Leaving an uncertain attempt never promises to undo a possibly committed correction. A definitive409/422 allows reviewing the retained draft and constructing a new attempt after refresh; no new operation is created by an automatic retry.

D-03 closes correction conflict recovery: a definitive revision_conflict retains reason/replacement and loads the latest owned source. If it is active or resolved, show base/current source evidence and status, preserve the replacement as a proposed new record, and require renewed confirmation of the correction consequence. Only that confirmation creates a new operation_id and adopts the reviewed expected_revision; replacement UUID may remain the same when its creation was definitively rolled back. Do not merge replacement fields with original fields. If current is entered_in_error, block new correction; an uncertain identical operation still recovers its existing receipt before terminal checks. Failed current reads block confirmation. Another409 repeats this review.

Rejected: edit immutable FDI/code on the same identity obscures what record was erroneous; separate correction/create can leave an avoidable half-completed replacement; resolving implies a clinical outcome.

### 2. Additive transport and persistence

`POST /api/patients/{patient_id}/conditions/{condition_id}/corrections` body:

```json
{"operation_id":"UUID","expected_revision":3,"reason":"Se registró en una pieza equivocada.","replacement":{"id":"new UUID","dentition":"permanent","tooth_fdi":26,"condition_code":"caries","surfaces":["O"],"note":null}}
```

replacement may be omitted/null. Schema forbids extras; positive strict revision; trimmed reason1–1000characters; replacement follows existing create validation, including optional surfaces and note1000. No owner/actor/status/supersedes input. It may change tooth/dentition/code only by creating a validated new identity. Replacing a record with the same identity fields is permitted if the original evidence is incorrect; replacement reason explains it.

Response201 on first commit,200 on identical retry: `{operation_id, condition_id, correction_revision_id, replacement_condition_id, replacement_revision_id}` with nullable replacement IDs. This stable receipt identifies exact revisions; callers GET latest resource state separately. Retry does not pretend a replacement's later edits are the correction snapshot.

Expand condition status check to entered_in_error; add nullable `supersedes_condition_id` to replacement with owner/patient composite FK and unique direct replacement per original. Correction reason/operation_id/command_snapshot belong to original correction revision; action `corrected`. Add owner+operation unique partial index on correction revisions. No generic operations/event store. Application normalizes command once; repo persists normalized immutable payload alongside receipt-bearing revision metadata. The linked replacement created revision is retrievable by replacement ID/revision1. Conditions/revisions DTOs include nullable linkage/correction metadata; legacy revisions retain null. Old GET status=all includes all statuses, with explicit entered_in_error filter added and cursor validation expanded. Existing active/resolved semantics remain. Deploy backend/status-aware client together before enabling correction entry; downgrading app preserves data but a pre-change client cannot safely consume the expanded status, so do not roll back to it after new records are written.

Transaction: verify owned parent/source; lookup committed operation receipt scoped by owner; identical normalized command returns receipt, incompatible reuse409idempotency_conflict without disclosure; lock original; recheck receipt after lock to close same-operation race; validate revision/source state; mark entered_in_error/revision+1; insert corrected revision; optionally insert replacement and created revision/link; commit once. Any failure rolls back all. If the owner+operation unique constraint races across different source locks, roll back the whole attempted correction before rereading the committed owned receipt; normalize/compare and return identical receipt or409idempotency_conflict, never a500 or partially changed source. A duplicate active replacement returns existing owned record409active_condition_exists and leaves source unchanged. New operation on already-error source409condition_entered_in_error; stale revision409revision_conflict. Foreign patient/source/UUID collision remains404; invalid body422. Keep existing partial unique active identity and overlap policy. Distinct operation IDs racing on one source yield exactly one successful correction.

Migration must expand both revision constraints in0022: allowed action and the revision>1/before_snapshot rule admit corrected. Creation remains revision1 with action created and null before. New correction metadata is present only on corrected revisions; legacy snapshots are never backfilled or rewritten.

#### Read DTOs and exact revision retrieval

Keep ConditionSnapshot fields unchanged except the additive status union. ConditionResponse adds `supersedes_condition_id: UUID | null` and `correction: CorrectionMetadata | null`. ConditionRevision adds the same two top-level fields, not fields inside before/after snapshots. Linkage is immutable and comes from the owned condition row; correction is populated only for the corrected revision or the current entered_in_error condition. Legacy records/revisions return null. A replacement created revision has supersedes_condition_id and null correction; if that replacement is later corrected, it has its own correction metadata.

CorrectionMetadata is `{operation_id, condition_id, correction_revision_id, reason, replacement_condition_id, replacement_revision_id}`. All IDs are UUIDs except nullable replacement IDs, which are both null or both present. The correction endpoint receipt is this object without reason. command_snapshot remains internal persistence data for normalized replay comparison and is never exposed in conditions, revisions or Activity. Actor/time remain existing persisted DTO fields. Activity adds action corrected/title Condición corregida while retaining revision event_id, resource_id and the resource href; it never includes reason/note/snapshots.

Example additive fields on a corrected original:

```json
{"id":"00000000-0000-4000-8000-000000000016","status":"entered_in_error","revision":4,"supersedes_condition_id":null,"correction":{"operation_id":"00000000-0000-4000-8000-000000000001","condition_id":"00000000-0000-4000-8000-000000000016","correction_revision_id":"00000000-0000-4000-8000-000000000004","reason":"Se registró en una pieza equivocada.","replacement_condition_id":"00000000-0000-4000-8000-000000000026","replacement_revision_id":"00000000-0000-4000-8000-000000000005"}}
```

Example additive fields on its replacement:

```json
{"id":"00000000-0000-4000-8000-000000000026","status":"active","revision":1,"supersedes_condition_id":"00000000-0000-4000-8000-000000000016","correction":null}
```

Example corrected revision fields, alongside unchanged actor/time/before/after fields:

```json
{"id":"00000000-0000-4000-8000-000000000004","condition_id":"00000000-0000-4000-8000-000000000016","revision":4,"action":"corrected","supersedes_condition_id":null,"correction":{"operation_id":"00000000-0000-4000-8000-000000000001","condition_id":"00000000-0000-4000-8000-000000000016","correction_revision_id":"00000000-0000-4000-8000-000000000004","reason":"Se registró en una pieza equivocada.","replacement_condition_id":"00000000-0000-4000-8000-000000000026","replacement_revision_id":"00000000-0000-4000-8000-000000000005"}}
```

Exact result/history activation uses the existing owned condition GET, then GET revisions with limit50 and existing next_cursor until the target revision UUID from the receipt/metadata is found. Preserve loaded pages, focus and label that exact snapshot, and distinguish it from the latest resource if later edits occurred. On page failure retain target and retry the failed cursor with GET only. Exhausting pages without target shows revision unavailable, never substitutes latest. Navigation to the record remains the existing condition UUID URL; target revision is local history context, not clinical browser storage or a new URL parameter. No new exact-revision endpoint is required.

### 3. Shared application boundary, no speculative framework

`patients/condition_service.py` provides typed record/edit/resolve/correct entry points using existing domain validation and repository transactions. Routes authenticate/map HTTP and delegate. SQL, row locks and transaction-bound rechecks remain repo-owned; no route calls sequential repo methods to emulate atomic replacement. Existing POST/PATCH retry semantics and status-only resolution remain identical. No new tool/client adapter or generalized command bus.

Typed command/domain validation lives under patients and may be shared by transport models; the service must not import routes or rely on frontend applicability checks. Catalog grouping does not create another mutation path. Preserve normalized omission-versus-explicit-null/[] behavior and immutable attempt bodies when consolidating validators.

### 4. Current/history and honest author labels

Default UI filter Actuales requests active conditions and does not draw resolved/error marks as active. Existing explicit Todas/Resueltas plus Registradas por error remain available, with text/legend status and no health inference. Deep link to a non-active record temporarily selects its appropriate historical filter and dentition; returning to current does not lose a draft silently. Default UI does not silently change API default all.

Keep actor UUID as authority. Display existing trusted display_name when available; otherwise `Usuario <first 8 UUID hex characters>` with full UUID available through an accessible disclosure. If abbreviations collide among displayed actors, expand just enough to distinguish them. Do not claim professional verification, show email/RUT, use current user for another actor, or say unavailable when UUID exists. No new profile/name field or auth change. Render on records, revision history and Activity. A future verified professional profile is a separate feature.

### 5. Spatial selection and compact editing

Keep chart identity/FDI, anatomical families and native buttons. When space cannot fit sixteen44px controls, render paged anatomical quadrants: one selected quadrant with up to eight permanent/five primary teeth in the available width, all quadrants reachable through named44px controls; wrap within the quadrant if needed. This is view pagination, not hiding condition text; label quadrant/dentition and preserve selected FDI/draft across switches. Full chart remains overview only when controls would overlap. Changing viewport must not reset selection. Dropdown remains a secondary keyboard alternative. No container threshold may leave a seemingly interactive chart as the only visual affordance with no piece controls.

For new draft, show selected FDI text and a deliberate Cambiar pieza affordance rather than a second required dropdown. Existing record immutable fields remain plain context. Whole-tooth codes show `Pieza completa, sin superficies`; no five disabled controls. Surface codes keep native checks/labels. Clinical content is never collapsed by default. Preview is at most96px high on narrow layouts; textarea starts with at least4lines, allows normal growth to roughly one-third available visual viewport then internal scrolling; Cancel/Guardar adjacent and touch44. Focus selected surface/input without reselecting tooth. Do not animate clinical state changes decoratively.

### 6. Conflict comparison, not automatic merge

Store base snapshot from edit start, local draft and latest server revision. On409 freeze save, retain draft, load latest and display base/local/current for surfaces and note; compare status and immutable identity separately. Each locally changed field requires an explicit keep-local/use-current choice. Untouched local fields retain current values without presenting them as local changes. No default choice for conflicting edits, no all-fields rebase button. Resolve intent must be separately confirmed against latest active state. For edit/resolve, current resolved/error source permits read/discard, not editing or force-rebase. Correction has the distinct D-03 review in decision1, including resolved sources. Server read failure offers retry without losing local data. Each successful retry uses newly chosen current expected_revision; another409 repeats comparison rather than force-saving.

| Pending command | Latest source | Recovery |
|---|---|---|
| edit/resolve | active | Field choices; resolve consequence confirmed separately |
| edit/resolve | resolved/entered_in_error | Read/discard; no new mutation |
| correct | active/resolved | Retain reason/replacement; review source and confirm a new attempt |
| correct | entered_in_error | No new correction; identical uncertain committed attempt may recover receipt |
| any | latest read unavailable | Retain local data; block renewed save and retry GET |

### 7. Safe URL continuity

Canonical path remains patient ficha. Reuse existing `tab=clinical&clinical=diagnosis|evolutions` on every committed view change, including bare ficha URLs. No clinicalView parameter is introduced or treated as an alias; it was only an earlier planning name and never a deployed contract. Evolution detail path takes precedence over query state; otherwise valid clinical selects the subview, absent/unknown clinical defaults to diagnosis. Fetch a focused condition UUID only within diagnosis; switching to evolutions removes condition and switching away from clinical removes clinical/condition while preserving supported unrelated safe parameters. Existing clinical=evolutions links continue to restore Evoluciones. Never put patient name, RUT, note, correction reason or search into URL. Malformed condition UUID does not fetch. Back/forward uses existing draft guard before switching patient/view; accepted discard clears draft, canceled navigation restores prior URL/UI. Browser refresh preserves saved location, not unsaved input after explicit discard. History-only view restoration is safe query state, not patient-data storage.

### 8. Complete interaction and visual contract

[visual-contract.md](visual-contract.md) fixes the representation matrix, quadrant orientation, list/chart/editor linking, group/count units, responsive regions and commit/post-save state machine. These rules refine the existing six slices; they do not add clinical concepts or a seventh domain. [wireframes/odontogram-reference.html](wireframes/odontogram-reference.html) is a standalone synthetic visual reference only, with selectable display states and no HTTP writes. References guide hierarchy/proportions, not replace the capability requirements or existing anatomy/runtime components.

Save is always per condition or per correction command, not an examination-wide approval. After confirmed save preserve the reviewed piece, focus the saved record or correction result, announce outcome, and keep an explicit next action. A failed subsequent GET is a stale-view error, not an uncertain write. For uncertain writes freeze existing attempt identity/body and do not resubmit automatically. A read failure retries reads only. All four commands use this same feedback contract; correction may select the replacement's different FDI/dentition after receipt.

### 9. D-04 bounded backend catalog and frontend presentation

On2026-10-06 the human selected `A. Catálogo mínimo`: consolidate backend definitions and add minimal grouping/applicability metadata to the existing catalog, with only diagnosis available. This refines S3/S4, not clinical taxonomy. Five future families are not a closed TypeScript enum or enabled tabs. No Procedure, treatment-plan item, appliance, multi-tooth command, enabled flag or configurable statusBehavior is introduced. All twelve codes retain their current Condition lifecycle regardless of presentation category.

Keep typed immutable definitions in `patients/conditions.py`, keyed by condition code, containing `label_es`, `category_key`, `surface_codes` and `allowed_dentitions`. Derive the existing CATALOG label projection and SURFACE_CODES membership from these definitions if their imports must remain compatible. `canonical_surfaces`, catalog serialization and application validation consult that same definition. Existing global FDI/canonical M,D,O,V,L validation remains. All twelve allow permanent and primary; the four surface-capable codes remain caries, incipient_caries, pigmentation and fracture. Empty surfaces remain valid for every code. Scope is derived from nonempty surface_codes (surface-capable versus whole-tooth), not an additional field that can contradict it. Surface-capable does not mean surface-required.

The existing authenticated `GET /api/patients/condition-catalog` keeps `version:1`, the twelve ordered `conditions` and all existing entry fields. Add top-level `categories:[{key:"diagnosis",label_es:"Diagnóstico"}]` and per-entry `category_key:"diagnosis"`, `allowed_dentitions:["permanent","primary"]`. These are additive hints, not authority supplied by a caller. Do not put categories/icons/draft state in condition rows, snapshots or mutation bodies. Request extras remain forbidden. An old catalog response lacking these additive fields normalizes to the one diagnosis group and both incumbent dentitions in the typed client/presentation boundary; it still gets labels/surfaces from the response. Do not replace a failed catalog request with a guessed hardcoded clinical catalog. Backend/client/status rollout rules from decision2 still apply; catalog compatibility does not make old clients safe for entered_in_error.

SQL CHECKs in0022 remain immutable historical schema guards, not another live catalog. Keep the exact code/surface constraints for this change and verify them against definitions through real migrated-DB insert/rejection proofs. A future approved code or changed applicability requires an additive migration as well as a domain definition. Do not remove constraints, import live definitions into a historical migration or claim that adding a Python definition alone makes a code persistable.

Use one local `src/lib/odontogramPresentation.ts` helper for catalog indexing, category grouping and text/applicability resolution. A presentation-only code-to-symbol-key registry points to the existing authored ConditionSymbol geometry; labels, allowed dentitions and surface rules never originate there. Palette, chart, editor, list, concept legend and history consume the same resolved entries. Persisted status adornments and focus/hover/draft remain separate from the base symbol. No custom widget per concept and no component-library/state-store addition. Category grouping changes palette organization only, not patient context, current/history filtering, lifecycle permissions or selection. Render a plain Diagnóstico heading for one populated category; category controls are needed only for multiple populated server categories and must use44px native controls. Category navigation alone does not discard a draft or select a new clinical concept.

Fallbacks distinguish evidence from authoring:

| Input | Reading/presentation | Authoring |
|---|---|---|
| Supported catalog entry, no dedicated symbol | Server label/code plus neutral mark and Símbolo no disponible; same fallback everywhere | Allowed only through the supported single-Condition applicability contract; backend still validates |
| Persisted code absent from loaded catalog | Condición no reconocida plus escaped code, stored surfaces/status and history; never drop the record | No create/edit inferred from fallback; lifecycle-only resolve/correct without replacement remains governed by service rules; a replacement must use a supported catalog entry |
| Unknown category key with valid category label/entry metadata | Render server label and group without a frontend five-family whitelist | Category does not grant procedure/planning semantics; entry still must satisfy the supported Condition contract |
| Missing category descriptor for a supplied key | Visible Otra categoría plus escaped key, retain record/entry | No inferred clinical meaning or new command kind |
| Catalog read unavailable or malformed applicability metadata | Retain independently loaded owned conditions, code fallback and history; catalog error with GET retry | Block new/edited concept applicability and replacement saves requiring catalog review; retain drafts/frozen uncertain attempts; identical uncertain retries follow existing command rules |

Own condition/history reads must not be gated by catalog success. Retry catalog reads without resending writes; refreshing metadata must not silently rewrite a reviewed draft or frozen attempt. Unknown future category fixtures prove defensive presentation, not authorization to publish a new clinical family.

Extension proof: inject an extra synthetic Condition definition/category into a catalog fixture with existing supported applicability and no new symbol. The same entry appears consistently in palette, inspector, list, chart accessible description, concept legend and revision history without modifying those components or status handling. This is a frontend composition test, not a thirteenth production code or DB write. A bespoke symbol may require one presentation registration and geometry addition; new clinical domains still require their own validated entities, commands and rendering integration. The reusable chart/selection shell must not assume every future overlay is a Condition or that changing category creates a Procedure.

## Blast Radius and Rollout

One additive migration plus condition domain/service/repo/routes/client, Activity mapping and patient surfaces. Terminal status requires exhaustive union updates and cursor tests. Existing evolution/Drive/auth/LLM remain untouched. Preserve data on DB downgrade; test legacy records/requests and avoid rollback to status-unaware binaries after correction writes. Do not promise backward response compatibility to a pre-change status parser.

## Verification Strategy and Slice Dependencies

S1 correction API crosses HTTP/Postgres with fail-first, duplicate rollback, lost-response retry, same/different-operation races, ownership and legacy data. S2 correction UI and S3 reading/actor/catalog depend on S1's terminal status and metadata. S3 owns the small additive catalog contract and shared presentation helper; S4 consumes it and is blocked by S3's verified checkpoint. S5 conflict recovery depends on S1 terminal status handling. S6 navigation is independent; final integration joins all. Each slice has a verifiable checkpoint; no agent runtime dependency.

## Deferred Research and IA Roadmap

OD06/09/10 need clinical taxonomy/examination/mixed-view decisions; OD11 needs measurements before optimization. Verify complete pages and no false empty on error with synthetic1/50/51/500records but set no arbitrary speed SLA. IA work later must reuse this application boundary, add separate proposal/approval/provenance contracts and explicit clinical approval; no current readiness claim.
