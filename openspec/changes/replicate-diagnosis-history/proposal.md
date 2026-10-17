## Why

The reference investigation documents a useful Diagnosis/History workflow, but our app already implements most diagnosis operations and lacks a patient-wide temporal chart. Rebuilding the existing chart would risk its audit, conflict and recovery contracts; this change adds the missing historical view and closes specific interaction gaps through the existing owners.

## Investigation / Current State

- `PatientDetail.tsx` offers Diagnóstico and Evoluciones. Legacy plan links open read-only evidence; plan creation is retired.
- `PatientDiagnosis.tsx`, `PatientOdontogram.tsx`, `useDentalWorkspace.ts` and the dental presentation registry already cover anatomical FDI charts, eight categories, inspection, surface application, saved-record modals, corrections and retry-safe commands.
- `PatientConditionHistory.tsx` and treatment revisions provide record-level history, not an as-of patient chart.
- Condition and procedure revision tables store before/after snapshots and timestamps. Activity supplies links and summaries, not sufficient historical chart state.
- `useDentalClinicalNotes` owns a shared composer across the notes rail and Sheet. Diagnosis notes bind to patient/optional tooth; procedure notes bind to the procedure. Attachments and recalls are not current product domains.

## What Changes

- Add Historial as a clinical mode with a date timeline, read-only reconstructed chart, changes for the selected day and paginated audit events.
- Consolidate the Diagnosis summary into an accessible grouped accordion with exact, filter-aware counts and contextual note actions.
- Reuse anatomical artwork, catalog, modals and notes. Add visible Eliminar in saved-record modals and deletion audit, replacing new-use recording-error removal according to the latest user decision.
- Make new History links reloadable and guard navigation away from dirty or uncertain clinical work.
- Preserve existing records, revisions, Spanish labels, Evoluciones, archived plan evidence and author/ownership rules.

## Change Profile

- Profile: runtime-change.
- This request creates specification artifacts only. The planned implementation changes UI, adds read/delete APIs and supporting schema/indexes; fail-first contract coverage is required.

## Capabilities

### New Capabilities

- `patient-dental-history`: owned, date-based reconstruction of condition/procedure/deletion revisions and read-only History.
- `patient-dental-record-deletion`: confirmed deletion from current chart/list with a durable deletion receipt and retained history.

### Modified Capabilities

- `dental-diagnosis-workspace`: temporal navigation, summary, notes and motion; replace error-based undo with confirmed deletion and retain legacy audit compatibility.
- `odontogram-human-workflow`: retire new recording-error commands; support deleted/current reads, conflict recovery and historical correction receipt replay.
- `patient-dental-treatments`: explicit deletion for eligible observed procedures with related notes and performed/plan evidence preserved.

## Out Of Scope

- Treatment plan authoring, plan state transitions, Appointments, recalls, billing and prices.
- New attachment storage/upload UI, an encounter/consultation entity or deletion of a whole consultation.
- Physical purge of clinical/audit data, restoration of a completed deletion, changing direct-application semantics, new planned-procedure creation or new clinical taxonomies.
- Replacing Evoluciones, changing clinical approval/LLM/Drive behavior, cloning licensed source artwork, global theme redesign or new UI/state/date libraries.

## Impact

Extend PatientDetail/Diagnosis, add historical reads and explicit delete commands, typed clients, deletion markers and revision actions. Update current reads, identity uniqueness, Activity, linked-note access and write guards. Retire new correction mutations with 410 while preserving exact committed receipt replay and historical IDs. See deletion-design.md for schema, concurrency, UI and rollback implications.

## Ownership and Test Seam

- Highest existing Seam: authenticated PatientDetail clinical navigation and existing patient-scoped dental APIs.
- Owning Module: patient dental workspace; historical projection gets a dedicated read owner rather than extending the large mutable diagnosis component.
- Interface: existing current-record commands; new confirmed delete commands and paginated history/snapshot reads; explicit inspection-only chart callbacks.
- Highest test Seam: HTTP tests across the registered FastAPI app and routed PatientDetail browser/component journeys. Real Postgres proves snapshot selection and indexes.
- Adapter: typed `api.ts`, asyncpg repository and reused chart/presentation adapters.
- Depth / Leverage / Locality: temporal selection and ownership stay behind a small read interface; the same chart and registry render current and historical evidence.

## Prior Art and First Proof

- Prior art: `PatientDetail.test.tsx`, `PatientDiagnosis.test.tsx`, `PatientDiagnosis.catalog.test.tsx`, `PatientDiagnosis.exits.test.tsx`, `PatientOdontogram.test.tsx`, `test_patient_conditions_contract.py`, `test_patient_treatments.py`, `test_patient_dental_notes.py`, `patient-diagnosis.spec.ts` and `diagnosis-detail.spec.ts`.
- First failing API proof: request an owned patient's as-of chart with a later correction present; expect the prior snapshot, while a second owner's request remains 404. No aggregate temporal endpoint exists today.
- First failing UI proof: open `?tab=clinical&clinical=history&at=2026-10-03` and expect Historial, date-consistent read-only inspection and no write controls/requests. Current routing falls back to diagnosis.
- Deletion first proof: saved Caries opens Eliminar, cancellation retains local edits, confirmation removes only the saved UUID and records one deleted revision without entered_in_error.
- Diagnosis first proof: the grouped summary accordion and per-record note access preserve draft identity and truthful totals across partial reads and dentition/status filters.

## Verification Policy

Contract tests precede each changed behavior. Mocked browser checks prove UI only; the disposable real-DB journey proves persistence and historical reconstruction. Reference writes were not verified in the source audit and are not claimed as parity evidence. Run the repository's full validation suite before any future commit or release.

## Execution Order Decision

- Required: yes, six implementation slices with shared routing, chart and modal dependencies.
- Deletion-compatible persistence precedes history projection and deletion UI. History reads precede History UI; Diagnosis summary is independent of those reads. Overlay integration follows both readers and the deletion journey.

## Notes

- Input: self-contained recovered source text in reference/ and fresh audit/evidence/ captures. Previous binary screenshots were unavailable; they are not counted as fresh proof.
- Existing authority: PRODUCT.md, DESIGN.md, patient-workspace brief and current dental specs. This is functional integration, not a literal copy of reference bugs or unsupported product domains.
- Scope decisions follow existing contracts: retain 12 findings/63 procedure variants rather than reduce to the reference's 72 observed cards; replace new recording-error removal with explicit deletion while retaining legacy audit evidence and retired-plan policies; history is knowledge recorded by a date, not a clinical effective-date assertion.
- The latest user instruction explicitly changes removal semantics to Eliminar; historical deletion audit is retained without labelling the clinical record an error. No deletion is executed in this documentation audit. Any later request for recalls, attachments, whole-mouth encounter records or plan authoring reopens scope before tasks change.
- The active `refine-clinical-assistant-ux` change can touch PatientDetail and shared design files. Reconcile its relevant edits at task 0.2; do not normalize or execute that change here.
- No tracker issues, implementation SDLC map, external publication or implementation delegation are part of this request.
