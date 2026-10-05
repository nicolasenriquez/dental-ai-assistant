# Google Drive Release Evidence

Status: local-only milestone complete; production release deferred.

Captured: 2026-09-11.

No real Google account, ID token, refresh token, Drive file, or clinical data was used.

## Repository And Docker Proof

| Gate | Status | Evidence |
|---|---|---|
| Docker runtime | PASS | `just dev-up-build`; `app-blue` and Postgres healthy; `/api/health` returned `status=ok`. |
| Production-safe defaults | PASS | `deploy/.env.example` sets `AUTH_MODE=local`, `GOOGLE_DRIVE_ENABLED=false`, and `GOOGLE_DRIVE_AUTO_ONBOARD=false`. Compose defaults preserve those values. |
| Production origin contract | DEFINED | Origin `https://chat.dynamous.ai`; callback `https://chat.dynamous.ai/api/google-drive/oauth/callback`; return target `https://chat.dynamous.ai/assistant`. Values are fixed by deployment configuration, not browser input. |
| GIS and Picker browser policy | PASS, synthetic only | Docker Playwright provider smoke passed `1/1` in default Chromium and Chromium with `--disable-features=FedCm`. CSP, COOP, official GIS callback, Picker frames, and observed origins passed. |
| Authentication and Drive browser bootstrap | PASS, mocked providers | Docker Playwright bootstrap passed `9/9`, including returning connection, consent denial, account mismatch, provider failure, explicit reconnect, and local mode. |
| Auth, OAuth, managed-file, and security routes | PASS, mocked providers | Docker backend run passed `93` tests. |
| Config, AES-GCM keyring, OAuth adapter, and text export | PASS, mocked providers | Docker backend run passed `43` tests. |
| Same-account, mismatch, denial, revoke, reconnect, recovery | PASS, automated boundary | Covered by `test_google_drive_oauth_routes.py` and `test_google_drive_managed_routes.py`; no real Google grant was used. |
| Encryption lifecycle | PASS in code/tests; operational proof pending | AES-GCM purpose separation, key versions, lazy rotation, and plaintext absence are covered by `test_drive_token_cipher.py`. Production key custody and rotation drill still require operator evidence. |

Evidence command for provider smoke:

```powershell
docker run --rm --network host --mount "type=bind,source=$PWD,target=/workspace" --workdir /workspace/app/frontend --env E2E_PROVIDER_SMOKE=1 mcr.microsoft.com/playwright:v1.62.1-noble npx playwright test --config playwright.config.ts --project=provider-smoke
```

Evidence command for mocked Drive bootstrap:

```powershell
docker run --rm --network host --mount "type=bind,source=$PWD,target=/workspace" --workdir /workspace/app/frontend --env E2E_BASE_URL=http://localhost:8000 mcr.microsoft.com/playwright:v1.62.1-noble npx playwright test --config playwright.config.ts --project=drive-bootstrap
```

The provider smoke intentionally uses synthetic credentials. Google returned expected `403` responses for unregistered localhost/synthetic credentials. This proves browser policy and request shape, not OAuth acceptance.

## Deferred Production Gates

These gates are intentionally deferred because this milestone will not publish
Google authentication or Drive publicly. Complete them before production enablement:

- [ ] Separate test and production Google Cloud projects exist and are recorded.
- [ ] Production project owns `chat.dynamous.ai`; domain verification is complete.
- [ ] Public HTTPS homepage, privacy policy, and Google API Services Limited Use disclosures are live and linked in OAuth branding.
- [ ] OAuth application name, logo, support contact, authorized domain, and support email match Dental AI Assistant.
- [ ] Test project has explicit test users; production publishing/verification status is recorded.
- [ ] Authorized JavaScript origins and redirect URIs are exact for each project. No wildcard or unused origin remains.
- [ ] Drive API, Picker/API dependencies, and required OAuth configuration are enabled in each project.
- [ ] Picker API key is restricted to required web referrers and APIs. Production and test keys are separate.
- [ ] Test-user manual smoke completes Google sign-in, explicit Drive consent, same-account success, account mismatch, denial, revoke, reconnect, Picker import, update/conflict, and workspace recovery using synthetic files only.
- [ ] Production encryption key storage, backup, rotation, old-key retention, and revocation procedure are documented and exercised without exposing key material.
- [ ] Production host inspection confirms `AUTH_MODE=local`, Drive disabled, and auto-onboarding disabled until all gates above pass.

## Release Rule

Keep production `AUTH_MODE=local`, Google Drive disabled, and auto-onboarding disabled until every deferred gate is checked and reviewed. Keep test credentials, client secrets, refresh tokens, encryption keys, and screenshots containing them out of Git.

## References

- [Google Identity Services setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)
- [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)
- [OAuth application verification](https://support.google.com/cloud/answer/9110914)
- [Google Picker overview](https://developers.google.com/workspace/drive/picker/guides/overview)
- [`docs/google-provider-browser-smoke.md`](google-provider-browser-smoke.md)
- [`deploy/.env.example`](../deploy/.env.example)
