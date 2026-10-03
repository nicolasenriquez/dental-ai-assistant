# Local Docker Compose project.
# Keep production Compose configuration unchanged; local override publishes
# app-blue on localhost:8000 and enables demo seed data.

set shell := ["sh", "-cu"]
set windows-shell := ["powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-Command"]
set dotenv-load := true

compose := "docker compose --project-directory deploy --env-file .env -f deploy/docker-compose.yml -f deploy/docker-compose.local.yml"
e2e_compose := "docker compose -p ai-tutor-e2e --project-directory deploy --env-file .env -f deploy/docker-compose.e2e.yml"
local_services := "postgres app-blue"
voice_services := "postgres app-blue whisper"
e2e_image := "mcr.microsoft.com/playwright:v1.62.1-noble"
repo_dir := justfile_directory()

# Default runtime is Docker. Bare `just` == first-run Docker boot.
default:
    just dev-up-build

# Start local services without forcing an image rebuild.
[unix]
dev-up:
    unset OPENROUTER_API_KEY; {{compose}} up -d {{local_services}}

[windows]
dev-up:
    Remove-Item Env:OPENROUTER_API_KEY -ErrorAction SilentlyContinue; {{compose}} up -d {{local_services}}

# Rebuild the application image, then start local services.
[unix]
dev-up-build:
    unset OPENROUTER_API_KEY; {{compose}} up -d --build {{local_services}}

[windows]
dev-up-build:
    Remove-Item Env:OPENROUTER_API_KEY -ErrorAction SilentlyContinue; {{compose}} up -d --build {{local_services}}

[unix]
dev-up-voice:
    unset OPENROUTER_API_KEY; {{compose}} --profile voice up -d --build {{voice_services}}

[windows]
dev-up-voice:
    Remove-Item Env:OPENROUTER_API_KEY -ErrorAction SilentlyContinue; {{compose}} --profile voice up -d --build {{voice_services}}

# Stop local services and preserve named volumes.
dev-down:
    {{compose}} --profile voice down --remove-orphans

# Helpers for Docker-default loop.
dev-logs:
    {{compose}} logs -f app-blue postgres

dev-ps:
    {{compose}} ps

# Run the authenticated UI baseline against local app-blue only.
# E2E_USER and E2E_PASSWORD are loaded from the local, gitignored .env file.
e2e-baseline:
    docker run --rm --network host --mount "type=bind,source={{repo_dir}},target=/workspace" --workdir /workspace/app/frontend --env E2E_USER --env E2E_PASSWORD {{e2e_image}} npx playwright test --config playwright.config.ts --project=baseline

# Regenerate local visual/ARIA baselines after an intentional UI change.
e2e-baseline-update:
    docker run --rm --network host --mount "type=bind,source={{repo_dir}},target=/workspace" --workdir /workspace/app/frontend --env E2E_USER --env E2E_PASSWORD {{e2e_image}} npx playwright test --config playwright.config.ts --project=baseline --update-snapshots

# Separate Compose project, database, and port; root .env's Google mode stays untouched.
e2e-local-up:
    {{e2e_compose}} up -d --build --wait

# Removes only the isolated E2E database. Does not affect the local app stack.
e2e-local-down:
    {{e2e_compose}} down --volumes

e2e-local-ps:
    {{e2e_compose}} ps

# Bootstrap E2E_USER in the isolated database, then run real local login + UI baseline.
e2e-local-login:
    docker run --rm --network host --mount "type=bind,source={{repo_dir}},target=/workspace" --workdir /workspace/app/frontend --env E2E_USER --env E2E_PASSWORD --env E2E_BASE_URL=http://localhost:8001 --env E2E_BOOTSTRAP_USER=1 {{e2e_image}} npx playwright test --config playwright.config.ts --project=setup

# Run full visual/ARIA baseline; failures beyond setup are separate UI regressions.
e2e-local-baseline:
    docker run --rm --network host --mount "type=bind,source={{repo_dir}},target=/workspace" --workdir /workspace/app/frontend --env E2E_USER --env E2E_PASSWORD --env E2E_BASE_URL=http://localhost:8001 --env E2E_BOOTSTRAP_USER=1 {{e2e_image}} npx playwright test --config playwright.config.ts --project=baseline
