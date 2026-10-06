# Odontogram extensibility audit

Date:2026-10-06. Scope: source/spec audit and surgical specification refinement only.

## 1. Executive verdict

**GO at specification level after approved D-04 refinement. Score:93/100.** Before refinement,86/100 and GO WITH CONDITIONS for the additional extensibility objective. These are engineering judgment scores, not measured runtime quality or clinical certification.

The existing end-to-end workflow, correction transaction, retries, revision conflicts, navigation and responsive contract are sufficiently specified. The latest request exposed a narrower omission: "one visual mapping" did not establish backend definition ownership, additive catalog shape, SQL drift proof or safe extension/failure behavior. D-04 closes those omissions in R16–R17 and S3/S4. No material human decision remains for this bounded scope. Runtime delivery still requires the unchecked proof gates.

| Dimension | Weight | Before | After | Rationale |
|---|---:|---:|---:|---|
| Clinical boundaries and preservation |20|19|19|Condition, resolution and error correction remain distinct; no procedure taxonomy imported |
| Persistence, concurrency and retry |20|19|19|Existing detailed atomic/revision/receipt design retained; runtime proof outstanding |
| End-to-end UX and responsive behavior |20|18|19|Existing states/container contract retained; optional-empty surfaces/catalog failure clarified |
| Catalog ownership and extension |20|12|17|Backend definitions, additive transport, SQL agreement, six-view resolution and fallbacks now explicit |
| Repo fit, traceability and verification |20|18|19|Existing29 tasks retained; real S3→S4 dependency and test obligations added |
| Total |100|86|93|Specification quality only |

The remaining seven points reflect implementation complexity, unexecuted production accessibility/DB/browser gates and clinical-symbol validation limits. They are not hidden requirements that DentalPin can resolve.

## 2. Current architecture

Assistant branch is `feat/ai-assisted-evolutions`, local HEAD `a12812a`. Previous audit baseline `06b12bf` is historical. DentalPin local HEAD is `fc36a71b`; an existing frontend/modules.json edit was left untouched. No remote-HEAD equality is claimed.

| Element | Current implementation | Consequence |
|---|---|---|
| Catalog | patients/conditions.py:15–29 CATALOG labels and SURFACE_CODES; authenticated patient_conditions.py:189–201 returns version1/code/label_es/surface_codes | Already backend-owned; not twelve independent frontend label lists |
| Validation | CreateCondition validators, valid_tooth/canonical_surfaces and repository surface recheck | Backend authority exists, but definitions/applicability are split |
| Schema |0022_patient_conditions.py:19–40 code, dentition, canonical surfaces/applicability CHECKs | Static guards are intentional; adding a runtime code alone cannot persist it |
| Client | lib/api.ts:1000–1116 typed catalog, records, revisions and POST/PATCH | code is already string; categories/applicable dentitions are absent |
| Palette/editor | PatientDiagnosis loads catalog, maps labels/tools and edits local draft; surfaces are native checks | No write before Save; current editor always renders five controls, disabling whole-tooth ones |
| Symbols | ConditionSymbol.tsx code switch with original geometry and resolved:boolean | One symbol implementation, but status and neutral fallback need explicit treatment |
| Chart | PatientOdontogram projects active surfaces/resolved outlines, shares ConditionSymbol, overlays native tooth buttons only at720px chart width | Container-aware already; no visual quadrant controls below threshold; no error status yet |
| List/history | PatientDiagnosis and PatientConditionHistory consume labels but have separate binary status text | Current API-driven labels are useful; shared resolution/status contract is missing |
| Reads | PatientDiagnosis.load awaits catalog before paging conditions | Catalog failure can prevent saved evidence from loading; empty UI must not imply clinical absence |
| Persistence | Routes call patient_conditions_repo directly; repo checks owner/parent, locks row, applies expected_revision and creates append-only revisions in transaction | condition_service.py is planned, not shipped; preserve existing transaction rules |
| Activity/navigation | PatientActivity + patient_activity route project revision IDs; PatientDetail reads tab/clinical/condition | Existing links and historical targets must remain valid |

Current statuses are active/resolved. entered_in_error, correction metadata/endpoint and new application service are specification targets, not runtime features observed here.

## 3. DentalPin findings

All source paths below are relative to the supplied DentalPin repository.

### ADOPT

- Keep palette, selected piece, applicable surfaces and record editor visibly related.
- Group separate records under one FDI heading, retaining each record's identity/actions.
- Separate concept representation from persisted state and transient selection.
- Reuse a central presentation registry and anatomically mirrored surface coordinates.

### ADAPT

- `frontend/app/config/odontogramConstants.ts:440–524` defines five static clinical families and type membership. `useTreatmentCatalog.ts:33–118` fetches server items and groups them by clinical_category with constants fallback. Assistant should use its existing catalog, with only diagnosis published now.
- `TreatmentBar.vue:73–144` displays all families in diagnosis for existing work, therapeutic families in planning, and locks effective status per mode. This is broader than diagnosis-only despite comments in some helpers. Assistant must not infer modes/permissions from category.
- `TreatmentBar.vue:224–279` separates catalog item identity from odontogram type/icon. Useful conceptual separation; price/material/catalog UUID mechanics are out of scope here.
- `ConditionsList.vue:26–40` flattens treatment tooth membership then groups by FDI. Assistant has one Condition per tooth, so it needs grouping without membership entities.
- `OdontogramChart.vue:601–611` keeps edit modal open when update returns null and closes only after success. Preserve this behavior principle in explicit condition saves.
- `HistoryMode.vue:23–35,55–64,158–180` uses date-based whole-chart replay. Assistant has owned per-record revision history; importing chart replay would add a domain/query requirement.

### DO NOT COPY

- `useTreatments.ts:20–35` maps frontend existing to backend performed and normalizes back. That does not define active/resolved Condition semantics.
- `OdontogramChart.vue:346–375` writes immediately on direct surface clicks and whole-tooth actions. Assistant retains local selection→review→Save for every entry path.
- `SurfaceSelectorPopup.vue:162–167` clears/closes immediately after emitting confirm; chart's confirm handler:561–565 does not await persistence. Preserve draft/popup until authoritative result.
- `DiagnosisMode.vue:87–89` changes selectedTooth on hover; sidebarCtx exposes it as clinical context. Assistant hover only highlights.
- `OdontogramChart.vue:568–573` ignores deleteTreatment's boolean and toasts Undone; `useTreatments.ts:157–171` can return false. No apparent undo or false success.
- `TreatmentEditModal.vue:102–106` does not send changed empty surfaces. Assistant explicitly supports[] and must preserve that behavior.
- DentalPin fracture is whole-tooth (`odontogramConstants.ts:171–174`); Assistant fracture is surface-capable. Preserve Assistant meaning.
- `TreatmentIcons.ts:522–524` falls back to a filling icon. Unknown concepts must use a neutral explicit fallback.
- `OdontogramLegend.vue:98–110` still iterates static categories; `ToothDualView.vue:91–155` contains type-specific rendering branches. DentalPin does not fully solve dynamic registry consistency itself.
- Do not copy Vue implementation, SVG paths, assets, branding or colors. LICENSE identifies Business Source License1.1; this refinement records concepts/source evidence only.

Source read establishes these control paths. This pass did not execute DentalPin writes or reproduce network failures in its browser.

## 4. Taxonomy comparison

| Category | DentalPin | Assistant current | Ship now? | Future? | Domain implications |
|---|---|---|---|---|---|
| Diagnóstico | Static twelve types plus catalog; diagnostic entries existing-only | Twelve Condition codes; no category descriptor | Yes, one diagnosis grouping with current codes | More approved Condition definitions | Validate code/applicability and schema before adding persistable concepts |
| Restauradora | Fillings/sealant/veneer/inlay/overlay/crown; catalog variants; bridges/splints in multi-tooth flow | No restoration/procedure entities | No tab/content | Separate approved capability | Existing restoration observation may differ from performed Procedure or plan item; category alone cannot settle meaning |
| Cirugía | extraction/implant/apicoectomy, existing/planned | missing is a Condition, not performed extraction | No | Separate approved capability | Absence versus indication versus performed surgical act require distinct facts |
| Endodoncia | root canal extents/post/overfill, existing/planned | pulpitis and periapical conditions only | No | Separate approved capability | Disease/observation does not equal root-canal procedure completion |
| Ortodoncia | bracket/tube/band/attachment/retainer, existing/planned | rotated/displaced Conditions only | No | Separate approved capability | Tooth position, appliance presence and therapeutic action need validated models |

The five families really exist, but they are not five interchangeable Condition statuses. Constants provide fixed defaults; server catalog can add category/items. TreatmentBar also always includes constant categories, so empty/default tabs are not proof of enabled backend capability. Assistant should not repeat that fallback behavior.

## 5. Capability matrix and main gaps

| Capability | DentalPin | Assistant current | Current OpenSpec before D-04 | Gap | Recommendation | Scope impact |
|---|---|---|---|---|---|---|
| Semantic catalog | Static registries plus server treatment catalog | Backend CATALOG + SURFACE_CODES | Consistent visual mapping requested | H01/P1 ownership and derivation unspecified | Typed definitions drive API/service; presentation stores only geometry | Small S3 refinement |
| Category grouping | Five constants merged with server categories | Flat API-driven palette | No category transport | H02/P1 fixed-list extension contract missing | Add one diagnosis descriptor/group key; no closed five-family enum | S3/S4, no new clinical codes |
| Surface/whole-tooth | Separate lists; fracture whole-tooth | Four surface-capable codes incl. fracture;[]optional | Existing applicability preserved | H04/P1 empty extent can be mislabeled whole-tooth | Derive scope from allowed surfaces; preserve[]and label accurately | S3/S4 wording/proof |
| Schema extension | Separate Treatment/catalog domain and validation | Explicit12-code DB CHECK | Taxonomy deferred | H03/P1 definition-only extensibility would fail DB | Keep constraints; require future additive migration + drift gate | Current DB proof, no new schema for grouping |
| Concept→tooth / tooth→concept | Tool-first with click-to-apply | Both local orders | Both allowed; explicit Save | Existing contract sufficient | Retain local draft/review | No redesign |
| Multi-surface | Popup review, direct click writes | Local canonical subset | Explicit applicability and Save | No new scope gap | Preserve all optional subsets/backend checks | Existing tests extended |
| Multi-tooth | Registry/range/free, bridges/splints/roles | Single-tooth Condition identity | Excluded | New entity/atomicity needed | Future domain change, no multi_tooth branch now | Deferred |
| Edit/resolve/correct | Treatment CRUD/perform/delete/undo | edit/resolve, planned correction | Atomic correction/retry/D-03 specified | DentalPin cannot resolve our transaction semantics | Keep approved service/repo path | Unchanged S1/S2/S5 |
| Palette/chart/list/legend/history | Shared constants/icons but dynamic/static divergence | Labels from API; shared geometry; repeated binary statuses | R14 symbols/status contract | H02/P1 consumer boundary/extension proof missing | One resolved entry + independent state treatment | S3/S4 |
| Catalog outage/unknown concept | Static fallback, unknown filling glyph | Catalog gates record load; code fallback | Unknown label only | H04/P1 evidence/authoring distinction missing | Independent saved reads; neutral explicit fallback; no inferred writes | S3/S4 failure proof |
| History | Date-based chart replay | Owned revisions | Exact revision paging/metadata fixed | No blocker for current scope | Retain per-record history | No chart replay |
| Container reflow/keyboard/touch | Responsive component CSS/SVG interactions | Container threshold hides controls | R6/R15 quadrant/44px/Assistant contract | Production proof still needed | Keep current approved orientation/targets/draft guards | Existing S4 proof |

No new P0 found. H01–H04 were P1 specification gaps for this request and are now closed normatively. P2 follow-ups are runtime craft/clinical-symbol review and optional concept-legend presentation. They stay under existing verification, not a hidden redesign.

## 6. Recommended architecture and implementation fit

Approved D-04 chooses the smaller catalog refinement, not the proposed generic OdontogramConceptDefinition verbatim.

```text
patients/conditions.py (typed definitions + domain validation)
       |                       |
       v                       v
existing catalog GET      condition_service record/edit/resolve/correct
       |                       |
       v                       v
lib/api.ts               db/patient_conditions_repo.py --> Postgres
       |
       v
lib/odontogramPresentation.ts (resolution/grouping, presentation-only symbols)
       |
       +--> palette / chart / editor / list / concept legend / history
```

Minimal transport shape is fixed in design decision9: keep version1/code/label_es/surface_codes; add categories and entry category_key/allowed_dentitions. All shipped entries stay diagnosis and both dentitions. Derived surface capability avoids contradictory scope metadata; no multi_tooth, enabled or statusBehavior fields. Presence in backend catalog supplies current authoring choices; client metadata is UX guidance, never backend permission.

| Repo location | Planned responsibility |
|---|---|
| app/backend/patients/conditions.py | Consolidate immutable definitions; derive compatibility projections; preserve FDI/surface canonicalization |
| app/backend/patients/condition_service.py | Existing planned canonical command boundary consumes domain validation; repo owns locks/transactions |
| app/backend/routes/patient_conditions.py | Auth/transport mapping and additive catalog serialization, not independent vocabulary |
| app/backend/db/patient_conditions_repo.py | Preserve uniqueness/revisions/retry/correction atomicity; no category persistence |
| app/backend/alembic/versions/0022_patient_conditions.py | Historical constraint evidence, not edited; correction still uses its separate additive migration |
| app/frontend/src/lib/api.ts | Additive DTO and legacy normalization at typed boundary |
| app/frontend/src/lib/odontogramPresentation.ts | One local catalog index/category/label/extent resolver and code-to-symbol-key mapping |
| Existing ConditionSymbol/ToothDrawing/toothGeometry | Original geometry/anatomy with independent status decoration |
| Existing PatientDiagnosis/PatientOdontogram/PatientConditionHistory | Consume shared resolved entries, preserve deliberate guards and in-memory draft |
| Existing PatientDetail/PatientActivity | Existing safe navigation and revision projection requirements retained |

An approved new single-Condition concept should need a domain definition, schema migration where required, optional dedicated symbol registration and external contract tests. It should not need a new palette/list/legend/chart-state implementation. A future Procedure/appliance/multi-tooth capability still needs its own validated domain, persistence and integration. Reusing chart selection/composition avoids an entire odontogram rewrite; catalog metadata does not eliminate those future domain costs.

## 7. End-to-end flow and slice order

```text
Owned ficha --> Clínica/Diagnóstico --> saved current/history reads
                                 +--> catalog GET (independent failure/retry)
        |
        v
piece + catalog concept (either order)
        --> applicable surfaces/note in local draft
        --> explicit review/Save
        --> typed client --> owned route --> condition_service --> repo transaction
        |
        +--> confirmed write --> exact result/focus --> GET refresh
        |                                      +--> failed GET: saved/stale, GET-only retry
        +--> uncertain response --> frozen UUID/body --> explicit identical retry
        +--> definitive conflict --> command-specific review --> confirmed new attempt
        +--> invalid/unavailable --> retain draft, actionable error
```

Resolution names clinical outcome; correction names a recording error, mandatory reason and optional linked atomic replacement. Selected FDI/dentition and draft survive reflow/hover/category navigation. UI states never become persisted clinical statuses. No examination-wide Save or automatic Assistant action.

```text
S1 correction API --> S2 correction UI -------------------+
                  --> S3 reads/actor/catalog --> S4 ------+--> integrated proof --> closeout
                  --> S5 conflict review ----------------+
S6 safe navigation -------------------------------------+
```

S4's new S3 dependency is genuine because palette/chart/editor consume its verified catalog/resolver. It replaces the former independent-S4 assumption; six slices and29 task IDs remain. S1 and S3 are substantial slices and should be executed incrementally through their listed proofs, not treated as one undifferentiated edit.

## 8. Readiness gate and proof limits

| Gate | Specification evidence | Runtime proof owner |
|---|---|---|
| No rigid UI list | R16–R17/design9 shared definition/resolution | S3/S4 synthetic extension |
| Original12preserved | Explicit exact code/surface/dentition/[]contract | S3 HTTP + migrated DB, integrated regression |
| No unvalidated meaning | diagnosis only; unchanged labels/applicability | S3/S4 + manual clinical-language review |
| Condition≠Procedure | R12/R16/R17; future entities explicitly deferred | Integrated language/command proof |
| Reference without source copying | Source facts plus original geometry contract | Diff/source review during implementation |
| Backend authority | Domain/service + SQL guards, forbidden extras | S1/S3 HTTP/real DB |
| Consistent categories/concepts/status | Shared six-view presentation; independent adornments | S3/S4 |
| Responsive context retained | Existing R6/R15 plus R17 category/reflow behavior | S4 actual container/Assistant/keyboards |
| Correction safety retained | R1–R3/R8/R11 untouched; catalog cannot change attempt | S1/S2/S5 + integrated failure proofs |
| Future expansion without chart rewrite | Reusable composition, no per-view code list; new domains still explicit | Synthetic single-Condition extension; future domain gate |

DentalPin closes factual organization/interaction questions. It cannot validate our clinical taxonomy, symbols, empty-surface clinical obligations, correction state machine, ownership or idempotency. `grilling` closes remaining human decisions after source lookup; it is not another evidence repository. D-04 was the only new material scope decision and was answered explicitly.

Current pass performs artifact validation/traceability checks, not production UI/API/DB verification. Previously recorded108 synthetic cases remain historical, not evidence for R16–R17. See readiness-review.md for actual checks from this refinement. Runtime tasks remain unchecked; implementation, sync and archive stay deferred.
