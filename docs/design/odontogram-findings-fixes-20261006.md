# Odontogram findings: proposal, patch and verification

2026-10-06. Implemented in Dental AI Assistant, using DentalPin as a read-only reference. Scope: the five audit findings, not the entire future mirror/domain plan. Ponytail ultra: retain working protections and repair the actual layout boundary. No dependencies, schema changes or reference source/assets copied.

Reference repository: C:/Users/nenri/OneDrive/Desktop/proyectos/pry-ai-evaluator/references/dentalpin.

## Per-finding proposals and decisions

### F1: implicit clinical persistence

Root cause in reference: backend/app/modules/odontogram/frontend/components/odontogram/OdontogramChart.vue handleSurfaceClick/handleToothClick call applyTreatment, which writes through useTreatments. Selecting some chart elements is therefore a commit, unlike the note composer with its explicit Save.

Target location: app/frontend/src/components/patients/PatientDiagnosis.tsx chooseTooth/chooseTool/save. The target already creates local drafts and submits only from explicit form Save. Proposed long-term fix is to retain this single owner rather than introduce click-to-apply or another persistence hook. Existing tests prove tool/tooth selection does not call create and that uncertain retries reuse the frozen payload.

Implementation: no additional persistence code needed. Regression suite retained and passed. Blast radius: none for the backend/API. Blind spot: this run did not submit live saves or inject failed network responses; those are covered by mocked regression tests, not claimed as fresh live-write UAT.

### F2: hover rebinds the note's tooth

Root cause in reference: DiagnosisMode.vue handleToothHover sets selectedTooth; the note composer watches that value to set binding. Moving the pointer can change a future note association.

Target location: PatientDiagnosis.tsx highlightedTooth and draft.tooth_fdi are independent; PatientOdontogram receives onHighlight separately from onSelect. Proposed fix is to retain that separation and prove it with an already populated draft. A debounce, binding lock or duplicate selection store would mask the problem and add state.

Implementation: strengthened PatientDiagnosis.test.tsx regression to select36, populate its note, hover/focus/leave/blur11, and assert the original FDI/note and zero create/edit/correction calls. Blast radius: test only; production selection state unchanged. Blind spot: two simultaneous inline editors would still require coordination, since useTransitionGuard stores one blocker. This patch does not introduce a second editor.

### F3: chart squeezed beside inspector; interaction targets too small

Root cause in reference: viewport-based320px note rail, CSS zoom and overflow:hidden clip outer molars. The target already avoids that clipping model, but its own width boundaries were not coordinated. PatientDiagnosis switched to a300px inspector at960px content width, leaving approximately640px after its gap. PatientOdontogram enabled the16-column overlaid controls at720px section width without sufficient allowance for chart padding/borders.

Target locations: PatientDiagnosis.tsx grid/inspector/records placement and selected-tooth preview; PatientOdontogram.tsx ResizeObserver and overlay container query. Fix: enable inspector at1064px available content width, reserving744px chart +300px inspector +20px nominal gap; enable overlaid controls only at744px chart width, with both CSS and ResizeObserver using that boundary. Narrow modes retain existing44px quadrant controls. Geometry viewBox/FDI calculations are unchanged.

Why this approach: native container queries already react to sidebar/assistant width. Raising coordinated thresholds is smaller and safer than a new layout hook, horizontal scroll workaround, reducing SVG zoom, forcing min-width overflow, or changing the shell. The browser determines placement; existing state stays mounted.

Implementation: two production components, one boundary regression and the existing patient surface brief. Test shrinks/expands743→744→743, retaining the chosen quadrant and original draft tooth without invoking selection. Native measurements verify real CSS, which jsdom alone cannot do.

Blast radius: diagnosis inspector moves into the existing stacked position for content widths960–1063; chart controls use quadrant mode at720–743. This applies to both dentitions and assistant/side-navigation resizing. No global shell, header, route, API or write logic changed. The target header is static, so the reference's competing sticky top0 headers do not reproduce here; no speculative sticky header was added.

Blind spots: JavaScript/CSS thresholds must remain coordinated in future edits; preserve the documented744/1064 relationship. Primary dentition uses the same conservative threshold. User zoom/font sizing changes effective content widths, so tests/report use measured DOM width rather than requested viewport size. Large condition-symbol stacks,200% zoom and assistant-opening workflows were not newly exercised live in this patch; existing tests cover their current behavior where available.

### F4: non-focusable chart interactions

Root cause in reference: ToothDualView's clickable DIV/SVG lacks role/tabindex; related list highlights depend on mouse events.

Target location: PatientOdontogram.tsx renders native buttons with accessible FDI labels, aria-pressed, disabled state, focus outline and focus/blur equivalents to hover. Narrow controls remain native buttons. PatientDiagnosis condition rows also provide focus equivalents.

Proposed fix: preserve native controls rather than make the decorative SVG a second custom keyboard widget. F3 ensures their rendered widths have enough space. Existing chart tests verify focus highlights without selection and click selects; the improved populated-draft regression verifies focus cannot rebind records.

Implementation: preserved incumbent control behavior, verified through tests and native rendered target measurements. Blast radius: F3's control-mode switch only. Blind spot: this was not a complete NVDA/accessibility audit; no WCAG certification claimed.

### F5: palette/legend drift and raw clinical labels

Root cause in reference: TreatmentBar derives categories from its live catalog, but OdontogramLegend uses static constants; note cards can show internal clinical_type keys.

Target location: lib/odontogramPresentation.ts conditionGroups/resolveCondition and PatientDiagnosis.tsx tools/legend. Both target tools and legend already derive from the same catalog. There are no treatment-bound note cards to repair in this target. Unknown stored codes deliberately use a neutral read-only fallback with their code, instead of a guessed clinical meaning.

Proposed fix: retain the single catalog-derived presentation path and existing tests for populated categories, unknown symbols and unsupported entries. Do not add seven empty therapeutic tabs, translate unapproved codes or relabel general notes as treatment notes. Real therapeutic categories/types require their own approved API/domain scope, as documented in the mirror plan.

Implementation: no redundant catalog or label code. Blast radius: none. Blind spot: a future typed note rail must resolve binding/type labels from its approved catalog; general patient notes currently have no treatment association. No promise of eight-category functional parity is made.

## Verification

- Targeted tests:43 passed (PatientDiagnosis35, PatientOdontogram8).
- Full frontend suite:84 files,751 tests passed.
- TypeScript tsc --noEmit passed; Biome checked222 files with no errors after formatting the new assertion.
- Production Docker frontend build passed; only app-blue recreated with --no-deps. Postgres/data preserved; app-blue healthy.
- Served/current browser bundle: /assets/index-Bo8WlB5h.js. Initial browser reload retained the previous HTML bundle; a cache-busting UAT query loaded the new bundle. The dirty guard correctly interrupted navigation until the temporary UAT draft was explicitly discarded.
- Native browser measurements: chart743.636px uses quadrant controls;744.848px enables overlay with minimum width45.540px. Content1063.636px keeps one column;1065.454px renders chart746.704px + inspector300px, with minimum target width45.653px. Computed button min-height44px.
- Additional native effective viewport widths354/698/903/1163/1309 and1527 exercised; piece36 and its synthetic note survived every transition. Requested viewport overrides differed from effective CSS widths, so neither exact requested dimensions nor200% zoom are claimed as verified.
-20 primary/32 permanent FDI positions verified live. Temporary draft discarded without saving; viewport reset to993×792, diagnosis/permanent view retained. Reference tab untouched.
- git diff --check passed. Existing dirty-tree changes were preserved, not committed or reverted.

Evidence: .playwright-cli/verification/clinical-layout-fix-20261006/native-layout-measurements.json and odontogram-wide.png. The screenshot shows the actual served chart/layout, without a saved clinical change.

## Classic git diff

The following production diff is scoped to this turn. Its before state preserves prior working-tree edits rather than comparing against HEAD and attributing older work to this patch. Regression test and surface-brief edits are described above.

```diff
diff --git a/app/frontend/src/components/patients/PatientDiagnosis.tsx b/app/frontend/src/components/patients/PatientDiagnosis.tsx
index 7bfc598..2a2a6c8 100644
--- a/app/frontend/src/components/patients/PatientDiagnosis.tsx
+++ b/app/frontend/src/components/patients/PatientDiagnosis.tsx
@@ -844,7 +844,8 @@ function PatientDiagnosisWorkspace({
           </Button>
         </div>
       )}
-      <div className="grid items-start gap-5 [@container(min-width:960px)]:grid-cols-[minmax(0,1fr)_300px]">
+      {/* ponytail: reserve 744px for the chart, 20px gap and 300px inspector. */}
+      <div className="grid items-start gap-5 [@container(min-width:1064px)]:grid-cols-[minmax(0,1fr)_300px]">
         <div className="min-w-0 space-y-4">
           <PatientOdontogram
             complete={!loading && !readError}
@@ -919,7 +920,7 @@ function PatientDiagnosisWorkspace({
         </div>
         <aside
           aria-label="Editor de condición"
-          className="min-w-0 [@container(min-width:960px)]:col-start-2 [@container(min-width:960px)]:row-start-1 [@container(min-width:960px)]:row-span-2"
+          className="min-w-0 [@container(min-width:1064px)]:col-start-2 [@container(min-width:1064px)]:row-start-1 [@container(min-width:1064px)]:row-span-2"
         >
           {draft && (
             <form
@@ -1028,7 +1029,7 @@ function PatientDiagnosisWorkspace({
                       aria-label={`Pieza seleccionada ${draft.tooth_fdi}`}
                       role="img"
                       viewBox="0 0 42 122"
-                      className="mx-auto h-40 w-28 [@container(max-width:959px)]:h-24 text-muted"
+                      className="mx-auto h-40 w-28 [@container(max-width:1063px)]:h-24 text-muted"
                     >
                       <ToothDrawing tooth={draft.tooth_fdi} surfaces={draft.surfaces} />
                     </svg>
@@ -1309,7 +1310,7 @@ function PatientDiagnosisWorkspace({
             </div>
           )}
         </aside>
-        <div className="min-w-0 space-y-4 [@container(min-width:960px)]:col-start-1">
+        <div className="min-w-0 space-y-4 [@container(min-width:1064px)]:col-start-1">
           {' '}
           <div className="flex flex-wrap items-center justify-between gap-3">
             <h3 className="font-semibold">Condiciones por pieza</h3>
diff --git a/app/frontend/src/components/patients/PatientOdontogram.tsx b/app/frontend/src/components/patients/PatientOdontogram.tsx
index f9c2e9c..06881d5 100644
--- a/app/frontend/src/components/patients/PatientOdontogram.tsx
+++ b/app/frontend/src/components/patients/PatientOdontogram.tsx
@@ -49,7 +49,8 @@ export function PatientOdontogram({
     const node = sectionRef.current;
     if (!node || typeof ResizeObserver === 'undefined') return;
     const observer = new ResizeObserver((entries) => {
-      setNarrow((entries[0]?.contentRect.width ?? 0) < 720);
+      // ponytail: leave room for chart padding and sixteen 44px targets.
+      setNarrow((entries[0]?.contentRect.width ?? 0) < 744);
     });
     observer.observe(node);
     return () => observer.disconnect();
@@ -201,7 +202,7 @@ export function PatientOdontogram({
           })}
         </svg>
         <div
-          className={`absolute inset-x-2 inset-y-5 hidden gap-y-8 [@container(min-width:720px)]:grid ${dentition === 'permanent' ? 'grid-cols-[repeat(16,minmax(0,1fr))]' : 'grid-cols-[repeat(10,minmax(0,1fr))]'}`}
+          className={`absolute inset-x-2 inset-y-5 hidden gap-y-8 [@container(min-width:744px)]:grid ${dentition === 'permanent' ? 'grid-cols-[repeat(16,minmax(0,1fr))]' : 'grid-cols-[repeat(10,minmax(0,1fr))]'}`}
         >
           {teeth.map((tooth) => (
             <button
```
