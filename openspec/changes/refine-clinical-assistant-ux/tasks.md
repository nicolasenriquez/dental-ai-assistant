All tasks are future implementation work and intentionally unchecked. Artifact completion does not mean runtime delivery. Preserve unrelated worktree changes and the immutable audit evidence. Capability names below refer to this change's delta files; requirement names are exact traceability targets.

## 0. Continuity and evidence gates

- [ ] 0.1 Confirm closure of `harden-clinical-workspace-continuity`, inspect its final code/specs and validation evidence, and reconcile shared-file interfaces against this design. Record the starting revision and existing dirty changes. If closure or a material contract conflict remains unresolved, stop shared-file implementation and report the prerequisite; do not close predecessor tasks here.
  Traceability: R01 and R02–R11; proposal Impact/Notes; design Context and Migration Plan; external continuity prerequisite.
- [ ] 0.2 Establish a source/build/served-assets manifest for the implementation verification environment, including revision, relevant dirty diff, build command/time, asset names/hashes, base URL and fixture versus real environment. Preserve the user session and data. Resolve or isolate any served-build mismatch before attributing runtime results to this change.
  Traceability: R01; audit provenance.json and evidence 01–03; design Verification and traceability.

## 1. Available-width writing, C1

- [ ] 1.1 Add failing regression coverage for typing and control access in narrow full/contextual/Sheet composers, including long text, sources, voice lifecycle, coarse-pointer targets and reflow with a caret/selection. Use the existing composer tests and browser layout seam; do not assert only CSS class names.
  Traceability: R03; conversational-runtime / Pane-aware clinical writing layout; all three scenarios.
- [ ] 1.2 Reflow the shared clinical composer from available container width so constrained input owns its writing row and controls wrap. Preserve autosize, keyboard/IME, voice handback, Stop/queue and source-removal contracts. Run the focused composer/voice/autosize regressions.
  Traceability: R03; conversational-runtime / Pane-aware clinical writing layout; design C1.
- [ ] 1.3 Verify actual textarea geometry and typing at the required viewport/pane matrix, with optional attachments and each mocked voice state. Capture evidence and update the Assistant brief with the container-based behavior and confirmed threshold.
  Traceability: R03; conversational-runtime / Pane-aware clinical writing layout; audit evidence 29/30/32; design Verification and traceability.

- [ ] 1.4 Reproduce SHADCN-003 on the C0-identified build and add a failing rendered regression for the contextual Sheet's established `min(88vw,560px)` border-box width at 768 and 1023 CSS px. Give only the contextual caller ownership of this layout through the smallest existing Sheet modifier/variant; preserve default Drive/profile sizing. Verify expected width within 2 CSS px, 767/768 and 1023/1024 mode boundaries, local scrolling, named title, one close control, focus containment/return, coarse targets and C1 writing/caret/work behavior. Record a corrective no-op if already satisfied; update only the applicable surface documentation after verified implementation.
  Traceability: SHADCN-003; conversational-runtime / Contextual Assistant Sheet width ownership; all three scenarios; independent shadcn audit 16 and geometry JSON; design Independent shadcn composition refinement. Runs after 1.1–1.3 and before C6/integrated verification; no global primitive or new dependency.

## 2. Original-context decision and labeling, C2

- [ ] 2.1 Add regression tests for patient A→B, A→null and general→A with text/sources/queue, focus trapping, safe initial focus, Escape, failed/deferred patient updates and upstream-guard cancellation. Include retained patient/general labels, blocked dispatch, restoration and historical artifact buffers.
  Traceability: R02/R04; conversational-runtime / Accessible unsent-work context decision and Truthful retained composer origin; all scenarios.
- [ ] 2.2 Replace the existing inline boundary with the controlled allowlisted modal and existing Button variants. Keep one focus owner, truthful origin/target/consequences, safe return focus, pending feedback, duplicate-request protection and successful-transition-only discard. Verify no primitive auto-close loses the failure decision.
  Traceability: R02; conversational-runtime / Accessible unsent-work context decision; design C2.
- [ ] 2.3 Separate retained-origin composer presentation from active patient dispatch metadata. Reuse authorized labels and guarded restoration for patient and explicit general work; retain mismatch locks and the existing buffer/queue ownership. Run focused Area/composer tests and negative submit/write assertions.
  Traceability: R04; conversational-runtime / Truthful retained composer origin; existing Explicit original-context unsent work contract.
- [ ] 2.4 Verify the context modal by keyboard and responsive browser flow, including nested guard cancellation and failed change, and document the safe choices in the Assistant brief. Record focus path, work preservation and request identities with synthetic patients.
  Traceability: R02/R04; both C2 requirements; audit evidence 05/06/35; design C2.

## 3. Loading, error ownership and review recovery, C3

- [ ] 3.1 Add failing thread-load regression tests for transient GET failure→retry→success, loaded-empty versus first-load failure, preserved edits, pending/unknown Drive exports, active-turn hydration, 401/403/404 and stale thread responses. Assert the retry issues no create/acquire, patient-change, submit, resolve, recover or export-retry writes.
  Traceability: R11; clinical-agentic-feedback / Recoverable clinical thread loading; all four scenarios.
- [ ] 3.2 Add scoped load status and the dedicated same-thread retry UI through canonical hydration, with a read invocation policy that excludes export recovery side effects. Preserve other load callers and existing authentication/unavailable handling. Run focused hook/Area tests.
  Traceability: R11; clinical-agentic-feedback / Recoverable clinical thread loading; design C3 load-policy seam.
- [ ] 3.3 Add operation/resource correlation for frontend error ownership and render a save failure once at its artifact. Include regression tests for independent identical-text failures, response loss with approved/failed/pending/unverifiable outcomes, and recovery without duplicate approval/write. Preserve existing canonical reconciliation and buffer protections.
  Traceability: R05; clinical-agentic-feedback / Operation-owned clinical failure feedback; all three scenarios; audit evidence 12.
- [ ] 3.4 Observe the pending review-action region in the actual scroll container and condition its recovery dock on visible usability, retaining a safe fallback. Add regression tests for in-view/offscreen/occluded/unmounted targets, exact-artifact focus, focused-dock retention and modal return focus; activation must not prepare or resolve a write.
  Traceability: R06; clinical-agentic-feedback / Visibility-aware review recovery access; all three scenarios; design C3.
- [ ] 3.5 Verify combined loading/error/review flows in long full/contextual transcripts, including failed load retry, canonical save uncertainty and offscreen recovery. Record network effects and update the Assistant brief with feedback ownership and visibility behavior.
  Traceability: R05/R06/R11; all C3 requirements; audit evidence 10/11/12/36; design Verification and traceability.

## 4. Pending-work continuity, C4

- [ ] 4.1 Add deferred-response hook/component regressions for two or more opened pages, retry outcomes, focus refetch, reordered/new/removed rows, invalid cursors, partial later-page failure and old patient/kind/limit generations. Assert API-backed totals, stable IDs and exact action links.
  Traceability: R07; clinical-workspace-discovery / Pending-work window continuity; all six scenarios.
- [ ] 4.2 Implement bounded fresh-cursor refresh to opened page depth with atomic publication, stable-ID dedupe, current final cursor, coalesced refocus and generation invalidation. Keep the last complete window on failure, retry an invalid cursor chain at most once and introduce no polling or endpoint.
  Traceability: R07; clinical-workspace-discovery / Pending-work window continuity; design C4.
- [ ] 4.3 Preserve reading anchor and appropriate item/action focus in `ClinicalPendingWork`, including vanished-item fallback and explicit-retry announcement. Distinguish export-retry failure from pending-read failure, preserve clinical/Drive grouping, and run focused hook/component tests.
  Traceability: R07; clinical-workspace-discovery / Pending-work window continuity; Retry an export, Focused row disappears, Passive refocus and Partial refresh failure scenarios.
- [ ] 4.4 Verify second-page retry and window refocus through the browser, with successful removal, failed export, failed later-page refresh and rapid scope change. Capture anchor/focus and request sequence evidence and update the applicable pending-work documentation or Assistant brief.
  Traceability: R07; clinical-workspace-discovery / Pending-work window continuity; audit evidence 19→20; design C4.

## 5. Artifact composition and available navigation, C5

- [ ] 5.1 Add regression coverage for full/contextual/manual heading hierarchies and evolution metadata across artifact, approval and ficha, including two same-day times, midnight/DST and browser locale. Assert original semantic timestamps, unchanged numeric inputs and historical edit buffers.
  Traceability: R08/R09; clinical-agentic-feedback / Composition-aware artifact headings and Complete abbreviated evolution timestamps; all six scenarios.
- [ ] 5.2 Pass the appropriate heading level through existing artifact composition and show shared abbreviated date/time in Assistant metadata. Check manual and ficha consumers, exact-resource accessible names and stored values; preserve current timezone, date editing and manual actions. Run focused artifact/approval/date tests.
  Traceability: R08/R09; both metadata/composition requirements; design C5; audit evidence 07/17/33.
- [ ] 5.3 Use existing shell/sidebar availability to condition the full Assistant header's `Pendientes` link. Add and run navigation regressions for expanded sidebar, rail without destination, hidden/mobile drawer, breakpoint changes and focused-entry retention. Keep contextual navigation and the existing pending URL.
  Traceability: R10; clinical-workspace-discovery / Visibility-aware pending navigation; all three scenarios; design C5.
- [ ] 5.4 Update DESIGN.md to distinguish abbreviated evolution date/time display from numeric editable date fields, and update the Assistant brief for headings and conditional navigation. Verify full/contextual/manual accessibility trees, same-day metadata and sidebar modes in the browser, with scoped evidence.
  Traceability: R08/R09/R10; all C5 requirements; interview D3/D4; design C5.

C5 additionally includes this localized independent-audit acceptance:

- [ ] 5.5 RED/GREEN/VERIFY: Reproduce PMAX-001 on the C0-identified served build with at least two distinct consulted evolution IDs at the same displayed date/minute. Add `EvolutionListResult` regression coverage for distinct visible labels and accessible names, exact patient/evolution hrefs, payload order, different-time rows, empty/invalid rows and unchanged formatter values. If already passing, retain proof and make no corrective edit; otherwise add only local identification from current result data, such as an ordinal stable within the unchanged list. Do necessary local cleanup only. Verify keyboard, 360/390 px and tablet/desktop rendering, actual 200% zoom and reduced motion; confirm no added read/write/provider request, preview payload or SSE change. Preserve unsent context and all incumbent clinical invariants; update the Assistant brief only for the local list behavior.
  Traceability: PMAX-001; clinical-agentic-feedback / Complete abbreviated evolution timestamps / Consulted evolutions share a displayed timestamp; independent audit evidence assistant-1440, assistant-390 and evolution-destination; design C5 acceptance extension.

- [ ] 5.6 Reproduce SHADCN-002 on the C0-identified build and add failing full/contextual/Sheet heading regressions. Keep the outer contextual h2/SheetTitle as the sole visible `Asistente clínico` shell title, remove only its embedded repetition, and place the empty-state heading at h3. Preserve full-route h1/empty h2, contextual artifact h3/field h4, manual composition, patient controls and region names. Verify the named modal, one close control, Escape/focus return, draft/context/buffer retention and no induced clinical/export write with desktop/tablet browser evidence. Record a corrective no-op if already satisfied and update the applicable Assistant brief after implementation.
  Traceability: SHADCN-002; clinical-agentic-feedback / Single contextual Assistant shell title; both scenarios; independent shadcn audit 15/16 and heading JSON; design Independent shadcn composition refinement. Runs after 5.1–5.5 and before C6/integrated verification; no new primitive or runtime policy.

## 7. Design engineering refinement, C6

C6 runs after C1–C5, before existing section 6. New numeric IDs preserve all incumbent task IDs. For each RED task, reproduce on the completed C1–C5 build first; if behavior already passes, retain regression proof and make the corresponding GREEN a documented no-op. Do not invent a failure to force a correction. Unavailable required physical-device checks remain open gates.

PMAX-004 extends tasks 7.1–7.3: add the independent audit's long-identity/disconnected-Drive fixture at 390×900, measure the same patient/header region between banner and transcript, and require less than the recorded 237.58 px without hiding required content or relocating it to the transcript. Verify complete identity inline or through visible keyboard/touch disclosure, distinct guarded patient selection, focus/work and coarse targets in narrow full/contextual views. Use local reflow/spacing first, and recheck the improvement after C7. DE01 now has four scenarios; its original three remain intact. Tasks 7.9 and integrated checks also cover this added scenario when testing combined height.

- [ ] 7.1 RED: Add behavior regressions at the existing composer/Area/autosize seams for changing usable height with a preserved draft/caret/selection, five sources and up to three queued entries, including contextual Sheet, Stop and mocked voice states. Reproduce actual clipping or scroll-owner failure through browser geometry and physical software-keyboard open/close or orientation; distinguish viewport emulation from device proof.
  Traceability: DE01; conversational-runtime / Visible-viewport clinical editing continuity; all three scenarios; design C6 ownership and native-browser limits; C1 contracts remain protected.
- [ ] 7.2 GREEN: Correct only a reproduced DE01 failure through existing clinical container/Sheet height and local scroll boundaries, CSS first. Preserve textarea autosize, native zoom, work/context, caret and required controls. Perform only necessary local cleanup; add no global viewport framework or hook unless the physical reproduction proves local CSS insufficient and this design is reconciled first. Run focused composer/Area/autosize/voice regressions.
  Traceability: DE01; conversational-runtime / Visible-viewport clinical editing continuity; design C6 minimal correction and alternatives; incumbent dispatch/voice/queue invariants.
- [ ] 7.3 VERIFY: Close DE01 with rendered desktop/tablet/mobile and 420–520 px contextual checks, short landscape/orientation, physical keyboard open/close, zoom and reduced motion. Record measured CSS/visible viewport and scroll ownership, accessible caret/actions and unchanged work/selection. Assert layout changes invoke no new clinical/provider requests; record unavailable hardware separately before proceeding to DE02.
  Traceability: DE01; conversational-runtime / Visible-viewport clinical editing continuity; all three scenarios; design C6 closure proof and integrated device gate.
- [ ] 7.4 RED: After C2, add context-transition/Area regressions with accepted-limit patient identities, pending/error feedback and resize while the decision is open. Test actual portaled content in narrow/short/200% zoom browser layouts and coarse pointer, measuring choices rather than matching classes. Preserve safe initial focus, trap, Escape, return focus and deferred commit assertions.
  Traceability: DE02; conversational-runtime / Viewport-bounded clinical context modal; all three scenarios; existing Accessible unsent-work context decision; design C6 portal risk.
- [ ] 7.5 GREEN: Correct only reproduced modal bounds or target failures using domain-scoped content scrolling, wrapping actions and existing Button/token sizing independent of clinical-area ancestry. Reuse the existing AlertDialog; retain one focus owner, pending/failure handling and successful-transition-only discard. Do only necessary cleanup; do not restyle other dialogs or introduce confirmations/dependencies. Run focused context-transition/Area tests.
  Traceability: DE02; conversational-runtime / Viewport-bounded clinical context modal; design C6 ownership/minimal correction; C2 choices and commit contract.
- [ ] 7.6 VERIFY: Close DE02 through component and browser checks of full authorized identities/consequences, all actions reachable without background scroll, actual 44×44 px portaled coarse targets, narrow/short/200% zoom and keyboard trap/return. Include growing pending/error text, upstream cancellation and no premature discard/submit/write. Check reduced motion and existing clinical modal regressions before proceeding to DE03.
  Traceability: DE02; conversational-runtime / Viewport-bounded clinical context modal; all three scenarios; existing Accessible unsent-work context decision; design C6 closure proof.
- [ ] 7.7 RED: Add composer behavior coverage for two long common-prefix sources differing only in suffix, a 500-character unbroken display name and five sources with text/queue/mocked voice. Confirm full-name readability in narrow full/contextual/Sheet browser layouts, existing full accessible removal names, stable ordering and exact-ID removal; expose any remaining visual truncation after C1 and DE01.
  Traceability: DE03; conversational-runtime / Unambiguous attached-source identification; all three scenarios; design C6 source schema bounds and existing accessible-name distinction.
- [ ] 7.8 GREEN: Correct only reproduced identification failures with inline full-name wrapping or contained source-list scrolling in ClinicalComposer, preserving stable-ID removal and target access. Keep source content/order/count, dispatch restrictions and voice/queue unchanged. Reuse existing markup/tokens with necessary local cleanup; no hover-only tooltip, new detail modal or source/provider fetch. Run focused composer regressions.
  Traceability: DE03; conversational-runtime / Unambiguous attached-source identification; design C6 minimal correction; C1 and DE01 height/work contracts.
- [ ] 7.9 VERIFY: Close DE03 with pointer/touch/keyboard full-name identification, suffix variants, maximum/unbroken names and five sources across desktop/tablet/mobile, narrow panes, short height, zoom and reduced motion. Verify exact removal ID and no automatic turn/new source-provider request. Recheck DE01/DE02 together with expanded source height, focus, Stop/queue/voice and clinical buffers; record evidence before integrated section 6.
  Traceability: DE03 and coupled DE01/DE02 risks; conversational-runtime / Unambiguous attached-source identification and both other C6 requirements; all nine C6 scenarios; design C6 closure proof.

## 8. Independent UI/UX refinement, C7

C7 follows C6 and precedes section 6. Reproduce each finding against the identified completed build; retain regression proof and make GREEN a documented no-op if already satisfied. These tasks preserve C0, all clinical invariants, existing IDs/states and PMAX-001 task 5.5. No preview, API, persistence, OAuth or Patients-filter expansion is included.

- [ ] 8.1 RED: Add clinical list/row regressions using three different existing thread IDs with the same title/rendered update minute, including exact timestamp ties, active/running/pending states and unique controls. Prove distinguishable visible selection/menu names and exact destination/action IDs across search filtering, unchanged-group refresh and desktop/mobile reflow. Include unique rows and preview-bearing fixtures to detect unwanted content exposure; retain guarded selection and rename/delete behavior.
  Traceability: PMAX-002; clinical-workspace-discovery / Distinguishable clinical conversation collisions; all three scenarios; design C7 clinical row owner and test seam.
- [ ] 8.2 GREEN: Add only clinical collision presentation using deterministic ordinals from existing opaque IDs within the full loaded title/minute collision group before filtering. Keep list order/grouping, stored titles, dates/status and exact actions; unique rows remain unchanged. Reuse existing list/row seams with optional clinical presentation if needed, no raw ID/preview/message tooltip or telemetry and no extra reads/title writes. Perform necessary local cleanup and run focused clinical list/row plus legacy Chat regressions.
  Traceability: PMAX-002; clinical-workspace-discovery / Distinguishable clinical conversation collisions; design C7 discriminator decision, stability boundary and rejected preview/renaming alternatives.
- [ ] 8.3 VERIFY: Verify collision labels visually and accessibly at desktop/tablet/360/390 px, keyboard and actual 200% zoom. Exercise search/clear, unchanged refresh, group membership changes, active/running/pending rows and guarded row actions with exact IDs. Inspect synthetic network traces for no additional reads/writes and confirm no preview/identifier exposure or legacy Chat label changes. Update the Assistant surface brief for the local presentation rule and record proof before the shell slice.
  Traceability: PMAX-002; all three conversation-collision scenarios; design C7 privacy, shared-row and stable-group regression risks; C0 served-build provenance.
- [ ] 8.4 RED: Add shell/banner regressions for full Assistant and Pending with disconnected/connecting Drive, long state text and closed/open sidebar. Reproduce trigger/text/connect rectangle intersections at 360/390 px and short landscape; test keyboard focus/return and simulated connection/viewport changes. Include Patients, ficha/contextual Assistant and legacy Chat controls to expose shared-shell regressions; compare PMAX-004 matched header geometry.
  Traceability: PMAX-003 and coupled PMAX-004/DE01; clinical-workspace-discovery / Assistant mobile navigation and Drive banner coexistence; all three scenarios; design C7 shell/banner owner.
- [ ] 8.5 GREEN: Reserve nonoverlapping space through minimal existing responsive shell composition, wrapping/spacing and semantic tokens. Preserve readable banner/connect and usable menu targets, truthful connection state, sidebar/focus behavior and work. Do not suppress the banner, redesign other pages or initiate OAuth/thread-acquisition/clinical/export actions from layout changes. Perform necessary local cleanup and run focused shell/banner and clinical layout regressions.
  Traceability: PMAX-003; all banner/navigation coexistence scenarios; design C7 minimal shell correction and rejected hiding/positioning alternatives; PMAX-004/DE01 usable-height contract.
- [ ] 8.6 VERIFY: Prove nonintersecting menu/text/connect rectangles, wrapped unclipped state text, required target sizes and no horizontal overflow on Assistant/Pending at 360/390 px, short landscape, actual 200% zoom and desktop/tablet. Exercise sidebar/focus and simulated connected/disconnected/connecting transitions; verify Patients/ficha/contextual/legacy Chat navigation and preserved editing. Recheck C6/PMAX-004 usable height with long identities, sources/queue, and absence of induced OAuth/acquisition/clinical/export requests. Record scoped surface documentation and synthetic evidence before integrated closeout; report physical-device/AT limits separately.
  Traceability: PMAX-003; all three shell coexistence scenarios; PMAX-004 compact-header scenario and coupled DE01–DE03; design C7 shared-shell regression risk and C0 provenance.

## 6. Integrated verification

Integrated tasks 6.1–6.3 include C7 collision identification and shared-shell/banner regressions plus PMAX-004 compact-header acceptance. Recheck the exact fixture geometry and complete identity access after all deliveries; preserve task 5.5's consulted-evolution coverage. New synthetic labels/connection-state tests do not certify real clinical content, OAuth, hardware or assistive technology.

- [ ] 6.1 Run the frontend typecheck, Biome, full Vitest and production build with Bun and the repository's required validation suite before any future commit: backend `uv run ruff check .`, `uv run ruff format --check .`, `uv run mypy .`, `uv run pytest tests -xvs`; frontend `bun run tsc --noEmit`, `bun x biome check src`, `bun run test`. Use the prescribed working directories. Record results; reproduce any claimed pre-existing failure on the starting revision without editing unrelated modules.
  Traceability: R02–R11, DE01–DE03 and PMAX-001–004; all fifteen delta requirements; AGENTS.md Testing and Lint, Format, Type Check; predecessor validation remains separately attributable.
- [ ] 6.2 Run integrated synthetic browser flows across all deliveries against the identified served build: context change/retention, narrow composer, load retry, approval dismiss/failure/recovery/success, separate Drive failure, paged retry and exact ficha navigation. Include scoped Stop/queue, voice, stale-result and artifact-buffer regressions. Include C6 short visible height with maximum sources/queue, bounded long-content modal and portaled targets, and full source-name/exact-removal behavior together. Review expected/actual/diff before any authorized scoped Linux baseline update and rerun affected comparisons.
  Traceability: R01–R11 and DE01–DE03; all delta requirements; design Verification and traceability and C6 closure proof; existing Deterministic accessible validation contract.
- [ ] 6.3 Perform scoped keyboard and assistive-technology checks for modal name/description, focus trap/return, heading navigation and error announcements, plus 200% zoom, reduced motion and physical coarse-pointer access where available. Include C6 physical software-keyboard open/close and orientation, modal scroll/portal targets and touch-readable source names. Run a read-only authenticated smoke check on the identified app build. Record completed checks and unavailable environment gates separately; do not claim AT/device/provider or DB guarantees from mocks, and do not close a required check without its actual evidence.
  Traceability: R01/R02/R03/R05/R06/R08/R10/R11 and DE01–DE03; accessibility, navigation and all C6 scenarios; design Verification and traceability and C6 device gate. Real provider/clinical writes and predecessor database gates are outside this task.

## Execution Order

Integrated tasks 6.2 and 6.3 also cover task 5.5's coincident-timestamp consulted-list scenario: inspect visible and accessible identification, exact destination, keyboard/reflow/zoom and absence of extra requests. Do not infer physical-device, screen-reader or served-build parity from this audit's mocks.

```text
Continuity closure/reconciliation → provenance gate
                                      ├→ C1 writing ───────────┐
                                      ├→ C2 context ───────────┤
                                      ├→ C3 recovery ──────────┤→ C6 refinement → C7 refinement → integrated checks
                                      ├→ C4 pending window ────┤
                                      └→ C5 composition/nav ───┘
```

| Checkpoint | Task sequence | Prerequisite | Completion proof |
|---|---|---|---|
| C0 | `0.1 → 0.2` | Predecessor closure is external | Reconciled final contracts and matching source/build/served manifest |
| C1 | `1.1 → 1.2 → 1.3` | C0 | Rendered writing width and preserved controls/work |
| C2 | `2.1 → 2.2 → 2.3 → 2.4` | C0 | Safe modal and truthful retained origin with no wrong-context dispatch |
| C3 | `3.1 → 3.2 → 3.3 → 3.4 → 3.5` | C0 | Read-only retry, independent error owners and exact-artifact recovery |
| C4 | `4.1 → 4.2 → 4.3 → 4.4` | C0 | Fresh bounded list with stable reading/focus and authoritative outcomes |
| C5 | `5.1 → 5.2 → 5.3 → 5.4 → 5.5` | C0 | Correct heading trees, abbreviated date/time, distinguishable coincident-timestamp result links and available pending navigation |
| C6 | `7.1 → 7.2 → 7.3 → 7.4 → 7.5 → 7.6 → 7.7 → 7.8 → 7.9` | C1–C5 | Three reproduced-or-already-passing cases, localized correction if needed, behavior/geometry/device proof and coupled regressions |
| C7 | `8.1 → 8.2 → 8.3 → 8.4 → 8.5 → 8.6` | C6 | Distinct clinical collision rows, nonoverlapping mobile shell/banner, coupled compact-header proof and shared-page regressions |
| Integrated | `6.1 → 6.2 → 6.3` | C7 (C1–C6 transitively) | Recorded suite/browser/accessibility/smoke results and honest limitations |

C1–C5 have no semantic dependency on one another. The user requested one-context work; execute their shared-file edits serially in the listed delivery order and recheck focused regressions at each checkpoint. C6 follows all five to avoid repairing a condition they already resolve; its three slices run serially because modal/source height and composer scrolling interact. C7 follows C6 to verify collision presentation and shared-shell layout against the completed clinical layout, including compact-header acceptance. Integrated verification follows C7. The graph expresses prerequisites, not authorization for parallel agents. Never overlap Area/transcript/artifact edits from different deliveries. If reconciliation reveals a new semantic dependency, update the artifacts and verify the graph before implementation continues.

This change's planning is complete when artifacts and strict validation agree. Runtime completion requires the unchecked tasks and actual evidence. Spec sync, archival and implementation startup are separate decisions.
