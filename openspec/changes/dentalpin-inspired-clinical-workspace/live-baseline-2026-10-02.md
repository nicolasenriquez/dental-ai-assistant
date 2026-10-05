# Live baseline: Dental AI Assistant

Read-only observation on 2026-10-02 in the authenticated Codex native browser at localhost:8000. The original browser tab was restored to /patients and its viewport override was reset. No patient, evolution, message, approval, or export was submitted. Names, identifiers and clinical excerpts visible in the local data are omitted here.

## Surface inventory

| Surface | Route observed | Current visible contract | Measured fixture |
| --- | --- | --- | --- |
| Root | / → /patients | The auth loading screen appears briefly; root then redirects to directory. No Inicio navigation item. | Redirect confirmed in live URL and DOM. |
| Directory | /patients | Title, creation button, name/RUT search, one row-wide patient link with masked RUT, age and last evolution. No sort or filter control. | Demo account returned 1 row. At 713 × 968 CSS px: search 668 × 46, list 668 × 90; no horizontal page overflow. |
| Ficha | /patients/:id | Identity, edit, primary new evolution, secondary Assistant, compact last-evolution/count/pending summary, one pending action, history and empty detail pane. | The local fixture showed 8 saved evolutions and 9 pending items. These values are snapshot data, not product defaults. |
| Assistant | /assistant → /a/:threadId | Patient picker, general consultation, voice control, disabled send when empty, optional Drive, conversation/pending sidebar. No focused clinical starter matrix in the empty state. | At 713 × 968 CSS px, composer dock measured 713 × 69; no horizontal page overflow. |
| Pending tab | Existing Assistant sidebar | One chronological list with textual status and typed Continue/Retry controls. | The local fixture showed 9 rows: 4 recoverable drafts and 5 failed Drive exports. No approval was visible in that snapshot. |

Desktop inspection used a temporary viewport override; the browser reported about 1422 × 1000 CSS px after device scaling. The Patients shell began the main pane at x=260px, matching the 260px DESIGN.md sidebar contract. Its search was about 1080 × 45px. Treat these measurements as baseline samples, not fixed target dimensions.

## Verified strengths

- Masked RUT is visible in patient rows, ficha and pending work; the full identifier was not presented in these views.
- Directory and ficha have distinct loading/error/empty paths in source; patient list search remains a body-only POST.
- Ficha retains patient identity, a single primary "+ Nueva evolución" and a contextual Assistant action.
- Assistant blocks empty send, keeps voice optional, and separates Drive from the main clinical composer.
- Pending rows identify saved evolution versus failed Drive synchronization in text; retry remains with the owning pending-work surface.

## Gaps that change this proposal

| ID | Observation | Source owner | Planned correction | Proof |
| --- | --- | --- | --- | --- |
| G1 | / redirects to /patients; the patient directory is the authenticated entry. | App.tsx, SidebarNavigation.tsx | Retain this route and the present three-destination sidebar; make its logo link to /patients and keep compact selection available across routes. | / redirects to /patients; either logo state opens /patients, and compact Pacientes/Asistente/Chat buttons remain usable. |
| G2 | The ficha shows one most-recent pending item. In this fixture that item was a Drive export failure while four clinical drafts also existed. | PatientOverview.tsx; clinical_pending_work_repo.py orders by updated_at | Give clinical review/drafts explicit visual priority and show Drive recovery separately, using authoritative per-kind totals. | Fixture with newer export and older approval still shows approval first. |
| G3 | Assistant pending work is one chronological list in a separate sidebar tab; at narrow width it requires opening the drawer. Source review adds a route blocker: opening /assistant auto-acquires a thread and replaces the URL with /a/:threadId, dropping ?view=pending. | ClinicalAssistant.tsx, ClinicalThreadList.tsx, ClinicalPendingWork.tsx | Make /assistant?view=pending a read-only route mode that shows the existing pending projection in the main pane on narrow screens, skips thread acquisition, and preserves exact work links. | Direct open and reload of /assistant?view=pending show pending work without a new thread, message or hidden drawer dependency. |
| G4 | Directory has search but no sort, and its query disappears after navigation. | Patients.tsx, patients.py | Ephemeral authenticated query state plus URL-backed non-sensitive sort. | Return restores name/RUT query without placing it in URL/storage; sort follows back/forward. |
| G5 | Last-evolution summary displays a date without an exact deep link; the large detail pane begins empty until a history row is selected. | PatientOverview.tsx, PatientWorkspace.tsx | Link the date to the exact approved evolution and retain explicit selection behavior. | The summary opens the same evolution URL as its history row. |
| G6 | Current screenshot and source contracts define a dark 260px clinical shell. DentalPin's light multi-module cards are structurally relevant but visually incompatible. | DESIGN.md, globals.css, DentalPin home source | Use task hierarchy and deep-link patterns with current tokens. | HTML reference and implementation screenshots preserve dark tokens, one primary action and existing breakpoints. |

The local fixture is too small to validate directory pagination or large-list performance. No message, save, Drive retry, empty-account setup, or full keyboard/screen-reader audit was exercised in this session. Those are acceptance proofs for implementation, not claims of current behavior.

## Reference comparison

DentalPin Home resolves module slots (dashboard.hero, timeline, attention, activity, widgets) and presents operational work by category; its patient list URL-backs query and sort. This app has no module registry or equivalent practice-management data. The transferable code pattern is composing owned projections into distinct sections with object-specific links. The target implementation uses fixed clinical sections and existing owner-scoped APIs. Search remains private in the POST body because this app handles RUTs, a material difference from the reference.
