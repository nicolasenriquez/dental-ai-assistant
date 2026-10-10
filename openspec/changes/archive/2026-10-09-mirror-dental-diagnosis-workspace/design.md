## Context

This design mirrors the declared DentalPin diagnosis/odontogram/clinical-plan interactions. Appendix A is the source-to-target implementation map and numeric visual contract. The prior design introduced UI/lifecycle differences; those are superseded here. D01 full plans, D02 no commercial/agenda integration, D03 direct chart application, D04 editable notes without attachments are explicit human decisions.

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
- Eight profiles/proportions, anatomical anchors, root/crown/pulp layers, colors/patterns and timing follow appendix A. Independently authored geometry must meet those visible contracts; preserving four simplified profiles is insufficient. No new120ms cap, no removal of source translateY/glow/pulses, no dashed whole-tooth draft replacing the reference50% preview.

## UI and events

Clinical modes: Diagnóstico, Planificación, Planes, Evoluciones; preserve condition deep links, add authorized plan/treatment/note links and guarded dirty edit/composer navigation. Upper/lower arches and Permanente/Temporal stay inside Registrar condiciones. Palette uses eight mapped categories and distinct Spanish variants. Legend is initially collapsed with Existing/Planned and the five core category groups as source; category variants use base illustrations unless their variant override supplies the source-specific motif in appendix D. Do not add an invented taxonomy or count badge. Source dark/light dental backgrounds are tokenized separately: crown/root/detail/outline/chart surface/selected.

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

Dot top/right4px, diameter6px is surface support, not saved usage. Selected card is border/background/halo. Pointer and keyboard state must be equivalent; reduced motion disables the reference animations while preserving immediate state feedback. Exact source numbers, layer order and examples live in appendix A and are required acceptance inputs, not optional visual inspiration.

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

Attachments were investigated fully in appendix A: source uploads photos/docs before note creation; unlink/cancel does not delete uploaded file. D04 explicitly defers this separate media/gallery/storage domain. Do not expose nonfunctional attachment buttons or reuse evolution Drive export as clinical file storage.

## Migration and rollback

Next unused additive Alembic revision(s), no destructive condition/general-note backfill. Deploy storage before new endpoints/UI. Roll back frontend/routes while retaining recorded tables/revisions. Clinical files are not provisioned. Document D03 create-save contract change in PRODUCT.md/patient surface brief during release closeout so old docs no longer contradict chart actions. No new dependencies required.

## Verification and risks

Fail-first tests assert no-tool read popover, direct active-tool commit, separate lateral selector/occlusal direct path, successful clear/undo and uncertain retry without duplicate. Source parity fixtures include representative position1..8 and all quadrants, primary molars, missing+replacement, implant/pontic hidden roots, partial pulp, surface dots/outlines, crown patterns, bracket and P. Measure150/200ms transitions and1/1.5s pulses, reduced motion and source hover offsets. Compare equivalent content/viewport to reference captures; previous different-patient screenshots are not pixel-parity proof.

HTTP/real-Postgres prove ownership, exact replay, row/receipt rollback, stage closure concurrency, cancellation denominator and automatic completion. Browser isolated synthetic fixture proves direct finding/observed procedure, plan confirmation/acceptance/execution, notes template/unbound/bound/edit/delete/load-more/reload, dirty edit navigation, keyboard/tap and narrow rail. Scope risk is controlled by fixed inventory and explicit D02/D04 exclusions. Independently authored art may differ at path level; acceptance compares proportions/layers/state feedback rather than asserting copied SVG identity.

## Open Questions

None after D03/D04. Unsupported media/commercial functions are explicitly deferred, not claimed as mirrored.

## Deep Modules and contract cleanup

Appendix E is binding for Module ownership, small Interfaces, real dependency injection Seams, consumer inventory and expand→migrate→contract. PatientDetail remains the highest caller/test Seam. The workspace Module hides application/recovery ordering, the presentation Module owns the single visual registry, notes own their composer/feed and plans own aggregate transitions. Backend domain commands accept repository/transaction Adapters instead of constructing hidden infrastructure; asyncpg SQL stays in db. No generic event bus, DI container, second API client or pass-through hook per endpoint.

Slice10 removes superseded create-editor/focus/geometry/palette/rail paths only after Slice8 proves all replacement consumers. Preserve historical aliases, condition/general-note APIs and UUIDs/revisions, retry/conflict/correction and accessibility. No destructive schema contract in this change; rollback retains new records. The exact removal inventory and zero-consumer searches accompany browser replay and full checks. Appendix C fixes candidate-vs-highlight events and source spatial measurements; appendix B fixes75-entry scope and the explicit global-arch status adaptation.

## Live parity refinements

Appendix D fixes eight variant-icon overrides, separate paletteColor/layerColor roles, clinical tokens, source defects to improve and the exact future visual fixture matrix. Do not impose one generic icon on every bridge/splint. The source Notas/Open IA overlap was reproduced; target reserves independent safe-area-aware44px actions and suppresses tooltip while a modal owns focus. These are corrective UI adaptations, not claims of flawless reference behavior.

The source plan view has a Plan/Confirm/In progress stepper, session progress and an item-level Mark as completed action. TreatmentPlanService.complete_item:1017 advances only the next pending session, not all sessions. Target provides that action through the existing stage-complete command: resolve first pending sequence from the authorized snapshot, freeze its stage ID with expected plan revision, and reject stale selection normally. Label Completar siguiente sesión for multiple stages; do not reproduce a new back-compat shim or bulk-complete all work.

Optional clinical note at execution is treatment-owned, body1..4000; it is distinct from stage note<=1000. Add optional clinical_note_body to stage completion and create it in the same transaction/receipt, returning the note in changed_resources. Explicit completion confirmation authorizes the entered text; empty input omits note creation. Source PlanDetailView makes completion then note creation in two requests; atomic target orchestration is a named safety adaptation with identical user steps. Add fail-first rollback/replay proof.

Reference quote issuance locks the displayed active plan/chart. D02 excludes that commercial domain: target lifecycle/immutable executed-session rules remain authoritative and do not invent a quote-lock field. Editable pending/active additions are the clinical-only adaptation already scoped, not evidence that every source active plan is editable. Plan stepper/notes/session hierarchy is retained with Spanish text and without budget/appointment controls.

Native comparison measured441×792 CSS; the requested desktop override did not resize the source tab and was reset. Do not treat unequal-size/different-patient screenshots as pixel parity. Current28 backend proofs and46 component proofs demonstrate incumbent protections only; future therapeutic/plan/typed-note resources and final visual parity still require implementation gates.

## Appendix A — DentalPin mirror audit: source→target map and visual contract

Formerly `mirror-audit.md`, folded here during artifact compaction. Revisión de código: 2026-10-06. Esta revisión corrige la especificación anterior; su validación sintáctica no demostraba fidelidad al producto de referencia. No se modifica código de producto. Las observaciones de navegador previas siguen teniendo sus límites de persistencia y móvil; este pase aporta evidencia de código, no nueva UAT.

### Hallazgos de la OpenSpec anterior

| Hallazgo | Evidencia DentalPin | Corrección requerida |
|---|---|---|
| P1: Sheet para inspección/edición cambia la interacción | ToothQuadrant.vue:121 UPopover; ToothTooltip.vue; TreatmentEditModal.vue usa UModal | Popover en la pieza, modal compacto para superficies y modal para editar registro. Sheet solo para notas en móvil. |
| P1: Guardar obligatorio por cada concepto no es el mirror | OdontogramChart.vue:346/362/517 | D03 aprobado por el usuario: aplicación directa con herramienta activa; selector lateral confirma superficies; clic oclusal aplica esa superficie. |
| P1: conservar cuatro perfiles simplificados impide reproducir la anatomía | ToothSVGPaths.ts:140/230/251 y tablas occlusales | Ocho posiciones permanentes, escalas individuales, remapeo temporal, anclajes anatómicos y simetrías. Dibujos independientes con estas proporciones y estados. |
| P1: cerrar plan requiere un botón adicional inventado | treatment_plan/service.py:1180 _check_and_complete_plan | Última ejecución completa el plan automáticamente cuando todos los ítems están completed. No añadir Completar plan intermedio. |
| P1: reabrir completed→draft no existe | service.py:147 VALID_PLAN_TRANSITIONS;1665 reopen;1817 reactivate | Reabrir es pending→draft; reactivar es closed→draft; completed→archived. No reutilizar estos nombres para otra transición. |
| P2: cancelar un ítem y excluirlo del denominador modifica el cierre | _check_and_complete_plan usa item.status != completed | Mostrar completados/total como referencia; un ítem cancelled impide auto-completar el plan. Cerrar es una acción distinta. |
| P2: tiempos120ms y prohibir desplazamientos no reproduce el pulido | ToothDualView.vue:1110 estilos; TreatmentBar.vue:1189 | Conservar150ms, desplazamientos suaves y pulsos con sus valores; reduced-motion global los desactiva. |
| P2: contadores Registrados en herramientas fueron añadidos | TreatmentBar.vue isSelected y .is-surface::after | Quitar contador inventado. Borde/fondo indica selección; dot6px indica superficies. |
| P2: geometría, patrones y color estaban descritos de forma genérica | ToothDualView.vue:433/469/809/918/1040; odontogramConstants.ts | Especificar capas, orden, clipping, patrones, opacidades, raíces ocultas y P para planificado. |
| P2: rail1064px/300px y notas read-only no son DentalPin | DiagnosisMode.vue:147/224/232 y DiagnosisNotesSidebar.vue | Referencia usa960px, rail320px/384px y compositor; móvil tiene botón flotante y slideover. Alcance de notas se resuelve explícitamente. |
| P2: superficie V obligatoria de carilla y restricción pediátrica fueron inferidas | SurfaceSelectorPopup.vue ofrece M/D/O/V/L; tipo/FDI del backend | No presentar restricciones nuevas como referencia. Conservar validación FDI y metadatos realmente soportados; distinguir representación V de validación clínica. |
| P2: leyenda dinámica completa fue una mejora no un mirror | OdontogramLegend.vue usa cinco TREATMENT_CATEGORIES estáticas | Reproducir leyenda colapsada, estados y cinco grupos básicos; las variantes heredan símbolo. Ocho categorías de paleta no equivalen a ocho grupos de leyenda. |

### Mapa de código → comportamiento → destino

Raíz de referencia: `C:/Users/nenri/OneDrive/Desktop/proyectos/pry-ai-evaluator/references/dentalpin`.

| Referencia relativa a la raíz | Responsabilidad | Destino Dental AI Assistant |
|---|---|---|
| backend/app/modules/odontogram/frontend/components/clinical/DiagnosisMode.vue | registrar condiciones, lista/CTA/rail; hover de pieza actualiza selectedTooth | PatientDiagnosis y nuevo compositor dental |
| .../odontogram/OdontogramChart.vue | herramienta, modos, click-to-apply, superficies, multi-selección, edición, undo | dueño de interacción del odontograma y comandos tipados |
| .../odontogram/ToothQuadrant.vue | popover por pieza, enlace hover, conectores entre miembros contiguos | PatientOdontogram y contexto de pieza |
| .../odontogram/ToothTooltip.vue | nombre anatómico, registros por existing/planned, badge superficies, clic para editar | popover contextual de pieza |
| .../odontogram/SurfaceSelectorPopup.vue | modal compacto, corona recortada, centros de superficie espejados, selección y confirmar | selector de superficies dental |
| .../odontogram/TreatmentEditModal.vue | editar notas/superficies/estado, borrar y realizar | modal de registro; revisión/corrección conserva garantías del target |
| .../odontogram/TreatmentBar.vue | categorías, variantes, tarjetas, selección/dot, modos single/multi | paleta de conceptos |
| .../odontogram/TreatmentIcons.ts y LateralViewIcons.ts | vocabulario de símbolos y variantes | registro de iconografía independiente |
| .../odontogram/ToothSVGPaths.ts | ocho anatomías, anclajes, superficies, escalas, patrones y simetría | toothGeometry.ts ampliado |
| .../odontogram/ToothDualView.vue | composición lateral/oclusal y estados/animación | ToothDrawing.tsx y capas diagnósticas |
| frontend/app/config/odontogramConstants.ts | colores, niveles pulpares, símbolos, tipo clínico, estados | odontogramPresentation.ts y catálogo de metadatos |
| frontend/app/assets/css/main.css:130,251,278 | reduced-motion; fondo, contorno, raíz, detalle, selección light/dark | tokens dentales semánticos en sistema de diseño |
| .../clinical/ConditionsList.vue | FDI ordenados, tratamientos/superficies, hover enlazado | lista agrupada de registros |
| .../clinical/DiagnosisCTA.vue | crear/continuar borrador; no completar diagnóstico | CTA diagnosis→plan |
| backend/app/modules/treatment_plan/service.py | sesiones, confirmación, reapertura/reactivación, autocierre | servicio de plan clínico con adaptación comercial D02 |

Los prefijos `.../odontogram/` y `.../clinical/` de esta tabla corresponden a `backend/app/modules/odontogram/frontend/components/`. Los números señalan el código inspeccionado; las futuras tareas deben revisar símbolos, no depender de líneas inmutables.

### Contrato de pulido visual

1. Anatomía:32 piezas permanentes y20 temporales; ocho perfiles por posición. Escalas laterales por posición1..8:0.65,0.62,0.62,0.62,0.62,0.95,1.0,1.20. Base55px y altura derivada del viewBox. Lateral container110px, corona superior alineada abajo e inferior arriba. Vista lateral/oclusal cambia orden entre arcadas; número fuera del grupo espejado. Q2/Q6 reflejan X; Q4/Q8 Y; Q3/Q7 ambos. No cambiar M/D al espejar solo su dibujo: espejo y etiquetas tienen el mismo sistema de centros.
2. Anatomía ausente: opacidad0.25 para missing/extraction existentes sin restauración sustitutiva; sustitución implant/bridge/crown/pattern evita desvanecimiento. Implant oculta raíces naturales; puente pontic no dibuja raíz. Esto es presentación derivada, no un nuevo diagnóstico persistido.
3. Pulpa: clipping del path anatómico; full, two_thirds y half. Implementación actual usa offsetY0.2/alto0.7 y offsetY0.35/alto0.5 para los parciales. Los comentarios del archivo no coinciden exactamente con los números: usar el cálculo ejecutado como evidencia.
4. Superficies: caries relleno rojo; incipiente punto naranja; pigmentación punto marrón; composite azul; amalgama gris; temporal verde; sellador contorno celeste. Redibujar el borde al final para que el relleno no tape la anatomía. Centros de superficie propios, no círculos genéricos que cubren la corona.
5. Patrones: no erupcionado rayas grises; corona diagonales ámbar; inlay puntos azules; overlay líneas horizontales; miembros protésicos/conectores según rol. Corona sobre implante y puente tienen además relleno lateral sólido. Inlay requiere selector de superficies pero se dibuja con patrón; una sola etiqueta surface era insuficiente.
6. Laterales: fractura, cruz de ausencia/extracción, lesión periapical en ápice, rotación sobre corona, desplazamiento lateral, perno, bracket/tubo/banda/ataches/retenedor; sobreobturación añade círculo más allá del ápice. Anclajes dependen del perfil. No reutilizar un emoji o el mismo punto para todos.
7. Estados: existing opacity1; planned opacity0.7 con P roja fuera de transformaciones SVG. Anillo seleccionado2.5px pulsa1.5s entre1 y0.6. Preview es outline relleno al50%, no hit target, pulsa1s entre0.4 y0.6, glow azul4px. Highlight enlazado usa glow ámbar6→10px,1s. Hover pieza translateY(-1px),150ms ease; card translateY(-2px),150ms y sombra4/12px. Fill/stroke150ms; pulpa fill200ms. Reduced-motion hace transición/animación prácticamente instantáneas y una iteración.
8. Tarjetas: grid auto-fill min104px, gap6px, altura mínima72px, padding7/6px, radio8px, borde2px; icono24px en zona26px; etiquetas multilínea. Estado seleccionado borde azul/fondo/halo3px; dot cyan6px top/right4px para surface. Aplicar tokens semánticos para estos colores, conservando diferencias entre conceptos y estados.

### Notas: flujo end-to-end comprobado en código

Referencias bajo `backend/app/modules/clinical_notes/`:

- `frontend/components/DiagnosisNotesSidebar.vue`: compositor abierto por defecto; create/update/delete; recent20 y loadMore; permisos; asociación y hover.
- `frontend/components/NoteComposer.vue`: texto, plantillas, checkbox de pieza, uploads, Guardar/Cancelar/reset.
- `frontend/components/NoteCard.vue`: badge por tipo, autor, fecha relativa, truncado280, mostrar más, vínculos, miniaturas y acciones.
- `frontend/composables/useClinicalNotes.ts`, `useNoteTypeMeta.ts`: transporte, tipos/colores/categorías de plantilla.
- `note_templates.py`, `frontend/i18n/locales/es.json`: nombres y campos de plantillas.
- `router.py`, `schemas.py`, `service.py`, `models.py`: validación, resolución de propietario/paciente, creación, edición solo texto, soft-delete y feed.
- Documentos/fotos y `media` son recursos separados; las notas enlazan IDs de documentos ya subidos.

```text
Diagnóstico → compositor abierto → escribir/aplicar plantilla
     hover pieza → selectedTooth → checkbox Vincular a pieza N
     desmarcar checkbox → nota sin pieza
     [opcional subir foto/PDF → documento existente → ID adjunto]
     Guardar → diagnosis + patient owner + pieza opcional + texto + IDs
     éxito → reset compositor → refrescar recent → tarjeta visible
     fallo → conservar texto y adjuntos → reintentar
     tarjeta hover/focus → resuelve pieza(s) → highlight en chart
     editar → cuerpo al compositor → PATCH solo cuerpo → refrescar
     eliminar → confirmación → soft-delete → refrescar
```

Detalles que no se deben inventar:

- La barra lateral lista todos los tipos de nota, aunque solo crea diagnosis. treatment/treatment_plan pertenecen a sus entidades y la nota administrativa pertenece al paciente. Appointment queda fuera por D02.
- Hover de diente cambia la pieza candidata de la nota; watcher vuelve a activar checkbox al recibir pieza. El guardado captura la pieza que se muestra al pulsar Guardar. Esto difiere del target anterior, que no tiene notas dentales tipadas.
- Plantilla agrega campos al final del texto con línea en blanco; no reemplaza contenido existente ni genera un diagnóstico automáticamente.
- Editar una nota existente cambia body únicamente. Aunque el compositor muestre otra pieza candidata, el PATCH no religa su asociación ni agrega nuevos adjuntos. Target debe reflejarlo en controles para evitar prometer otro resultado.
- Reset ocurre solo después de create/update exitoso. Cancelar limpia selección local de documentos, pero no elimina documentos ya subidos. Quitar adjunto del borrador tampoco elimina archivo remoto.
- Soft-delete conserva el registro. Solo autor o admin pueden editar/borrar en la referencia; target conserva modelo de dueño autenticado sin inventar roles clínicos.
- Feed recent usa created_at/before y20 elementos; target puede usar cursor compuesto para evitar saltarse empates, declarado como adaptación técnica sin alterar UX.
- Una tarjeta con pieza explícita destaca esa pieza; nota de treatment resuelve miembros mediante lookup; nota sin pieza/plan general no destaca dientes inventados.
- Las subidas son una escritura previa al guardado de nota. Requieren un dominio de archivos clínicos que Dental AI Assistant no tiene; no se puede prometer ese mirror reutilizando automáticamente Drive de evoluciones.

### Adaptaciones que deben quedar nombradas

D02 excluye presupuesto/agenda/cobros: pending→active necesita un registro manual de aceptación clínica, mientras DentalPin lo acopla al presupuesto. Es una adaptación aprobada, no comportamiento nativo de DentalPin. Owner-only/revisiones/idempotencia del target se conservan sin añadir paneles ni pasos a la creación directa aprobada D03. Undo mantiene el resultado visual de DentalPin pero revierte lógicamente con rastro clínico. Ilustraciones se producen de forma independiente con el contrato visual anterior; no se afirma que conservar los dibujos actuales equivalga al mirror.

## Appendix B — Fixed Spanish catalog contract (dental-clinical-v1)

Formerly `catalog.md`, folded here during artifact compaction. Version: dental-clinical-v1. This inventory specifies target metadata, not reference code/assets or a billing catalog. Variant IDs below are stable target keys; reference internal codes provide traceability only. Each row requires a distinct Spanish card and saved label, server validation and independently authored illustration. No unlisted billable/global-mouth item is silently imported.

Categories: Diagnóstico, Restauradora, Cirugía, Endodoncia, Ortodoncia, Preventivo, Periodoncia, Odontopediatría. Existing twelve findings retain their own API and IDs: pulpitis, caries, incipient_caries, pigmentation, fracture, missing, periapical_lt_2mm, periapical_2_4mm, periapical_gt_4mm, rotated, displaced, unerupted. Reference periapical_small/medium/large map to those target codes and never create duplicates.

D03 mirror amendment: direct whole-tooth fracture creation follows the reference; legacy target fracture surfaces remain readable/editable so no historical data is lost. New surface selection uses M/D/O/V/L as the reference selector; no inferred veneer-V-only or pediatric-only API restriction is imposed. V means vestibular; O is displayed as Oclusal/incisal while retaining API code O. `both` means both dentitions are accepted for clinician entry, not a treatment recommendation. Inlay combines a surface selector with pattern rendering; veneer keeps its reference render convention without adding an unsupported validation rule.

| Variant ID | Category | Spanish display label | Clinical type | Scope | Allowed surfaces | Dentition | Visual family |
|---|---|---|---|---|---|---|---|
| PREV-SEAL | Preventivo | Sellador de fosas y fisuras | sealant | tooth | M D O V L | both | surface |
| REST-COMP | Restauradora | Obturación composite | filling_composite | tooth | M D O V L | both | surface |
| REST-AMAL | Restauradora | Obturación amalgama | filling_amalgam | tooth | M D O V L | both | surface |
| REST-TEMP | Restauradora | Obturación temporal | filling_temporary | tooth | M D O V L | both | surface |
| REST-INLAY-COMP | Restauradora | Incrustación de composite | inlay | tooth | M D O V L | both | pattern + surface selection |
| REST-INLAY-CER | Restauradora | Incrustación cerámica | inlay | tooth | M D O V L | both | pattern + surface selection |
| REST-OVER-COMP | Restauradora | Restauración de recubrimiento composite | overlay | tooth | — | both | pattern |
| REST-OVER-CER | Restauradora | Restauración de recubrimiento cerámico | overlay | tooth | — | both | pattern |
| REST-VEN-COMP | Restauradora | Carilla composite | veneer | tooth | M D O V L | both | surface |
| REST-VEN-PORC | Restauradora | Carilla porcelana | veneer | tooth | M D O V L | both | surface |
| REST-VEN-ZIR | Restauradora | Carilla zirconio | veneer | tooth | M D O V L | both | surface |
| REST-CROWN-MC | Restauradora | Corona metal-cerámica | crown | tooth | — | both | pattern |
| REST-CROWN-ZIR | Restauradora | Corona zirconio | crown | tooth | — | both | pattern |
| REST-CROWN-DISI | Restauradora | Corona disilicato de litio | crown | tooth | — | both | pattern |
| REST-CROWN-METAL | Restauradora | Corona metal | crown | tooth | — | both | pattern |
| REST-CROWN-PROV | Restauradora | Corona provisional | crown | tooth | — | both | pattern |
| REST-CROWN-IMPL-MC | Restauradora | Corona sobre implante metal-cerámica | crown_on_implant | tooth | — | both | pattern |
| REST-CROWN-IMPL-ZIR | Restauradora | Corona sobre implante zirconio | crown_on_implant | tooth | — | both | pattern |
| REST-CROWN-IMPL-PROV | Restauradora | Corona provisional sobre implante | provisional_crown_on_implant | tooth | — | both | pattern |
| REST-BRIDGE-MC | Restauradora | Puente metal-cerámica | bridge | multi_tooth | — | both | pattern |
| REST-BRIDGE-ZIR | Restauradora | Puente zirconio | bridge | multi_tooth | — | both | pattern |
| REST-BRIDGE-MARY | Restauradora | Puente Maryland | bridge | multi_tooth | — | both | pattern |
| REST-SPLINT-OCC | Restauradora | Férula de descarga | splint | global_arch | — | both | lateral |
| REST-SPLINT-PERIO | Restauradora | Férula periodontal de contención | splint | multi_tooth | — | both | lateral |
| REST-RECONSTR | Restauradora | Reconstrucción amplia con composite | filling_composite | tooth | M D O V L | both | surface |
| REST-FILL-REPAIR | Restauradora | Reparación de obturación | filling_composite | tooth | M D O V L | both | surface |
| REST-CROWN-RECEMENT | Restauradora | Recementado de corona | crown | tooth | — | both | pattern |
| REST-CROWN-POST-ENDO | Restauradora | Corona sobre diente endodonciado | crown | tooth | — | both | pattern |
| REST-HEAL-ABUT | Restauradora | Pilar de cicatrización | implant | tooth | — | both | lateral |
| REST-DEF-ABUT | Restauradora | Pilar definitivo | implant | tooth | — | both | lateral |
| ENDO-UNI | Endodoncia | Endodoncia unirradicular | root_canal_full | tooth | — | both | pulp |
| ENDO-BI | Endodoncia | Endodoncia birradicular | root_canal_full | tooth | — | both | pulp |
| ENDO-MULTI | Endodoncia | Endodoncia molar | root_canal_full | tooth | — | both | pulp |
| ENDO-RETREAT | Endodoncia | Retratamiento endodóncico | root_canal_full | tooth | — | both | pulp |
| ENDO-POST-FIBER | Endodoncia | Perno de fibra | post | tooth | — | both | lateral |
| ENDO-POST-METAL | Endodoncia | Perno colado | post | tooth | — | both | lateral |
| ENDO-URGENT | Endodoncia | Apertura cameral urgente | root_canal_half | tooth | — | both | pulp |
| ENDO-MED-REFRESH | Endodoncia | Recambio de medicación intraconducto | root_canal_two_thirds | tooth | — | both | pulp |
| ENDO-APICOFORM | Endodoncia | Apicoformación | root_canal_full | tooth | — | both | pulp |
| ENDO-PED | Endodoncia | Endodoncia en pieza temporal | root_canal_full | tooth | — | both | pulp |
| PERIO-SPLINT-RAR | Periodoncia | Férula de contención post-RAR | splint | multi_tooth | — | both | lateral |
| SURG-EXT-SIMPLE | Cirugía | Extracción simple | extraction | tooth | — | both | lateral |
| SURG-EXT-COMPLEX | Cirugía | Extracción compleja | extraction | tooth | — | both | lateral |
| SURG-EXT-3MOLAR | Cirugía | Extracción tercer molar | extraction | tooth | — | both | lateral |
| SURG-EXT-OST | Cirugía | Extracción quirúrgica con ostectomía | extraction | tooth | — | both | lateral |
| SURG-IMP-TI | Cirugía | Implante de titanio | implant | tooth | — | both | lateral |
| SURG-IMP-ZIR | Cirugía | Implante de zirconio | implant | tooth | — | both | lateral |
| SURG-APEC | Cirugía | Apicectomía | apicoectomy | tooth | — | both | lateral |
| SURG-CYST | Cirugía | Exéresis de quiste | apicoectomy | tooth | — | both | lateral |
| SURG-EXT-INCLUIDO | Cirugía | Extracción de pieza incluida | extraction | tooth | — | both | lateral |
| ORTO-BRACK | Ortodoncia | Bracket individual (reposición) | bracket | tooth | — | both | lateral |
| ORTO-RET-FIX | Ortodoncia | Retenedor fijo | retainer | tooth | — | both | lateral |
| ORTO-ATTACH | Ortodoncia | Ataches ortodóncicos | attachment | tooth | — | both | lateral |
| ORTO-BRACK-CEMENT | Ortodoncia | Cementado de bracket | bracket | tooth | — | both | lateral |
| PED-SEAL | Odontopediatría | Sellador pediátrico | sealant | tooth | M D O V L | both | surface |
| PED-PULPOTOMY | Odontopediatría | Pulpotomía | root_canal_half | tooth | — | both | pulp |
| PED-CROWN-SS | Odontopediatría | Corona preformada pediátrica | crown | tooth | — | both | pattern |
| PED-EXT-TEMP | Odontopediatría | Extracción de pieza temporal | extraction | tooth | — | both | lateral |
| PED-FILL-TEMP | Odontopediatría | Obturación en dentición temporal | filling_composite | tooth | M D O V L | both | surface |
| PED-PULPECTOMY | Odontopediatría | Pulpectomía pediátrica | root_canal_full | tooth | — | both | pulp |
| CORE-TUBE | Ortodoncia | Tubo ortodóncico | tube | tooth | — | both | lateral |
| CORE-BAND | Ortodoncia | Banda ortodóncica | band | tooth | — | both | lateral |
| CORE-ENDO-OVERFILL | Endodoncia | Obturación radicular sobreextendida | root_canal_overfill | tooth | — | both | pulp + lateral |

Coverage: 60 mapped seed variants plus three missing core tools; 63 therapeutic variants and twelve preserved findings. Variants sharing clinical type stay distinct. Clinical type pulp/root/surface rendering never substitutes for catalog scope: REST-SPLINT-OCC requires an explicit upper/lower arch; multi-tooth bridge/splint use atomic records and explicit member selection.

The rest of DentalPin's billable seed catalog, including uncharted/global-mouth services and prices, is excluded by D02. No template prices, appointment scheduling, branded treatment package names or implied financial acceptance are introduced. Core aliases filling/root_canal/bridge_pontic are reference legacy inputs, not extra target cards. Bridge member roles are selected inside the procedure, not separate pontic/abutment procedures.

Source: ../references/dentalpin/backend/app/modules/catalog/seed.py TREATMENTS mapped entries and ../references/dentalpin/backend/app/modules/odontogram/constants.py core type definitions, inspected 2026-10-06. Labels translated to plain Spanish where needed; anatomical illustrations are independently implemented.

### Recuento final contrastado con código

Lectura AST de `backend/app/modules/catalog/seed.py`, variable TREATMENTS:129 servicios en total,60 con odontogram_treatment_type y69 sin mapping. Los60 mapeados tienen22 tipos clínicos y scopes54 tooth,5 multi_tooth y1 global_arch. Todas sus internal_code aparecen en esta tabla; ninguna falta. CORE-TUBE, CORE-BAND y CORE-ENDO-OVERFILL completan tipos de las constantes sin variante seed. Resultado target:63 variantes +12 hallazgos =75 entradas, no75 tipos clínicos diferentes.

`useTreatmentCatalog.ts` sustituye las constantes de una categoría cuando tiene catálogo y usa fallback cuando no lo tiene; por ello la unión de75 es un contrato target de cobertura, no una afirmación de75 botones simultáneos en una clínica DentalPin. Los69 servicios sin mapping no se importan como herramientas dentales; incluyen prestaciones globales/comerciales fuera del scope aprobado.

`TreatmentBar.vue:370–449` detecta global_arch antes de la selección regular y abre picker superior/inferior. No forzar REST-SPLINT-OCC por la selección multi-tooth de su tipo splint. La fuente crea globales con status planned; el target permite registrar un aparato ya existente en Diagnóstico y uno futuro en Planificación con provenance adecuado: adaptación funcional explícita al alcance aprobado de observaciones/planes. Crear el planned record y su item en una sola transacción reemplaza las dos peticiones fuente sin añadir pasos de UI.

Each target variant resolves icon_key from the eight source internal-code overrides first, otherwise its clinical_type. Appendix D defines motifs and the full source color pairs. Store/resolve palette and layer color roles separately; icon appearance never authorizes anatomical scope. The72 live source options were captured category by category; the75 target union remains unchanged.

## Appendix C — Notas: contrato de mirror implementable

Formerly `notes-contract.md`, folded here during artifact compaction. D04 incluye texto, plantillas y asociaciones; adjuntos quedan investigados y diferidos. El flujo fuente y sus límites están en appendix A. Este documento fija los campos y superficies del target sin incorporar agenda, galería o cobros.

### Tipos y superficies

| Tipo | Propietario | Creación | Presentación |
|---|---|---|---|
| diagnosis | paciente; pieza opcional | compositor abierto en Diagnóstico | badge Diagnóstico/info/Stethoscope; tarjeta con diente opcional |
| treatment | procedimiento | acción Notas del tratamiento junto al registro | badge Tratamiento/success/Syringe; vínculo al procedimiento y miembros |
| treatment_plan | plan | Nota del plan en su contexto | badge Plan/secondary/ListChecks; vínculo al plan |
| administrative | paciente, recurso general existente | Información actual | lectura combinada en feed dental; badge Administrativa/neutral/UserCog |

Usar los nombres españoles de `clinical_notes/frontend/i18n/locales/es.json`: Notas, Añadir nota, Plantillas, Asociar al diente N, Guardar, Cancelar, Cargar más, Ver más, Ver menos, Abrir contexto. No mostrar tipo/UUID interno al profesional. No copiar el texto fuente que promete recuperar una nota mediante soporte si el target no tiene ese servicio.

### Plantillas habilitadas

Los identificadores y categorías siguen `note_templates.py`; redactar formularios propios en español con estos campos, sin completar hechos clínicos. Las plantillas administrativas vinculadas con llamadas/citas no se agregan como funcionalidad nueva en este cambio.

| ID/categoría | Etiqueta de referencia | Campos que debe poder registrar |
|---|---|---|
| diagnosis_caries / diagnosis | Caries | hallazgo, profundidad, síntomas, vitalidad, tratamiento sugerido |
| diagnosis_periapical / diagnosis | Lesión periapical | pieza, imagen/radiografía, percusión/palpación, diagnóstico |
| general_follow_up / general | Seguimiento general | hallazgos, procedimiento, indicaciones |
| endo_single_visit / endodontics | Endodoncia (sesión única) | diagnóstico, anestesia, conductos, longitud de trabajo, obturación, postoperatorio |
| endo_multi_visit / endodontics | Endodoncia (varias sesiones) | sesión, conductos trabajados, medicación, siguiente revisión |
| perio_scaling / periodontics | Tartrectomía / RAR | cuadrantes, sondaje, sangrado, indicaciones de higiene |
| implant_placement / implantology | Colocación de implante | identificación/dimensiones, torque, estabilidad, injerto, postoperatorio |

Diagnosis solicita categoría diagnosis. Tratamiento/plan usa general por defecto, como useNoteTypeMeta; solo solicita una categoría clínica específica cuando el contexto realmente la envía. No inferir plantilla a partir del último hover de herramienta. Cambiar categoría refresca la lista, conserva body. Aplicar plantilla agrega texto separado por línea vacía; el usuario revisa y Guardar persiste.

### Comandos y estados

Crear: id/operation_id UUID estables, note_type, entity_kind/entity_id autorizados, body1..4000, optional dentition/tooth_fdi. El límite4000 y las revisiones provienen del target de notas existente y son adaptación técnica explícita, no dato atribuido a DentalPin. Persistir actor/time en servidor. Editar: expected_revision, operation_id y body únicamente; rechazar intentos de cambiar pieza/entidad por PATCH. Eliminar: confirmación del profesional, expected_revision y operation_id; soft-delete y revisión conservada. Un comando repetido idéntico devuelve el mismo recibo.

Lectura: feed combinado paciente+sus procedimientos+sus planes+notas generales, orden descendente por creación y UUID,20 por página, cursor atado a dueño/paciente/filtros. Metadata enlazada identifica tipo/etiqueta sin filtrar entidades ajenas. Lectura de nota/revisiones valida dueño incluso si la nota ya fue eliminada; feed activo omite eliminadas. Resolución por general-note ID usa su ruta existente, no tabla dental.

Texto vacío deshabilita Guardar. Guardando deshabilita doble envío y conserva el texto hasta recibo. Error mantiene texto y asociación capturada para reintento idéntico; cambiarlo inicia otro intento deliberado. Conflicto de edición compara última versión con texto local; ninguna sobrescritura silenciosa. Cancelar vuelve al estado inicial/cierra compositor; cambiar paciente no conserva IDs ni vínculos del anterior.

Hover de pieza crea candidato visible, no escritura. En creación, cambiar candidato vuelve a activar la asociación como el watcher fuente. Guardar captura el candidato mostrado. En edición, mostrar el vínculo guardado y no prometer que el hover lo cambiará. Tarjeta con diente destaca una pieza; tarjeta del procedimiento destaca todos sus miembros; nota del plan/sin diente no produce pieza ficticia. Focus y tap proporcionan la misma asociación visible.

### Evidencia de aceptación

Crear una nota sin pieza; crear otra asociada16 a partir de Caries; mover hover a17 antes de Guardar y verificar la asociación mostrada/capturada; desmarcar asociación y guardar sin pieza; provocar timeout y repetir sin duplicado; editar texto de la nota16 mientras se pasa por17 y verificar que sigue16; crear nota de puente y verificar highlight de miembros; comprobar21 registros/Cargar más; Ver más sobre body>280; eliminar/reload y revisar rastro; pasar rail→Sheet sin perder texto. Ningún control de adjuntos se muestra en esta fase.

### Matriz exacta candidato / highlight / asociación

| Gesto antes de Guardar | Candidato del compositor | Highlight transitorio | Asociación que se guarda |
|---|---|---|---|
| Inicio sin pieza | ninguno | ninguno | sin pieza |
| Entrar en16 y salir del chart |16 permanece |16 al entrar; se limpia al salir |16 si checkbox activo |
| Desmarcar16 y volver a la misma pieza |16 sin cambio |16 durante hover |sin pieza; no hay cambio de candidato que reactive el watcher |
| Desmarcar16 y entrar en17 |17; checkbox vuelve a activo |17 |17 salvo nueva desmarcación |
| Hover de fila de condiciones o tarjeta vinculada a18 |conserva el candidato anterior |18 o miembros del procedimiento |conserva candidato/checkbox anterior |
| Hover de nota sin pieza o plan, luego salir |conserva candidato |ninguno |conserva candidato/checkbox anterior |
| Edición de nota guardada en16 |vínculo16 inmutable |puede señalar otra pieza al inspeccionar |PATCH solo body; sigue16 |

Fuentes: `DiagnosisMode.vue:87–125` separa handleToothHover (actualiza selectedTooth solo con número) de handleConditionHover/handleNoteTeethHover (solo hoveredTeeth); `NoteComposer.vue:101–107` reactiva checkbox solo al cambiar el prop; `121–143` captura binding en Submit. Entrar/salir de tarjetas no debe alimentar de vuelta el candidato. No inventar selección nula al pointerleave. Al cambiar paciente reiniciar contexto de pieza y borrador según dirty guard; cambiar dentición limpia un candidato que ya no pertenece a la dentición visible: adaptación explícita para evitar una asociación oculta, no hecho atribuido al source.

### Distribución espacial comprobable

`DiagnosisMode.vue:139–225`: dos columnas align-start con gap-4 (16px); columna principal flex-1/min-width0/space-y-4: card Registrar condiciones → card Condiciones registradas con header colapsable y badge numérico → CTA contextual. El aside está fuera de esos cards, alineado al comienzo del panel; ancho320/384px sin encogerse. `DiagnosisNotesSidebar.vue:177–215`: sidebar con padding12px, gap12px, fondo muted/50 y radius del token; header con icono/título/acción, compositor, feed con overflow vertical y separación8px entre tarjetas. El icono Notas pertenece al header del rail, no al card Registrar condiciones. El feed tiene padding al final del scroll para no recortar controles.

El target debe preservar esa jerarquía, gaps y alineación utilizando tokens propios. No introducir un gran margen izquierdo en cada nota para simular el aside. Usar ancho de contenido del workspace para el umbral960px y comprobar shell abierto/cerrado; rail/Sheet son dos presentaciones del mismo estado, sin doble fetch ni doble compositor activo. Mobile conserva botón fixed end16/bottom16; ajustar su posición solo si hay solapamiento real con controles del shell, dejando evidencia de la adaptación.

### Live evidence and corrective adaptations

Native browser confirmed optional binding16, unchecked binding, existing text + Caries template append and successful local cancellation without Save. Source mobile Sheet contained one visible and one hidden textarea from two sidebar mounts; target requires one Module-owned draft/feed across presentations. Floating Notas was obstructed by Open IA at441px; appendix D requires separate hit areas and dock clearance. Neither side's patients were clinically mutated. New typed-note create/edit/delete persistence remains an implementation gate; current general-note SQL proofs do not substitute for it.

## Appendix D — Contrato visual con evidencia live

Formerly `visual-parity-contract.md`, folded here during artifact compaction. Complementa appendices A y C. Base de browser: artifacts/diagnosis-parity-live-20261006. No son assets para producción ni aceptación del target futuro.

### Inventario observado y decisiones de marca

Native Codex Playwright recorrió8 categorías: Diagnóstico12, Restauradora29, Cirugía9, Endodoncia10, Ortodoncia4, Preventivo1, Periodoncia1 y Odontopediatría6 =72 opciones live. Target75 agrega tube/band/overfill fallback conforme al contrato. Iconos/SVG, colores computados, indicador de superficie y dimensiones de cada opción se conservaron como evidencia JSON. Usar autores propios para los dibujos finales, nunca v-html o SVG fuente importado.

Dental AI mantiene su workbench oscuro, tokens blue/slate, typography y lucide-react para navegación/acciones. No recolorear el Chat, agregar un selector global de tema ni sustituir todas las superficies de la app por las cálidas de DentalPin. Introducir tokens dentales semánticos para anatomía/categorías/marcas/preview. La tabla source light/dark informa esos tokens; dark es el modo activo del target y light referencia de diseño, no una nueva funcionalidad de tema aprobada.

### Iconos clínicos y overrides de variante

Fuente TreatmentIcons.ts:499–518 y TreatmentBar.vue:216,252,872. Resolver override por variant_id antes del icono clínico base. La leyenda de tipos puede mantener el icono base; tarjeta/registro que identifica variante usa su icono resuelto.

| Variante | Icon key fuente | Distinción visible requerida |
|---|---|---|
| REST-BRIDGE-MC | bridge_metal_ceramic | banda de base metal bajo tres unidades conectadas |
| REST-BRIDGE-ZIR | bridge_zirconia | motivo brillante/rombo en el póntico |
| REST-BRIDGE-MARY | bridge_maryland | póntico central con alas de retención, sin coronas pilares ficticias |
| REST-CROWN-IMPL-MC/ZIR | crown_on_implant | corona sobre tornillo de implante |
| REST-CROWN-IMPL-PROV | provisional_crown_on_implant | contorno discontinuo y relleno más ligero |
| REST-SPLINT-OCC | splint_occlusal | arco y puntos de contacto oclusal |
| REST-SPLINT-PERIO | splint_periodontal | piezas unidas con alambre de contención |

Los demás usan el tipo base documentado. 24×24/viewBox24 en una zona26px, trazos fuente habitualmente1.25–1.5px con detalles, silueta dental y marcas específicas. No utilizar círculos/flechas genéricas como reemplazo de toda la semántica. Pulpitis debe indicar canal pulpar; caries manchas; incipiente puntos; periapical tres tamaños en ápice; missing pieza ausente; desplazamiento ejes; unerupted contorno atenuado. El icono de paleta no es el renderer de capas del diente. Probar detalles a escala24 y targets44; el glyph no necesita medir44.

### Colores por función

Tabla extraída del código; alias legacy solo para resolver historia, no botones nuevos. Los iconos de Dental AI actuales medidos heredan rgb(148,163,184) para los12 hallazgos. Sustituir esa uniformidad en el dominio dental, preservando labels legibles. Textos principales siguen text-foreground; secundarios text-muted. Estado nunca depende solo del color.

| Tipo fuente | Light | Dark |
|---|---|---|
| pulpitis | #EF4444 | #F87171 |
| caries | #EF4444 | #F87171 |
| incipient_caries | #F97316 | #FB923C |
| pigmentation | #92400E | #D97706 |
| fracture | #BE185D | #EC4899 |
| missing | #6B7280 | #9CA3AF |
| periapical_small | #EF4444 | #F87171 |
| periapical_medium | #DC2626 | #EF4444 |
| periapical_large | #B91C1C | #DC2626 |
| rotated | #8B5CF6 | #A78BFA |
| displaced | #F59E0B | #FBBF24 |
| unerupted | #9CA3AF | #D1D5DB |
| filling_composite | #3B82F6 | #60A5FA |
| filling_amalgam | #6B7280 | #9CA3AF |
| filling_temporary | #22C55E | #4ADE80 |
| sealant | #06B6D4 | #22D3EE |
| veneer | #EC4899 | #F472B6 |
| inlay | #3B82F6 | #60A5FA |
| overlay | #3B82F6 | #60A5FA |
| crown | #F59E0B | #FBBF24 |
| crown_on_implant | #F59E0B | #FBBF24 |
| provisional_crown_on_implant | #FCD34D | #FDE68A |
| pontic | #F97316 | #FB923C |
| bridge_abutment | #FBBF24 | #FDE68A |
| bridge | #F59E0B | #FBBF24 |
| splint | #3B82F6 | #60A5FA |
| extraction | #DC2626 | #EF4444 |
| implant | #10B981 | #34D399 |
| apicoectomy | #6366F1 | #818CF8 |
| root_canal_full | #8B5CF6 | #A78BFA |
| root_canal_two_thirds | #8B5CF6 | #A78BFA |
| root_canal_half | #8B5CF6 | #A78BFA |
| post | #7C3AED | #A855F7 |
| root_canal_overfill | #3B82F6 | #60A5FA |
| bracket | #6366F1 | #818CF8 |
| tube | #6366F1 | #818CF8 |
| band | #8B5CF6 | #A78BFA |
| attachment | #EC4899 | #F472B6 |
| retainer | #14B8A6 | #2DD4BF |
| filling | #3B82F6 | #60A5FA |
| root_canal | #8B5CF6 | #A78BFA |
| bridge_pontic | #F97316 | #FB923C |
| rotate | #8B5CF6 | #A78BFA |
| displace | #F59E0B | #FBBF24 |

Importante: endodoncia usa violeta en paleta pero relleno pulpar azul en getPulpConfig; no propagar automáticamente paletteColor a layerColor. Las marcas de capa usan la configuración source específica (surface fill/dots/outlines, patrones de crown/inlay/overlay, símbolos laterales). Registry conserva ambos roles. Root/crown/detail/outline/chart/background/selection tokens siguen appendix A y main.css:251–288. Comparar el color computado final por rol; no basta comprobar strings en metadata.

### Estados y motion medidos

Caries seleccionada en source light: background rgb(239,246,255), border rgb(59,130,246), halo rgba(59,130,246,.2) de3px. Dot ::after rgb(6,182,212),6px, top/right4, significa superficies. Card min-height72, transition background/border/box-shadow/transform150ms. No es contador de usos. La tarjeta puede elevarse2px en hover; diente1px, glows y pulses según appendix A. En reduced-motion quitar movimiento decorativo, conservar color/outline y foco. Labels/español no heredan texto microscópico de la fuente si pierde legibilidad en el shell target; registrar adaptación de tipografía sin cambiar significado.

Modal de superficies fuente tiene vista oclusal y lateral, M/D/O/V/L, contador y Confirmar deshabilitado con0 superficies; M/O puede revisarse y Cancelar no registra. Tooltip puede coincidir con modal en source: target cierra/suspende popover al abrir modal, un solo foco atrapado y restauración al caller. Mantener contexto durante la salida para no mostrar Pieza0/unknown en la animación.

### Mejoras fuente que no se deben copiar

Bug source confirmado a441×792 CSS: Notas y Open IA tienen el mismo rect x375.29/y740.14/w35.98/h35.98; z30 frente a40. elementFromPoint devuelve Open IA; click Notas abrió IA, Enter sobre Notas sí abrió el Sheet. CopilotMount.vue:22 y DiagnosisMode.vue:234 comparten fixed bottom-4/end-4; la barra inferior también ocupa esa zona.

Target Notas/Asistente debe tener zonas independientes44×44, separación≥8px y reservar altura real de cualquier dock/barra + safe-area antes de fijar bottom. Hit test del centro y de los bordes debe resolver la acción correcta; scroll, zoom y teclado también. No copiar coordenadas16px ciegamente. No duplicar un compositor oculto y otro visible: el DOM fuente tenía dos textareas al abrir mobile, pero target conserva un propietario de draft y feed.

### Matriz de aceptación futura

1. Fixture sintético equivalente en ambos sistemas:32 permanente/20 primaria, varios cuadrantes, crown+endo+caries, implant/missing, pontic/bridge, planned P, full/half/two-thirds pulp, long labels y notas. No comparar pixel a pixel pacientes distintos.
2. Capturar idle, hover/focus, selected, surface popup M/O, multi roles, saved edit, busy, success, conflict, error/retry y disabled; categoría y label siempre reconocibles. Independently authored geometry se compara por proporciones/capas/anchors, no identidad de path.
3. Tamaños CSS exactos1440×900,1280×800,1024×768,768×1024,430×932,390×844; verificar innerWidth antes. Probar shell/asistente abierto, local scroll, zoom200%, reduced-motion y pointer/keyboard. Texto4.5:1, foco/controles significativos3:1, hit targets44. Colores clínicos no sustituyen texto/shape.
4. Capturas native de esta sesión cubren441×792 en ambos, no desktop exacto: el override solicitado1440×1000 afectó únicamente la pestaña seleccionada y produjo1309×909 CSS por zoom; source permaneció441×792. Overrides restablecidos. No etiquetar esa tentativa como prueba desktop. CLI de fixture propio podrá producir tamaños exactos; no extraer cookies de IAB ni afirmar que CLI es el browser nativo.

La matriz final del target nuevo sigue pendiente de implementación. Los datos medidos permiten diseñarla y evitar pérdidas; no prueban paridad ya entregada.

## Appendix E — Arquitectura y retirada segura del flujo anterior

Formerly `architecture-cleanup.md`, folded here during artifact compaction. Ejecución de Slice10 (2026-10-07): el inventario definitivo, las retiradas y las pruebas antes/después/rollback quedaron en slice10-evidence.md (evidencia podada de esta carpeta; recuperable del historial de git). El diagnóstico estructural siguiente conserva el estado auditado original; no describe el código actual.

Contrato de esta OpenSpec, no implementación realizada. La arquitectura del target sigue AGENTS.md; no incorpora el registro modular de Vue, SQLAlchemy, un bus de eventos ni un contenedor de inyección de DentalPin. Aquí inversión de dependencias significa aceptar dependencias en el Seam que realmente varía, con Adapter de transporte/persistencia y pruebas, sin inventar interfaces para cada función.

### Diagnóstico estructural

`app/frontend/src/components/patients/PatientDiagnosis.tsx` tiene 1637 líneas en el estado auditado. Concentra catálogo, borrador, selección, recuperación, peticiones, paginación y presentación. El tamaño es evidencia de concentración, no una métrica de Depth. `chooseTooth` desplaza foco mediante `firstSurfaceRef`; `pieceButtonRef` y `toothSelectRef` sostienen el recorrido inferior «Cambiar pieza». Mantener ese recorrido junto al mirror produciría dos propietarios de la misma interacción.

El consumidor público es `pages/PatientDetail.tsx` → `PatientDiagnosis`; los tests renderizados cruzan ese mismo Seam. `PatientOdontogram` y `ToothDrawing` consumen `toothGeometry`; `PatientDiagnosis`, `PatientOdontogram` y `PatientConditionHistory` consumen `lib/odontogramPresentation`. Este último también conserva resolución de códigos históricos: no puede borrarse en bloque como supuesto legacy.

En DentalPin, `DiagnosisMode.vue` compone chart/lista/CTA y pasa contexto al sidebar; `OdontogramChart.vue` orquesta selección/aplicación; `ToothDualView.vue` consume geometría/reglas; `DiagnosisNotesSidebar.vue` y `NoteComposer.vue` poseen feed y borrador. Replicar estas responsabilidades no exige replicar su infraestructura de ModuleSlot.

### Modules y pequeñas Interfaces

| Module y ubicación | Interface para caller y tests | Implementation oculta / propietario |
|---|---|---|
| Workspace dental, `hooks/useDentalWorkspace.ts` | patientId, mode, selectedPlanId; viewModel y eventos tipados de intención/inspección/aplicación/edición/recuperación | catálogo normalizado, active variant, dentición, selección anatómica, operación congelada, carga/refresh coordinado y adaptación de condición/procedimiento. UI no conoce orden de peticiones ni arma payloads. |
| Presentación dental, evolucionar `lib/odontogramPresentation.ts` y geometría del dominio | construir modelo de pieza y de tarjeta/leyenda desde registros y catálogo; datos anatómicos puros | un registro de tipos/variantes y reglas de capa, aliases históricos, anchors, colores y estados. Chart/paleta/leyenda no mantienen switches clínicos rivales. `resolveCondition` usado por historial se conserva o migra con su consumidor. |
| Notas clínicas, `hooks/useDentalClinicalNotes.ts` | contexto autorizado patient/entity, candidato de pieza; modelo de compositor/feed y acciones texto/plantilla/asociación/guardar/editar/eliminar/paginar | cuerpo y asociación capturada, body-only edit, draft/retry, cursor y refresh. Una instancia conserva el borrador cuando cambia rail/Sheet; candidatos y highlights son entradas separadas, sin estado global compartido. |
| Plan clínico, `hooks/usePatientClinicalPlan.ts` y dominio backend de planes | snapshot autorizado + comandos explícitos del ciclo y sus recibos | aggregate/revision, orden de items/sesiones, estados permitidos, historial, recuperación y completado automático. No duplicar transiciones en la página y el hook. |
| Dominio backend paciente, servicios para tratamientos/planes/notas | comandos tipados con owner autenticado, operación/revisión y resultado de dominio | validación clínica, identidad, autorizaciones, invariantes y coordinación transaccional; recibe acceso al repositorio/transaction Adapter. El Adapter asyncpg ejecuta SQL en `db/`; las pruebas HTTP observan los mismos resultados y real Postgres demuestra locks/rollback. |

Los nombres propuestos fijan ownership, no obligan a introducir clases. Cada Module presenta una Interface coherente; sus helpers privados pueden dividirse por responsabilidad. No crear un hook por endpoint que solo reenvíe fetch, un comando genérico sin tipos, un barrel de exports de todo el dominio ni un hook universal que incluya notas, planes, dibujos y peticiones. Los typed clients actuales son el Seam de transporte del frontend; no añadir una capa paralela de cliente. Inyectar allí solo lo necesario para usar el Adapter real y el de pruebas. No sustituir pruebas transaccionales por mocks.

PatientDiagnosis queda como composición del modelo dental, chart/paleta/lista/CTA y notas. Componentes renderizan y emiten eventos; no hacen fetch, SQL, retries ni resuelven transiciones. El catálogo y las reglas visuales comparten identidad de variante pero mantienen separado permiso de entrada de convención gráfica. La validación definitiva sigue en servidor; un icono no define superficies válidas.

### Expand → migrate → contract

1. Expand: storage aditivo y Modules nuevos detrás de las Interfaces existentes. Conservar condiciones/notas generales, UUIDs, revisiones, correcciones y deep links. No transformar datos históricos para que parezcan nuevos registros.
2. Migrate: Slice1 cambia inspección/aplicación; Slice2/3 añade variantes y scopes; Slice4–6 planes; Slice7 presentación; Slice9 notas; Slice8 integra el caller público. Cada slice migra sus consumidores y pasa sus pruebas antes del siguiente checkpoint.
3. Contract: Slice10 depende del journey integrado. Auditar consumidores actuales y eliminar solo lo sustituido. Durante migración puede existir código anterior; el estado final entrega una sola ruta activa por interacción. Cero referencias activas se demuestra con búsqueda de imports/handlers/selectores y replay del recorrido público, no con un flag permanentemente apagado.

### Inventario de retirada y preservación

| Área | Retirar cuando el reemplazo esté probado | Preservar / migrar con evidencia |
|---|---|---|
| PatientDiagnosis | lower create editor, «Cambiar pieza», foco forzado, refs/handlers/styles exclusivos, requisito Guardar para crear desde chart, estado duplicado de selección | modal de edición, dirty guard, retry exacto, conflicto, corrección lógica, historial y links a condiciones, adaptados a su nuevo Module |
| Dibujo y chart | perfiles genéricos de cuatro familias y máscaras/preview obsoletos; ramas responsivas sustituidas y helpers sin consumidores | numeración FDI/dentición, texto accesible, callbacks y tests externos útiles, perfiles nuevos, listados clínicos que siguen vigentes |
| Catálogo/presentación | listas de herramientas y switches de marca paralelos una vez todos consuman el registro único | aliases/códigos/labels históricos y la resolución de condiciones desconocidas; el registro nuevo no elimina el historial |
| Notas | rail duplicado de lectura general, estados/feed antiguos exclusivos de esa proyección | PatientNotes y API general en Información; notas generales permanecen distintas y aparecen tipadas en el feed combinado; no backfill destructivo |
| Pruebas/docs/config | assertions y selectores que exigían desplazamiento al editor; ramas temporales/imports/flags sin uso del área sustituida | sustituir por pruebas de los nuevos comportamientos; mantener suites de ownership, history, recovery y contrato público. Feature map y docs se actualizan en fase4 |
| Persistencia | ninguna tabla/columna histórica en este cambio | esquema de condiciones/notas generales y tablas nuevas; rollback de aplicación conserva registros. Una eventual retirada de esquema requeriría otro cambio y evidencia de cero uso |

Antes de borrar: registrar archivo/símbolo, caller, reemplazo y prueba que lo cubre. Buscar consumidores en `src`, tests frontend/backend, rutas y docs; revisar referencias dinámicas/selectores en el browser. La lista auditada es inicial: el inventario definitivo se actualiza contra el código al implementar, respetando cambios concurrentes. No borrar cambios ajenos, adapters necesarios, historias ni recursos fuera de diagnóstico/odontograma/notas/planes.

### Gate de salida

Pruebas renderizadas por PatientDetail/PatientDiagnosis, HTTP y browser demuestran el mismo comportamiento antes/después de retirar código. Confirmar con reload IDs/revisiones de registros previos, notas generales y borradores/planes nuevos; comprobar no-tool sin escritura, una aplicación por gesto, edición/conflicto/retry, hover de notas y local scroll. Registrar búsquedas de cero consumidores del recorrido retirado y lista exacta de eliminaciones. Full checks de AGENTS.md y rollback compatible después del contract. No declarar cleanup por una reducción de líneas ni usar down destructivo para recuperar producción.

### Refinamientos desde browser live

Appendix D añade icon-key overrides por variante y palette/layer roles al registro único. ConditionSymbol solo se sustituye tras migrar sus consumidores de herramientas, chart, leyenda e historial; preservar badges de resolved/error en su reemplazo. No importar complete_item back-compat shim del source: la acción de próxima sesión usa el mismo comando de stage completion. El draft de notas no vive en dos mounts; Notas/Asistente tienen hit areas independientes. Estos criterios entran en los tests públicos y en el inventario de Slice10.

## Appendix F — Aggregate implementation contract and traceability

Formerly the change-level `spec.md` index, folded here during artifact compaction. Profile: runtime-change. Approved scope: D01 full plans, D02 clinical lifecycle without budgets, agenda or payments; D03 direct reference application; D04 editable clinical notes without media. This aggregate indexes the normative deltas; it does not replace or duplicate them.

| Capability | Requirement IDs | Normative source |
|---|---|---|
| Diagnosis workspace | W1–W10 | specs/dental-diagnosis-workspace/spec.md |
| Therapeutic records | T1–T5 | specs/patient-dental-treatments/spec.md |
| Clinical plans | P1–P6 | specs/patient-clinical-treatment-plans/spec.md |
| Dental notes | N1–N5 | specs/patient-dental-clinical-notes/spec.md |
| Modified existing workspace | Manual diagnosis, backed activity, chart composition | specs/clinical-workspace-discovery/spec.md |

Appendix B fixes63 therapeutic variants plus12 incumbent findings. design.md fixes ownership, field limits, routes, status transitions, transaction/retry semantics, UI events, visual contract, migration/rollback and test seams. The preparation investigation recorded comparator facts, evidence limitations and human decisions (pruned; recoverable from git history). Appendix A fixes source-backed anatomy, motion, notes events and permitted adaptations; appendix C fixes note templates/types/fields and acceptance fixtures; tasks.md is the only execution graph.

Existing condition APIs, IDs, revisions, owner scope, expectedRevision conflict handling, correction links and revision, retry and logical correction protections remain binding; D03 supersedes mandatory create Guardar in chart interactions. Product code is not changed by preparing this specification. No third-party assets, commercial integration, AI-generated clinical action or clinical attachment storage is included.

Appendix E fixes deep Module Interfaces, dependency injection Seams, bounded removal inventory and non-destructive contract gates. Appendix C separates tooth candidate from highlight and fixes source layout measurements. W8/W9 and N5 make these behavior/cleanup obligations normative.

W10 and appendix D add variant icons, semantic clinical color roles and unobstructed action/modal access. P3 includes next-pending-session item shortcut and atomic optional treatment note on execution. The live-parity audit recorded current native observations and real incumbent test boundaries, not future mirror acceptance (pruned; recoverable from git history).
