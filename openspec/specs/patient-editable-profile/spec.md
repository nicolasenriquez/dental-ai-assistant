# Patient Editable Profile

## Purpose

Allow authenticated owners to update patient demographic data while preserving identity and clinical history.

## Requirements

### Requirement: Edit owned patient

The system SHALL allow an authenticated owner to update a patient's basic data without changing the patient identifier or clinical evolutions.

#### Scenario: Update names and birth date

- **WHEN** the owner submits valid names and an optional birth date to `PATCH /api/patients/{patient_id}`
- **THEN** the system updates the patient, refreshes `updated_at`, and returns the same patient identifier with a masked RUT

#### Scenario: Preserve the RUT when omitted

- **WHEN** the owner submits an update without `rut` or with `rut: null`
- **THEN** the system keeps the stored RUT unchanged

#### Scenario: Change a valid RUT

- **WHEN** the owner submits a valid Chilean RUT
- **THEN** the system normalizes and validates it with módulo 11, stores its components, and returns only the new masked RUT

#### Scenario: Reject invalid or duplicate RUT

- **WHEN** the submitted RUT is invalid or already belongs to another patient of the same owner
- **THEN** the system returns `422` or `409` without changing the patient

#### Scenario: Hide another owner's patient

- **WHEN** an authenticated user submits an update for a patient owned by another user
- **THEN** the system returns `404` without changing any record

#### Scenario: Preserve clinical context after editing

- **WHEN** the professional saves demographic changes from the patient ficha
- **THEN** the UI closes the modal, updates the patient identity, preserves the current route and selected evolution, and shows a success confirmation

#### Scenario: Protect the current RUT in the edit form

- **WHEN** the professional opens the edit form
- **THEN** the current RUT is shown masked and the full RUT input appears only after choosing `Cambiar RUT`
