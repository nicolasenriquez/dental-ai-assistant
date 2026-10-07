## Context

This design mirrors the declared DentalPin diagnosis/odontogram/clinical-plan interactions. mirror-audit.md is the source-to-target implementation map and numeric visual contract. The prior design introduced UI/lifecycle differences; those are superseded here. D01 full plans, D02 no commercial/agenda integration, D03 direct chart application, D04 editable notes without attachments are explicit human decisions.

## Goals / Non-Goals

Reproduce the tooth popover, compact surface modal, edit modal, illustrated palette, anatomical layered chart, source motion/backgrounds, grouped conditions, editable note rail and clinical plan lifecycle. Preserve the target owner/revision/retry/history infrastructure. Budgets, appointments, payments, attachment storage, clinical AI actions and third-party SVG/code copying remain excluded. Do not claim a full commercial DentalPin clone or pixel-identical licensed art.

## Boundary and Ownership

Highest UI Seam: PatientDetail clinical mode and PatientDiagnosis/PatientOdontogram rendered events. Highest test Seam: rendered patient UI with typed clients, authenticated HTTP and real-Postgres persistence. Page→domain→pattern→primitive→token remains one-way.

Target components stay under components/patients; hooks under hooks; fetch only through lib/api.ts. New backend patient domain services own treatments/plans/dental notes; routes/patient_treatments.py, patient_treatment_plans.py and patient_clinical_notes.py expose them. SQL stays in corresponding db/*_repo.py. Additive Alembic migrations, asyncpg, no ORM or event-bus dependency. General patient notes and conditions retain IDs/APIs. New clinical notes are distinct from condition.note and general patient notes.

## Decisions and adaptation ledger

- D03 makes an active tool + anatomical activation an explicit clinical command. Whole-tooth click applies; occlusal surface click applies that surface; lateral activation of a surface tool opens the selector and Confirmar applies selected surfaces. No extra create editor/Guardar. Save remains for edit modal and note compositor. Pointer hover alone never writes.
- Popover on tooth provides FDI/name, Existing/Planned groups, record symbols and surfaces; click record opens edit modal. Reference has a300ms open/100ms close configuration; keyboard/tap get equivalent access. Compact surface modal uses a160px anatomical view and cropped lateral crown. Implement domain popover using existing native positioning/focus patterns and a domain modal following PatientFormModal, not a new shared Dialog/Popover primitive. Sheet is used only for mobile notes, matching the reference slideover.
- Tool selection is variant-aware; cancel/Escape clears intent. Successful application clears active variant, refreshes records and shows source-like receipt/toast with Deshacer. Undo logically marks the just-created entry erroneous with reason Deshacer registro, retaining audit history; it is not destructive SQL deletion. Existing record editing retains explicit save and incumbent conflict/correction UI. Frozen operation identity survives timeout/retry and blocks double activation while pending. No unrelated navigation or lower-form focus.
- Conditions and therapeutic records stay separate in persistence but share the reference grouped-FDI list, ordered by FDI with individual label/surfaces. No invented Hallazgos/Tratamientos split or Registrados counter on tool cards. Planned records remain visible in tooth context as planned; source-compatible mode data filters control chart presentation. Multi-tooth shared IDs are never counted as independent procedures.
- Clinical plans match reference transitions and auto-completion below. D02 replaces budget-mediated acceptance with an explicit recorded clinical acceptance action; only this is a named approved lifecycle adaptation. No other invented plan transition/automatic correction-to-draft.
- Eight profiles/proportions, anatomical anchors, root/crown/pulp layers, colors/patterns and timing follow mirror-audit.md. Independently authored geometry must meet those visible contracts; preserving four simplified profiles is insufficient. No new120ms cap, no removal of source translateY/glow/pulses, no dashed whole-tooth draft replacing the reference50% preview.

## UI and events

Clinical modes: Diagnóstico, Planificación, Planes, Evoluciones; preserve condition deep links, add authorized plan/treatment/note links and guarded dirty edit/composer navigation. Upper/lower arches and Permanente/Temporal stay inside Registrar condiciones. Palette uses eight mapped categories and distinct Spanish variants. Legend is initially collapsed with Existing/Planned and the five core category groups as source; category variants use base illustrations unless their variant override supplies the source-specific motif in visual-parity-contract.md. Do not add an invented taxonomy or count badge. Source dark/light dental backgrounds are tokenized separately: crown/root/detail/outline/chart surface/selected.

Reference notes rail uses breakpoint960px, width320px and384px at xl. Translate the breakpoint to available patient content width to account for the target shell; retain320/384 rail widths when the source composition fits. Narrow view exposes a floating Notas button and right Sheet, retaining composer state. Do not replace the anatomical chart with a list-only interface on narrow screens: keep the two arches in a scrollable chart region, source tooth scaling and FDI labels, with keyboard-accessible44px hit areas. Horizontal scrolling is local to the chart, not forced page movement.

| Event | Observable result | Clinical command |
|---|---|---|
| Hover/focus tooth | transient highlight; active tool renders source preview | none |
| Click tooth, no tool | contextual record popover | none |
| Click tool card | border/fill/halo; active-tool instruction | none |
| Click whole-tooth with active tool | apply concept and source receipt | create finding or existing/planned procedure |
| Click occlusal surface with surface tool | apply that one surface | create command |
| Click lateral tooth with surface tool | compact surface selector | none until Confirmar |
| Confirmar surfaces | apply selected surfaces; clear tool on success | create command |
| Multi selection and confirmation | reference range/free selection, roles and connectors | one atomic procedure |
| Click saved record | edit modal with notes/surfaces/status actions | none until explicit action |
| Deshacer newly applied record | remove its active visual mark; preserve correction audit | logical reversal |
| Hover note/card or conditions row | linked piece/member highlight | none |
| Guardar note/edit | preserve draft on failure; refresh/reset on success | explicit create/update |

Dot top/right4px, diameter6px is surface support, not saved usage. Selected card is border/background/halo. Pointer and keyboard state must be equivalent; reduced motion disables the reference animations while preserving immediate state feedback. Exact source numbers, layer order and examples live in mirror-audit.md and are required acceptance inputs, not optional visual inspiration.

## Persistence and API contracts

Existing conditions keep codes/IDs/revisions/correction links and conflict behavior. New direct whole-tooth findings call the incumbent create API with surfaces=[] and note=null; legacy fracture surfaces remain supported for read/edit. A surface activation passes the exact selected codes. Internal adapters map reference periapical names to existing target codes.

New tables: patient_dental_treatments, patient_dental_treatment_teeth, patient_dental_treatment_revisions; patient_clinical_plans/items/stages/revisions; patient_dental_clinical_notes and their revisions; patient_clinical_commands. UUID keys, owner_user_id/patient_id composite foreign keys, revision>=1, TIMESTAMPTZ. Do not migrate general notes into dental notes or rewrite conditions.

Treatment: variant_id/catalog_version and Spanish metadata snapshot, clinical_type, category, scope tooth/multi_tooth/global_arch, dentition, optional arch, teeth[{tooth_fdi,role,surfaces}], note<=1000, observed_existing/planned_in_clinic provenance, existing/planned/performed/cancelled/entered_in_error state, actor/time/revision. The visual reference maps performed to existing; target keeps provenance for history without adding visible state selectors in diagnosis.

Server validates real FDI/dentition, no duplicate members/surfaces, supported surfaces M/D/O/V/L, exact catalog scope, one tooth for tooth scope, >=2 members for bridge/splint, same arch where reference selection requires it. Use reference bridge role pillar/pontic with explicit role selection (not invented abutment spelling). Whole-arch records use arch and no FDI. No inferred pediatric-only or veneer-V-only rejection. Surface/pattern rendering metadata is independent from allowable entry surfaces. Catalog63 variants covers mapped reference items plus three documented core fallback tools, not an asserted identical live database.

Plan: title<=200 (optional like source), diagnosis/internal notes<=2000, draft/pending/active/completed/closed/archived, revision, confirmation and adapted clinical acceptance actor/time. Item links one planned treatment, unique treatment_id, sequence, pending/completed/cancelled. Stage is a clinical session: label1..200, note<=1000, sequence, pending/completed/cancelled, completion actor/time. Initial stages snapshot catalog session definitions where supplied; otherwise one default session. Pending sessions may be edited/added through the authorized plan commands while work remains editable; completed sessions stay immutable. No prices or appointment IDs in this clinical-only adaptation.

All new writes have operation_id UUID and expected_revision of owning aggregate; creates have stable client UUID. Persistent receipt keyed owner/operation with canonical payload hash: identical retry replays before current-revision validation, changed payload409. Response: operation_id,resource_id,revision,changed_resources[{kind,id,revision}],committed snapshot. No actor/time/state totals trusted from client. Existing finding create retains its stable UUID/idempotency contract. Lock plan then linked treatments in UUID order; clinical rows/revisions/receipt commit atomically. Correction of linked treatment includes expected_plan_revision but does not silently reopen/complete/cancel the plan: explicit source-equivalent actions govern lifecycle.

| API (incumbent /api base) | Contract |
|---|---|
| GET /patients/treatment-catalog | version,categories,variants,visual/scope metadata |
| GET/POST /patients/{p}/dental-treatments; GET/PATCH /{t}; GET /{t}/revisions; POST /{t}/corrections | existing records, explicit edits/corrections and histories |
| GET/POST /patients/{p}/clinical-plans; GET/PATCH /{plan}; GET /{plan}/revisions | list/create/detail/edit/history |
| POST /{plan}/items; PATCH /{plan}/items/{item}; POST /{plan}/reorder | atomic planned treatment+item+sessions in editable draft/pending/active plans; pending metadata/order |
| POST /{plan}/items/{item}/stages; PATCH /.../{stage}; POST /.../{stage}/complete or /cancel | clinical sessions; reference session semantics |
| POST /{plan}/confirm, /accept, /reopen, /close, /reactivate, /archive | explicit source transitions except approved manual acceptance |
| GET /patients/clinical-note-templates | Spanish category/key/label/field templates |
| GET/POST /patients/{p}/clinical-notes; GET/PATCH /{note}; POST /{note}/delete; GET /{note}/revisions | typed notes, body-only edit, logical delete, history |

Lists return items,total,next_cursor, limit1..100 default20, stable time+UUID ordering and owner/patient/filter-bound cursor. Foreign resources404, invalid payload422, stale revision/illegal transition409 with latest authorized snapshot only. Preserve local edit/composer content for conflict comparison and explicit retry; no new recovery panel on successful click-to-apply. Activity exposes safe resource events and no note body. No external messages/integrations.

## Clinical lifecycle: source-equivalent transitions

Draft→pending Confirmar with >=1 item; pending→active Registrar aceptación is D02 adaptation. Pending→draft Reabrir; draft/pending/active→closed Cerrar with reason rejected_by_patient/expired/cancelled_by_clinic/patient_abandoned/other. Closed→draft Reactivar; completed→archived Archivar; no completed→draft and no invented extra Completar plan action. Reactivation clears current closure metadata but retains the revision/event with its old reason, as the source retains its event.

Completing a session marks it completed. When all item sessions are completed/cancelled and at least one completed, finalize the item and procedure; all-cancelled does not claim performed work. The visible session list is the evidence of partial work, not a new required partial_execution status. Auto-complete active plan only when every item.status is completed; cancelled items remain in total and prevent auto-completion, matching _check_and_complete_plan. All work cancelled offers Cerrar, never fake100%. Preserve performed history and logical deletion on corrections; no implicit missing finding or resolved condition is generated from a procedure.

## Notes end-to-end contract

D04 adds diagnosis/treatment/treatment_plan notes; administrative general notes remain their existing domain and appear as read-only typed entries in the dental feed. Appointment note types stay excluded by D02. Dental note fields: note_type, entity_kind patient/treatment/plan, entity_id, patient/owner, optional tooth_fdi/dentition for diagnosis, body1..4000, actor/time/revision, deleted_at. Enforce matching owner/patient/entity on server; no patient leakage through plan/treatment lookup. Create and soft-delete append revisions/receipts; PATCH changes body only, preserving entity/tooth. No attachment field/upload control until its separate phase.

Diagnosis composer starts open; Spanish templates append structured blank fields separated by an empty line, never overwrite/generate clinical facts. Create is diagnosis+patient owner; tooth optional via Asociar al diente N. Faithful source behavior: tooth hover updates the candidate and re-enables binding when the candidate changes; show the current candidate explicitly and capture it at Save. Existing-note edit freezes its saved linkage and exposes body-only editing, because source PATCH only changes body. General note never becomes a dental diagnosis through hover.

Save trims nonempty body, retains text on error, resets only after committed success and refreshes cards. Cancel closes/reset local composer state. Feed fetches20 and Cargar más; all authorized note types remain recognizable through source badge colors/icons, author, relative date, linked entity,280-character preview and Ver más. Hover/focus cards highlights explicit tooth or treatment members; unbound/plan/general note highlights nothing. Author/owner edit and delete buttons; delete confirmation then logical removal. The same compositor pattern supplies treatment/plan notes in their context, with entity links and source category templates. Mobile Notas Sheet retains state across rail changes. Note/record hover linking is transient; no note is saved by hover.

Attachments were investigated fully in mirror-audit.md: source uploads photos/docs before note creation; unlink/cancel does not delete uploaded file. D04 explicitly defers this separate media/gallery/storage domain. Do not expose nonfunctional attachment buttons or reuse evolution Drive export as clinical file storage.

## Migration and rollback

Next unused additive Alembic revision(s), no destructive condition/general-note backfill. Deploy storage before new endpoints/UI. Roll back frontend/routes while retaining recorded tables/revisions. Clinical files are not provisioned. Document D03 create-save contract change in PRODUCT.md/patient surface brief during release closeout so old docs no longer contradict chart actions. No new dependencies required.

## Verification and risks

Fail-first tests assert no-tool read popover, direct active-tool commit, separate lateral selector/occlusal direct path, successful clear/undo and uncertain retry without duplicate. Source parity fixtures include representative position1..8 and all quadrants, primary molars, missing+replacement, implant/pontic hidden roots, partial pulp, surface dots/outlines, crown patterns, bracket and P. Measure150/200ms transitions and1/1.5s pulses, reduced motion and source hover offsets. Compare equivalent content/viewport to reference captures; previous different-patient screenshots are not pixel-parity proof.

HTTP/real-Postgres prove ownership, exact replay, row/receipt rollback, stage closure concurrency, cancellation denominator and automatic completion. Browser isolated synthetic fixture proves direct finding/observed procedure, plan confirmation/acceptance/execution, notes template/unbound/bound/edit/delete/load-more/reload, dirty edit navigation, keyboard/tap and narrow rail. Scope risk is controlled by fixed inventory and explicit D02/D04 exclusions. Independently authored art may differ at path level; acceptance compares proportions/layers/state feedback rather than asserting copied SVG identity.

## Open Questions

None after D03/D04. Unsupported media/commercial functions are explicitly deferred, not claimed as mirrored.

## Deep Modules and contract cleanup

architecture-cleanup.md is binding for Module ownership, small Interfaces, real dependency injection Seams, consumer inventory and expand→migrate→contract. PatientDetail remains the highest caller/test Seam. The workspace Module hides application/recovery ordering, the presentation Module owns the single visual registry, notes own their composer/feed and plans own aggregate transitions. Backend domain commands accept repository/transaction Adapters instead of constructing hidden infrastructure; asyncpg SQL stays in db. No generic event bus, DI container, second API client or pass-through hook per endpoint.

Slice10 removes superseded create-editor/focus/geometry/palette/rail paths only after Slice8 proves all replacement consumers. Preserve historical aliases, condition/general-note APIs and UUIDs/revisions, retry/conflict/correction and accessibility. No destructive schema contract in this change; rollback retains new records. The exact removal inventory and zero-consumer searches accompany browser replay and full checks. notes-contract.md now fixes candidate-vs-highlight events and source spatial measurements; catalog.md fixes75-entry scope and the explicit global-arch status adaptation.

## Live parity refinements

visual-parity-contract.md fixes eight variant-icon overrides, separate paletteColor/layerColor roles, clinical tokens, source defects to improve and the exact future visual fixture matrix. Do not impose one generic icon on every bridge/splint. The source Notas/Open IA overlap was reproduced; target reserves independent safe-area-aware44px actions and suppresses tooltip while a modal owns focus. These are corrective UI adaptations, not claims of flawless reference behavior.

The source plan view has a Plan/Confirm/In progress stepper, session progress and an item-level Mark as completed action. TreatmentPlanService.complete_item:1017 advances only the next pending session, not all sessions. Target provides that action through the existing stage-complete command: resolve first pending sequence from the authorized snapshot, freeze its stage ID with expected plan revision, and reject stale selection normally. Label Completar siguiente sesión for multiple stages; do not reproduce a new back-compat shim or bulk-complete all work.

Optional clinical note at execution is treatment-owned, body1..4000; it is distinct from stage note<=1000. Add optional clinical_note_body to stage completion and create it in the same transaction/receipt, returning the note in changed_resources. Explicit completion confirmation authorizes the entered text; empty input omits note creation. Source PlanDetailView makes completion then note creation in two requests; atomic target orchestration is a named safety adaptation with identical user steps. Add fail-first rollback/replay proof.

Reference quote issuance locks the displayed active plan/chart. D02 excludes that commercial domain: target lifecycle/immutable executed-session rules remain authoritative and do not invent a quote-lock field. Editable pending/active additions are the clinical-only adaptation already scoped, not evidence that every source active plan is editable. Plan stepper/notes/session hierarchy is retained with Spanish text and without budget/appointment controls.

Native comparison measured441×792 CSS; the requested desktop override did not resize the source tab and was reset. Do not treat unequal-size/different-patient screenshots as pixel parity. Current28 backend proofs and46 component proofs demonstrate incumbent protections only; future therapeutic/plan/typed-note resources and final visual parity still require implementation gates.
