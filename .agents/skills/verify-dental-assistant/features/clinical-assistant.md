# Clinical assistant

## Sub-features

Patient selection, clinical composer, streaming response, evolution draft review, explicit approval, and the contextual assistant opened from a patient or evolution. Google Drive workspace has its own [feature recipe](google-drive.md).

## How to get to it (user POV)

After sign-in, open `/assistant`, which acquires a thread and redirects to `/a/:threadId`. This can create a database record even before sending text. Select a synthetic patient if the task needs context. From patient detail, `Asistente` opens the contextual assistant beside the workspace on desktop; narrow screens navigate to the thread.

## Driving it with Playwright CLI

Snapshot initial screen and patient selector; select synthetic patient, then verify selection survives navigation/reload. For an isolated account with model configured, fill `Nota clínica` and click `Enviar mensaje`; capture the submitted text in redacted form, visible response, and hydrated thread after reload. To verify approval or Drive side effects, additionally confirm saved evolution or Drive state through their normal UI. Use screenshot and before/after snapshots.

On disposable patient context, also open `Preparar evolución` from `Resumen del paciente` and confirm composer prefill. Desktop shows `Asistente del paciente`; a tablet Sheet uses `Asistente clínico`; mobile navigates to `/a/:threadId`. Close with `Cerrar asistente` and confirm focus returns to the trigger. Reopen via `Asistente` and follow `Abrir asistente completo`. A conflicting context offers `Conservar el trabajo clínico`, `Abrir nuevo hilo`, or `Continuar conversación`; verify the chosen action preserves the intended patient/work.

In the clinical sidebar, open `Pendientes` and confirm region `Trabajo pendiente`. The empty state is `No hay trabajo pendiente`; populated items offer `Revisar`, `Continuar`, or `Reintentar` according to approval, recoverable draft, or Drive export failure. `Ver más pendientes` needs enough items. Patient summary exposes a count and `Continuar trabajo` when an item exists. Populated states require actual draft/approval/export prerequisites; an empty list proves only the empty path.

## Gotchas

Clinical input may contain identifiers; never retain real patient text in evidence. `clinical-assistant.spec.ts` and `clinical-workspace.spec.ts` intercept internal APIs, so their browser proof is fixture-backed. Successful generation requires `CLINICAL_EXTERNAL_LLM_ENABLED=true` plus provider configuration. The standard isolated port-8001 runtime forces generation off; a submitted turn should show `La asistencia clínica externa está deshabilitada.` and does not prove response/draft generation. In `AUTH_MODE=local`, Drive is unavailable. Use [Google Drive](google-drive.md) for Google-mode provider behavior.

Before opening `/assistant` or a contextual assistant, record existing thread IDs through the authenticated `/api/clinical-threads` read endpoint. Clean up only a thread whose creation response belongs to this run and whose ID was absent beforehand, using `DELETE /api/clinical-threads/:threadId`; corroborate with a subsequent 404. A reused thread belongs to the existing session: do not delete it, change its patient, or send text without an explicit cleanup plan.
