## 1. Contract

- [x] 1.1 Add the authenticated `PATCH /api/patients/{patient_id}` contract, owner isolation, optional RUT semantics, duplicate handling, and masked response assertions.
  Traceability: Requirement `Edit owned patient`; proves authentication, ownership, validation, privacy, and preservation semantics.
  Notes: Added route authentication coverage, update request field coverage, owner-scoped repository contract, `COALESCE` RUT preservation, and timestamp assertions in `app/backend/tests/test_patients_contract.py`.

## 2. Implementation

- [x] 2.1 Implement the owner-scoped repository update and FastAPI route without changing the migration or clinical evolution routes.
  Traceability: Requirement `Edit owned patient`; covers `PATCH`, `404`, `409`, `422`, `updated_at`, and unchanged evolution ownership.
  Notes: Added `update_patient` in `app/backend/db/patients_repo.py`, `UpdatePatientRequest` and the `PATCH` route in `app/backend/routes/patients.py`.

- [x] 2.2 Extract the shared patient modal and wire edit actions into the patient detail page.
  Traceability: Requirement `Edit owned patient`; covers modal reuse, masked RUT replacement, dirty-close confirmation, success feedback, and context preservation.
  Notes: Added `PatientFormModal`, replaced the creation modal in `Patients`, and added `Editar paciente` plus update feedback in `PatientDetail`.

## 3. Verification

- [x] 3.1 Add frontend interaction coverage and run focused backend, TypeScript, and lint validation.
  Traceability: Requirement `Edit owned patient`; covers precarga, save, preserved route, masked RUT, and dirty-form close.
  Notes: Added edit, masked-RUT replacement, and dirty-close coverage to `PatientDetail.test.tsx`; focused Node-container runs pass for the patient flows, TypeScript and lint pass. The remaining `PatientDetail` age assertion and other full-suite failures are pre-existing and outside this change.
