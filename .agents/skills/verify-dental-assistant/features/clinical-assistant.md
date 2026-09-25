# Clinical assistant

## Sub-features

Patient selection, clinical composer, streaming response, evolution draft review; Google Drive workspace has its own [feature recipe](google-drive.md).

## How to get to it (user POV)

After sign-in, open `/assistant` (existing thread URLs use `/a/:threadId`). Select a synthetic patient if task needs context.

## Driving it with Playwright CLI

Snapshot initial screen and patient selector; select synthetic patient, then verify selection survives navigation/reload. For an isolated account with model configured, fill `Nota clínica` and click `Enviar mensaje`; capture the submitted text in redacted form, visible response, and hydrated thread after reload. To verify approval or Drive side effects, additionally confirm saved evolution or Drive state through their normal UI. Use screenshot and before/after snapshots.

## Gotchas

Clinical input may contain identifiers; never retain real patient text in evidence. `clinical-assistant.spec.ts` intercepts internal thread and Drive APIs, so its browser proof is fixture-backed. In `AUTH_MODE=local`, non-Drive clinical flows can work but Drive access is unavailable. Use [Google Drive](google-drive.md) only when verifying real Google-mode provider behavior; a skipped provider path is not a passing integration test.
