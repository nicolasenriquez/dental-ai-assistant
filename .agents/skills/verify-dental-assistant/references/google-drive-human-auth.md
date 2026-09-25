# Headed Google + Drive verification handoff

Run only when the user requests real Drive verification and owns the Google account. Use `playwright-cli` on the desktop where they can see the headed Chrome window. Drive connection/consent persists in the existing app and may create an app-managed folder. Keep the existing Docker stack running; do not alter `.env`, deploy configuration, Google Cloud, or provider accounts as part of browser automation.

## Doctor — stop before asking user if a gate fails

1. From repo root: `just dev-ps`. Check `http://localhost:8000/api/health` and `http://localhost:8000/api/auth/config` with `Invoke-RestMethod` (Windows). Require `status: ok`, `mode: google`, `drive_enabled: true`, and a nonempty `google_client_id`. `drive_auto_onboard` determines whether consent starts automatically after login.
2. Confirm `http://localhost:8000` is an authorized JavaScript origin for that Google client ID. Confirm configured Drive redirect URI ends in `/api/google-drive/oauth/callback` on the same authorized app origin, and return URL points back to that app's `/assistant`. Google Cloud and `.env` own these settings; report mismatch, do not attempt to fix by manipulating a browser URL. The app's `/api/auth/config` cannot verify redirect configuration by itself.
3. Check `playwright-cli list`; choose a unique session name such as `verify-drive-20260925-1`. Open `playwright-cli -s=verify-drive-20260925-1 open http://localhost:8000/login --headed --browser=chrome`. Check that login displays Google button `Acceder con Google` and that browser console does **not** report `The given origin is not allowed for the given client ID`. If it does, stop and close only this session; ask user to authorize the origin in Google Cloud and retry after propagation. Do not collect full browser console, requests, traces, videos, or storage state as proof; OAuth callback URLs and tokens may appear there.

## Human handoff

Say: "Headed Chrome is open at http://localhost:8000/login. Please click Acceder con Google, finish Google sign-in and any Drive consent in that window, then tell me when you are back in Dental AI Assistant. Do not paste credentials or OAuth URLs here." **Wait** for explicit user confirmation; do not click Google login, fill provider forms, capture provider screens, or infer success from elapsed time. If Google login or consent is blocked, ask which visible error occurred and stop rather than bypassing it. If callback is still loading after confirmation, check state once more and report pending; never blindly repeat consent.

## Corroborate session and Drive

Use same named browser session. To check authentication without printing account identity:

```text
playwright-cli -s=verify-drive-20260925-1 run-code "async page => { const response = await page.request.get('http://localhost:8000/api/auth/me'); return { authenticated: response.ok() }; }"
```

If `authenticated` is false, stop. Otherwise check only sanitized Drive status:

```text
playwright-cli -s=verify-drive-20260925-1 run-code "async page => { const response = await page.request.get('http://localhost:8000/api/google-drive/status'); return { http_ok: response.ok(), status: response.ok() ? (await response.json()).status : 'unavailable' }; }"
```

Require `status: connected` before labeling provider connection verified. `disconnected`, `revoked`, `workspace_missing`, `workspace_recovery_pending`, and `unavailable` are distinct outcomes; report actual one. Do not repeat OAuth start or Drive actions to turn failure into success.

In the same session, use the current `/assistant` or `/a/:threadId` page if already there; otherwise navigate to `/assistant`. If the Drive workspace is already open, skip opening it again. Otherwise use observed button `Abrir Google Drive`: `playwright-cli -s=verify-drive-20260925-1 click "getByRole('button', { name: 'Abrir Google Drive' })"`. Wait for region `Espacio de documentos de Google Drive` and label `Conectado`; mounting and status fetch are asynchronous. Inspect `Notas`, `Documentos`, and `Diarios` by button name and confirm each selected section has `aria-pressed=true`. On close/reopen, wait for region visibility before checking `Conectado` again; immediate checks can report a false negative while it loads. Do not read file contents, select a patient, import a file, edit a document, or trigger export on a shared account.

For a stronger read-only provider proof (`drive-read`), keep `Notas` open and check the sources response in the same browser context, returning counts only:

```text
playwright-cli -s=verify-drive-20260925-1 run-code "async page => { const response = await page.request.get('http://localhost:8000/api/google-drive/sources'); if (!response.ok()) return { sources_http_ok: false, status: response.status() }; const body = await response.json(); return { sources_http_ok: true, file_count: Array.isArray(body.files) ? body.files.length : null }; }"
```

Treat a failure or an unexpected body as failed read proof even when connection UI says `Conectado`. Do not print filenames or response bodies; this GET does not modify Drive files.

## Evidence and cleanup

Use `.playwright-cli/verification/<run-id>/` for a short status-only report: selected origin, doctor result, human handoff confirmation, auth boolean, Drive status, UI section names, and any skipped path. Do not save broad snapshots/screenshots containing Google account identity, Drive file names, patient records, or callback query strings. For safe visual proof after `Conectado` is visible, capture only the status element:

```text
playwright-cli -s=verify-drive-20260925-1 screenshot "getByRole('region', { name: 'Espacio de documentos de Google Drive' }).getByText('Conectado', { exact: true })" --filename=.playwright-cli/verification/<run-id>/connected.png
```

Review the image for sensitive context before retaining it; otherwise record boolean assertions and why visual capture was skipped. A 200 response alone proves neither login in UI nor Drive listing; corroborate through the real workspace controls. Close only the named browser session after the user finishes; remove only auto-generated Playwright CLI page snapshots and console logs created by this run if they contain provider/account information (not the reviewed proof directory). Never disconnect/revoke their Drive connection or stop the shared app. Confirm proof file survives cleanup.
