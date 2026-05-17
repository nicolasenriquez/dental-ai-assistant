# CLAUDE.md

Instructions for AI coding agents working in this repository. Read this before making any code changes. This file covers **how the code is written** — conventions, layout, and the invariants that must not regress.

---

## Project Overview

**The AI Tutor** (internally named **DynaChat**) is a RAG-powered chat interface that lets viewers query a creator's video catalog and get streaming answers with per-chunk citations that deep-link to the exact timestamp in the source video. Python + FastAPI backend, React + Vite + TypeScript frontend, Postgres + pgvector for storage and hybrid retrieval.

This codebase is the running project for the Dynamous Agentic Engineering Course. See `README.md` for a human-facing overview.

---

## Tech Stack

**Backend**
- Python 3.11+ (don't rely on 3.12+ features)
- `uv` for package management (not pip, not poetry) — `backend/pyproject.toml` is the dependency source of truth, `backend/uv.lock` pins exact versions
- FastAPI with `uvicorn[standard]` ASGI server
- `asyncpg` for async Postgres access (via connection pool from `db/postgres.py`)
- `alembic` for schema migrations
- `docling-core[chunking]` for transcript chunking (HybridChunker)
- `openai` SDK pointed at OpenRouter's OpenAI-compatible endpoint (embeddings + chat completions)
- `pgvector` for vector storage and cosine similarity
- `python-dotenv` for config loading

**Frontend**
- Bun (not npm, not pnpm — use `bun install`, `bun run dev`, `bun run build`)
- React 18.3, TypeScript 5.4, Vite 5.2
- `react-router-dom` v6 for routing
- `react-markdown` + `remark-gfm` for assistant message rendering
- `react-syntax-highlighter` for code blocks
- Tailwind CSS 3.4 (no component library — components are built from Tailwind primitives)
- Vanilla `fetch()` for API calls (no axios, no SDK) — typed wrappers in `src/lib/api.ts`

---

## Repo Layout

```
ai-tutor/
├── CLAUDE.md                # This file — code conventions
├── README.md                # Human-facing overview + quick start
├── app/
│   ├── start.sh             # POSIX bootstrap: uv sync → uvicorn + bun dev
│   ├── start.bat            # Windows equivalent
│   ├── backend/
│   │   ├── main.py          # FastAPI app factory, lifespan init, /api/health
│   │   ├── config.py        # All env var reads + hardcoded constants
│   │   ├── rate_limit.py    # 25 msg/user/24h cap (security invariant)
│   │   ├── signup_rate_limit.py  # Signup abuse guard
│   │   ├── pyproject.toml   # uv dependencies + tool config (ruff, mypy, pytest)
│   │   ├── uv.lock          # uv lockfile (committed, pinned versions)
│   │   ├── alembic/         # Migration env + versions/ (all schema changes)
│   │   ├── auth/            # Google OAuth + password + JWT token handling
│   │   ├── data/
│   │   │   └── seed.py      # Sample videos seeded on first startup
│   │   ├── db/
│   │   │   ├── postgres.py  # asyncpg connection pool
│   │   │   ├── repository.py        # ALL raw SQL for chat tables — nowhere else
│   │   │   ├── users_repo.py        # Auth user queries
│   │   │   ├── user_messages_repo.py # Rate-limit audit-table access
│   │   │   └── signup_attempts_repo.py # Signup rate-limit audit-table access
│   │   ├── ingest/
│   │   │   ├── youtube_url.py        # YouTube URL parsing/validation
│   │   │   └── dynamous.py          # Dynamous course transcript ingester
│   │   ├── integrations/
│   │   │   └── circle.py            # Circle community integration (gated content)
│   │   ├── llm/
│   │   │   └── openrouter.py        # stream_chat() async generator, SSE output
│   │   ├── rag/
│   │   │   ├── catalog.py           # In-process video catalog cache
│   │   │   ├── chunker.py           # Docling HybridChunker wrapper
│   │   │   ├── citations.py         # Citation assembly
│   │   │   ├── embeddings.py        # embed_text / embed_batch via OpenRouter
│   │   │   ├── expansion.py         # Query expansion
│   │   │   ├── retriever_hybrid.py  # RRF hybrid retrieval (tsvector + pgvector)
│   │   │   └── tools.py             # RAG tool definitions
│   │   ├── routes/
│   │   │   ├── admin.py             # Admin-only video library management
│   │   │   ├── auth.py              # Sign-in / sign-up / session
│   │   │   ├── channels.py          # POST /api/channels/sync, sync runs
│   │   │   ├── conversations.py     # GET/POST/DELETE /api/conversations*
│   │   │   ├── ingest.py            # POST /api/ingest
│   │   │   └── messages.py          # POST /api/conversations/{id}/messages (SSE)
│   │   ├── scripts/                 # eval_retrieval, sync_channel, migration tooling
│   │   ├── services/
│   │   │   ├── supadata.py          # Supadata API client (YouTube transcripts)
│   │   │   ├── video_ingest.py      # Video ingestion orchestration
│   │   │   └── youtube_meta.py      # YouTube metadata fetching
│   │   └── tests/                   # pytest suite (unit + integration)
│   └── frontend/
│       ├── package.json      # Bun dependencies + scripts
│       ├── vite.config.ts    # Dev server port, API proxy to backend
│       ├── tsconfig.json
│       ├── index.html
│       └── src/
│           ├── main.tsx      # React root
│           ├── App.tsx       # BrowserRouter + layout
│           ├── components/   # ChatArea, Sidebar, Message, MarkdownRenderer, etc.
│           ├── hooks/        # useConversations, useMessages, useStreamingResponse, useToast
│           ├── lib/
│           │   └── api.ts    # All typed fetch wrappers + TypeScript interfaces
│           ├── styles/
│           │   └── globals.css # Tailwind imports
│           └── __tests__/    # Vitest test files
├── deploy/                   # Docker Compose, Caddy, channel-sync systemd units
├── docs/                     # API reference
└── scripts/                  # Standalone tooling (transcript transcription)
```

**Placement rules** (where new files go):

- New API routes → new file in `app/backend/routes/`, one file per resource. Mount from `main.py`.
- New SQL queries → `app/backend/db/` (chat tables in `repository.py`; auth/audit tables in their dedicated `*_repo.py`). Never write SQL in route handlers, services, or components.
- New schema changes → a new Alembic migration in `app/backend/alembic/versions/`.
- New RAG pipeline steps → `app/backend/rag/`. Keep chunker, embeddings, and retriever as separate modules.
- New content sources → `app/backend/ingest/`, one module per source.
- New React components → `app/frontend/src/components/`, one component per file, named exports matching filename.
- New React hooks → `app/frontend/src/hooks/`, prefix with `use`.
- New API client functions → `app/frontend/src/lib/api.ts`. Keep all fetch calls in this one file.

---

## Running the App

Install and start everything (backend venv + deps, frontend deps, both dev servers):

```bash
cd app
./start.sh         # POSIX
start.bat          # Windows
```

Manual backend:

```bash
cd app/backend
uv sync --all-extras                   # creates backend/.venv, installs runtime + dev deps
cd ..
uv --project backend run uvicorn backend.main:app --reload --port 8000
```

Backend **must** be run from `app/` (not `app/backend/`) — the `backend.main:app` import path requires it. Running from the wrong cwd gives `ModuleNotFoundError: No module named 'backend'`. The `--project backend` flag tells uv to use `app/backend/.venv` while cwd is `app/`.

Manual frontend:

```bash
cd app/frontend
bun install
bun run dev           # dev server with HMR
bun run build         # production build → dist/
bun run preview       # serve built assets
```

The app requires a Postgres database (`DATABASE_URL`). Alembic migrations run automatically in the FastAPI lifespan handler on startup.

---

## Testing

The repo has an established test suite — a backend pytest suite under `app/backend/tests/` and a frontend Vitest suite. Add tests for every bug fix (a regression test) and every new feature.

**Python backend:**

```bash
cd app/backend
uv run pytest tests -xvs
```

All backend tool invocations run from `app/backend/` so that `pyproject.toml` (which holds ruff, mypy, pytest config) is picked up. Running the tools from `app/` with `--project backend` works for package resolution but mypy/pytest **do not** auto-discover config from a non-cwd project.

- Test directory: `app/backend/tests/`
- Use `pytest-asyncio` for async tests (`asyncio_mode = "auto"` is set, so plain `async def` test functions work)
- Use `httpx.AsyncClient` against a test FastAPI app for integration tests

**TypeScript frontend:**

```bash
cd app/frontend
bun run test
```

- Test directory: `app/frontend/src/__tests__/` or co-located `*.test.tsx` files
- Use Vitest (not Jest — Vite-native, faster)
- Mock `fetch` with `vi.stubGlobal('fetch', ...)` for hook tests

---

## Lint, Format, Type Check

**Backend tooling is configured in `app/backend/pyproject.toml`:** ruff (lint + format, line-length 100, target py311 — E/F/W/I/B/UP/SIM/RUF), mypy (lenient `strict = false`, `warn_return_any = true`, `ignore_missing_imports = true`), pytest (asyncio auto mode). All three are in the `dev` optional-dependency group, installed by `uv sync --all-extras`.

**Before every commit, the full validation suite:**

```bash
# Backend (from app/backend/)
cd app/backend
uv run ruff check .
uv run ruff format --check .
uv run mypy .
uv run pytest tests -xvs
cd ../..

# Frontend
cd app/frontend
bun run tsc --noEmit
bun x biome check src
bun run test
```

---

## Code Conventions

### Python (backend)

- **Async everywhere.** FastAPI routes are `async def`. Database calls use `asyncpg` via a connection pool. Any sync blocking call (file I/O, CPU work) in a route handler is a bug — use `asyncio.to_thread` or move it to a background task.
- **Imports:** stdlib first, third-party second, local third. Group with blank lines. No wildcard imports.
- **Type hints:** on every function signature and return type. Use `list[str]` / `dict[str, int]` syntax, not `List` / `Dict` from `typing`.
- **No `print()` in runtime code.** Use `logging` with a module-level logger: `logger = logging.getLogger(__name__)`. `print()` is acceptable in `data/seed.py` and one-off scripts.
- **Errors:** raise specific exceptions (`ValueError`, `KeyError`, custom) with clear messages. Never `except:` bare. Avoid `except Exception` except at the outermost request handler.
- **SQL:** all queries live in `db/`. Parameterize with `$1, $2, $3...` placeholders (asyncpg) — never use f-strings or `%` formatting to build SQL.
- **Config:** every environment variable is read exactly once in `config.py` and exposed as a module-level constant. Routes and services import the constant, never `os.environ` directly.
- **Pydantic models:** use `pydantic.BaseModel` for request/response schemas, defined in the route file that uses them (unless shared).

### TypeScript (frontend)

- **Function components only.** No class components. Named exports, one component per file. File name matches component name.
- **Hooks for state and effects.** Custom hooks live in `src/hooks/`, prefixed `use`, returning a typed object.
- **All API calls go through `src/lib/api.ts`.** Never `fetch()` inline in a component.
- **Types:** every function signature typed; no `any` except when bridging an untyped dependency with a clear comment. Prefer `interface` for object shapes, `type` for unions and aliases.
- **Imports:** relative paths within `src/` (no path aliases configured). External libraries first, then internal.
- **Styling:** Tailwind utility classes only. No inline `style={{...}}` except for dynamic values. No CSS modules, no styled-components.
- **Event handlers:** typed callbacks (`(e: React.ChangeEvent<HTMLInputElement>) => void`), not `any`.
- **State:** React built-ins (`useState`, `useReducer`, Context) only. Do not add Redux, Zustand, or Jotai.
- **SSE parsing:** all SSE consumption goes through `useStreamingResponse`. Do not parse SSE in components or new hooks.

---

## Database

Postgres via `asyncpg`. All tables (chat + auth) live in Postgres. Schema is managed by Alembic migrations. The connection pool is initialised in the FastAPI lifespan handler via `db/postgres.py:get_pg_pool()`. No ORM. No SQLite.

**Tables:** `users`, `user_messages`, `signup_attempts`, `videos`, `chunks` (FK → videos), `conversations`, `messages` (FK → conversations), `channel_sync_runs`, `channel_sync_videos` (FK → channel_sync_runs). Timestamps use `TIMESTAMPTZ`. TEXT primary keys for chat tables (compatible with client-side IDs); UUID primary keys for auth tables.

**Rules for database code:**
1. All SQL lives in `db/` — parameterised, no f-string interpolation.
2. Use `$1, $2, $3...` placeholders for asyncpg.
3. All schema changes go through a new Alembic migration. The app runs `alembic upgrade head` automatically on startup.
4. All timestamps stored as `TIMESTAMPTZ`.

---

## RAG Pipeline Invariants

These behaviors are part of the AI Tutor's contract and must not regress:

1. **Chunking** uses Docling `HybridChunker` with `max_tokens=512` (`HYBRID_CHUNKER_MAX_TOKENS` in `config.py`). Do not swap to recursive-character splitters or LangChain chunkers.
2. **Embeddings** come from OpenRouter's `openai/text-embedding-3-small` (1536-dim). Never call a different embedding model or provider. Never embed on the frontend.
3. **Retrieval** is hybrid: Reciprocal Rank Fusion (RRF) combining Postgres `tsvector` keyword search with `pgvector` cosine similarity, top-5 chunks. See `app/backend/rag/retriever_hybrid.py`.
4. **Chat completion** uses OpenRouter's Claude Sonnet via the `openai` SDK pointed at `https://openrouter.ai/api/v1`.
5. **Streaming format:** Server-Sent Events with JSON-encoded tokens. Each token is framed as `data: <json-string>\n\n`. The `sources` event is emitted as `event: sources\ndata: <json-array>\n\n` **before** the `data: [DONE]\n\n` terminator. The frontend parser in `useStreamingResponse.ts` depends on this format exactly.
6. **Citations** must include video title, video URL, exact-timestamp deep-link, and the quoted transcript snippet. The citation modal opens an embedded YouTube player at the timestamp.

---

## Environment Variables

All env var reads happen in `app/backend/config.py`. Add new variables there and import the constant elsewhere. See `deploy/.env.example` for the full template.

| Variable | Required | Purpose |
|---|---|---|
| `OPENROUTER_API_KEY` | **yes** | Authenticates embeddings and chat completions to OpenRouter |
| `DATABASE_URL` | **yes** | Postgres connection string. The app refuses to start if unset (no SQLite fallback). |
| `JWT_SECRET` | **yes** (auth) | 32+ random bytes used to sign session-cookie JWTs. Rotating it invalidates all live sessions. |
| `SUPADATA_API_KEY` | prod (YouTube ingestion) | Fetches YouTube transcripts via Supadata. Required for channel sync and manual ingestion. |
| `YOUTUBE_CHANNEL_ID` | prod (channel sync) | YouTube channel ID/handle to sync videos from. |
| `CHANNEL_SYNC_TYPE` | prod (channel sync) | Content type filter: `all`, `video`, `short`, `live`. Default: `video`. |
| `ADMIN_USER_EMAIL` | optional | Email of the single admin user (case-insensitive). When unset, every `/api/admin/*` endpoint returns 403. |
| `CORS_ORIGINS` | No (dev default) | Comma-separated allowed CORS origins. Defaults to localhost frontend ports. |
| `CATALOG_ENABLED` | No (default: `false`) | Injects a video-catalog block into the system prompt to enable prompt caching. |
| `CATALOG_TIER` | No (default: `standard`) | Cache tier: `standard` (~5-min) or `extended` (1-hour TTL). |

When adding configurability, add the constant to `config.py` with a sensible default. **Never commit `.env` files** — they are in `.gitignore`.

---

## Deployment

The AI Tutor ships via Docker Compose to a Digital Ocean VPS, fronted by Caddy at `chat.dynamous.ai`. The compose stack lives in `deploy/` (see `deploy/README.md` for the first-time-setup runbook). The real `.env` lives only on the production host (root-owned, mode 600) and is never committed.

### Services (`deploy/docker-compose.yml`)

| Service | Image | Purpose |
|---|---|---|
| Caddy | `caddy:2.8-alpine` | TLS termination + reverse proxy; auto-provisions Let's Encrypt |
| Postgres | `pgvector/pgvector:pg16` | Primary database (loopback-only, no public exposure) |
| App (blue/green) | app `Dockerfile` | FastAPI backend + frontend static bundle |

### Caddy routing

`/api/*` → backend; everything else → frontend static assets.

### Blue/green redeploy

Deploy is pull-based: a systemd timer on the VPS pulls `main`, builds the **inactive** color, polls its `HEALTHCHECK`, and only flips Caddy's upstream once the new color is healthy — so production never 502s during a deploy. Any change to `deploy/` must preserve this property: both `app-blue` and `app-green` defined identically except `container_name`, each with a real `HEALTHCHECK`, neither publishing a host port, `deploy/upstream.conf` as the single source of which color is live.

### YouTube ingestion (Supadata)

Production transcript fetching uses **Supadata** (`SUPADATA_API_KEY`), not `youtube-transcript-api` — Digital Ocean IPs are blocked by YouTube's scraping defenses. Supadata client rules:
1. Always pass the `lang` parameter (Supadata 500s on non-English-only videos without it).
2. Back off on 429 — the free tier is generous but not infinite.
3. Read the key from `SUPADATA_API_KEY` in `config.py`; never inline it.

### Testing external APIs (Supadata, OpenRouter, anything with a secret)

Any PR that adds or modifies an external-API integration must ship with **mocked-boundary tests**, not live-key tests:
1. Record real responses once into `app/backend/tests/fixtures/<service>/<scenario>.json` and check the fixtures into git.
2. In tests, use `httpx.MockTransport` / `respx` or `pytest` `monkeypatch` to short-circuit the HTTP client. Never hit the real API from a test.
3. Cover the happy path, a rate-limit (429), a transient 5xx, and service-specific quirks.
4. If a test needs a secret to exist in `os.environ`, set a fake value in `conftest.py`.

---

## Known Footguns

Existing quirks in the repo — fix them when an issue covers them, but don't depend on the broken behavior:

1. **Seed data uses synthesised YouTube IDs.** `data/seed.py` (enabled with `SEED_ENABLE=true`) seeds 10 mock videos with fake YouTube ids (`AgntBld001a`, etc.). Citation deep-links and the embedded-player modal will not resolve for seeded videos — seed data is for local dev only. Real data comes from `POST /api/channels/sync`.
2. **Runtime dependencies are unpinned in `pyproject.toml`** but pinned in `uv.lock`. Don't add upper bounds to `[project].dependencies` — the lockfile handles reproducibility.
3. **SSE tokens are JSON-encoded** (wrapped in quotes, escaped newlines). Non-standard but intentional — it safely handles tokens containing newlines. The parser in `useStreamingResponse.ts` expects this exact format.

---

## Commit and PR Conventions

- **Commit messages:** conventional commits — `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`. Subject line under 72 characters. Body explains *why*, not *what*.
- **PR title:** same conventional-commits prefix as the first commit. Under 72 characters.
- **PR body:** link the issue/ticket it resolves and include a short test plan.
- **New dependencies:** explain what the dependency does, why existing dependencies don't work, and evidence of active maintenance.
- **One issue per PR.** Don't bundle unrelated fixes. If you notice a bug while working on something else, file a new ticket rather than fixing it in the current PR.

---

## Dos and Don'ts (Quick Reference)

**Do:**
- Run the full validation suite (tests, lint, typecheck) before declaring a PR done
- Keep all SQL in `db/`
- Keep all fetch calls in `src/lib/api.ts`
- Add tests for every bug fix (regression test) and every new feature
- Keep scope tight — implement what the ticket asks, nothing more

**Don't:**
- Introduce a new LLM provider, embedding model, or vector database without an explicit ticket authorizing it
- Add state management libraries to the frontend
- Add an ORM to the backend
- Write SQL outside `db/` or fetch calls outside `src/lib/api.ts`
- "Improve" code that wasn't part of the issue you're fixing

---

## Security-Sensitive Paths

These files implement or gate security invariants (authentication, authorization, owner-only conversation scoping, the 25 msg/user/24h rate limit, signup abuse guards). Changes here warrant careful human review:

- `app/backend/auth/` (entire directory)
- `app/backend/routes/auth.py`
- `app/backend/routes/admin.py` — consumer of the admin dependency
- `app/backend/routes/conversations.py`, `app/backend/routes/messages.py` — owner-only conversation scoping
- `app/backend/db/users_repo.py`
- `app/backend/db/repository.py` — conversation/message `user_id` scoping functions
- `app/backend/main.py` — auth router registration and dependency wiring
- `app/backend/config.py` — `JWT_SECRET` / `DATABASE_URL` handling
- CORS middleware configuration
- `app/backend/rate_limit.py` — the 25 msg/user/24h cap
- `app/backend/db/user_messages_repo.py` — rate-limit audit-table access
- `app/backend/signup_rate_limit.py`, `app/backend/db/signup_attempts_repo.py` — signup abuse guard
- `deploy/Dockerfile` — uvicorn `--proxy-headers --forwarded-allow-ips` flags; the signup IP trust boundary depends on these
