# Patients

## Sub-features

Patient list, patient detail, creation, owner scoping, masked RUT.

## How to get to it (user POV)

Sign in; landing page is `/patients`. Select patient to open `/patients/:patientId`.

## Driving it with Playwright CLI

After real sign-in, snapshot heading `Pacientes`, open a synthetic patient from list, and observe detail plus URL. To prove creation, use a disposable account and known synthetic identity: open button `+ Nuevo paciente`, fill `Nombres`, `Apellidos`, `RUT`, `Fecha de nacimiento`, submit `Crear paciente`, reload list and confirm new entry. Capture before/action/result and verify owner visibility; do not log raw RUT.

## Gotchas

Creation persists sensitive data. Existing `app-baseline.spec.ts` stubs `/api/patients`, so its dialog/screenshot proof is mocked browser only. Do not create records on a shared account without cleanup.
