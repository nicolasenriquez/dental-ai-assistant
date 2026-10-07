# Odontogram UAT fixes — proposal and implementation

Scope: UAT-01/R7, UAT-02/R8 and UAT-03/R9 from the 6 October 2026 audit. The normative OpenSpec acceptance contract takes precedence over implementation notes describing automatic disjoint merges. No new dependency, backend command, database migration or navigation framework is needed.

## UAT-01: mobile note sizing

**Root cause and location.** `app/frontend/src/hooks/useAutosizeTextarea.ts` treats browser support for `field-sizing` as proof that every caller enables content sizing. `PatientDiagnosis.tsx`, the fourth caller, does not. Its `min-h-24` also provides only three useful lines at the deployed root font size.

**Patch.** Let the shared hook defer to native sizing only when the actual computed property is `content`. Enable content sizing on the condition note and express its minimum as four line heights plus the existing padding and borders. Retain the existing one-third-viewport cap and JS fallback.

**Why this approach.** CSS handles wrapping and width changes without another state machine or listener in supported browsers. The computed-style guard fixes the shared false assumption for every caller. Removing native sizing globally would make chat and evolution fields depend on JS unnecessarily; hardcoding a pixel height would repeat the font-scale bug. Adding another autosize library would duplicate the existing hook.

**Blast radius.** Shared hook: `ChatInput`, `ClinicalComposer`, `EvolutionReviewArtifact`, `PatientDiagnosis`. Fields already using native sizing keep it; fixed-size callers now use the existing fallback. The new minimum/content-sizing class is confined to the condition note.

**Blind spots and checks.** JSDOM has no layout: hook tests cover supported-but-fixed and actually-enabled native branches, while browser checks measure short/long text at 390 and 430 CSS px. Existing fallback cap tests remain. Real virtual keyboards and assistive technologies are outside this patch's proof. On very short viewports the four-line minimum can exceed the one-third cap; CSS minimum wins to preserve usable editing. Older browsers retain the existing JS fallback; its resize behavior is not being redesigned.

## UAT-02: explicit conflict decisions

**Root cause and location.** `PatientDiagnosis.tsx` computes required choices as `localChanged && currentChanged`. This skips the clinician's decision for a local-only change, even after a 409. The same component retains `draft.base` but renders only local/current note and surfaces.

**Patch.** Require the existing Mantener/Usar choice for every locally changed editable field. Include the base value in the existing comparison. Keep latest values for untouched fields, the reviewed revision, terminal-state restrictions, resolution reconfirmation and the separate D-03 correction review.

**Why this approach.** Change the decision predicate and render the snapshot already held by the editor. A new merge engine would increase the clinical write surface. Merely changing the copy would leave the gate incorrect. Relaxing the specification would remove an explicitly requested human decision.

**Blast radius.** Ordinary condition edit/resolve recovery after 409 only. Disjoint races now need one extra choice for the local field. Creation, uncertain frozen retry, correction replacement and backend atomicity remain on their existing paths.

**Blind spots and checks.** Preserve remote untouched surfaces when keeping a local note; ensure choosing current really excludes local edits; a second 409 must clear prior choices; failed GET and terminal states must still block. Existing focused tests cover these, with disjoint tests changed to assert the gate and base text. Surface-array equality and note trimming retain their existing semantics.

## UAT-03: publish focused condition context

**Root cause and location.** `PatientDetail.tsx` reads `condition` from query state but provides no return channel. `PatientDiagnosis.tsx` keeps result/history/existing-record focus in component state. Reload reconstructs the view from a URL that never learned the selected UUID.

**Patch.** Add one optional callback from Diagnóstico to the existing URL owner. Publish confirmed/result/history/existing-record UUIDs, remove the UUID when closing history, and restore history after the owned exact GET on reload. Reuse guarded transitions for history actions. Delay publication until the next animation frame so reset/save has removed the dirty router blocker. A save with an already-pending navigation continues that navigation instead of publishing competing focus. Existing tab/subview handlers still clear condition outside diagnosis.

**Why this approach.** The page remains the sole owner of navigation; the child remains usable outside that page. A localStorage mirror would introduce stale patient context and a second source of truth. Moving all diagnosis state into the router or adding a global store is unnecessary. Calling raw `history.replaceState` would bypass React Router and its existing guards.

**Blast radius.** Two components and an optional prop. URL writes use `replace`, preserve unrelated query parameters and include only the owned condition UUID. Clinical text stays out of query state. Existing exact GET ownership/UUID validation and patient-keyed isolation remain intact.

**Blind spots and checks.** The real application uses a data router, unlike many MemoryRouter component tests. Browser checks must cover save → URL without a spurious dirty dialog, history → reload, close → clear UUID, dirty cancel/discard, and original/replacement links. Publication checks component liveness before navigating; async owned reads retain their sequence checks. Reload restores the resource and its history, not a specific revision's scroll position: R9's URL contract has no revision parameter. Another read may occur when the newly published UUID enters the existing loader; this is intentional ownership-backed refresh, not another write.

## Patch preview

The companion [odontogram-fixes-20261006.patch](odontogram-fixes-20261006.patch) is a classic git diff of the three production files, captured from the working tree. Regression tests are included in the implementation but kept out of that preview for readability.

## Validation

- Full frontend suite: **750 passed in 84 files**. After simplifying the hook to use computed style alone, its four branch/cap tests passed again. TypeScript and changed-file Biome passed for the final source. Docker production build passed.
- Playwright CLI against the final Docker image, real FastAPI and disposable Postgres: **22/22 checks passed**. Short note height was **114.06 px** at both 390×844 and 430×932; medium notes grew to 158.84/136.45 px; long notes capped at 278.52/307.55 px with internal scroll. Disjoint explicit choice, second race, remote-field preservation, save without a dirty dialog, history reload/close, historical correction reload, dirty cancel/discard and leaving diagnosis passed.
- A separate CLI link check passed result focus, original/replacement revision links, original resource link and original reload. Read-only reload retained exactly five revisions in its fixture. Initial recipe failures were incorrect assertions against real accessible labels, not product failures; the corrected complete recipe passed.
- The final local `app-blue` image was recreated with its existing database/config preserved and became healthy. Its frontend asset is `index-_a-9dEzd.js`. The authenticated native browser opened the original retained UAT patient, published the original UUID from the history button, reloaded, and restored the historical filter and revision history. This native follow-up performed no clinical writes.
- Evidence: `.playwright-cli/verification/odontogram-fixes-20261006/result.json`, `check-final-image.log`, `check-links.log`, `check-final.log`, `note-390.png`, `note-430.png`, `conflict.png`, `historical.png`, `native-history.png`. Full frontend log: `.playwright-cli/verification/odontogram-uat-20261006/fix-frontend-tests.log`.

The historical UAT report remains unchanged as evidence of the original failures. These checks close the three reported defects; they do not certify every OpenSpec scenario, clinical symbol, screen reader or external provider. Backend code and schema were not changed, so a new complete backend suite was not required. No commit or push was performed.

Cleanup confirmed: the Playwright browser was closed; containers, network and volume belonging only to `odontogram-fixes-20261006` were removed. Subsequent container/volume queries returned no owned resources. Shared localhost:8000 returned HTTP 200; its database and retained UAT patient remain intact.
