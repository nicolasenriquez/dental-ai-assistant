# Local Docker Compose project.
# Keep production Compose configuration unchanged; local overrides publish
# app-blue on localhost:8000 and enable demo seed data.

set shell := ["sh", "-cu"]
# `windows-shell` keeps this file compatible with just 1.50, installed in the
# current development environment. Newer just versions can use a [windows]
# platform-specific shell setting instead.
set windows-shell := ["powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-Command"]

compose := "docker compose --project-directory deploy --env-file deploy/.env -f deploy/docker-compose.yml -f deploy/docker-compose.local.yml"
local_services := "postgres app-blue"

# Start local services without forcing an image rebuild.
dev-up:
    {{compose}} up -d {{local_services}}

# Rebuild the application image, then start local services.
dev-up-build:
    {{compose}} up -d --build {{local_services}}

# Stop local services and preserve named volumes.
dev-down:
    {{compose}} down
