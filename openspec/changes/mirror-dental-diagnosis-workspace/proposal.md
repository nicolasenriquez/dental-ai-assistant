## Why

Dental AI Assistant currently records twelve findings, but chart activation creates incomplete drafts and moves focus away from the tooth. It lacks the therapeutic categories, illustrated palette, coherent chart previews, grouped clinical context and treatment-plan lifecycle needed for the requested DentalPin-inspired workflow.

## Investigation / Current State

See investigation.md and the two source-backed audits in docs/design. The existing owner-scoped condition workflow already supports explicit save, revisions, correction, conflicts and safe retries. D03 explicitly supersedes the create-only Guardar step for chart actions; preserve revisions, recovery and error-correction guarantees behind the mirrored interactions. DentalPin combines catalog variants with clinical types and different anatomical scopes; its diagnosis mode records existing work while planning records future work. Its cyan dot indicates surface support, not saved usage.

## What Changes

- Keep all twelve existing diagnostic codes and Spanish labels.
- Add an independently authored, fixed therapeutic catalog covering the mapped reference inventory and missing core tools, with eight categories, Spanish labels, distinct variants, anatomy/surface metadata and illustrations.
- Mirror tooth popovers, compact surface selector and record edit modals. Active tool + tooth/surface click applies directly according to D03; hover only previews. Integrate Permanent/Temporal controls, source legend, anatomy, motion and grouped records.
- Introduce separately persisted existing/planned/performed therapeutic records, including atomic multi-tooth procedures and whole-arch devices.
- Add patient-local Planificación and Planes: draft plans, confirmation, recorded clinical acceptance, execution by stages, completion, closure, reopening and immutable history.
- Mirror the editable clinical-note rail, templates, optional tooth association, typed linked cards, body-only edit and soft-delete per D04. Images/PDF attachments are investigated but deferred; general notes remain their existing resource.

## Capabilities

### New Capabilities

- `dental-diagnosis-workspace`: chart, inspection, palette, previews, grouped records, legend and accessible contextual editing.
- `patient-dental-treatments`: fixed Spanish inventory, observed and planned therapeutic records, ownership, persistence, correction and revision contracts.
- `patient-clinical-treatment-plans`: clinical plans, linked treatments, acceptance, staged execution and lifecycle history.
- `patient-dental-clinical-notes`: typed diagnosis/treatment/plan notes, templates, tooth linking, editable feed and history.

### Modified Capabilities

- `clinical-workspace-discovery`: modify the complete existing manual-diagnosis, chart composition and backed-activity requirements to reflect D03/D04 and the new persisted clinical resources. Existing IDs/revisions/correction APIs remain intact. The completed `harden-odontogram-human-workflow` is predecessor evidence; this change explicitly supersedes its creation-flow presentation constraints without editing or archiving that folder.

## Change Profile

Profile: runtime-change. The eventual implementation changes UI, APIs and persistent clinical resources; phase 1 fail-first proof is mandatory. This request creates specifications only.

## Out Of Scope

Budgets, prices, billing, appointments, messages, clinic tenancy/RBAC expansion, AI-generated diagnoses or plans, clinical attachment/gallery/document domain, third-party asset/code copying, and an asserted clinical-standard certification.

## Impact

PatientDetail/PatientDiagnosis/PatientOdontogram, their presentation helpers and typed API clients; new patient treatment, clinical-plan and dental-note routes/services/DB repositories and additive Alembic tables; owner-scoped activity integration; focused frontend, HTTP, real-Postgres and isolated browser tests. Clinical agent approval, evolution persistence, Drive export, RAG and existing condition schema are outside the change.

## Verification Policy

First prove the read-only tooth-click regression through rendered PatientDiagnosis. For each new clinical resource, prove owner denial, validation, idempotency and revision conflicts through HTTP; use real PostgreSQL for transaction invariants. Use isolated synthetic patients for browser saves and reload verification. Existing 46 passing tests are baseline evidence, not proof of the proposed implementation.

## Notes

- D01: user explicitly selected complete plans, superseding the earlier twelve-concept-only scope.
- D02: user explicitly selected the clinical lifecycle without commercial/agenda integrations.
- D03: user selected direct application like DentalPin, including occlusal click and surface confirmation; no added Guardar step for whole-tooth creation.
- D04: user selected editable dental notes/templates/links; attachments are explicitly deferred.
- mirror-audit.md identifies previous invented differences and source-backed visual/event contracts. The four decisions were resolved through grilling via grill-with-docs; no material product decision remains open within this boundary.
- OpenSpec is the change's source of truth. No tracker/map was used. Implementation stays deferred.

- Final audit2026-10-06:75 target entries confirmed against all60 mapped seed variants plus3 core tools and12 findings. W8/W9/N5 add explicit deep Module ownership, safe legacy retirement and exact note candidate/highlight/layout behavior. architecture-cleanup.md defines the contract slice after integration, without widening commercial/media scope or changing product code.

- Live follow-up: eight variant icon overrides and palette/layer colors are explicit; source floating-action collision is corrected rather than copied. Item shortcut advances next pending session; optional execution note commits atomically as a named target safety adaptation. Scope D01–D04 remains unchanged; current tests are baseline proof, not implementation approval.
