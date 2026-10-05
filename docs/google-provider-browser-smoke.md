# Google Provider Browser Smoke

Task 6.3 evidence. Captured 2026-09-11 against the Docker-served app at
`http://localhost:8000` with Playwright Chromium. No Google account, real ID
token, Drive file, or clinical data was used.

## Observed Origins

The browser observed these origins across the parent document and provider
frames while loading the official GIS button and raw PickerBuilder:

- `https://accounts.google.com/gsi/client` — GIS JavaScript
- `https://accounts.google.com/gsi/style` — GIS stylesheet
- `https://accounts.google.com/gsi/button` — rendered GIS button frame
- `https://ssl.gstatic.com` — nested GIS button assets; not required in the parent CSP
- `https://apis.google.com/js/api.js` — Google API loader
- `https://apis.google.com/_/scs/` — Picker loader chunks
- `https://docs.google.com/picker` — Picker frame
- `https://fonts.googleapis.com` — existing font stylesheet
- `https://fonts.gstatic.com` — existing font files

The parent CSP allowlist contains only the parent-required origins. Nested GIS
and Picker documents retain their own provider response policies, so observing
`ssl.gstatic.com` does not require adding a broad Google source to the parent
document.

Picker was opened with synthetic app, key, and access-token values. Google
returned provider `403` responses for unregistered localhost and synthetic
credentials; the frames still proved required navigation origins and CSP
behavior. This is expected and is not OAuth acceptance evidence.

## Browser Policy

FastAPI serves exact parent-document CSP sources plus
`Cross-Origin-Opener-Policy: same-origin-allow-popups`. The CSP has no wildcard
source or `unsafe-eval`; script inline execution remains blocked. GIS injects an
inline style element, so the narrower `style-src-elem 'unsafe-inline'` directive
is scoped to style elements; React dynamic style attributes use the separate
`style-src-attr 'unsafe-inline'` directive. Google-hosted iframe subresources
use their own response policies.

GIS initialization uses official popup callback with `ux_mode=popup`,
`auto_select=false`, `use_fedcm_for_button=false`, and
`button_auto_select=false`. One Tap `prompt()` and `login_uri` are absent.

## Reproduction

```powershell
just dev-up-build
docker run --rm --network host --mount "type=bind,source=$PWD,target=/workspace" --workdir /workspace/app/frontend --env E2E_PROVIDER_SMOKE=1 mcr.microsoft.com/playwright:v1.62.1-noble npx playwright test --config playwright.config.ts --project=provider-smoke
```

Smoke covers default Chromium plus a second Chromium launched with
`--disable-features=FedCm`. It checks response headers, non-blank GIS/Picker
frames, synthetic same-origin credential callback request shape, required
provider origins, and absence of CSP console violations.

## Sources

- https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid
- https://developers.google.com/identity/gsi/web/reference/js-reference
- https://developers.google.com/workspace/drive/picker/guides/web-picker
- https://developers.google.com/identity/gsi/web/guides/fedcm-migration
