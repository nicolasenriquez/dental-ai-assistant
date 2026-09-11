---
name: setup-project-local
description: Sets up and starts the AI Tutor project locally — environment file, dependencies, database, migrations, and dev server. Use when standing up the project for the first time on a new machine or after a fresh clone.
---

# Initialize Project

Run from the repository root. Default runtime is Docker.

## Input

None required. Run from the repository root.

## Process

### 1. Create Environment File
```powershell
Copy-Item deploy\.env.example .env
```
Fill in `OPENROUTER_API_KEY`, `POSTGRES_*`, `JWT_SECRET`.

### 2. Boot Docker
```bash
just dev-up-build
```
Starts `postgres` + `app-blue` on `http://localhost:8000`. Migrations run automatically on startup.

### 3. Validate Setup

Check that everything is working:

```bash
curl -s http://localhost:8000/api/health
```

Should return a healthy response.

## Output

A running local AI Tutor instance.

### Access Points

- App + API: http://localhost:8000
- Health Check: http://localhost:8000/api/health
- Database: 127.0.0.1:5433 (loopback only, via compose `postgres`)

## Cleanup

To stop services:
```bash
just dev-down
```

## Notes

- Host-native `uv`/`bun` flows (`app/start.sh`, `start.bat`) only when Docker is unavailable.
- Host-side test/lint (`pytest`, `ruff`, `mypy`, `vitest`, `tsc`, `biome`) still run on the host.
