# Google sign-in and Drive connection

Verify Google login and read-only Drive availability through real provider boundaries, with the account owner handling sign-in and consent in a headed browser. Follow [human-auth handoff](../references/google-drive-human-auth.md) before starting.

## Sub-features

- `google-login`: user signs in through GIS popup and reaches authenticated app.
- `drive-connect`: user grants Drive `drive.file` consent when prompted; callback returns to app.
- `drive-open`: user opens Drive workspace and sees connected state.
- `drive-sections`: user opens `Notas`, `Documentos`, and `Diarios` without modifying provider data.
- `drive-read`: `Notas` loads through the real Drive read boundary without exposing document names in proof.

## How to get to it (user POV)

Open `http://localhost:8000/login` on an origin authorized for the configured Google client ID. Select `Acceder con Google`; if prompted, select `Conectar Drive` or `Conectar Google Drive` and approve provider consent. After return, open `/assistant` and select `Abrir Google Drive` in the header.

## Driving it with Playwright CLI

Preconditions: `just dev-ps` shows an already-running app; `/api/health` is healthy; `/api/auth/config` reports `mode: google`, `drive_enabled: true`; Google origin and Drive callback/return URL match this instance. Use a new, non-persistent `--headed --browser=chrome` session on port 8000. Ask the user to complete login and any consent in that window, **wait for their confirmation**, then check `/api/auth/me` and `/api/google-drive/status` read-only in that same browser context. Do not log returned account identity or tokens. If status is `connected`, navigate `/assistant`; click button `Abrir Google Drive`, confirm region `Espacio de documentos de Google Drive` and label `Conectado`. Click `Documentos`, `Diarios`, `Notas` in turn and confirm selected section via `aria-pressed`; record only section names, connected state and non-sensitive UI status. For `drive-read`, require a successful GET `/api/google-drive/sources` in the same authenticated context; record HTTP success and count only, never file names. Reopen workspace after closing it to confirm connection remains, without editing/importing files. Save only scoped, reviewed evidence; see handoff recipe for exact commands.

## Gotchas

- Google GIS uses a popup; Drive authorization navigates away and returns through `/api/google-drive/oauth/callback`. One browser session must own both; no cookie import or programmatic provider login.
- `drive_auto_onboard` may begin Drive consent immediately after sign-in. It can prepare a managed folder; account owner handles consent. Do not repeat consent or create/recreate workspace on failure.
- A successful Dental session with `ready-without-drive`, `disconnected`, `workspace_missing`, or `unavailable` is not connected proof. Report login and Drive outcomes separately.
- A connected banner or selected tab alone does not prove the provider read succeeded: check `drive-read` separately. Drive write, Picker import, and export require their own mapped action, observed side effect, and dedicated test data; never infer from `drive-connect`.
- Existing browser specs stub `/api/auth/me`, Drive status, or provider handoffs. Label those mocked browser checks, not live-provider proof.
