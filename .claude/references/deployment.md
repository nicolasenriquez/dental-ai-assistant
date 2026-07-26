# Reference: deployment & external-API testing

On-demand detail for work under `deploy/` or any change to an external-API integration (Supadata, OpenRouter,
anything with a secret). The always-on `CLAUDE.md` only names that these exist; this is the how. Read it before
touching the compose stack or adding a networked integration.

**Ships as.** Docker Compose to a Digital Ocean VPS, fronted by Caddy at `chat.dynamous.ai`. The stack lives in
`deploy/` (`deploy/README.md` is the first-time-setup runbook). The real `.env` lives only on the production host
(root-owned, mode 600) and is never committed.

**Services (`deploy/docker-compose.yml`).**

| Service | Image | Purpose |
|---|---|---|
| Caddy | `caddy:2.8-alpine` | TLS termination + reverse proxy; auto-provisions Let's Encrypt |
| Postgres | `pgvector/pgvector:pg16` | Primary database (loopback-only, no public exposure) |
| App (blue/green) | app `Dockerfile` | FastAPI backend + frontend static bundle |

**Caddy routing.** `/api/*` → backend; everything else → frontend static assets.

**Blue/green redeploy.** Deploy is pull-based: a systemd timer on the VPS pulls `main`, builds the **inactive**
color, polls its `HEALTHCHECK`, and only flips Caddy's upstream once the new color is healthy — so production never
502s during a deploy. Any change to `deploy/` must preserve this: both `app-blue` and `app-green` defined
identically except `container_name`, each with a real `HEALTHCHECK`, neither publishing a host port,
`deploy/upstream.conf` as the single source of which color is live.

**YouTube ingestion (Supadata).** Production transcript fetching uses **Supadata** (`SUPADATA_API_KEY`), not
`youtube-transcript-api` — Digital Ocean IPs are blocked by YouTube's scraping defenses. Client rules:
1. Always pass the `lang` parameter (Supadata 500s on non-English-only videos without it).
2. Back off on 429 — the free tier is generous but not infinite.
3. Read the key from `SUPADATA_API_KEY` in `config.py`; never inline it.

**Testing external APIs (Supadata, OpenRouter, anything with a secret).** Any PR that adds or modifies an
external-API integration ships with **mocked-boundary tests**, not live-key tests:
1. Record real responses once into `app/backend/tests/fixtures/<service>/<scenario>.json` and check the fixtures in.
2. In tests, use `httpx.MockTransport` / `respx` or `pytest` `monkeypatch` to short-circuit the HTTP client. Never
   hit the real API from a test.
3. Cover the happy path, a rate-limit (429), a transient 5xx, and service-specific quirks.
4. If a test needs a secret in `os.environ`, set a fake value in `conftest.py`.
