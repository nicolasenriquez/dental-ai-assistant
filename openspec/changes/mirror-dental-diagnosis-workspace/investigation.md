# Investigation and scope decisions

Profile: runtime-change. State: scope locked after mirror audit and D03/D04.

## Scope correction

The user's latest instruction supersedes the earlier twelve-concept-only scope. Preserve those twelve concepts and include the missing therapeutic categories and Spanish names, illustrated cards, selection feedback and chart preview. This change remains specification-only until explicitly authorized for implementation.

Decision D01: the user selected C, complete treatment plans and their execution lifecycle, in addition to existing findings and therapeutic records. The earlier twelve-concept-only recommendation is superseded.

Decision D02: the user selected A, complete clinical lifecycle only: creation, confirmation, recorded acceptance, staged execution, closure, reopening and history. Budgets, appointment scheduling and payments are excluded. Source proves DentalPin couples these domains; the target has no such resources. Target clinical confirmation therefore creates no commercial side effect.

## Plan lifecycle evidence

DentalPin `treatment_plan/service.py` declares draft → pending → active → completed → archived, draft/pending/active → closed, pending → draft and closed → draft. Confirmation triggers draft budget creation in the reference UI contract; budget state can lock plan edits. Each plan item links one treatment, with pending/completed/cancelled executable sessions. Completion carries clinician and time, and can occur without an appointment. The target's owner-only patient boundary must be used instead of importing DentalPin's clinic tenancy model.

Clinical acceptance, financial acceptance and actual procedure completion are different events. A future target design must specify which acceptance it records and cannot claim financial approval if no budget domain is in scope. Likewise, a recorded pre-existing extraction cannot silently complete a planned extraction or rewrite a missing-tooth finding.

## Verified comparator facts

- DentalPin `TreatmentBar.vue` diagnosis mode exposes all constant and catalog clinical categories, locks effective status to `existing`, and hides the status toggle. Planning locks to `planned`. The backend uses `performed` for both executed and pre-existing entries; this mapping is reference-specific, not a target schema decision.
- The small upper-right cyan dot is `.treatment-btn.is-surface::after`, indicating surface support. Selection uses `.selected` border/background. It does not indicate a saved or previously used entry.
- Constants define five clinical categories: Diagnóstico, Restauradora, Cirugía, Endodoncia and Ortodoncia. Catalog mappings add Preventivo, Periodoncia and Odontopediatría. Catalog categories without odontogram mappings do not establish diagnosis palette coverage.
- Catalog variants have separate identities and Spanish labels but may share a clinical type. A metal-ceramic crown and a zirconia crown must not collapse into one indistinguishable card/record. A selected card is matched by catalog ID when present, clinical type otherwise.
- Scope belongs to the catalog item. In particular, `splint` includes both a multi-tooth periodontal splint and a whole-arch occlusal appliance. Do not derive scope solely from clinical type or force either onto one tooth.
- Source constants include bracket, tube, band, attachment and retainer, plus endodontic fill variants. Catalog mappings and fallback tools must be reconciled explicitly in a target inventory rather than assumed identical.
- Target `patients/conditions.py` supports exactly twelve clinician-entered findings, active/resolved/entered_in_error, one FDI tooth and optional M/D/O/V/L surfaces. This is not currently a therapeutic record model. Preserve original IDs, revisions, correction links, owner scope and retry/conflict protections.

## Evidence and limits

Live observations and target/reference event traces are recorded in `docs/design/dentalpin-diagnosis-user-flow-20261006.md` and `docs/design/dental-ai-diagnosis-comparative-audit-20261006.md`, with screenshots under `artifacts/diagnosis-audit-20261006/`. Existing records were inspected without clinical writes. Target saved edit/conflict behavior is source/test evidence, not completed browser persistence UAT. No valid mobile target measurement was obtained in that audit.

Reference sources: `../references/dentalpin/frontend/app/config/odontogramConstants.ts`; `../references/dentalpin/backend/app/modules/odontogram/{constants.py,frontend/components/odontogram/TreatmentBar.vue,frontend/components/clinical/DiagnosisMode.vue}`; `../references/dentalpin/backend/app/modules/catalog/{seed.py,frontend/composables/useTreatmentCatalog.ts}`.

DentalPin is a design comparator, not evidence of a clinical standard. Study its interactions and independently author target code, symbols and geometry; no third-party SVG/code copying is assumed.

## Mirror decisions from the audit

D03: user selected A, active-tool click-to-apply exactly as DentalPin, with surface picker/confirmation where the reference uses it. The previous mandatory Guardar create step is superseded. Target owner scope, stable retries, revisions and logical correction remain behind that interaction.

D04: user selected A, editable typed dental notes, templates and optional associations in this change; media attachments remain a later phase. Full source notes lifecycle is documented in mirror-audit.md, including upload-before-save and body-only edit limitations. The earlier read-only-note rail is superseded.

The previous completed→draft reopening, manual plan completion step,120ms motion cap, Sheet tooth inspector, usage counters, simplified geometry and inferred veneer/pediatric restrictions were introduced by the prior spec and are removed. Prior Implementation Ready meant structural validation; this audit rechecks fidelity explicitly.

## Existing ownership and test seam

Highest UI seam: PatientDetail clinical diagnosis route and rendered PatientDiagnosis, composed with PatientOdontogram. Typed API boundary: `app/frontend/src/lib/api.ts`; existing condition persistence: route → patient condition service → DB repository. Broader therapeutic behavior requires an explicitly declared domain seam, rather than arbitrary expansion of condition codes.

Test prior art: PatientDiagnosis, PatientOdontogram, odontogramPresentation and PatientDetail Vitest tests; `tests/patient-diagnosis.spec.ts` and clinical workspace browser fixtures. Baseline focused Vitest run passed 46 tests in the preceding audit. Browser expectations must be checked against current conflict UI before reuse; an old rebase expectation is stale. Future clinical writes must use isolated synthetic fixtures through the Docker runtime.
