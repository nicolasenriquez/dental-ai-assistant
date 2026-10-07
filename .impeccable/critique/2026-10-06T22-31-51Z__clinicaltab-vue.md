---
score: 21
score_max: 40
p0_count: 0
p1_count: 4
p2_count: 1
method: single-context
reason: sub-agents declined by user
mode: Operate
na_heuristics: none
timestamp: 2026-10-06T22-31-51Z
slug: clinicaltab-vue
---
⚠️ DEGRADED: single-context (sub-agents declined by user)

# DentalPin Clinical audit and Dental AI Assistant mirror plan

Date: 2026-10-06. Status: planning only; no product implementation performed.

## Decision and scope

Mirror the annotated patient header and Clinical/Diagnosis composition using the existing React patient workspace. Preserve explicit clinical Save, server-authoritative catalog, ownership, privacy disclosures, immutable correction history and the current design tokens. Improve the existing odontogram anatomy instead of embedding Nuxt or replacing the workflow.

**Ready to implement:** header composition, responsive diagnosis workspace, independently authored anatomical geometry, diagnostic palette/legend, condition grouping, motion and an adjacent rail displaying existing patient notes with guarded navigation to their editor. The twelve supported diagnostic concepts remain the supported write vocabulary.

**Separate domain work required for full functional parity:** seven therapeutic categories, planned/performed treatment records, treatment plans, appointments/recalls, typed clinical notes, templates, attachments and historical chart reconstruction. These are defined as dependency packages below; they cannot be delivered honestly by adding palette buttons to today's condition API. Clinical taxonomy and record semantics require approval before this domain package is implementation-ready. This document does not create a new OpenSpec change or authorize implementation.

Reference: `http://localhost:3000/patients/d6eebc99-9c0b-4ef8-bb6d-6bb9bd380a46`; audited in the existing native Codex browser at 993×792. The latest request to use that browser superseded the earlier CLI browser request. Source root: `C:/Users/nenri/OneDrive/Desktop/proyectos/pry-ai-evaluator/references/dentalpin`.

Target: `C:/Users/nenri/OneDrive/Desktop/proyectos/pry-ai-evaluator/ai-tutor`; source and current authenticated localhost:8000 UI inspected. Existing implementation/UAT changes from earlier work are outside this audit's modifications.

## Evidence and limits

Evidence directory: `.playwright-cli/verification/dentalpin-mirror-20261006/` (historical directory name; this audit used native browser automation).

| Flow | Live evidence | Persistence coverage |
|---|---|---|
| Header | Identity, age, contact controls, Edit and Actions menu; Appointment/Collect/Note/Archive entries | No edit/archive/contact action submitted |
| Dentition | Permanent has 32 FDI positions; Primary has 20 | View state only |
| Categories | All eight category buttons exercised and their palettes read | No tool applied to a tooth |
| Surface workflow | Caries → lateral area of tooth 16 → select M and O → cancel popup → cancel tool | No Confirm; source traced to POST |
| Legend | Expanded status and five category groups, then collapsed | Read only |
| Conditions | Existing groups 17,27,36,43,46; tooth36 has Crown and Full root canal | Read only; badge8 differs from six visible tooth entries, not diagnosed as a count bug |
| Notes | Caries template populates fields; Save enabled; Cancel clears/closes composer | No Save or attachment upload |
| History | Timeline, view-only chart, changes, treatment/change counts | No time travel mutation |
| Plans | Existing active plan with progress and linked accepted quote | No create/schedule action |
| Target | Existing patient header, diagnosis chart, quadrant controls, draft editor, catalog, condition filter and legend | Read only in this audit |

Reference write endpoints were traced in source. Successful saves, reload durability, retries, conflicts, denied ownership, upload cleanup and delete/undo are **not verified UAT results** of this audit. Mobile breakpoints and 200% zoom were read in source, not exercised live. Visual measures below are for the observed viewport, not universal layout guarantees.

## Design critique

The anatomy, FDI arrangement and linked clinical context are specific to dentistry. The surrounding shell follows conventional patient-management navigation. The strongest opportunity is to retain the anatomical clarity while making the selected tooth and save boundary unmistakable.

### Heuristic score

Operate mode; 0–4, higher is better. All ten apply. Source-only recovery paths constrain the score's confidence.

| Heuristic | Score | Evidence |
|---|---:|---|
| System status | 2 | Active tool is visible; tool click/direct apply and note Save use different commit boundaries |
| Real-world match | 3 | FDI, upper/lower arches and lateral/occlusal anatomy are coherent |
| User control | 2 | Draft cancel exists; direct apply and delete-backed undo require care |
| Consistency | 2 | Eight live catalog categories versus five static legend categories; internal keys in cards |
| Error prevention | 1 | Hover changes note tooth binding; direct click can write |
| Recognition | 3 | Palette symbols, legend, grouped conditions and cards support recognition |
| Flexibility/efficiency | 2 | Shortcuts exist in source, but tooth wrappers are not keyboard focusable |
| Minimalist design | 2 | Useful two-column composition competes with several navigation/tool layers |
| Error recovery | 2 | Error toast/source undo exist; failure/retry persistence not exercised |
| Help/documentation | 2 | Global Help and legend; weak explanation at the save boundary |
| **Total** | **21/40** | **Acceptable; significant workflow improvements needed** |

Strengths: (1) dual anatomical views distinguish crown/root context from occlusal surfaces; (2) conditions grouped by FDI connect the chart to recorded findings; (3) templates and adjacent cards reduce repeated typing and context switching.

Cognitive load: six patient tabs → four clinical modes → eight categories → twelve diagnostic tools, with a substantially larger restorative palette. These are several decision points above four visible options. Keep the dental spatial model; progressively disclose tools and one active editor instead of adding more parallel decision areas.

Emotional journey: anatomical familiarity builds confidence, small/clipped targets and uncertain commit timing create hesitation, and saved condition/note summaries restore confidence. A precise save receipt should be the reassuring endpoint.

Personas: Alex (power user) needs keyboard tooth activation and rapid repeated entry without hidden writes. Sam (keyboard/screen reader) cannot operate tooth DIV/SVG wrappers with no role/tabindex and cannot rely on hover-only relationships. Jordan (first use) can mistake tool selection for a harmless draft and existing therapeutic procedures for diagnosed conditions.

Minor observations: contact hit areas are small; legend lacks aria-expanded in source; nested complementary landmarks add noise; contextual card labels sometimes expose root_canal_full/filling_composite. Global reduced-motion support exists in the reference and must not be incorrectly reported as absent.

### Priority findings and localized remedies

| ID | Priority / root cause and location | Proposed target behavior | Why this approach / blast radius |
|---|---|---|---|
| F1 | P1. OdontogramChart.vue:346–380 calls applyTreatment directly from surface/tooth clicks; note composer instead uses Save | All chart actions prepare the existing PatientDiagnosis draft; only Guardar writes; receipt identifies FDI, concept, surfaces and revision | Retains the target's current safety boundary. Faster click-to-apply would require a different clinical contract; no API/schema change in visual package |
| F2 | P1. DiagnosisMode.vue:87–89 assigns selectedTooth inside handleToothHover; NoteComposer watches toothNumber and enables binding | Separate transient highlight from explicit selection; bind condition notes to the draft's fixed FDI; general patient notes remain unbound | A visual highlight is never authority for a clinical association. Local diagnosis props/state; regression test pointer movement during an unsaved draft |
| F3 | P1. DiagnosisMode uses a320px rail from viewport960px; OdontogramChart uses zoom down to0.5 and overflow:hidden. Observed chart490.8px clips18/28/48/38. PatientStickyHeader uses top0 beneath global top0/z40 | Decide columns using actual available workspace width; preserve narrow quadrant controls, 44px activation targets and uncut overview. Use the real shell scroll owner/sticky offset | Avoids merely lowering zoom or hiding molars. Local PatientDetail/PatientDiagnosis layout; shared shell changes only if measured necessary |
| F4 | P1. ToothDualView rootDIV is click-only, no role/tabindex; ConditionsList hover is visual | Preserve existing target semantic tooth controls, add equivalent focus/keyboard cross-highlights, visible focus and selected-state announcement | Reuses target's accessible path; no new chart library or separate keyboard state model |
| F5 | P2. TreatmentBar combines catalog categories, but OdontogramLegend uses static five-category constants; note cards interpolate some raw clinical keys | Palette, legend, symbols and Spanish card labels derive from the same typed catalog/presentation functions. Show only supported operations | Fixes source-of-truth drift. Local odontogramPresentation and presentation components; adding seven categories requires independent domain work |

Suggested design commands, if implementation is later authorized: `$impeccable harden` for F1/F2/F4, `$impeccable adapt` for F3, `$impeccable clarify` for F5, then `$impeccable polish` for alignment and motion. These commands were not executed.

## Comment 1 — header decomposition and mirror

Reference PatientStickyHeader.vue owns only presentation and emits back/edit/archive/newAppointment/newNote/collect. It renders avatar or initials, full name, active/archived indicator, derived age, contact links, edit action, action dropdown and an extension slot for alerts. This keeps patient data and action implementations outside the header.

Target PatientDetail.tsx already supplies initials, name, age/birthdate, privacy-controlled contact/RUT disclosures, edit, Nueva evolución and Asistente. Mirror the hierarchy and spacing at the existing header seam; do not reproduce raw national_id, assume an active/archived field, or add unsupported Appointment/Collect/Archive menu entries.

Implementation decisions: full name may wrap (no mandatory truncation); age is derived from birthdate, absent age stays absent; RUT remains masked/disclosed by PatientHeaderDisclosure; contact actions keep existing disclosure policy; primary Nueva evolución stays visible; group only existing secondary actions using incumbent controls. Use semantic tokens and target themes. Extract a PatientWorkspaceHeader component only if action/layout complexity warrants it, keeping page-owned callbacks and data. No new library or global header redesign.

Accept: long name, missing birthdate/contact, masked RUT, keyboard order, edit return context, scroll to lower chart, and narrow screens all remain usable. Sticky identity must never conceal shell navigation or own a competing vertical scrollbar.

## Comment 2 — actual component/data structure

```text
Reference PatientDetail
  PatientStickyHeader
  Patient tabs → ClinicalTab (URL clinicalMode)
    ClinicalModeToggle: Diagnosis / Plans / Appointments / History
    DiagnosisModeContainer (optional plugin subtabs)
      DiagnosisMode
        Register conditions card
          OdontogramChart
            Permanent / Primary
            Upper + lower arches
              ToothDualView → ToothSVGPaths + clinical overlays
            Whole-mouth strip
            TreatmentBar → catalog categories/tools
            SurfaceSelectorPopup (when whole tooth has surface-capable tool)
            OdontogramLegend
        ConditionsList → grouped treatment memberships by FDI
        DiagnosisCTA → create/continue plan
        ModuleSlot → DiagnosisNotesSidebar
          NoteComposer → templates + tooth binding + attachment document IDs
          NoteCard[] → author/time/type/context/body
```

Reference Nuxt4/Vue/NuxtUI/Tailwind4 and plugin ModuleSlots are not target dependencies. Target uses React18/Vite/Tailwind3/Radix/typed fetch clients. Reproduce the product behavior at existing seams, not the reference extension framework.

### Catalog and status differences

| Reference category | Live examples | Current target write support |
|---|---|---|
| Diagnostic | Pulpitis, Caries, Fracture, Missing, periapical bands, Rotated, Displaced, Unerupted | Twelve codes in patients/conditions.py; four allow M/D/O/V/L surfaces |
| Restorative | Fillings, inlays, overlays, veneers, crowns, implant crowns, bridges, splints, abutments | No therapeutic catalog/record contract |
| Surgery | Simple/complex/wisdom extraction, titanium/zirconia implant, apicoectomy, cyst/impacted tooth | No therapeutic catalog/record contract |
| Endodontics | Single/two-root/molar, retreatment, posts, chamber opening, medication, apexification, primary tooth | No therapeutic catalog/record contract |
| Orthodontics | Bracket replacement/bonding, retainer, Invisalign attachments | No therapeutic catalog/record contract |
| Preventive | Pit and fissure sealant | No therapeutic catalog/record contract |
| Periodontics | Post-SRP retention splint | No therapeutic catalog/record contract |
| Pediatric | Sealant, pulpotomy, steel crown, primary extraction/filling, pulpectomy | No therapeutic catalog/record contract |

Reference useTreatments maps frontend existing ↔ backend performed, otherwise planned. The diagnosis view filters existing and excludes migration_import; it includes crowns/fillings/root canals, not solely diagnoses. Target condition statuses active/resolved/entered_in_error mean something different. Never equate resolved with performed, or entered_in_error with deletion. Keep condition correction operations and operation IDs intact.

Reference create route: POST /api/v1/odontogram/patients/{patientId}/treatments; shape includes tooth_numbers, scope, status, optional catalog_item_id/clinical_type and surfaces. Single-surface click writes directly; lateral click for a surface tool opens the popup, which confirms only with nonempty surfaces. Target allows empty surfaces for compatible conditions; a visual mirror must not silently tighten that backend contract.

Reference note route: /api/v1/clinical_notes/notes; patient recent feed and templates are separate endpoints. Templates append structured text. Attachments upload documents before note Save. Type badges use diagnosis/info, treatment/success, administrative/neutral and plan/secondary. Target PatientNote has body, author, timestamps and revision only; condition notes belong to conditions and cap at1000 characters. General notes must not be relabeled as treatment notes or silently given tooth bindings.

### Anatomy, color and motion

Reference ToothSVGPaths provides morphology and display geometry; ToothDualView combines lateral roots/crown and occlusal surfaces, quadrant transforms, clips, hatching, pulp and therapeutic overlays. Crisp outline layers are redrawn above fills. Status style and clinical color are separate concerns; planned procedures use P while anatomy still indicates the concept.

Target toothGeometry.ts, ToothDrawing.tsx and ConditionSymbol.tsx already provide this seam. Independently refine family profiles (incisor/canine/premolar/molar; deciduous distinction), root separation and crown proportions. Derive mirror transforms from FDI, not screen position. Keep M/D adjacency toward/away from the midline and V/L orientation explicit for all eight quadrants. Do not imply O is clinically valid on every family simply because the fixed server vocabulary admits it; preserve current vocabulary and flag any new clinical validation as separate contract work.

Use existing semantic clinical color tokens with outline/hatch/symbol equivalents, so state is not color-only. Initial palette remains the twelve diagnosis concepts. Hover/focus transitions150ms and opacity/color updates150–200ms; new saved row entry160ms once. No indefinite pulse or geometry motion that moves the pointer target. Respect prefers-reduced-motion with static highlights. Never animate persistence success before the server confirms it.

Reference root LICENSE is Business Source License1.1; frontend/LICENSE names MIT Nuxt UI Templates. Do not infer that the template license covers DentalPin anatomy/source. Plan independently authored target geometry and presentation; verbatim reuse requires confirming applicable rights. This is a source provenance gate, not a legal opinion about a specific deployment.

## Target composition and interaction contract

```text
PatientDetail (existing routing, patient privacy and actions)
  Header identity + existing actions
  Existing patient tabs
  Clínica → Diagnóstico / Evoluciones (existing URL contract)
    PatientDiagnosis (one owner of condition draft/guard/save)
      Main column
        Anatomy overview + Permanente/Temporal
        Accessible tooth/quadrant controls
        Server-backed category/tools + shared legend
        Existing draft editor (condition, surfaces, condition note, Guardar)
        Conditions grouped by FDI + correction/history/filter/pagination
      Context rail
        Explicit selected FDI and relevant saved condition note
        Recent general patient notes (read-only cards + load more/retry)
        “Nueva nota general” → guarded existing Información editor
```

Column criterion: enable rail only when content width supports main≥720px + gap24px + rail320px (≥1064px available content). At the observed993px viewport, use a stacked or controlled sheet presentation instead of forcing a490px anatomy column. This is an available-width rule, not a copied viewport breakpoint. If the assistant pane is open, remeasure/reflow; do not add a third fixed-width column. Narrow chart keeps existing per-quadrant44px controls and a complete non-clipped overview.

Main flow: choose tooth or concept → update local draft → choose valid surfaces/condition note → review patient/FDI/dentition → Guardar → await server result → display saved row and receipt → highlight recorded tooth. Hover/focus can emphasize a tooth but never replace draft identity. Switching dentition, patient, tab or route while dirty invokes the existing keep/discard guard. Correcting a condition stays an atomic correction with reason and immutable original.

Data flow: API → typed lib/api.ts → PatientDiagnosis state → presentation helpers → chart/list/legend. A narrow PatientClinicalNotesRail may use a feature hook for paginated getPatientNotes; it must not inline fetch or mount the entire PatientNotes editor. Keep condition editor ownership local. The global useTransitionGuard currently stores only one blocker; mounting two independent editable components would overwrite one registration. PhaseA avoids that regression. Dual inline editors require an explicitly tested coordination design before enabling them.

## Implementation packages and order

No code below has been applied. Each package is reviewable independently; no new dependencies.

| Package | Dependencies | Exact seams / actions | Completion gate |
|---|---|---|---|
| A1 Header/layout | Existing PRODUCT/DESIGN/UX and patient surface brief | PatientDetail.tsx, existing header disclosures; use existing Button/sheet controls; available-width rail layout in PatientDiagnosis | Header/contact/privacy/navigation tests; screenshot at993px and wide/narrow widths; scroll collision absent |
| A2 Anatomy | A1 width rules | components/patients/toothGeometry.ts, ToothDrawing.tsx, ConditionSymbol.tsx, PatientOdontogram.tsx |32 permanent/20 primary FDI; quadrant transforms/surface mapping tests; no clipping; keyboard44px controls |
| A3 Palette/legend/list | A2; existing catalog and records | lib/odontogramPresentation.ts + PatientDiagnosis; share catalog labels/symbols/applicability; retain current save/correction/filter/paging handlers | Unknown code fallback; supported-only tools; saved row/legend agreement; no mouse hover binding or implicit write |
| A4 Context notes | A1 + A3 explicit FDI | New local PatientClinicalNotesRail only if justified; getPatientNotes via typed client/hook; read-only general cards, existing condition note/editor; guarded link to existing PatientNotes | Loading/empty/error/retry/more; correct patient reset; no duplicate blocker; note revision/count metadata preserved |
| A5 Motion/polish | A1–A4 | Local semantic tokens/utilities, focus/hover/one-time save feedback; document durable decisions in patient surface brief, not unrelated global redesign | Reduced motion and dark/light readability; no infinite attention animation; geometry remains stable |
| A6 Verification | A1–A5 | Existing frontend tests plus native browser UAT on retained synthetic target patient | Matrix below passes; record exact build and evidence; no claim of full treatment parity |

Ready-package review preview (structural, **not an executable patch**):

```diff
--- a/app/frontend/src/components/patients/PatientDiagnosis.tsx
+++ b/app/frontend/src/components/patients/PatientDiagnosis.tsx
@@ composition only; retain current draft/save/correction state owner @@
- Chart, tools, editor and saved conditions share one vertical sequence.
+ Available-width workspace contains a main diagnostic sequence and context rail.
+ Chart/list/legend share server-backed presentation metadata.
+ Rail displays existing general notes and an explicit selected-tooth context.
+ General note editing navigates through the existing dirty-state guard.
@@ persistence boundary @@
  Selecting a tooth/tool changes only the draft.
  Guardar remains the only create boundary.
  Atomic correction and revision conflict handlers remain authoritative.
```

This preview describes composition, not literal current lines or a code diff. A real patch must be generated against the current tree when implementation is authorized.

### Full-parity dependency packages

| Package | Definition needed before implementation | Acceptance / dependencies |
|---|---|---|
| B1 Therapeutic domain | Clinician-approved independent catalog: stable code, Spanish label, category, scope(tooth/multiple/arch/mouth), allowed dentitions/surfaces, applicable tooth families, symbol key; explicit treatment state machine distinct from condition states | Catalog codes/clinical meaning reviewed; empty/unknown handling agreed; no frontend-only category entries. A3 provides the presentation seam |
| B2 Treatment persistence | New owner-scoped resource, repository-only SQL, Alembic migration, typed FastAPI/client DTOs; idempotent creates, expected_revision updates and auditable reversals/corrections; membership constraints and tenant/patient validation | Single/multi tooth atomicity, duplicate retry, concurrent update409, owner denial, rollback and immutable audit tests. Existing conditions not converted into performed procedures |
| B3 Typed clinical notes | Decide authoritative binding to patient + optional condition/treatment/FDI+dentition; allowed types and immutable actor/time/revision; legacy PatientNote remains general. Independent clinical templates need approved wording/provenance | Typed API/schema/versioning; binding ownership validation; retries409; templates remain editable drafts. Dual-editor coordination replaces one-blocker assumption only with app-wide guard regression coverage |
| B4 Attachments | Authorized document resource, MIME/size checks, storage boundary, upload ownership, link validation, orphan cleanup for canceled notes, retry dedupe; existing Drive export remains independent | Failed/canceled uploads cannot leak orphan links/documents; download authorization; no tokens/raw RUT exposure. Requires security/deployment references |
| B5 Plans/history/appointments | Separate resource/state/authorization contracts, approved scope and routes; historical chart rebuild from auditable events with boundary timestamps | No decorative nonfunctional tabs. Plans never auto-approve evolution or export. Time travel view-only; corrected originals visible; paging stable |
| B6 Full mirror UAT | B1–B5 delivered and approved | Eight category workflows exercised on authorized synthetic data; save/reload/retry/conflict/ownership/attachments and historical reconstruction verified end to end |

These packages are deliberately not represented as implementation-ready therapeutic APIs: clinical approvals and binding semantics are missing today. Visual work A is independently ready and does not depend on inventing them.

## Blast radius and blind spots

| Area | Risk | Containment / verification |
|---|---|---|
| Shared transition guard | Two editors overwrite single blocker | One editable condition owner inA; general notes read-only/navigation. IfB3 changes registry, test every existing consumer |
| Width / assistant pane | Viewport breakpoint ignores sidebar/pane and crushes chart | Measure available content; test collapsed/expanded navigation and assistant pane, no third rail |
| FDI orientation | Mirroring changes Mesial/Distal or V/L | Test all quadrants, each morphology and both dentitions; explicit patient-left/right labels |
| Record meaning | Reference existing/performed mistaken for active/resolved | Separate domains/status labels; no condition migration inA |
| Pagination/completeness | Partial conditions/notes look complete; count drift | Preserve complete/unconfirmed chart signal; backend totals/cursors only; filters and deep links tested |
| Correction/retry | Layout refactor resets operation ID, original or receipt | Keep handlers/state owner; test retries,409, historical deep-link visibility and no duplicate replacement |
| Clinical notes | General note displayed as treatment-bound, draft note exceeds1000 | Separate labels/resources; preserve current validation and revision metadata; no inferred binding |
| Geometry ownership | Exact source/assets copied under assumed templateMIT | Independent geometry at existing seam; rights gate before verbatim asset reuse |
| Privacy | Raw IDs/contact enter mirrored header or AI prompts | Keep PatientHeaderDisclosure, masked RUT and sensitive-input invariants; no backend auth/model edits inA |
| Accessibility | Decorative SVG replaces semantic controls | Semantic activation, keyboard/focus equivalents, non-color state descriptions and44px minimum controls |
| Runtime evidence | Source support mistaken for verified persistence | Report source-traced vs live tested steps separately; create approved synthetic data before write UAT |

Affected tests are PatientDetail/PatientDiagnosis/PatientOdontogram/geometry/presentation and any new local rail tests. No backend/schema/auth/rate-limit/clinical generation/Drive changes inA. Avoid broad component extraction or global token edits unless a measured need justifies them.

## Acceptance matrix

1. Header at390/768/993/1280/1440 CSSpx, plus200% zoom: name readable, privacy intact, no sticky collision and all existing actions reachable.
2. Wide/stacked/sheet layouts with navigation expanded/collapsed and assistant open/closed: no edge molar clipping or hidden editor actions; chart activation targets≥44px.
3.32 permanent and20 primary teeth, eight FDI quadrants; morphology crown/root alignment and M/D/V/L/O transforms verified against independent expectations, not implementation snapshots alone.
4. Each of twelve supported diagnoses: choose tooth, draft, allowed/no surfaces, note, cancel, save, receipt, reload. No request caused by hover, tool choice or dentition change alone.
5. Keyboard-only sequence: tooth/concept/surfaces/Save, focus restore after cancellation and cross-highlights; screen-reader labels include FDI/dentition/condition and meaningful status announcements.
6. Dirty draft: switch tooth/dentition/tab/patient/route, keep/discard, browser Back/Forward; list/notes hover cannot rebind draft. General-notes navigation invokes same guard.
7. Empty/loading/error/retry, unknown catalog code, unavailable dentition, large list/page2, incomplete chart, status filtering and condition-history deep link preserve current behavior.
8. Network timeout retry reuses existing create/correction IDs;409 does not lose draft; correction keeps original history and produces one replacement; read-after-save durability proven on target synthetic patient.
9. Notes rail author/time/body, empty/error/more states and patient change; general note remains general; no attachments/types offered beforeB3/B4.
10. Light/dark theme and reduced motion: symbols/labels remain distinguishable, only confirmed saves animate once, no pointer-target movement.

Implementation validation commands (not run for this documentation-only audit): from app/frontend use Bun for tsc --noEmit, biome check src, test and build. IfB changes backend, read testing/architecture/deployment references and run uv ruff, format-check, mypy and pytest plus migration/transaction checks. Do not substitute this audit's read/draft browser coverage for that future release gate.

## Method, detector and run notes

A was recorded beforeB; both sequential in one context because user declined independent sub-agents. Snapshot slug: clinicaltab-vue. Ignore file absent. CLI detector scanned reference odontogram markup directory and returned two overused-font warnings (Arial) at OdontogramLegend.vue:267 and ToothDualView.vue:1315, actual exit1. These glyph font declarations are low-value specificity flags, not the cause of the five workflow issues; no typography novelty change recommended.

Native browser was already visible; reused the user's existing tab as explicitly requested. Read-only evaluate prevents mutable overlay injection; no detector overlay exists. No temporary live server started; existing3000/8000 apps retained. No new browser tab or temporary fixture created; evidence retained intentionally. Original Clinical/Diagnosis/Permanent/Diagnostic view restored with legend collapsed and an empty composer; current hover binding is transient reference behavior. No reference clinical writes/uploads. Reduced-motion global support found and accounted for. First snapshot of this target in this audit; no improvement trend claimed.

Questions skipped: the user supplied priority (annotated header and especially Clinical), target product, desired fidelity and planning-only scope. The principal design remedies are concrete; missing full-parity domain contracts are explicit gates rather than guessed requirements.

This plan implements neither the mirror nor fixes. Proceed A1→A2→A3; A4 can followA1 once explicit selection exists; thenA5/A6. B packages require clinical/domain decisions and their own reviewed implementation scope.
