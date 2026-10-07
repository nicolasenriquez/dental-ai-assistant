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

A complete interaction and visual contract is folded into [Appendix A](#appendix-a--human-interaction-and-visual-acceptance-contract) below. It fixes the representation matrix, quadrant orientation, list/chart/editor linking, group/count units, responsive regions and commit/post-save state machine. These rules refine the existing six slices; they do not add clinical concepts or a seventh domain. The synthetic reference HTML used during preparation was pruned with the other preparation evidence; it guided hierarchy/proportions only and does not replace the capability requirements or existing anatomy/runtime components.

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

Acceptance ownership: R1–R4/R11: S1 backend correction; R1/R4: S2 correction UI; R4–R5: S3 readings/actor; R6–R7: S4 spatial editor; R8: S5 conflict review; R9: S6 URL continuity; R13: S2/S4; R14: S3/S4; R15: S4/S6; R10/R12: integrated verification and closeout; R16: S3 backend catalog/typed client/real DB agreement; R17: S3 shared resolution/read/list/history/legend and S4 palette/chart/editor/interaction, with S4 blocked by S3's verified contract. No required scenario is covered only by artifact validation.

## Deferred Research and IA Roadmap

OD06/09/10 need clinical taxonomy/examination/mixed-view decisions; OD11 needs measurements before optimization. Verify complete pages and no false empty on error with synthetic1/50/51/500records but set no arbitrary speed SLA. IA work later must reuse this application boundary, add separate proposal/approval/provenance contracts and explicit clinical approval; no current readiness claim.

## Appendix A — Human interaction and visual acceptance contract

Formerly `visual-contract.md`, folded here during artifact compaction. Closes reference review G01–G09 within approved D-01/D-02. This is a normative design companion, not a new clinical taxonomy or copy of DentalPin assets. The standalone synthetic HTML reference used during preparation was pruned with the other preparation evidence and carried no persistence proof.

### Layout and hierarchy

Keep existing dark shell, logo and patient header. No new logo, dashboard or administrative navigation. Patient identity precedes clinical mode, which precedes selected FDI/concept. The work surface contains anatomy/tools; inspector appears alongside only when chart targets and text fit. At narrow available width, use named quadrant controls then a wrapping tooth grid and editor in normal document flow. A patient Assistant panel may reduce available width even at1440px, so use container space, not a viewport label.

The condition list remains below the work area, grouped by piece with one FDI label and separate records/actions. No card per field/surface/condition. One subdued border per work region, separators between groups; tonal surfaces for depth. Shadows only on an actual floating overlay, not every row. Buttons use existing semantic tokens/radii; primary local Save stays blue, cancel/history secondary. Global Nueva evolución stays in its existing header context.

Typography inherits DESIGN.md: body15px desktop/16px mobile inputs; headings16–20px in this region; FDI tabular numerals. UI action icons20px, condition marks20px palette/list and readable proportional chart marks, stroke1.6 consistent with incumbent ConditionSymbol. Clinical text remains explicit, never dependent on tooltip, color or a collapsed section.

### Symbol and status contract

One mapping drives palette/chart/editor/list/legend for the existing12codes. Reuse current authored symbols and labels; no imported paths or new medical meaning. A clinical-language review may identify a proposed glyph change, but taxonomy and semantics cannot be silently changed during implementation.

D-04/design decision9 fixes ownership: clinical labels and applicability come from the backend catalog; only original symbol geometry/status presentation is frontend-owned. History shares the same resolved entries. One populated diagnosis category is a heading, not a new tab bar. Empty Restauradora/Cirugía/Endodoncia/Ortodoncia tabs are not rendered. Future populated categories use server descriptors without a five-family UI whitelist and cannot change Condition lifecycle. Catalog reads can fail independently of condition/history reads; preserve saved facts and show an explicit catalog error rather than a guessed authoring palette.

Surface-capable codes accept an empty surface list under the existing contract. Describe that evidence as `Sin superficies especificadas`; reserve `Pieza completa, sin superficies` for codes with no surface support. Do not impose DentalPin's fracture whole-tooth rule. Selecting surfaces or navigating categories remains local and never writes.

| Existing code family | Base mark retained |
|---|---|
| pulpitis | Incumbent vertical channel/arrow mark, paired with Pulpitis text |
| caries | Filled circle |
| incipient_caries | Dotted circle |
| pigmentation | Three small spots |
| fracture | Zigzag |
| missing | Cross |
| periapical_lt_2mm / periapical_2_4mm / periapical_gt_4mm | Three circle sizes with exact existing text labels |
| rotated | Rotation arrow |
| displaced | Direction arrow |
| unerupted | Tooth below horizontal reference line |

Concept glyphs are not universal dental-standard certification. Distinct state treatment must not modify a concept's internal line pattern: incipient caries stays dotted in every state.

| State | Treatment | Text / accessible output |
|---|---|---|
| active | Base concept mark, normal contrast; surface fill from existing tokens | Activa |
| resolved | Muted base mark plus separate dashed outer status frame | Resuelta |
| entered_in_error | Muted base mark plus separate error/slash marker outside concept geometry; no active surface fill | Registrada por error; reason/history link |
| local draft | Blue selection boundary/preview, never inserted into persisted list/count | Borrador · Sin guardar |
| hover | Temporary neutral emphasis on piece and related rows | Does not change selected FDI, draft, note link or filter |
| keyboard focus | Existing visible focus ring, independent of selection | Named piece/control and selected/pressed state |
| saving | Local save pending indicator; no clinical status change yet | Guardando… |

Legend shows the three persisted status meanings and draft meaning briefly; extended concept explanation may open separately using the same catalog entries. It does not hide clinical facts. Names are always available; aria-hidden decorative SVG has adjacent text or a named piece button. A persisted code absent from catalog shows Condición no reconocida plus code; a server-supported entry lacking geometry retains its label with Símbolo no disponible and a neutral mark. Unknown category descriptors use Otra categoría plus key. These never masquerade as Caries or a filling and never hide saved records. Contrast/focus must be actually checked in future runtime, not inferred from a token name.

### Spatial orientation and linking

Preserve fdiTeeth order from toothGeometry.ts. Permanent upper18→11 then21→28; lower48→41 then31→38. Primary upper55→51 then61→65; lower85→81 then71→75. The left side of the frontal view is the patient's right; explicitly label it. Mobile quadrant navigation uses superior derecha(Q1/Q5), superior izquierda(Q2/Q6), inferior derecha(Q4/Q8), inferior izquierda(Q3/Q7) in that visual order.

Initially show the selected piece's quadrant; absent selection use upper patient-right. Opening a valid record focuses its dentition/quadrant and piece. Moving quadrant changes visible anatomy only, not selection or clinical filter; retain a selected-piece summary even while it is offscreen. All groups of clinical records remain in the list under the chosen dentition/status. No invisible filtering by displayed quadrant.

Both entry orders are allowed: piece→concept or concept→piece; until both are valid Save stays unavailable with explanation. Click/keyboard selects piece; hover only highlights. A list record names its condition and piece, opens that exact record and focuses the piece after any dirty guard. Multiple conditions on16 are distinct action targets, not one edit button on the entire group. Existing record's immutable fields cannot be changed by clicking another tooth. Existing guard offers discard/remain before replacing draft; no hover-bound note.

Use one visible FDI selection context. Cambiar pieza is an explicit new-draft action; dropdown remains an alternative. Targets44×44CSSpx minimum including quadrant controls. Never overlay overlapping full-chart targets to retain an apparent desktop layout. A reduced overview may be noninteractive only if the quadrant visual selector is clearly operable in the same region.

### Grouping and counts

Group with text Pieza16 then one semantic row per condition: mark+label, canonical surfaces or Pieza completa, explicit status and record-level Editar/Historial/Corregir as permitted. Notes remain readable through the existing record detail/edit affordance; do not create a separate note domain or sidebar binder. Clinical current facts must not be hidden by default.

For surface-capable empty records use Sin superficies especificadas rather than Pieza completa. Catalog-unavailable/unknown-code reading retains the stored extent without inferring applicability; actions follow design decision9 and the existing service lifecycle.

If counts are shown, label them as `8 condiciones · 5 piezas` only when the relevant selected dentition/status read is complete; compute distinct pieces from the complete confirmed set. Drafts never count. Incomplete reads show Datos incompletos and counts unavailable rather than fabricated zero or a total inferred from one page. No new metric endpoint is required solely for this optional display.

### Commit unit and state transitions

| State / event | Visible behavior | Allowed operation |
|---|---|---|
| Draft | FDI/concept summary, Sin guardar, inputs and Cancel/Save | Local editing; cancel no write |
| Save pressed | Guardando… in same action area; fields/attempt frozen | Exactly one create/edit/resolve/correct request |
| Confirmed create/edit | Condición guardada, piece retained, exact saved row focused | Refresh reads; optional explicit Registrar otra condición or Historial |
| Confirmed resolve | Condición resuelta; piece retained and exact resolved result accessible under its history filter | Refresh reads; no new clinical write |
| Confirmed correction with replacement | Corrección guardada; source and result links; focus replacement FDI/dentition/row | Refresh reads; no automatic new draft |
| Confirmed correction without replacement | Corrección guardada; focus original historical error record, reason visible | Refresh reads; no fabricated replacement |
| Confirmed write / subsequent read fails | Guardado confirmado + No pudimos actualizar la vista; keep response/receipt context | Reintentar lectura uses GET only, never replay POST/PATCH |
| Write response uncertain | No confirmamos el guardado; draft and UUID/body frozen | Explicit identical retry; no auto-send/new UUID |
| Definitive422 | Field error and retained draft | Correct input under existing retry rules |
| Definitive409 | Retained draft, save blocked, exact duplicate/current comparison | Owned existing link or field-aware review; no force-write |
| Definitive404 | Resource unavailable, retained draft | Read/recover/discard; no access widening |

Only clear dirty state after an authoritative success or explicit pre-save discard. A delayed response/refresh for patientA must not repaint patientB or focus its chart. Focus after save belongs to the exact returned resource; current default remains active when entering normally, but a resolve/correction result may deliberately expose its historical filter. Clinical status text and a polite live announcement confirm once, not duplicate toasts. New-row focus must not hide patient identity or place focus beneath a fixed control.

Correction names the preserved original separately from the optional new replacement. A labelled Sin reemplazo/Con reemplazo choice keeps reason mandatory in both modes. Without replacement, no replacement fields appear and review says no new resource will be created. With replacement, show its dentition, FDI, concept, surfaces and note under Nuevo registro de reemplazo; original identity remains plain context. A confirmed-write/failed-read correction shows receipt context and GET-only retry, not an editable replacement or another Save. D-03 recovery reviews base/current source and renewed consequence, while ordinary edit/resolve terminal recovery remains read/discard.

There is no Guardar odontograma/Finalizar examen button. Explicit manual labels are Guardar condición and Guardar corrección; resolve review names its consequence. The chart is a projection of confirmed individual records. Future exam approval needs a separate scope and cannot be implied by these saves. Next-action links into evolution/Assistant never automatically send a prompt or approve anything.

### Reference and verification matrix

The synthetic reference HTML used during preparation was pruned with the other preparation evidence; the state matrix above remains the composition reference. It was never connected to authentication or backend, and existing anatomy/profile paths are authored in Assistant, not extracted from Pin. It was a composition/state reference, not a substitute for runtime interactions.

Future proof at all six sizes: idle, draft, saving, saved, read_stale, uncertain, conflict, correction, whole_tooth and history/error. Include long patient name, long note, multiple conditions on one piece and temporal selection in implementation fixtures. Verify1440/1280/1024 with contextual Assistant open/closed using actual supported route/panel behavior; below768 use the existing full Assistant route, not invent a contextual mobile drawer. Narrow pane reflow must preserve selected FDI and draft.

Correction composition additionally covers without replacement and confirmed correction/failed subsequent read at all six sizes. The synthetic presentation selector changed these states without performing a write or GET; production proof must exercise actual requests and D-03 races separately.

The reference preview proved no page overflow for its own synthetic layouts and readable state composition; runtime44px targets, focus, keyboard, API/DB safety, screen reader, actual panel and virtual keyboard require later implementation verification. No decorative animations, decorative stickers or logo duplication is needed.

## Appendix B — Traceability legend

Task traceability uses historical finding IDs from the preparation audits. Those audit files were pruned from this folder for compaction and remain recoverable from git history.

- OD-01 correction distinct from resolution; OD-02 spatial selection/editor density; OD-03 visible professional author; OD-04 current vs historical reading; OD-05 field-aware conflict review; OD-06/OD-09/OD-10 taxonomy, mixed view and surface labels (deferred decisions); OD-07 spatial selection; OD-08 URL continuity; OD-11 performance investigation (large-fixture paging proved; no SLA claimed); OD-12 shared application seam; OD-13 proposal/approval/provenance (roadmap-only).
- DP-01–DP-03 predecessor reference cautions (ambiguous taxonomy, immediate writes, inaccessible SVG interactions); none were imported.
- G01 canonical clinical query compatibility; G02 symbol/status/focus matrix; G03 post-save closure for all four commands; G04 chart/list/editor linking; G05 quadrant orientation and order; G06 grouped rows and count units; G07 incumbent visual hierarchy; G08 verifiable visual reference/state matrix; G09 individual-record commit unit.
- H01 definition/applicability ownership split; H02 category/consumer extension contract; H03 runtime vocabulary vs SQL constraint drift; H04 catalog-failure and optional-empty-surface ambiguity.
