---
name: verify-dental-assistant
description: Drives Dental AI Assistant through its real browser UI with Playwright CLI and records scoped evidence. Use for /verify-dental-assistant, "verify the app in browser", "prove the patient flow", "check the clinical UI end to end", or "verify Google Drive with manual login".
---

# Verify Dental AI Assistant

Use this skill for browser verification of the running React/FastAPI/Postgres app. Start with the [feature map](features/README.md); choose the feature affected by the change and report each exercised entry point. Use the existing Playwright specs in `app/frontend/tests/` for deterministic mocked-UI checks; label such checks **mocked browser**, never full-system proof. Load the `playwright-cli` skill for CLI syntax and session handling. Upstream design reference: [create-verification-skill](https://github.com/cursor/plugins/tree/main/pstack/skills/create-verification-skill).

## Launch

Choose runtime by boundary. For local password login, run `just e2e-local-up` from repo root. It builds a separate Compose project with its own Postgres volume on `http://localhost:8001`, forcing `AUTH_MODE=local` and disabling Drive without altering root `.env` or existing `localhost:8000` app. `just e2e-local-ps` shows ownership; `just e2e-local-login` uses `E2E_USER` and `E2E_PASSWORD` from the gitignored root `.env`, bootstraps that user in the isolated database, and verifies real sign-in. `just e2e-local-baseline` includes sign-in plus the full visual/ARIA suite. For Google Drive, use only an already configured Google-mode instance on `http://localhost:8000` and follow [headed human-auth handoff](references/google-drive-human-auth.md); never point local-mode E2E at Drive or reconfigure an existing instance. Never put credentials or browser storage state into evidence.

Wait for the selected instance's `/api/health` to return JSON with `status: "ok"` and `db_type: "postgres"`. Local E2E requires `/api/auth/config` with `mode: local`, `drive_enabled: false`; live Drive requires `mode: google`, `drive_enabled: true`. Docker builds a static frontend; run `just e2e-local-up` after source changes. For a shared Google-mode app, state that proof covers its running build; health does not prove its image matches checkout. Do not target a remote URL without the user's explicit target and consent.

## Doctor

Before driving, check `just e2e-local-ps` (local) or `just dev-ps` (shared), `/api/health`, `/api/auth/config`, and a fresh `/login` browser visit on the selected port. For Google-mode Drive, also confirm the Google button loads without "origin is not allowed" errors and the configured callback/return origins match the browser URL; the Google client ID alone cannot prove this. Stop and report mismatches before requesting human sign-in. A healthy endpoint alone does not establish frontend build freshness, valid credentials, or provider readiness.

## Drive

Use `playwright-cli -s=verify-dental-assistant-<run-id> open http://localhost:8001/login` with a **new** session name for local checks; keep later commands on that session. Read snapshots after navigation and use observed ARIA roles, labels, or test IDs; never coordinates or guessed refs. In local mode, click `Regístrate` to reach `/signup`, or run `just e2e-local-login` for credentialed sign-in to `/patients`. Never enter secrets as literal CLI arguments or save authenticated storage state in proof. For the optional Drive variant, read [headed human-auth handoff](references/google-drive-human-auth.md), open a separate ephemeral headed Chrome session, ask the user to sign in/consent, **wait for confirmation**, then drive [Google Drive feature](features/google-drive.md). Do not create a patient, send clinical text, invoke LLM, or save an evolution in a shared database without an isolated account and cleanup plan.

## Evidence

Create `.playwright-cli/verification/<run-id>/` before capture (ignored by git). Record feature ID, entry point, before/action/after observations, selected runtime and build provenance, and untested paths. Save scoped snapshots and screenshots with `playwright-cli -s=<session> snapshot --filename=<path>` and `screenshot --filename=<path>` when their content is safe. For mutations, verify persisted state through normal UI reload (and owner-scoped API if needed); never treat a fixture or screenshot alone as proof of persistence. Mark scope: **real public UI**, **real authenticated app**, **real provider**, or **mocked browser**. Never capture Google popup/consent pages, OAuth URLs, storage state, cookies, patient names, RUTs, or clinical content; keep only non-sensitive connection-state proof for live Drive. When safe screenshot impossible, record sanitized status assertions and reason screenshot skipped. Keep proof after teardown and report its location and what was actually observed; report skipped map entries explicitly.

## Cleanup

Close only browser session created for this run with `playwright-cli -s=<session> close`, after user confirms finished with any manual login. If this run owns the isolated E2E stack, use `just e2e-local-down` to stop it and remove only its dedicated database volume; check for other E2E users first. Never stop pre-existing app containers, delete shared Postgres volumes, disconnect a user's Drive connection, run `playwright-cli close-all`/`kill-all`, or remove evidence. Confirm evidence files still exist after browser cleanup. After failure, apply same cleanup before retry.

## Resources

- [features/README.md](features/README.md) — choose user-visible feature and proof scope.
- [features/sign-in.md](features/sign-in.md) — public auth navigation and live sign-in.
- [features/patients.md](features/patients.md) — patient list and owner-scoped detail.
- [features/evolutions.md](features/evolutions.md) — draft review and approved save.
- [features/clinical-assistant.md](features/clinical-assistant.md) — assistant and Drive boundaries.
- [features/library-chat.md](features/library-chat.md) — RAG chat and citation surface.
- [features/google-drive.md](features/google-drive.md) — opt-in, read-only Google Drive proof.
- [references/google-drive-human-auth.md](references/google-drive-human-auth.md) — headed Chrome, human authentication, status assertions, and provider-safe evidence; read before Drive verification.
