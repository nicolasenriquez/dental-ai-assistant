# Clinical and diagnosis visual extraction

Playwright CLI review of DentalPin at `http://localhost:3000` on local date 2026-10-02 (CLI artifacts use UTC 2026-10-03). Source checkout: `fc36a71bdf1778d45e44ed7f72fbd0536d0be842`. User completed login in headed session `dentalpin-review`. Inspected Clinical > Diagnosis at 1440×900, 1024×768 and 375×667. No patient, condition, note or treatment was saved. Selected Caries, cancelled it, switched to Primary, expanded Legend and opened the mobile Notes drawer by keyboard.

Evidence labels: IMPLEMENTED = rendered observation or current code, with the method stated; DOCUMENTED BUT NOT IMPLEMENTED = design text without runtime proof; INFERRED = interpretation; PROPOSED = target decision. The earlier native-browser audit remains historical evidence, not a new CLI test result.

Dental AI Assistant was initially stopped. `just dev-up` started its existing local Docker services. The user completed login in headed CLI session `assistant-review` at `http://localhost:8000`. Fresh authenticated comparison covered directory, patient ficha, desktop contextual Assistant opening/closing and an exact approved-evolution route. Ficha screenshots use 1440×900, 1024×768 and 375×667; the focused evolution also passed a 320px page-overflow check. No patient, evolution, condition or note was saved; no message, approval or Drive retry was sent. Opening contextual Assistant acquired its existing runtime context and displayed a thread; this was not a zero-thread-acquisition test. Patient names, IDs, account email and clinical excerpts are omitted from this report.

## A. Visual Architecture

IMPLEMENTED, rendered DentalPin:

```text
Application
├── Global sidebar + 56px global header
└── Patient page
    ├── Patient identity header + contextual actions
    ├── Patient tabs
    └── Clinical panel
        ├── Clinical mode tabs
        └── Diagnosis workspace
            ├── Main column
            │   ├── Register conditions
            │   │   ├── Chart title + Permanent/Primary
            │   │   ├── Upper/lower arches + midline + FDI labels
            │   │   ├── Lateral tooth outlines + occlusal surfaces
            │   │   ├── Whole-mouth strip
            │   │   ├── Tool categories + illustrated condition tiles
            │   │   └── Collapsible legend
            │   ├── Collapsible conditions grouped by tooth
            │   └── Treatment-plan CTA
            └── Notes module slot
                ├── Desktop rail: composer + contextual note cards
                └── Narrow: floating trigger + right drawer
```

Global header, patient header, patient tabs and clinical mode tabs are distinct hierarchy levels. Their spacing and selection treatments explain the screen before individual radii or colors do.

## B. Layout Map

IMPLEMENTED, measured DOM boxes in CSS pixels. These are source samples, not target constants.

| Region | Desktop 1440×900 | Responsive observation |
| --- | --- | --- |
| Global sidebar/header | Sidebar 240px; header 56px | At 375px sidebar becomes menu trigger |
| Clinical panel | x264, y218, width1137 | Main content inset 24px on desktop |
| Clinical mode strip | x264, y234, width1137, height34 | Mobile strip scrolls locally |
| Diagnosis body | Starts y284; main737px, gap16px, notes384px | At 1024px notes remains320px and main shrinks to about385px |
| Register card | width737px; header54px; inset20px | Vertical document scroll; no page-wide horizontal overflow measured at the three viewports |
| Chart drawing | About697×267px for permanent dentition | Anatomical positions retain two arches and quadrant separation |
| Tool tiles | About106×72px; six columns in measured desktop state | Tile labels/icons provide recognition, not just a select menu |
| Conditions list | One grouped row per tooth; measured56px rows | Condition actions remain attached to their condition |
| Mobile notes trigger | 36×36px at x308,y615.33 | Covered by same-size IA trigger at the same coordinates |

Source code switches the notes rail at viewport960px, using320px and384px widths. PROPOSED: target adapts to available patient workspace width instead of copying this viewport threshold; a contextual Assistant also consumes that width.

## C. Component Inventory

| Component | Responsibility and parent | States/interactions | Evidence |
| --- | --- | --- | --- |
| `PatientStickyHeader.vue` | Patient identity and actions above tabs | Back, Edit, contact shortcuts; compact mobile identity | IMPLEMENTED, DOM/screenshot and source |
| `DiagnosisMode.vue` | Clinical diagnosis composition | Loading, conditions collapse, chart/list hover linking, notes rail/drawer | IMPLEMENTED, rendered structure and source |
| `OdontogramChart.vue` | Chart, dentition, treatment tools and legend | Permanent/Primary, selected Caries badge, cancel, instruction change, legend expansion | IMPLEMENTED, clicks and source |
| Tooth drawing components / `ToothSVGPaths` | Anatomical lateral and occlusal geometry | Different tooth families; condition marks | IMPLEMENTED, screenshot; exact geometry owner requires source trace during build |
| `ConditionsList.vue` | Group saved records by FDI tooth | Tooth badge, surfaces, inline actions; hover highlights chart | IMPLEMENTED, DOM/source; bidirectional hover not newly exercised |
| `odontogram.diagnosis.sidebar` | Module-provided contextual notes | Desktop composer/cards; mobile right drawer | IMPLEMENTED, DOM/source; keyboard opening succeeded |

## D. Data Flow

IMPLEMENTED, source-confirmed:

```text
DiagnosisMode → useOdontogram.fetchTreatments(patientId)
              → existing treatments excluding migration_import
              → ConditionsList + chart
chart/list hover → hoveredTeeth → matching representation
notes ModuleSlot ← patientId + selectedTooth + treatment-tooth map
```

The source also fetches treatment plans. These source resources are not target APIs. No source mutation or successful backend save was tested.

PROPOSED target flow remains `PatientDetail → PatientDiagnosis → typed patient conditions/catalog API → patient-owned persistence/revisions → chart + grouped list + Activity`. The condition draft inspector reuses this state. General patient notes stay in Información; no copied treatment-note feed, attachment uploader or module registry is added.

## E. State Matrix

| State | New CLI evidence | Target proof |
| --- | --- | --- |
| Populated diagnosis | IMPLEMENTED: anatomical chart and grouped conditions | Saved active/resolved marks agree with list and API |
| Tool selected | IMPLEMENTED: Caries badge, Cancel and click-to-apply instruction | Visible draft badge; no POST/PATCH before Guardar |
| Selection cancelled | IMPLEMENTED: Caries selection cancelled | Persisted state unchanged |
| Primary dentition | IMPLEMENTED: 20 FDI positions displayed | Correct set/order; mismatch rejected by API |
| Legend expanded | IMPLEMENTED: status and condition symbols/labels | Only supported target codes and active/resolved semantics |
| Desktop notes | IMPLEMENTED: rail and composer, empty Save disabled | Target uses condition inspector, not source notes workflow |
| Mobile notes | IMPLEMENTED: pointer blocked; keyboard Enter opens dialog; Escape closes | Avoid competing fixed buttons; named inline action or non-overlapping panel |
| Loading/error/empty/save/conflict | Not newly reproduced | Required target fixtures; never label untested source behavior as observed |
| Target authenticated ficha | IMPLEMENTED: identity/actions, compact summary, history and empty detail pane; no clinical tabs/chart | Four patient sections with chart-first Clínica; no summary above other section content |
| Target contextual Assistant | IMPLEMENTED: desktop side panel opens existing thread and closes | Preserve runtime and reflow diagnosis according to remaining width |
| Target focused evolution | IMPLEMENTED: exact history link opens evolution URL; summary/history do not displace detail | Preserve existing focused route |

## F. Visual Findings

Only observed defects receive severity. Target specification gaps are listed separately.

| ID | Severity | Observed defect | Root cause / adaptation |
| --- | --- | --- | --- |
| DP-C1 | P1 | Mobile Notes cannot be clicked | `DiagnosisMode` fixed bottom/end trigger z30 shares its full box with global IA z40. CLI click timed out with IA intercepting pointer events. Keyboard Enter opened one dialog. Target must keep contextual actions in one coordinated layout and prove pointer access without force clicks. |
| DP-C2 | P2 | Primary/Permanent area locally scrolls and chart heading wraps at375px | Width competition within chart header. Target should stack chart title and dentition control when needed. |

INFERRED: the professional quality comes primarily from anatomical tooth families, lateral/occlusal views, orderly arcades, illustrated tools, a stable patient identity and grouped records with contextual actions. It does not depend on DentalPin's light palette.

PROPOSED gaps to close in the existing target spec:

| Before | Gap | Target |
| --- | --- | --- |
| Retained HTML repeats one tooth icon for every FDI position | Generic glyphs erase dental anatomy | Distinct incisor/canine/premolar/molar silhouettes and readable surface geometry |
| Tools precede chart in one long form | Weak chart-first scan hierarchy | Chart first; compact illustrated tool palette next; conditions below |
| All saved marks use one generic style | Type/surface meaning absent | Stable symbol/pattern per code; selected, draft, active and resolved distinct |
| Draft editor always consumes full width below chart | Selection review is visually distant | Contextual inspector alongside chart when space permits; stacked on narrow panes |
| Wireframe has no bidirectional focus linkage | Chart/list relationship remains implicit | Hover/focus highlights matching tooth; explicit Ver diente works with keyboard |

## G. Source Map

| Visual element | Owner → primitive/style → data |
| --- | --- |
| Identity/actions | `patients/frontend/components/patient/PatientStickyHeader.vue` → buttons/links → patient detail |
| Register/list/notes layout | `odontogram/frontend/components/clinical/DiagnosisMode.vue` → UCard/flex/ModuleSlot → odontogram and note owners |
| Anatomical chart/tool palette/legend | `odontogram/frontend/components/odontogram/OdontogramChart.vue` and tooth/icon helpers → SVG + source tokens → dentition/treatment state |
| Tooth-grouped records | `odontogram/frontend/components/clinical/ConditionsList.vue` → list/dividers/badges → per-tooth treatment views |
| Mobile collision | DiagnosisMode notes trigger + global IA trigger → identical fixed bottom/end offsets, competing z-index → no data dependency |
| Target ficha | `app/frontend/src/pages/PatientDetail.tsx` → existing patient components/primitives/tokens → patient/evolution APIs |

Paths above for source clinical components are relative to `backend/app/modules/`. Existing `dentalpin-patients-e2e-2026-10-02.md` owns the broader directory/API map. This pass does not claim a complete rerun of its20 directory states.

## H. Screenshots

New source PNGs are local review evidence in `C:\Users\nenri\AppData\Local\Temp\opencode`:

- `dentalpin-clinical-desktop.png` (1440×900, permanent)
- `dentalpin-clinical-tablet.png` (1024×768, primary)
- `dentalpin-clinical-mobile.png` (375×667, primary)
- `dentalpin-clinical-mobile-notes.png` (375×667, notes drawer)

Source images contain demo identities and note content; they are not embedded in target wireframes or committed as patient fixtures. Compare the same viewport, dentition and selection state in future before/after evidence. The earlier patient-detail diagnostic PNG/HTML is historical; current wireframes/diagnosis.html and its previews replace its generic glyphs, marks and tool ordering. See readiness-review.md for planning verification of the replacement.

Authenticated target PNGs in the same temporary directory:

- `assistant-ficha-desktop.png` (1440×900)
- `assistant-ficha-context-desktop.png` (1440×900, contextual Assistant open)
- `assistant-ficha-tablet.png` (1024×768)
- `assistant-ficha-mobile.png` (375×667)

## Authenticated before → gap → target → implementation plan

| Current target, IMPLEMENTED by fresh CLI | Gap | PROPOSED target | Existing implementation task |
| --- | --- | --- | --- |
| Ficha shows identity, three actions, summary, history and an unselected detail placeholder | No dedicated personal/clinical/activity hierarchy or chart | Patient header → four tabs → selected section; Clínica owns Diagnóstico/Evoluciones | 2.6 then2.11–2.13 |
| At375×667, header, summary and starter actions occupy almost the entire first viewport | Repeating that summary before diagnosis would bury the chart | Tabs directly follow identity/actions; summary/starters render only in Resumen, not before Clínica | 2.6 and3.6 |
| At1440×900, global sidebar260px; contextual Assistant520px, gap about24px; remaining patient column about600px | Viewport-only desktop rules would squeeze chart plus inspector into a narrow region | Use available diagnostic width; stack inspector when Assistant consumes space | 2.13 and3.6 |
| Summary surfaces a Drive recovery item; latest-evolution date is plain text | Saved-work synchronization competes with clinical work; date lacks exact destination | Clinical priority and separate Drive recovery; exact approved-evolution link | 2.5–2.6 |
| Exact history link opens focused evolution without summary/history above it | This useful focus could regress during ficha restructuring | Keep existing focused route separate from tabbed overview | 2.6 and3.3 |

No page-wide horizontal overflow was measured for ficha at1440,1024,375px or focused evolution at320px. This does not prove every control, overlay or draft state at those widths. The fixture has one directory patient and existing saved/pending records; fixture counts are not acceptance constants. Empty/loading/API-error, owner-isolation, condition saves/conflicts, full keyboard coverage and screen-reader behavior remain implementation verification fixtures, not completed browser assertions.

The visual comparison is complete for this review's clinical/diagnostic scope. The DentalPin page is a full practice-management system; the target retains its clinical evolution owner and introduces only the already-selected manual condition/notes/activity resources. Runtime implementation remains deferred.
