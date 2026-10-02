# Patients

## Sub-features

Patient list/search, patient detail, creation/editing, duplicate recovery, unsaved-dialog confirmation, owner scoping, and masked RUT. Patient detail also provides evolution history, pending work, and the contextual [assistant](clinical-assistant.md).

## How to get to it (user POV)

Sign in; landing page is `/patients`. Select patient to open `/patients/:patientId`.

## Driving it with Playwright CLI

After real sign-in, confirm heading `Pacientes`. Search with `Buscar por nombre o RUT`, prove matching results and an impossible-query empty state, then clear the search. Open a synthetic patient from the list and observe detail plus URL. To prove creation, use a disposable account and synthetic identity: open `+ Nuevo paciente`, fill `Nombres`, `Apellidos`, and `RUT`; birth date is optional and uses `dd/mm/aaaa`. Submit `Crear paciente` and confirm navigation directly to the new detail. Use `Editar paciente`, change a synthetic field, and submit `Guardar cambios`; reload to prove persistence. Return through `‹ Pacientes` and find the updated entry. Capture before/action/result without raw RUT.

Duplicate creation offers `Este paciente ya existe` and `Abrir paciente`; changing a dialog and cancelling requires discard confirmation. Owner scoping needs a second account attempting the same detail URL and receiving an unavailable/404 result. A single-account screenshot cannot prove isolation.

## Gotchas

Creation persists sensitive data; there is no patient-delete API. Use an exclusively owned disposable E2E database for create/edit proof. On a pre-existing instance, restrict checks to list/search, detail, and clean dialog cancellation. Existing `app-baseline.spec.ts` stubs `/api/patients`, so its proof is mocked browser only.
