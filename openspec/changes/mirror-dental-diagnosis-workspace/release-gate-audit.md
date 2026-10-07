# Release-gate audit

Date: 2026-10-07. Tasks: 3.9, 4.1, 4.2. Sources: change `specs/**`, `tasks.md`,
`slice1..slice10-evidence.md`, `architecture-cleanup.md`, repository test suites.

This audit verifies coverage, retention and evidence. It performs **no spec sync and no
archive**; those remain behind explicit later workflow authorization (opsx stop contract).

## 1. Spec-to-code coverage

Requirement IDs come from `specs/**/spec.md`. Every group below has implementation code,
automated tests and recorded verification; per-slice commands and captures live in the
slice evidence files cited in `tasks.md`.

| Capability | Requirements | Implementation anchors | Verification evidence |
|---|---|---|---|
| `dental-diagnosis-workspace` | W1–W10 | `PatientDiagnosis.tsx`, `PatientOdontogram.tsx`, `ToothInspectionPopover.tsx`, `DentalConditionModal.tsx`, `DentalLegend.tsx`, `TreatmentRecordModal.tsx`, `TreatmentScopeModal.tsx`, `toothGeometry.ts`, `ToothDrawing.tsx`, `ToothClinicalLayers.tsx`, `useDentalWorkspace.ts` | Slice1 1.1/2.1/3.1; Slice7 1.7/2.7/3.7 (visual-parity-contract matrix); Slice10 2.10/3.11 zero-consumer audit; `PatientDiagnosis.test.tsx` (42), `PatientDiagnosis.treatments.test.tsx` (11), `PatientOdontogram.test.tsx`, `DentalPresentation.test.tsx`, `odontogramPresentation.test.ts` |
| `patient-dental-treatments` | T1–T5 | `routes/patient_treatments.py`, `patients/treatment_catalog.py`, `patients/treatments.py`, `patients/treatment_service.py`, `db/patient_treatments_repo.py`, migration0025, `lib/treatmentApi.ts` | Slice2 1.2/2.2/3.2; Slice3 1.3/2.3/3.3; Slice6 linked corrections 2.6/3.6; `test_patient_treatments.py`, `treatmentApi.test.ts` |
| `patient-clinical-treatment-plans` | P1–P6 | `routes/patient_treatment_plans.py`, `patients/clinical_plans.py`, `patients/clinical_plan_service.py`, `db/patient_clinical_plans_repo.py`, migrations0026–0027, `PatientClinicalPlans.tsx`, `ClinicalPlan*.tsx`, `lib/clinicalPlanApi.ts` | Slice4 1.4/2.4/3.4; Slice5 1.5/2.5/3.5; Slice6 1.6/2.6/3.6; `test_patient_clinical_plans.py`, `PatientClinicalPlans.test.tsx`, `clinicalPlanApi.test.ts` |
| `patient-dental-clinical-notes` | N1–N5 | `routes/patient_clinical_notes.py`, `patients/clinical_notes.py`, `db/patient_clinical_notes_repo.py`, migrations0027–0028, `DentalClinicalNotes.tsx`, `DentalNoteComposer.tsx`, `DentalNoteCard.tsx`, `PatientDentalNoteDetail.tsx`, `useDentalClinicalNotes.ts` | Slice9 1.9/2.9/3.10; Slice10 preservation 1.10/2.10/3.11; `test_patient_dental_notes.py` (5 real-Postgres proofs), `DentalClinicalNotes.test.tsx`, `useDentalClinicalNotes.test.ts` |
| `clinical-workspace-discovery` (modified) | 3 requirements | Diagnosis direct apply/context popovers (Slice1/2/7), Activity expansion (Slice8), chart-first composition with notes rail (Slice7/9); `routes/patient_activity.py`, `db/patient_activity_repo.py`, `patients/activity.py` | Slice7 1.7/2.7/3.7; Slice8 1.8/2.8/3.8; `test_patient_activity.py`, `PatientActivity.test.tsx`, `patient-clinical-journey.spec.ts`, `clinical-workspace.spec.ts` |

No requirement in the four new capabilities lacks an implementation anchor or a recorded
verification path. The modified discovery requirements are superseded only in the exact
areas listed in the delta; untouched discovery requirements remain covered by their
pre-existing tests.

## 2. Migration retention

| Revision | Change | Retention property |
|---|---|---|
| 0025 | Treatments, members, revisions, command receipts | Additive tables only |
| 0026 | Plan aggregates, items, sessions, plan revisions | Additive tables only |
| 0027 | Cancellation metadata, treatment-owned execution notes | Additive columns/tables; no rewrites |
| 0028 | Note contexts for diagnosis/plan, tooth binding | Widens existing note table: replaces one check constraint, relaxes `treatment_id` NOT NULL, adds nullable columns and new constraints; no table/column/data drop; `downgrade()` intentionally a no-op |

Verified: `uv run alembic heads` reports the single `0028` head; the 3.9 isolated-DB proof
upgraded a populated schema0024 database to0028 and read every pre-change snapshot
unchanged; archived pre-mirror source read the same snapshots against0028. All migration
files remain present in `app/backend/alembic/versions/`; no historical schema is removed.

## 3. Test and validation evidence

- Release gate 3.9 (2026-10-07): frontend `tsc`, Biome (251 files) and Vitest 794/794;
  backend ruff, format (233 files), mypy (233 files) and full pytest 966 passed / 167
  skipped / 0 failed. Isolated migration + rollback proof recorded in the 3.9 notes and
  `evidence/gate39-legacy.json`.
- Slice evidence: `slice1-evidence.md` … `slice10-evidence.md` record focused rendered,
  HTTP and real-Postgres suites plus browser runs on owned Docker targets; `slice10-evidence.md`
  holds the removal inventory, preserved IDs and rollback data hash.
- Browser suites present: `patient-diagnosis.spec.ts`, `patient-dental-notes.spec.ts`,
  `patient-plans.spec.ts`, `patient-activity.spec.ts`, `patient-clinical-journey.spec.ts`,
  `clinical-workspace.spec.ts`.
- Historical catalog byte-comparison failure is resolved at the repository level by
  `.gitattributes` LF rules for the generated catalog artifacts (Windows checkout artifact,
  not a clinical defect); the unrestricted suite now passes.

## 4. Predecessor sync ordering

`harden-odontogram-human-workflow` remains unarchived and modifies the same capability
`clinical-workspace-discovery` (requirement `Fixed tooth-condition identity and recurrence`).
This change modifies three other requirements of that file (`Manually editable tooth
diagnosis`, `Backed patient activity`, `Professional chart-first clinical composition`).

Resolved order for the later authorized sync:

1. Sync/archive `harden-odontogram-human-workflow` first, per its own
   `sync-archive-checklist.md`; its correction/conflict wording is the base canonical text.
2. Sync this change second: its MODIFIED delta carries wording compatible with the harden
   text (`Editing existing records SHALL retain explicit save and history-preserving
   correction`) and replaces the three requirements wholesale.
3. Archive this change only after its ADDED capabilities are synced and strict validation
   passes.

No requirement-level conflict exists between the two deltas, but applying the mirror delta
before the harden sync would leave the canonical correction wording stale; order matters,
not wording negotiation.

## 5. Sync/archive readiness

- `openspec validate mirror-dental-diagnosis-workspace --strict` passes.
- All implementation, verification and documentation tasks (0.x–3.11, 3.9, 4.1) are
  complete; this audit closes 4.2.
- Archive preconditions not met by design: explicit later workflow authorization is still
  required for both spec sync and archive, and the predecessor ordering above must be
  executed first. Neither action was performed here.

## 6. Retained limits

- Attachments/gallery, budgets, billing, appointments, messaging, AI-generated diagnoses
  or plans, and clinical-standard certification remain out of scope.
- Illustrations are independently authored, not pixel-identical to any licensed source.
- Real screen readers, device virtual keyboards, native browser zoom and reference clinical
  write UAT remain unclaimed; the harden UAT R7/R8/R9 acceptance record is untouched.
