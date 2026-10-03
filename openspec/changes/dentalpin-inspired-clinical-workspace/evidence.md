# Evidence and product-design critique

This annex is part of the change and is intentionally self-contained. It records the broad comparison and adoption decisions. The later focused patient click path is in dentalpin-patients-e2e-2026-10-02.md, including create, search, filters, sort, ficha tabs and source behavior. Neither annex embeds demo patient names, contacts, balances or clinical notes.

## Method and confidence

- Observed on 2026-10-02 in the authenticated Codex native browser at http://localhost:3000/. Screens were inspected at narrow and desktop widths; the viewport was restored. Home, patient list, detail, other main modules and Copilot were traversed. The later focused pass also exercised search results/no-match, staged debt filter and clear, sort field/direction, patient Back, all six ficha tabs, activity/note filters, and synthetic required-name state in the unsubmitted creation modal. No record was written.
- The live demo UI was in English, while checked-in screenshots include Spanish and Tamil localization examples. Locale-specific text in a source screenshot is not evidence of the live deployment's selected language.
- Playwright CLI reported no attached browser session. Browser inspection used the native Codex browser's Playwright-compatible locators. This limitation affects automation reproducibility, not the directly observed UI.
- DentalPin source reference: sibling repository references/dentalpin, main at fc36a71bdf1778d45e44ed7f72fbd0536d0be842. Its home source is frontend/app/pages/index.vue; patient list/detail are backend/app/modules/patients/frontend/pages/patients/index.vue and [id].vue; Copilot and navigation are in its frontend modules. The source review confirmed permission/module-gated widgets and patient list state.
- The longer observation record is copied to references/dentalpin-user-flow-handoff.md inside this change. This annex extracts the implementation-relevant evidence; the full record preserves observations of every inspected DentalPin route and source pointers for future reference.
- Browser observations are a snapshot of a demo deployment, not proof of clinical or security correctness. DentalPin's README claims Copilot permission revalidation, identifier substitution, clinical free-text exclusion, and write confirmation; those claims were not exercised over the network and are not imported as guarantees here.

## DentalPin observations relevant to this change

| Surface | Observed behavior | Source confirmation | Design implication |
| --- | --- | --- | --- |
| Home | Greeting/date, two creation actions, three status indicators, day timeline, two-column task widgets and links. Narrow width stacks widgets; timeline scrolls horizontally. | Home widgets are registered by enabled modules and permissions. | Keep direct patient creation in the current directory; a separate Home has no target owner in this change. |
| Patient directory | Search in place, status/contact/debt filters, sort field/direction, row-wide ficha links, create modal; mobile filters live in a panel. Search narrowed the fixture to one row; no-match and clear were distinct. | Search/list state is URL-backed; page size is 20. Debt filter depends on Payments and may silently stop applying if that module fails. The ficha Back implementation routes to plain /patients, losing the previous list query. | Adapt compact controls as a semantic desktop table and mobile full-card links, with distinct states and a privacy guard: search text stays in memory and POST body; only safe sort and supported evolution-presence filter enter the URL. Preserve directory context on return. |
| Patient ficha | Stable identity header, summary, detailed tabs, object-specific links and action bar. Narrow screen keeps common actions available. | Module contributions vary by installation and permission. | Keep the current compact clinical overview and direct links to evolution/work; do not add empty ERP tabs. |
| Copilot | To do/Chat panel, guided tasks, disabled send for empty input. | README describes permission checks and confirmation. | Keep guided entry limited to existing clinical capabilities; prefill is an invitation, not execution. |

Other DentalPin routes observed: agenda, recalls, treatment plans, quotes, invoices, payments, reports, and settings. They informed the exclusion boundary because current Dental AI Assistant has no equivalent authoritative records. No write actions in those routes were exercised.

## Current Dental AI Assistant evidence

| Current seam | Confirmed source | Gap or existing strength |
| --- | --- | --- |
| Root and shell | app/frontend/src/App.tsx; components/sidebar/SidebarNavigation.tsx; DESIGN.md | Root redirects to /patients; sidebar has Pacientes, Asistente, Chat and an existing dark 260px shell. |
| Directory | pages/Patients.tsx; lib/api.ts; backend/routes/patients.py; backend/db/patients_repo.py | Search is debounced, failure is recoverable, and results mask RUT. No URL state or sort control; backend returns all owned patients alphabetically. |
| Ficha | pages/PatientDetail.tsx; components/patients/PatientOverview.tsx; components/PatientWorkspace.tsx | Summary already shows last evolution, count, pending total, relevant actions and history; deep evolution URL focuses detail. |
| Pending work | backend/routes/clinical_pending_work.py; clinical_assistant/pending_work.py; hooks/useClinicalPendingWork.ts | Owner-scoped typed projection, total, cursor and retry exist; failure is distinct from empty. |
| Assistant | pages/ClinicalAssistant.tsx; components/clinical-assistant/ClinicalAssistantArea.tsx; ClinicalPendingWork.tsx | Patient picker, manual composer, pending sidebar and contextual panel already exist. Submission and approval stay explicit. Source review confirmed /assistant auto-acquires a thread and replaces its URL, so a pending query view needs an explicit read-only branch. |
| Product rules | PRODUCT.md; DESIGN.md; docs/design/UX_PRINCIPLES.md; .impeccable/surfaces/patient-workspace.md and clinical-assistant.md | Spanish clinical language, no invented metrics, masked identity, one dominant action, focus/recovery, existing palette and human approval are binding. |

## Audit and critique

1. DentalPin makes the next operational task clear from the first screen. Dental AI Assistant already starts at the patient directory. Keep that entry and make its create/search actions obvious; pending work remains accessible through the existing Asistente destination and exact patient links.
2. DentalPin's summary is useful because every card goes to its source object. The current patient overview already follows that principle for pending work and evolutions. This spec strengthens the links and hierarchy instead of introducing a second longitudinal record.
3. DentalPin's density depends on scheduling and financial modules. Mirroring those cards or menu entries here would create decorative zeros and misleading affordances. The target uses approved evolutions and pending clinical work plus the explicitly requested new notes, manual tooth conditions and their real activity, with unavailable states.
4. DentalPin's URL-backed directory controls make state addressable while on the list, but the observed ficha Back action returned to plain /patients and reset it. This app deliberately posts search text in the body, including RUT. Preserve query only in authenticated memory and put non-sensitive sort/evolution-presence filter in the URL; restore them on ficha return.
5. DentalPin's Copilot presents many tasks, but most are outside this product. The clinical Assistant already has a strong approval boundary; a small starter set should expose its supported paths while keeping text editable and unsent. DentalPin's create modal offers paired required names; the target should reuse its existing RUT-validated directory modal. The later user scope decision adds only optional phone/email, backed by a patient migration, without outreach controls.
6. The source screenshots use a light ERP palette. Dental AI Assistant has a dark clinical system. Copying colors, spacing, or broad tab hierarchy would reduce consistency. Reuse its information architecture, not its visual branding.
7. The proposed pending deep link crosses an existing route behavior: /assistant is a thread acquisition entry, while pending work is a read. Making pending an explicit route mode prevents invisible thread creation and gives narrow screens a discoverable main-pane destination.

## Intended user journey in this product

1. The treating dentist signs in and lands on Pacientes. The directory exposes search, supported filter/sort and Nuevo paciente without a separate dashboard. The sidebar stays familiar; compact icons select Pacientes, Asistente or Chat without expanding.
2. A name, phone or RUT query stays in memory and in the POST body; sorting can survive back/forward through the URL without carrying identity. A row opens the ficha.
3. The ficha shows masked identity, last approved evolution, total evolutions and patient-scoped pending work. "Nueva evolución" remains primary. The clinician may open a specific prior evolution or the contextual Assistant.
4. In Assistant, a starter opens the patient picker or prefills editable text. The clinician deliberately sends the note, reviews any draft, and explicitly approves persistence. The saved evolution appears in the ficha; Drive status remains separate.
5. Returning to the directory during the same authenticated route session restores the typed query and sort. Reload/logout clears the sensitive query.

## Visual reference: structural wireframes

These are privacy-safe diagrams based on the observed patterns and current product constraints. They prescribe hierarchy and relationships, not a new palette. The interactive synthetic directory and ficha are in `wireframes/clinical-workspace.html` and `wireframes/patient-detail.html`; measured rules are in `implementation-blueprint.md`.

    DentalPin observed directory            Dental AI Assistant target directory
    ┌──────────────────────────────┐       ┌───────────────────────────────────┐
    │ search / filters / sort      │       │ current Pacientes/Asistente/Chat  │
    │ linked patient rows          │  →    │ name/phone/RUT search             │
    │ new patient modal            │       │ supported filter/sort + rows      │
    └──────────────────────────────┘       │ existing validated create modal   │
                                           └───────────────────────────────────┘

    DentalPin observed ficha                Dental AI Assistant proposed ficha
    ┌──────────────────────────────┐       ┌───────────────────────────────────┐
    │ identity + many module tabs  │       │ identity + masked RUT              │
    │ summary → source objects     │  →    │ summary → evolution/pending        │
    │ clinical/admin/gallery       │       │ primary new evolution             │
    │ sticky mobile task actions   │       │ secondary contextual Assistant    │
    └──────────────────────────────┘       │ existing history/detail workspace │
                                           └───────────────────────────────────┘

    Narrow viewport: the same task order becomes one column; navigation uses
    the current shell drawer, and every action remains discoverable by keyboard.

## Visual source pointers

- DentalPin repository screenshots inspected: docs/screenshots/home.png and ia.png. The screenshot named patients.png depicts a clinical detail, not the patient directory; its filename must not be used as evidence for list appearance. These are demonstration captures with sample identities, so this change does not embed them.
- Current app visual baseline inspected: artifacts/clinical/01-assistant-empty.png and 02-patient-selected.png; the current shell/palette and composer hierarchy come from DESIGN.md and source, not from DentalPin screenshots.
- The six user-annotated live DentalPin screenshots remain in the browser conversation; the native browser API did not export them into the workspace. The two retained HTML files are interactive target references. `patient-directory-preview.png`, `patient-create-preview.png`, `patient-collapsed-preview.png`, `patient-info-preview.png`, `patient-detail-preview.png` and `patient-activity-preview.png` were captured from them through Playwright CLI. Those PNGs show synthetic target data, not source screenshots or implemented runtime UI.

## Decision matrix

| Reference pattern | Decision | Reason |
| --- | --- | --- |
| Task-first Home with direct object links | Exclude as a separate page | Existing directory stays the entry; exact patient/Assistant links surface owned work. |
| Patient search continuity, supported filter and sort | Adapt with privacy guard | Expand POST-body search to name/phone/full or partial RUT; ephemeral query memory plus URL sort/evolution-presence filter preserve useful context without exposing identifiers. |
| Patient summary as contextual hub | Refine existing | Already present; avoid duplicated ficha. |
| Copilot starter actions | Adapt narrowly | Only existing clinical actions; prefill/navigation, no autonomous execution. |
| Recently viewed patients | Exclude | No trustworthy visit log; use latest approved evolution and label it precisely. |
| Manual odontogram and patient notes | Add explicit new domain | The user's later scope decisions authorize tooth-level conditions, note revisions and a source-backed Activity projection; see patient-clinical-contract.md. |
| Schedule, finance, recalls, treatment plans, module widgets | Exclude | No current target domain model or authorized scope. |
| Light theme and ERP navigation density | Exclude | Conflicts with current design contract and clinical task hierarchy. |
