# Sign-in and signup

## Sub-features

Local password login, signup navigation, protected-route redirect. Google login is separate provider integration.

## How to get to it (user POV)

Run `just e2e-local-up` and open `http://localhost:8001/login`. Select `Regístrate` to visit `/signup`; use `Iniciar sesión` to return. Authenticated users land on `/patients`.

## Driving it with Playwright CLI

Confirm `/api/auth/config` on port 8001 reports `mode: local`. Start a fresh named session at `/login`. Save before snapshot; confirm heading `Iniciar sesión`. Click link `Regístrate`, confirm URL ends in `/signup` and heading `Crear cuenta`; save after snapshot and screenshot. Click link `Iniciar sesión` to confirm round trip. For real login, run `just e2e-local-login`: setup checks existing E2E credentials or signs up the dedicated account in isolated Postgres, then signs in through the real form and confirms `/patients` plus heading `Pacientes`. Never capture filled password or session state in proof. Verify protected redirect from a fresh unauthenticated session if relevant. If an existing shared instance instead reports `mode: google`, verify only public behavior: snapshot `/login`, navigate unauthenticated to `/patients`, and capture redirect back to `/login`; label result public-only and leave existing instance untouched.

## Gotchas

`AUTH_MODE=google` replaces local controls with Google sign-in; do not report password login as tested in that mode. `AUTH_MODE=local` supports E2E password login and non-Drive flows, but cannot prove Drive access. Real signup writes an account and triggers abuse limits; navigation alone is safe on shared database. Existing Playwright `auth.setup.ts` uses `E2E_USER`/`E2E_PASSWORD`; mocked `/api/auth/me` flows cannot prove login.
