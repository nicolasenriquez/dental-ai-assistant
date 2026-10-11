# Independent frontend audit

## Scope and method

Date: 2026-10-10, America/Santiago. Source HEAD: `98d0a105b0f2c00884f65bb1fe66e5685d3ec390`. Existing deletions in `.agents/skills/animate/` were preserved. No source, dependency, test, environment or design-authority edit was made.

Read the user-selected `.agents/skills/playwright-cli/SKILL.md` and `.agents/skills/shadcn/SKILL.md`. Used the native Codex browser's documented Playwright API instead of launching a separate CLI browser. shadcn was the only specialized component skill; historical reports using other skills were read only after the independent freeze. Browser documentation and the mandatory prose-editing instructions are operational/editorial guidance, not additional UI research skills.

Phase 1 identified contracts, source ownership and active spec. Previous audit conclusions were deferred until `evidence/independent-freeze.json` was written. Reports were actually found in `docs/design/audits/`; `docs/audit/` did not exist before this pass. No historical files were rewritten.

The authenticated session contains data whose provenance is not generally known. Persistent finding evidence uses the explicitly named UAT synthetic patient and synthetic unsent text, or a general empty state. Populated Pending Work was inspected without saving its clinical text or patient identifiers. No clinical/provider turn, approval, clinical save, export retry, OAuth or microphone permission was exercised. Navigation/context acquisition can itself update thread metadata; this was not a zero-request session. No synthetic patient was created or deleted.

## Browser coverage

| Route / flow | States inspected | Coverage and evidence |
|---|---|---|
| `/patients` | Initial directory, desktop table, mobile links | Actual session; no persisted screenshot of the populated directory |
| `/patients/:id` for the UAT patient | Summary, zero approved evolutions, contextual entry | Desktop panel and tablet modal, 15/16 |
| `/assistant`, `/a/:threadId` | General empty state, patient-bound empty state, navigation | 01/08; patient binding changes through existing context entry |
| Clinical patient picker | Open, synthetic no-match search, Escape | 02; returned focus, no patient selection from the search results |
| Contextual Assistant | Open, type synthetic unsent note, Escape, reopen | Note retained; then remove patient, 17; cleared text after observation |
| `/assistant?view=pending` | Populated draft/review and failed-copy groups, return | Read only; no retry, pagination or approval performed; no saved clinical-content evidence |
| Drive Notes | Loading, connected list, search no-match, clear | 09 is stable mobile no-match; no source opened or attached |
| Drive Documents | No active patient prompt | Observed selection prompt; no document fetched |
| Drive Journals | Loading, populated weekly list, unchanged preference | 10; no grouping preference saved or journal opened |
| Drive modal | Open, tab change, Escape | Keyboard dismissal returned focus to `Abrir Google Drive` |

Nominal viewport requests were 1440×900, 768×1024 and 390×844. An existing browser scale meant an initial 1440×900 request produced 1309×818 CSS px. Adjusted requests produced effective 1440×900; tablet observations were 768×1023 and 768×1025; mobile was 390×843. Additional contextual capture: 1025×768. JSON records contain the exact effective geometry. These are representative breakpoint checks, not claims that every nominal pixel matrix was reproduced exactly. Only the incumbent dark theme was observed; source inspection found no user-facing light-theme switch.

Full-viewport screenshots proved more reliable than cropped capture. Several early cropped screenshots changed or disagreed with responsive route/layout state. They are excluded from confirmed contextual findings. The capture-side cause was not instrumented. No persistent app navigation or panel defect is inferred from them.

## Findings frozen before historical reconciliation

Ratings: impact, severity, confidence and effort use 1 (least) to 5 (most). Confidence in visual symptom is separate from confidence that current source produces it.

| ID | Finding | Priority | Impact / severity / confidence / effort | Risk |
|---|---|---|---|---|
| SHADCN-001 | Unsent context transition on served build | P1 | 5 / 4 / 4 / 3 | High |
| SHADCN-002 | Repeated contextual title and sibling heading levels | P2 | 3 / 2 / 5 / 2 | Low |
| SHADCN-003 | Contextual Sheet width contract overridden | P2 | 3 / 3 / 5 / 2 | Medium |
| SHADCN-004 | Duplicate visible Pending navigation | P3 | 2 / 1 / 4 / 2 | Medium |
| SHADCN-005 | Source/served-build attribution gap | P1 gate | 5 / 4 / 5 / 2 | Medium |

### SHADCN-001: Unsent work becomes general presentation without a decision

Route: UAT patient ficha, contextual Sheet. Effective 768×1025, dark. Open Assistant, type `Nota sintética de auditoría. No enviar.`, press Escape, reopen, then choose `Quitar paciente activo`. The text survives close/reopen. The final observed UI shows `Consulta al asistente`, general placeholder and enabled Send, with no unsent-work decision. Evidence: [17](evidence/17-context-change-with-unsent.jpg).

Expected: explicit safe decision, truthful original context and the incumbent incompatible-context send lock. Relabeling obscures who the note concerns. No send was attempted, so wrong-patient dispatch is not proved. Current source already contains context protections; bundle equality is absent. Reproduce on the identified implementation build before any fix. Existing C2 requirements are the right owner; do not create another guard or persistence policy.

### SHADCN-002: Contextual shell repeats its title

Route: same ficha, desktop and Sheet. Effective 1025×768 and 768×1025, dark. Open Assistant with its loaded empty thread. The outer `Asistente clínico`, inner `Asistente clínico` and `Prepara una evolución clínica` are all h2. The repeated inner title is visible above the transcript. Evidence: [15](evidence/15-contextual-1025-native-full.jpg), [16](evidence/16-contextual-tablet.jpg), [headings](evidence/16-contextual-tablet-geometry.json).

Expected: one contextual shell title, a subordinate empty-state heading and unchanged artifact hierarchy. The duplicated label costs space and makes heading navigation describe nested content as peer sections. This is local composition cleanup, not a reason to remove SheetTitle or patient identity. Source confirms separate title owners in `ContextualAssistant` and embedded `ClinicalAssistantArea`; product hierarchy reasoning supplements the shadcn title requirement.

### SHADCN-003: Shared Sheet default wins over the contextual width

Route: same ficha, contextual Sheet. Effective 768×1025, dark. Open Assistant at the tablet breakpoint and measure the dialog's border box. Width is 459.99997 px; textarea width is 239.56438 px. The surface contract and contextual caller specify `min(88vw,560px)`, which is 560 px at this width. Evidence: [16](evidence/16-contextual-tablet.jpg), [geometry](evidence/16-contextual-tablet-geometry.json).

Expected: the existing contextual width formula controls the border box, within 2 CSS px of expected width, and local scrolling/focus remain intact. The missing 100 px reduces available writing space without product justification. Source corroboration: `sheet.tsx` adds `drive-sheet-content`; `globals.css` sets `width: min(460px,92vw)` after Tailwind utilities. Treat stylesheet ownership/cascade as the supported cause candidate; only a paired same-build correction can prove its complete causal effect. Do not enlarge every Drive/profile Sheet.

### SHADCN-004: Two visible Pending destinations

Route: full Assistant, expanded sidebar, desktop dark. Both sidebar `Pendientes` and header `Ver pendientes` expose the same destination. Initial cropped [01](evidence/01-assistant-desktop.jpg) shows the header; DOM/native snapshots established the expanded sidebar destination. Expected: suppress the header only when the equivalent sidebar entry is visibly usable, with safe focus handoff. Keep it in rail/mobile layouts. This is a modest simplicity improvement, already covered by C5.

### SHADCN-005: Runtime and local build differ

The browser loads `index-hMjYLKeb.js` and `index-BzakEpcP.css`; local dist contains `index-DRDYVL-j.js`, `index-C5tUUKOI.js` and `index-Cxj8-c6C.css`. Served JS text SHA256 is recorded in [provenance](evidence/provenance.json). Different names demonstrate separate artifacts, not their precise source revision or a cache root cause. C0 must establish source/build/served identity before declaring implementation behavior verified. No rebuild or restart was performed.

## Strengths, rejected proposals and limitations

Drive's connected state, no-match search and patient-required Documents prompt are explicit. Escape restores Drive trigger focus. The contextual Sheet preserves unsent text across close/reopen. Semantic directory table/mobile links and masked identity remain appropriate. Keep the dark token system, native search controls, local Button variants and existing Radix overlays.

Rejected: persistent offscreen Drive defect (later settled width 374.59 px within a 1440 px viewport); persistent mobile sidebar occlusion (settled sidebar right edge was 0); a wholesale shadcn migration; extra badges/cards; previews exposing clinical content. The first two are excluded observations, not resolved product bugs. A usable 230.95 px contextual textarea was measured at 1025×768 with collapsed navigation; this does not reproduce or disprove historical R03's 24.85 px geometry under another build/composition.

Not verified: generation/SSE/Stop/queue, voice states, approval/save/reconciliation, populated artifacts, source attachment/removal, error injection, export retry, Pending pagination, real keyboard hardware, touch/coarse media, screen readers, actual 200% zoom, reduced-motion rendering, contrast ratios or performance. No broad accessibility or clinical-safety certification follows from this pass.

## Scoped score

Expert heuristic: **72/100 = 7.2/10**. Hierarchy 14/20; visual consistency 16/20; responsive composition 14/20; observed feedback 12/15; partial keyboard behavior 11/15; context clarity 5/10. Deductions follow the repeated hierarchy, narrower-than-contracted Sheet and context presentation. No points certify unvisited clinical completion states. The score covers this observed served UI subset and cannot be directly compared with fixture audits that tested other builds and flows.
