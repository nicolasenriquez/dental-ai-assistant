## Context

The clinician uses the full Assistant and the contextual Assistant inside the patient ficha. Both consume the same clinical thread, original-context composer memory, transcript, artifact and approval components. The audit's isolated API fixtures establish UI symptoms, while source inspection establishes ownership. Neither establishes real database or provider guarantees.

Confirmed facts:

- R01 records different served and local bundles. The cause of that difference was not proved. Fresh implementation evidence must identify its source revision, dirty changes, build and served assets.
- `ClinicalComposer` uses a grid whose non-wrapping tools consume the writing column in a narrow desktop pane. The audited textarea measured 24.85 px at 1024×768. A global mobile breakpoint does not detect this pane.
- `ClinicalAssistantArea` already controls the patient-transition decision. `clearContextSlot` clears the origin slot's text, attached sources and queue entries only after a successful patient change. It does not discard historical artifact edit buffers.
- Retained composer presentation currently takes the active patient's metadata, even when the retained work belongs to a different patient or an explicitly general context. Dispatch already protects the original context.
- `useClinicalAssistant.load` hydrates canonical thread state and preserves unresolved artifact edits, but also schedules recovery of some existing Drive exports. A thread-load retry cannot be called read-only unless that export side effect is excluded for that invocation.
- `useClinicalPendingWork.refresh` replaces the combined list with the first page. The existing API supplies keyset cursors, stable item IDs, typed actions and a server total. Cursors depend on ordering by update time and identity; stored old cursors are unsuitable after a retry changes ordering.
- Artifact headings are fixed at h3/h4. The full Assistant has an h1 parent; the contextual Assistant has an h2 parent. Assistant artifact metadata uses the short date, while approval and manual review use the existing abbreviated date/time helper.
- At planning preflight, `harden-clinical-workspace-continuity` had 29/31 tasks checked. Its open 14.2 and 14.3 validation tasks remain external work. Re-read that state before implementation; the number is a planning snapshot, not a release assertion.

Primary authorities are `PRODUCT.md`, `DESIGN.md`, `docs/design/UX_PRINCIPLES.md`, `docs/design/frontend-architecture.md`, and `.impeccable/surfaces/clinical-assistant.md`. Audit identifiers and evidence are in the proposal's source directory.

## Goals / Non-Goals

**Goals:**

- Make context decisions safe to operate by keyboard and pointer, with truthful origin labels.
- Keep writing, voice and execution controls usable in narrow panes and mobile layouts.
- Give each failure a truthful state and a next action without losing work or list position.
- Reduce redundant actions only where the same destination remains directly accessible.
- Correct artifact heading composition and show the approved date/time format consistently.
- Deliver five bounded corrections behind a common continuity/provenance gate, with focused tests and cross-flow verification.

**Non-Goals:**

Backend/API/schema changes; new clinical workflows; automated approval; new draft storage; provider replacement; global visual redesign; global timestamp/timezone normalization; generalized modal or error frameworks; new dependencies; completion of the predecessor's database/provider gates through UI fixtures.

## Decisions

### Product decisions from the interview

| Decision | Approved outcome | Consequence |
|---|---|---|
| D1 | New complete OpenSpec with small deliveries | R01–R11 are covered here; shared files wait for predecessor closure/reconciliation. |
| D2 | Accessible modal with `Mantener` as the safe choice | Initial focus is on keeping the current context; Escape cancels the requested transition. |
| D3 | Reduce duplication according to visibility, preserve access and recovery | Recovery dock and header navigation are conditional; neither disappears merely because another instance exists in the DOM. |
| D4 | Keep abbreviated month, add time, update DESIGN.md | Evolution display uses existing `DD mes AAAA · HH:mm`; date input remains numeric and stored timestamps/timezone remain unchanged. |

No interview decision authorizes implementation. The requested result is this specification.

### Ownership and interfaces

| Delivery | Owning module and interface | Highest useful existing seam | Direct observation/test seam |
|---|---|---|---|
| C1, R03 | `ClinicalComposer`; value/textarea/voice/primary-action props | Shared full/contextual composer inside `ClinicalAssistantArea` | Composer component tests plus rendered contextual panes/Sheet |
| C2, R02/R04 | `ClinicalAssistantArea`; boundary, retained origin and composer presentation | Existing patient-change callbacks and authenticated composer memory | Area/composer tests with mocked patient update; modal keyboard browser flow |
| C3, R05/R06/R11 | `useClinicalAssistant`, Area and transcript/artifact consumers; load status, scoped feedback, existing artifact IDs | Typed `getClinicalThread`, canonical hydration, artifact recovery callbacks | Hook/component tests and intercepted network browser flow |
| C4, R07 | `useClinicalPendingWork` and `ClinicalPendingWork`; refresh/loadMore and retry callback | Existing typed paginated reads and `retryClinicalDriveExport` | Deferred-response hook tests; second-page retry/refocus browser flow |
| C5, R08/R09/R10 | Artifact composition callers and full Assistant shell; heading level/date helpers/sidebar availability | Existing component props, semantic headings and sidebar state | Artifact/approval/date tests and accessibility tree/navigation checks |

Interfaces added here are frontend props or hook results. Ordinary requests remain in typed clients; no inline fetch, alternate runtime state machine or generic framework is needed. Preserve page → domain → pattern → primitive → token direction.

### C1: Reflow by writing space

Use the composer container's available width to select layout, rather than a viewport breakpoint alone. In constrained panes, the textarea occupies its own available-width row, followed by wrapping controls. Optional keyboard help can shorten or move below the input. Mic/voice cancellation, Stop, send/queue and removable sources remain accessible. Do not compact by hiding a required action or reducing coarse-pointer targets below the existing 44 px contract.

Keep the shared autosize hook and its 144 px cap. Preserve draft, caret, IME, Enter/Shift+Enter, voice handback, queue limit and scoped Stop behavior through reflow. The exact container threshold is an implementation detail to determine with the required render matrix; changing it cannot relax the independent writing-row outcome. A viewport-only patch was rejected because the failure occurs in a narrow pane inside a desktop viewport.

### C2: Wrap the existing context decision

Reuse the allowlisted Radix AlertDialog and existing Button variants in the clinical domain. The primitive wrapper currently defaults to `role="dialog"`; the guard must explicitly supply the intended alert-dialog semantics and a linked title/description. Verify the rendered semantics, focus trap and inert background; do not assume that the component name establishes them.

Keep one controlled boundary and the existing transition callbacks. Describe origin, target or `Sin paciente`, and the affected unsent text, sources and queued entries. Use `Mantener paciente`, `Conservar y cambiar`, and `Descartar y cambiar`, with discard visibly secondary/destructive and no initial destructive focus. For an originally general context, use equivalent truthful wording such as `Mantener sin paciente`.

Escape or the safe choice closes the request without changing context or work. Outside interaction does not commit a choice. Preserve/discard prevents primitive auto-close while the existing guarded transition runs; show pending feedback and prevent duplicate commits. Successful transition closes the dialog; failure leaves the decision and work available with a retry or safe exit. Do not clear a slot optimistically. Nested existing navigation guards must have one active focus owner; cancellation of an upstream guard keeps the original boundary and work recoverable.

Return focus to the initiating patient control when it remains mounted, or a stable patient-selection control in the same area. Keep existing voice/approval/save restrictions. A modal Escape must not fall through and Stop execution or cancel underlying voice.

Give the composer a typed presentation of its displayed origin, including the retained label and explicit general context. This presentation is distinct from the active patient ID used for sending. Use only already-authorized/masked metadata. Restoring the origin uses the same transition guard; historical artifact identity and edit buffers remain independent. A new persistence/context policy and an inline three-button decision were rejected because they would duplicate safety logic or leave the audited focus defect unresolved.

### C3: Load and failure ownership

Represent thread loading explicitly as loading, loaded, or failed, scoped by thread ID and request generation. Render starters only after a successful read with an empty transcript. First-load failure renders a dedicated Spanish error with `Reintentar`; keep editing buffers and composer memory, and block new submission until the requested thread has loaded. Background refresh failure keeps readable content and reports the failed read without replacing it with welcome content.

Expose a user retry through the existing canonical hydration path with an invocation policy that performs thread reads without scheduling Drive retries. Preserve other callers' incumbent recovery policy. Initial failed-read retry, including hydration of a thread containing pending/unknown exports, must not call acquire/create, patient-change, turn submit, approval resolution, recovery writes or export retry. Existing read-only polling of a hydrated active turn may resume; propagate the read-only policy through reconciliation reads initiated by this retry so a later polling read does not indirectly schedule an export write. Independent existing export-recovery paths retain their policy. 401 follows authentication handling; inaccessible 403/404 uses the existing unavailable-state contract without an endless retry or replacement thread. Late results/errors cannot change another thread.

Give feedback a frontend operation identity and owner, for example read generation, turn ID, or action/artifact ID. Render a save failure once at its artifact; preserve unrelated load, queue, attachment and Drive failures even when messages are textually identical. Keep unverified canonical outcome distinct from confirmed failure. Canonical read/reconciliation still precedes recovery or a new save intention. String-based suppression or changing the backend error model is unnecessary and unsafe.

Observe the pending artifact's review-action region relative to the actual transcript scroll container, accounting for sticky header/composer occlusion. Hide the redundant review dock only while that destination is visibly usable. If the region is offscreen, occluded, unmounted during hydration, or observation is unavailable, keep the recovery access. Its action scrolls/focuses the exact artifact and invokes no approval write. Keep submit-lock semantics independently visible. Defer removing a focused dock control until focus moves safely; modal dismissal must retain a valid return target. An unconditional dock removal was rejected because it loses recovery in long transcripts.

### C4: Reconcile the opened pending-work window

Remember the number of successfully loaded pages for the current patient/kind/limit. After retry or visible-window focus, read again from the first page, following the new response cursors up to that depth or end-of-list. Deduplicate by stable ID, take total from the server, and atomically publish the completed window. Use its last cursor for the next load-more action. Do not reuse cursors captured before a mutation; do not poll or load the whole pending backlog.

While refreshing, keep the current list available with busy feedback. Coalesce refocus requests and use existing generation invalidation so old patient/filter requests cannot publish or erase newer data. If a later page fails, retain the last complete window and report it as not refreshed; do not publish a deceptively complete first-page-only result. Separate export-retry outcome from refresh-read outcome.

Capture the reading anchor, its offset and the focused item/action before publishing. Restore the surviving item's position/focus without moving focus on a passive window refocus. If its action disappeared but the row survives, focus another usable action on that row. If the row disappeared, focus the next surviving item/action, then the previous one, then the pending section heading, and announce the removal after an explicit retry. Preserve group separation and exact resource links.

The window preserves opened depth, not a frozen snapshot of individual items. Resolved entries disappear, changed entries move according to authoritative ordering, and new work can enter the window. This is preferable to merging stale rows indefinitely or inventing a new item-refresh endpoint. An invalid cursor restarts the bounded refresh from fresh page one once; repeated failure reports an error and preserves the last complete window.

### C5: Composition and metadata

Pass an explicit artifact heading level through the existing clinical composition chain. Full Assistant h1 → artifact h2 → fields h3; contextual section h2 → artifact h3 → fields h4. Check manual review's actual parent and preserve its existing interactions. Reuse the same artifact identity and DOM position; do not add wrapper headings merely to satisfy the hierarchy.

Use `formatClinicalDateTime` for evolution date/time in Assistant artifact metadata and the existing approval/manual/ficha displays. Keep `time.dateTime` equal to the underlying value. Patient ficha summaries already combine abbreviated date and time; verify they agree with the shared formatter and that accessible resource links include time. Update only evolution display rules in DESIGN.md and the Assistant brief. Keep numeric editable date fields, other short-date uses and existing timezone interpretation unchanged.

Read the shell's existing sidebar state and whether its `Pendientes` destination is visibly usable. Conditionally show the existing full Assistant header link only when that alternative is absent. A collapsed rail counts only if it actually exposes the same direct destination; a hidden mobile drawer does not. Contextual surfaces retain their incumbent navigation and do not gain new routes. Keep a focused header entry mounted until focus can move safely. CSS width alone and a broad sidebar redesign were rejected because neither proves access to the destination.

Independent audit PMAX-001 extends the preceding C5 timestamp acceptance to consulted evolution lists whose distinct IDs share the same displayed minute. `EvolutionListResult` currently builds identical date-only link labels; the server deliberately supplies only ID and timestamp. Add local visible and accessible identification, such as an ordinal within the unchanged result list, while preserving payload order, exact patient/evolution href, date formatter and original temporal values. The ordinal is not a persistent clinical identifier or priority. Reuse the existing Link/formatter and `EvolutionListResult.test.tsx`; add no preview fetch, payload/SSE change, backend edit or shared list abstraction. This remains C5 task 5.5, before C6; provenance C0 and all existing regression gates still apply. Evidence and excluded findings are in `docs/design/audits/assistant-independent-uiux-pro-max-2026-10-10/`.

### C6: Design engineering refinement

The final review adds three acceptance gaps after C1–C5, not three newly reproduced runtime defects. C1–C5 already cover the substantive R01–R11 corrections. C6 makes their constrained-height, portaled-modal and source-identification outcomes explicit without changing the approved context choices, clinical state model, API, database, providers or dependencies. Reproduce each case against the completed C1–C5 build first. If an incumbent or earlier delivery already satisfies it, retain behavioral regression proof and make no corrective application edit.

#### Skill inventory and execution boundary

All eight entries were read from `.agents/skills/<name>/SKILL.md` in this repository. These are confirmed local paths, not inferred capabilities. User authorization restricts this review to existing OpenSpec documentation and one context.

| Skill and exact local path | Actual capability / write behavior | Review use |
|---|---|---|
| [emil-design-eng](../../../.agents/skills/emil-design-eng/SKILL.md) | Design-engineering guidance; implementation can change UI; review asks for Before/After/Why | PRIMARY; interaction, frequency and polish analysis only |
| [break-ui](../../../.agents/skills/break-ui/SKILL.md) | Normally creates worst-case fixtures and a demo toggle | PRIMARY; schema-backed analysis only; no fixtures/toggle written |
| [mobile-native](../../../.agents/skills/mobile-native/SKILL.md) | Normally edits web CSS/meta and mobile interactions | PRIMARY; responsive criteria only; physical-device claims withheld |
| [review-animations](../../../.agents/skills/review-animations/SKILL.md) | Read-only motion review with explicit verdict | SUPPORTING; existing/planned transitions reviewed |
| [improve-animations](../../../.agents/skills/improve-animations/SKILL.md) | Reads source and writes animation plans; normal workflow can delegate | CONDITIONAL; not executed because no concrete additional motion defect was established |
| [find-animation-opportunities](../../../.agents/skills/find-animation-opportunities/SKILL.md) | Read-only proposal of justified movement | CONDITIONAL; not executed because no new transition is needed for orientation |
| [animate](../../../.agents/skills/animate/SKILL.md) | Implements motion and modifies application files | EXCLUDED; loaded, not executed |
| [prototype](../../../.agents/skills/prototype/SKILL.md) | Creates UI variants and can promote application code | EXCLUDED; loaded, not executed |

The additionally requested `playwright-cli` skill supplied the snapshot/action/visual-verification workflow. Browser actions used only the documented native Codex browser Playwright API, preserving the authenticated session; no external browser, installation or CLI attachment was attempted. Its use does not add a ninth Emil skill or authorize fixture/application writes.

#### Findings and minimal outcomes

| Before | After | Why |
|---|---|---|
| C1 specifies available width but has no software-keyboard/visible-height acceptance with accumulated sources and queue | Focused editing and necessary controls remain reachable through bounded clinical scrolling as usable height changes | Prevent clipping when a keyboard and multiple work regions compete for height |
| C2 specifies safe modal behavior but does not bound long descriptions/actions or prove targets outside clinical-area ancestry | Complete description and wrapped choices remain reachable within the modal; portaled controls satisfy the existing coarse-pointer target contract | Preserve the safe decision on narrow, zoomed or short screens |
| C1 makes source removal reachable, but composer labels truncate names that can differ only at their suffix | Full authorized source names remain inspectable inline or through contained list scrolling, associated with their stable removal IDs | Let touch, pointer and keyboard users identify the intended source before acting |

**DE01 — VALID GAP: usable visible height.** Source skills: mobile-native, break-ui, emil-design-eng. Component: `ClinicalAssistantArea`, `ClinicalComposer`, `ContextualAssistant` and its existing Sheet wrapper. Current/proposed behavior: incumbent `.app-layout` already uses `100dvh` with overflow containment; the composer dock does not shrink, and queued/source content can consume additional height. C1 reflows width and preserves editing, but does not specify software-keyboard height ownership. Evidence/hypothesis: `globals.css:255`, `:3218`, `:4109`, `:5474`, `:6752`, `ContextualAssistant.tsx:76` and `:91`, and `index.html:6`; these are source-backed risk locations, not proof of a keyboard defect. The empty native-browser landscape check retained visible input. User impact: populated work may leave caret, Stop/voice/cancel or source controls outside usable height. Minimal correction: use the affected clinical container/Sheet's existing scroll ownership and local height bounds; CSS first. Existing coverage: Pane-aware clinical writing layout, C1, and integrated zoom/coarse checks cover width/state, not this visible-height matrix. Regression risk: competing transcript/composer scroll, caret jumps, focus loss and Sheet/background coupling. Do not add a global viewport rewrite or a VisualViewport hook without a physical reproduction showing local CSS is insufficient.

**DE02 — VALID GAP: bounded modal and portal targets.** Source skills: break-ui, mobile-native, emil-design-eng. Component: C2's domain-owned context decision in `ClinicalAssistantArea`, reusing `ui/alert-dialog.tsx`. Current/proposed behavior: the existing primitive portals its content; `.dialog-content` is centered without an explicit scroll-height bound and `.dialog-footer` is a nonwrapping row. Evidence/hypothesis: `ui/alert-dialog.tsx:27`, `globals.css:6697`, `:6726`, `:6733`; the 44 px coarse rule at `:5462` depends on clinical-area ancestry, which a portal does not inherit. C2's new modal is not implemented, so this is a proposed-composition hazard rather than an observed failure of that modal. User impact: long identities or pending/error feedback can hide consequences/actions or leave small touch targets. Minimal correction: scoped domain content/description scroll bounds, wrapping actions and explicit coarse target sizing using existing tokens/primitives. Existing coverage: Accessible unsent-work context decision covers focus/choices/commit, not bounded content or portal-independent geometry. Regression risk: nested guards, focus trap/return, safe choice and deferred transition semantics; no global primitive restyling or extra confirmation.

**DE03 — VALID GAP: distinguishable attached names.** Source skills: break-ui, emil-design-eng, mobile-native. Component: `ClinicalComposer` attached-source row. Current/proposed behavior: `ClinicalComposer.tsx:93` truncates `${sourceName} · Google Drive`; the removal action at `:96` already exposes the full name accessibly. Evidence/hypothesis: source names accept 1–500 characters, up to five context items (`clinical_assistant/schemas.py`); shared-prefix filenames ending in `revision_v12.pdf` and `revision_v13.pdf` can be visually indistinguishable in narrow chips. No populated-source browser reproduction was made in this review. User impact: sighted touch/pointer users cannot reliably distinguish the intended source from a truncated prefix; existing accessible naming is not broken. Minimal correction: inline full-name wrapping or contained source-list scrolling, preserving stable-ID removal and a usable remove target. Existing coverage: C1 protects removal and reflow; the Assistant brief's filename wrapping applies to the Drive library, not this composer row. Regression risk: increased composer height, reordered sources or wrong-ID removal; verify together with DE01. Reject hover-only tooltips and a new source-detail modal/provider read.

#### Existing coverage, optional and rejected recommendations

| Classification | Recommendation and disposition |
|---|---|
| ALREADY COVERED | Autosize limits, caret/selection during pane resize, IME, immediate Send/Stop/Queue and voice handback: C1 and existing composer/autosize tests. The fallback autosize path needs behavior verification under C1, not a fourth gap. |
| ALREADY COVERED | Safe initial modal focus, Escape, return focus, truthful retained patient/general labels, successful-transition-only discard and nested-guard cancellation: C2. |
| ALREADY COVERED | Failed-load retry without Drive writes, operation-owned errors, uncertainty reconciliation and offscreen review recovery: C3. |
| ALREADY COVERED | Many pending records, fresh bounded cursors, disappearing/reordered rows, passive focus, retry and partial errors: C4. |
| ALREADY COVERED | Heading composition, same-day abbreviated date/time and conditional header navigation: C5; approved D1–D4 remain unchanged. |
| OPTIONAL | Additional subtle press feedback or safe-area tuning without an affected-device reproduction: defer. Preserve current button feedback and assess actual insets only where relevant. |
| REJECTED | Blanket input zoom/viewport changes: inputs already use 16 px under the scoped mobile/coarse rule and native zoom remains enabled. Replacing all `vh`, disabling zoom, UA sniffing or adding a global mobile framework is unjustified. |
| REJECTED | New motion timings, list staggering, springs, blur/crossfade over clinical data, artificial loading delays, animated autosize or hold-to-confirm discard: no demonstrated benefit and risks to immediate work, orientation or the approved choices. |
| REJECTED | New prototype, stress toggle, virtualized backlog, shared dialog framework, extra context confirmations or new APIs/dependencies: exceed the localized requirement. |

Break-ui cases were bounded by accepted schemas: first/last patient names up to 120 characters each, thread title up to 120, turn note up to 40,000, source content up to 10,000, display name up to 500, five sources and the incumbent three-entry queue. Plan long multi-paragraph notes, plausible multi-part identities plus boundary strings, shared-suffix filenames, unbroken names and finite safe Spanish errors. These values define future fixtures, not cases all rendered during this review. Empty/loading/error, long messages, rapid state changes and bounded pending windows already belong to C1–C5 tests.

#### Motion review verdict

**Approve the planned restrained approach; no additional motion requirement.** This is a source/design verdict, not a measured runtime-performance pass. Existing transcript/item entry uses 180 ms with a small 4 px offset (`globals.css:1927`, `:4168`); composer color/border feedback uses incumbent transitions (`:3227`). The Drive opening at `DriveWorkspace.tsx:1216` uses its existing 180 ms opacity/12 px offset policy and suppresses that opening motion for reduced motion or keyboard interaction. The context primitive has no entrance animation to repair. Preserve immediate feedback and cancellation, reduced-motion handling and focus; do not retune every incumbent curve from general guidance. C3 visibility changes and C4 reconciliation must retain their planned focus/anchor rules rather than gain list or dock animation. No concrete additional defect warrants executing improve-animations or find-animation-opportunities.

#### Limited native-browser verification

On 2026-10-10 the logged-in native Codex browser showed an empty Asistente clínico after normal navigation from Chat. DOM geometry and screenshots were inspected without typing, attaching, submitting, dictating, approving, resolving or retrying exports. At the existing CSS viewport about 585×792, textarea measured about 422×42 px and used 16 px text. Requested responsive overrides 320×568 and 568×320 yielded measured CSS viewports 291×516 and 516×291, respectively; host/browser scaling means these are not exact 320 px acceptance checks. The narrow textarea measured about 127×90 px, and the short-landscape textarea about 353×42 px. In all three empty states it remained visible, with no horizontal document overflow. The narrow writing space remains C1's already-known scope.

No runtime network trace or source/build manifest was captured here. The native navigation resolved to an empty `/a/<thread-id>` route; absence of clinical/provider writes is not inferred from a screenshot or navigation alone. No clinical action was invoked. Full-source names, five sources/three queued entries, the future C2 modal, touch targets, 200% zoom, reduced-motion timing and software keyboards were not reproduced. The original Chat URL and default viewport were restored. No new evidence or fixture files were written. These observations do not close C0 provenance or predecessor hardware/AT/provider gates.

#### Ownership, seams and future verification

| Gap | Owning module and existing interface | Highest useful test seam and closure proof |
|---|---|---|
| DE01 | Clinical Area/composer composition and contextual Sheet; existing draft/queue/voice props and container boundaries | Existing `ClinicalComposer.test.tsx`, `ClinicalAssistantArea.test.tsx`, autosize tests and browser geometry; physical keyboard open/close, short landscape/orientation, narrow contextual width, maximum work and preserved caret/selection/Stop/voice state |
| DE02 | Domain context decision inside Area; existing AlertDialog and Button interfaces, unchanged guarded transition callbacks | Existing `ClinicalPatientContextTransitions.test.tsx` and Area tests, plus real rendered portal geometry; long identities/status, narrow/short/200% zoom, 44×44 coarse targets, safe focus/trap/return and no premature discard/write |
| DE03 | Composer attached-source presentation; existing context-item ID/name/removal callback | Existing `ClinicalComposer.test.tsx` plus browser full-name readability and exact-ID removal; two suffix variants, 500-character unbroken name, five sources with text/queue/voice, no source/provider request or automatic turn |

Component tests prove state/callback ownership; browser geometry proves actual layout. Physical keyboard/scroll behavior needs a real device; emulation cannot certify it. Run RED reproduction → minimal GREEN/necessary cleanup → VERIFY for each gap before the next. An already-passing case warrants retained coverage and no corrective edit, not an invented failing assertion. If required hardware is unavailable, keep that gate open explicitly. Shared clinical regressions, keyboard, desktop/tablet/mobile, narrow panes, long content and reduced motion are included in integrated closeout.

C6 task IDs are `7.1`–`7.9`, physically before section 6. Local workflow guidance uses numeric IDs; using a new numeric section preserves all existing IDs, including integrated `6.1`–`6.3`, without mixing an alphabetic `5A` convention. The subsequent PMAX extension uses C7 task IDs `8.1`–`8.6`; the current execution graph is C0 → C1–C5 → C6 → C7 → Integrated.

#### PMAX-004 acceptance within DE01

The independent audit measured a 237.58 px patient/header region between the Drive banner and transcript at 390×900 with a long authorized patient identity. This is synthetic rendered evidence, not a physical keyboard diagnosis. Extend existing tasks 7.1–7.3 with the same fixture and measurement boundaries: reduce that region below the recorded baseline without moving its content into the transcript or hiding required controls. Check narrow full and contextual Assistant compositions, preserved work/focus and accessible complete identity. Prefer local spacing and reflow; if disclosure is needed, make it visible and keyboard/touch operable, retain access to the full identity and keep patient selection a distinct guarded action. Hover-only truncation and smaller required touch targets are rejected. The clinical header/Area and existing patient trigger own this presentation; existing Area/context-transition tests plus browser geometry are the useful seams. Recheck after C7 because shell/banner spacing must not cancel the transcript-space improvement. This adds acceptance to DE01, not a separate clinical workflow or task renumbering.

### C7: Independent UI/UX refinements

The follow-up authorization adds PMAX-002 and PMAX-003 after C6. Their earlier exclusion reflected the audit's narrower scope and ownership boundaries, not an assertion that the findings were invalid. Preserve the frozen independent report; the active proposal/specs/tasks govern the expanded planning. PMAX-005 Patients filters and clinical evolution previews remain outside this change.

**PMAX-002 — conversation collisions.** Three synthetic threads had identical rendered generic titles and update minutes. `ClinicalThreadList` maps title, identity, date and status into `WorkspaceThreadList`/`ConversationRow`; it does not use the returned preview. Distinguish only colliding clinical rows with a visible, accessible presentation label such as `Conversación 1`, using deterministic ordinal assignment within the complete loaded collision group before search filtering. Sort existing opaque IDs solely to assign ordinals; preserve the displayed list order, stored titles, grouping and exact thread destinations. With unchanged group membership and rendered title/minute, filtering, refresh and reflow preserve the mapping. A membership/title/displayed-minute change may recompute it; this is not a permanent identifier, chronology or clinical priority. Include the discriminator in selection and row-menu accessible names. Unique rows retain incumbent presentation. Preview/message content and raw IDs must not appear in labels, tooltips or telemetry; no extra read or title write is needed. A preview-based solution was rejected because it would expose additional clinical content; persistent renaming and showing opaque IDs were rejected as unnecessary contract changes. Keep any shared row extension optional and scoped to the clinical caller so legacy Chat semantics remain intact.

**PMAX-003 — mobile navigation and banner.** At 390×900 the closed-sidebar navigation trigger intersected the disconnected Drive heading. `AppShell` owns their composition, with `DriveBootstrapBanner` retaining connection semantics. Reserve real nonoverlapping layout space using existing responsive shell markup/tokens and minimal spacing/reflow. Cover Assistant and Pending views, long disconnected/connecting text, 360/390 px, short landscape and sidebar open/close. Do not hide the banner, replace its connection flow, redesign navigation or introduce positioning fixes that obscure other controls. Simulate connection-state changes at the existing test boundary; no real OAuth interaction is needed. Because the shell is shared, verify Patients, patient ficha/contextual Assistant and legacy Chat for navigation, banner, focus, horizontal overflow and preserved work. Check DE01/PMAX-004 together so extra shell spacing does not erase usable transcript height.

| Finding | Owner/interface | Existing seam and planned proof |
|---|---|---|
| PMAX-002 | `ClinicalThreadList` row mapping; optional presentation through `WorkspaceThreadList`/`ConversationRow` | Existing list/row and clinical navigation tests with collision fixtures; visible/accessibility labels, exact IDs, filtering/refresh, active/running/pending, guarded selection and rename/delete callbacks; legacy Chat regression and no extra requests |
| PMAX-003 | `AppShell` sidebar trigger and `DriveBootstrapBanner` composition; unchanged navigation/connection callbacks | Existing shell/banner tests and synthetic rendered Assistant/Pending geometry; nonintersecting trigger/text/connect rectangles, target sizes, focus/state transitions, shared-page regressions and no induced OAuth/clinical/export writes |

C7 tasks 8.1–8.6 run RED → minimal GREEN/local cleanup → VERIFY for each finding. Reproduce against the completed C6 build; an already-satisfied case retains regression proof and requires no corrective edit. C7 follows C6 because both alter constrained layout and shared clinical presentation; integrated verification follows C7. All incumbent task IDs/states and C0 provenance/continuity gates remain intact.

## Risks / Trade-offs

| Risk | Detection and mitigation |
|---|---|
| Predecessor edits change interfaces or active safety rules | Gate shared-file edits on predecessor closure, inspect the final diff/specs and reconcile this plan; stop for any material conflict. Do not mark predecessor tasks complete here. |
| Safe-looking thread retry triggers Drive writes through hydration | Test network effects with pending/unknown exports; exclude export recovery only for this read invocation, retain canonical hydration and existing callers. |
| Dialog closes before failed patient update or steals another modal's focus | Deferred transition tests, failure/cancel scenarios, nested-guard keyboard flow and focus return assertions. |
| Retained presentation enables wrong-patient send | Keep display origin separate from active dispatch context; assert no submit/queue/clinical write before explicit restoration. |
| Visibility changes unmount focused controls or hide offscreen recovery | Check actual scroll root/occlusion, fallback visible access, focus-held controls and modal return focus. |
| Error suppression hides a distinct failure | Correlate by operation identity; test simultaneous identical-text failures with different owners. |
| Pending refresh mixes old/new pages or loses focus | Fresh cursor chain, atomic publication, latest-generation guard, vanished-item fallback and failed second-page tests. |
| Metadata or heading changes affect manual review | Caller inventory and full/contextual/manual component plus browser checks; preserve stored values, date editing and buffers. |
| Screenshots are mistaken for safety/provider proof | Record fixture/read-only/real-integration classification and uncovered gates explicitly. |
| Collision ordinals are mistaken for permanent identity or rank | Use a neutral conversation discriminator, preserve title/date/status and exact destination; test stable mapping only for an unchanged loaded group and document regrouping behavior. |
| Shared row or shell changes regress other pages | Scope clinical row presentation; test legacy Chat and shared shell on Patients/ficha/contextual views with both Drive states and preserved focus/work. |
| Banner spacing erases compact-header gains or identity disclosure hides context | Measure PMAX-003 and DE01/PMAX-004 together; retain complete identity access, distinct guarded patient selection and required target sizes. |

## Migration Plan

No data migration is required. During implementation, first establish the predecessor closure/reconciliation checkpoint and source/served-build manifest. Deliver C1–C5 with tests and the applicable brief updates beside each correction, then C6 (including PMAX-004 acceptance) and C7 with reproduction before any corrective edit. Run integrated checks only after all deliveries; use the repository's existing Docker runtime and browser-test tooling, preserving the authenticated session and named volumes.

Each delivery can be reverted at its frontend/documentation boundary. A rollback must retain the predecessor's logical context guard, buffers, canonical reconciliation, explicit approval, owner scoping and Drive separation. Pending-list rollback may offer an explicit announced full refresh but cannot mutate clinical data. Do not revert safety controls to obtain a visual baseline. Deploy/sync/archive are outside the tasks in this planning request.

## Verification and traceability

| Finding | Requirement(s) | Delivery and direct proof |
|---|---|---|
| R01 | Verification gate rather than a runtime capability | C0 manifest; source/build/served asset comparison and evidence classification |
| R02 | Accessible unsent-work context decision | C2 keyboard/focus/transition-failure tests; evidence 05/35 |
| R03 | Pane-aware clinical writing layout | C1 real pane/Sheet geometry and typing; evidence 29/30/32 |
| R04 | Truthful retained composer origin | C2 patient/null/queue origin tests; evidence 06 |
| R05 | Operation-owned clinical failure feedback | C3 independent failures and canonical-outcome tests; evidence 12 |
| R06 | Visibility-aware review recovery access | C3 in-view/offscreen/occluded target and focus checks; evidence 10/11 |
| R07 | Pending-work window continuity | C4 retry/refocus/reordering/failure/race tests; evidence 19→20 |
| R08 | Composition-aware artifact headings | C5 accessibility tree in full/contextual/manual; evidence 07/17 |
| R09 | Complete abbreviated evolution timestamps | C5 same-day evolution/timezone tests; evidence 07/17/33 |
| R10 | Visibility-aware pending navigation | C5 expanded/rail/mobile navigation and focus checks; evidence 07 |
| R11 | Recoverable clinical thread loading | C3 failed GET→success, unavailable thread and no-write assertions; evidence 36 |
| DE01 | Visible-viewport clinical editing continuity | C6 tasks 7.1–7.3; bounded local geometry, preserved work and physical software-keyboard proof |
| DE02 | Viewport-bounded clinical context modal | C6 tasks 7.4–7.6; long/zoomed content, actual portal targets and safe focus/commit proof |
| DE03 | Unambiguous attached-source identification | C6 tasks 7.7–7.9; full suffix/name readability, exact removal ID and combined-height regression proof |
| PMAX-001 | Complete abbreviated evolution timestamps / coincident displayed timestamps | C5 task 5.5; visible/accessibility discrimination and exact existing destinations without preview/API expansion |
| PMAX-002 | Distinguishable clinical conversation collisions | C7 tasks 8.1–8.3; deterministic collision labels, filtering/refresh, exact actions and no content exposure/new requests |
| PMAX-003 | Assistant mobile navigation and Drive banner coexistence | C7 tasks 8.4–8.6; nonoverlap geometry, focus/connection-state transitions and shared-page regressions |
| PMAX-004 | Visible-viewport clinical editing continuity / compact long-identity header | C6 tasks 7.1–7.3 plus C7 coupled verification; below 237.58 px at matched 390×900 fixture, complete identity and preserved usable work |

Rendered checks cover 1440×900, 1024×768, 768×1024, 390×844 and 360×800; contextual widths 420–520 px where available; full/Sheet composition; 200% zoom; keyboard; coarse-pointer target emulation; reduced motion; long names/notes and optional attachments; each voice state through mocked media boundaries. Coarse emulation, accessibility trees and keyboard checks do not replace assistive-technology or physical-device testing.

Keep deterministic component/mock-browser proof separate from actual read-only authenticated smoke checks. Review expected/actual/diff before updating scoped Linux visual baselines under the existing policy. Record console/network failures, request identities and negative write assertions. Provider tests or real clinical/export writes need an independently authorized fixture environment; do not use the logged-in user's real records as disposable test data.

## Open Questions

No material product decision remains open. Container thresholds and visibility tolerances are reversible implementation details checked against the specified render outcomes. The predecessor closure, current build identity and real-environment availability are execution gates with explicit stop conditions, not inferred completed work.

## Planning readiness

The following two paragraphs record the earlier C6-only planning checkpoint, before PMAX-001–004 were incorporated; their counts and unchanged-file claims are historical, not the current totals.

The original `spec-driven` planning baseline contained 10 requirements, 36 scenarios and 25 unchecked tasks. C6 adds three requirements, nine scenarios and nine future tasks without removing that baseline: totals are 13 requirements, 45 scenarios and 34 unchecked tasks, with adjacent traceability. `openspec validate refine-clinical-assistant-ux --strict` passed after this additive review; artifact status reports proposal/design/specs/tasks done and `openspec list --json` reports 0/34 implementation tasks complete. Original requirement/scenario text remains intact, existing task IDs remain present, each task has adjacent traceability and appears once in the execution table, and dependencies are acyclic.

Planning state is `Implementation Ready`, subject to the explicit C0 execution prerequisites. Implementation remains 0/34 tasks complete. The review edited only proposal.md, design.md, tasks.md and specs/conversational-runtime/spec.md; both other delta files and .openspec.yaml retain their review-start hashes. No application test, runtime fix or prototype was executed in this review, and no predecessor gate was closed. The limited browser observation above does not certify the future C6 cases. The continuity change now reports 31/31 checked tasks, but its release-gate README still excludes real screen readers, physical keyboard/touch and provider writes and records baseline/e2e follow-up; reconcile those facts in C0 without certifying them here.

Current additive PMAX planning includes 15 requirements, 53 scenarios and 41 unchecked implementation tasks: PMAX-001 retains its C5 scenario/task 5.5; PMAX-004 adds one DE01 compact-header scenario to tasks 7.1–7.3; PMAX-002/003 add two requirements, six scenarios and C7 tasks 8.1–8.6. Proposal, design, both affected capability deltas and tasks agree on scope, owners, verification and C7-before-integrated dependencies. Strict OpenSpec validation passed and all four schema artifacts report done. Planning is `Implementation Ready`, with C0 and real-environment execution gates still required. This update changes only planning documentation; no application implementation, sync, archive, commit or predecessor-gate closure is implied.
