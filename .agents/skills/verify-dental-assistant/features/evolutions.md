# Dental evolutions

## Sub-features

New evolution, date/note validation, draft generation/review, approval confirmation, saved evolution detail, and unsaved-exit confirmation.

## How to get to it (user POV)

From `/patients/:patientId`, choose `+ Nueva evolución` in the page header to visit `/patients/:patientId/evolutions/new`; saved entries appear on patient detail. The empty-history state can offer another link with the same name, so scope an exact-role locator to `main header`.

## Driving it with Playwright CLI

On a disposable synthetic patient, confirm heading `Nueva evolución dental` and that `Generar borrador con IA` starts disabled. Enter a synthetic clinical note, generate a draft, and review proposed fields. `Guardar evolución` opens `Confirmar evolución`; only `Confirmar y guardar` persists it. Reload patient detail and open the saved evolution; capture before, review, confirmation, and persisted final state.

Generation requires `CLINICAL_EXTERNAL_LLM_ENABLED=true` and a configured provider. The standard isolated port-8001 Compose runtime forces this flag to false. There, verify navigation, note entry, and the generation failure with retained note; review/save controls remain unreachable until generation succeeds. Leave a dirty form through `Salir sin guardar`. Do not enable generation on a shared instance as part of verification.

## Gotchas

Saving is a clinical persistence boundary. `app-baseline.spec.ts` mocks patient/evolution API routes; screenshots there do not prove approval, Postgres write, or Drive export. Model and Drive behavior require explicit provider configuration.
