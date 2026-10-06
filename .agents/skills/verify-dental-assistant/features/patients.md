# Patients

## Sub-features

Patient list/search, patient detail, creation/editing, duplicate recovery, unsaved-dialog confirmation, owner scoping, and masked RUT. Patient detail also provides evolution history, pending work, and the contextual [assistant](clinical-assistant.md).

## How to get to it (user POV)

Sign in; landing page is `/patients`. Select patient to open `/patients/:patientId`.

## Driving it with Playwright CLI

After real sign-in, confirm heading `Pacientes`. Search with `Buscar por nombre o RUT`, prove matching results and an impossible-query empty state, then clear the search. Open a synthetic patient from the list and observe detail plus URL. To prove creation, use a disposable account and synthetic identity: open `+ Nuevo paciente`, fill `Nombres`, `Apellidos`, and `RUT`; birth date is optional and uses `dd/mm/aaaa`. Submit `Crear paciente` and confirm navigation directly to the new detail. Use `Editar paciente`, change a synthetic field, and submit `Guardar cambios`; reload to prove persistence. Return through `‹ Pacientes` and find the updated entry. Capture before/action/result without raw RUT.

Duplicate creation offers `Este paciente ya existe` and `Abrir paciente`; changing a dialog and cancelling requires discard confirmation. Owner scoping needs a second account attempting the same detail URL and receiving an unavailable/404 result. A single-account screenshot cannot prove isolation.

## Conditions: correction, actors, views and navigation

In Clínica/Diagnóstico: `Corregir registro` is separate from `Resolver condición`. Prove
the correction flow on a synthetic owned record: required reason, optional
`Crear registro de reemplazo`, review dialog naming masked patient/original/consequence,
and `Guardar corrección` as the only write; canceling writes nothing (reload proves it).
The original becomes Registrada por error; history keeps the reason, actor and exact
original/replacement links. Persisted actor labels show the saved actor's display_name
or `Usuario <uuid>` with full-UUID disclosure — never email/RUT/`Autor no disponible`.
Current/history filters are Actuales (default), Todas, Resueltas, Registradas por error.

Conflict proof (two tabs or two accounts on one owner): disjoint-field and same-field
edits show base/local/current comparison with per-field `Mantener/Usar` choices, no
generic rebase; a terminal (resolved/entered_in_error) current blocks edit with
read/discard only; failed current reads block save and retry GET only.

Navigation proof: bare `/patients/:id` → Clínica writes `?tab=clinical&clinical=diagnosis`
and reload restores diagnosis; subview buttons write canonical `clinical=` values and
Evoluciones drops the condition focus; back/forward restore committed URLs; a dirty
draft blocks tab/subview/directory navigation (cancel keeps URL/draft, discard
navigates without writing). Inspect every URL for absence of clinical text, name or RUT.
Unknown enums default to Resumen/diagnosis; a malformed condition UUID never fetches.

## Gotchas

Creation persists sensitive data; there is no patient-delete API. Use an exclusively owned disposable E2E database for create/edit proof. On a pre-existing instance, restrict checks to list/search, detail, and clean dialog cancellation. Existing `app-baseline.spec.ts` stubs `/api/patients`, so its proof is mocked browser only.
