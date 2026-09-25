# Dental evolutions

## Sub-features

New evolution, draft generation/review, approval, saved evolution detail.

## How to get to it (user POV)

From `/patients/:patientId`, choose `Nueva evolución` to visit `/patients/:patientId/evolutions/new`; saved entries appear on patient detail.

## Driving it with Playwright CLI

On a disposable synthetic patient, confirm heading `Nueva evolución dental`, enter synthetic clinical note, generate draft via `Generar borrador con IA`, review proposed fields, then explicitly approve with `Guardar evolución` only when allowed. Reload patient detail and open saved evolution; capture before, review, and persisted final state. If no isolated account/provider access, verify navigation and review controls only, marking scope accordingly.

## Gotchas

Saving is a clinical persistence boundary. `app-baseline.spec.ts` mocks patient/evolution API routes; screenshots there do not prove approval, Postgres write, or Drive export. Model and Drive behavior require explicit provider configuration.
