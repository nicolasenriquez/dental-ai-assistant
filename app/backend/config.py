"""
Configuration module — loads environment variables from the project-root .env file.
The path is computed dynamically so it works on any machine.
"""

import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Dynamically locate the .env file.
# config.py lives at app/backend/config.py, but the .env may sit at the backend
# root, the repo root, or a parent workspace depending on how the project was
# checked out. Rather than hard-coding a depth, walk up from this file and load
# the first .env found. See app/backend/.env.example for the expected keys.


def _find_and_load_env() -> None:
    """Search parent directories for .env and load it.

    In containerized deploys there is no .env file on disk — env vars are
    injected by docker-compose. Missing .env is therefore not an error.

    Tests run under pytest and never load an ambient .env: pytest injects its
    own pinned defaults in ``tests/conftest.py`` and sets
    ``AI_TUTOR_DISABLE_DOTENV`` before any backend import, so a developer's
    gitignored docker-compose .env (e.g. ``AUTH_MODE=google``) cannot leak
    into the test process.
    """
    if os.environ.get("AI_TUTOR_DISABLE_DOTENV") == "1":
        logger.info("AI_TUTOR_DISABLE_DOTENV set; skipping ambient .env load")
        return
    current = Path(__file__).resolve()
    # Try each parent directory up to the filesystem root
    for parent in current.parents:
        candidate = parent / ".env"
        if candidate.exists():
            load_dotenv(dotenv_path=candidate, override=False)
            logger.info(f"Loaded .env from {candidate}")
            return
    logger.info("No .env file found on disk; assuming env vars are injected (container deploy).")


_find_and_load_env()

# Expose configuration constants
OPENROUTER_API_KEY: str = os.environ.get("OPENROUTER_API_KEY", "")
if not OPENROUTER_API_KEY:
    print(
        "WARNING: OPENROUTER_API_KEY is not set or empty. "
        "Embedding and LLM features will not work.",
        file=sys.stderr,
    )

SUPADATA_API_KEY: str = os.environ.get("SUPADATA_API_KEY", "")
if not SUPADATA_API_KEY:
    print(
        "WARNING: SUPADATA_API_KEY is not set or empty. Ingest-by-URL will not work in production.",
        file=sys.stderr,
    )

# MISSION §Administrative surface: "A logged-in admin view … identified by a
# hardcoded user identifier, not by a role system." Empty = no admin configured,
# every /api/admin/* endpoint returns 403 fail-safe.
ADMIN_USER_EMAIL: str = os.environ.get("ADMIN_USER_EMAIL", "")
if not ADMIN_USER_EMAIL:
    print(
        "WARNING: ADMIN_USER_EMAIL is not set. All /api/admin/* endpoints "
        "will return 403 until it is configured.",
        file=sys.stderr,
    )

# Circle membership verification (issue #147). Without these, paid-content
# gating fails closed — every user is treated as a non-member and only sees
# YouTube chunks. The app keeps working; users just don't see Dynamous course
# content until the env is configured.
CIRCLE_ADMIN_TOKEN: str = os.environ.get("CIRCLE_ADMIN_TOKEN", "")
CIRCLE_PAID_ACCESS_GROUP_ID: int = int(os.environ.get("CIRCLE_PAID_ACCESS_GROUP_ID", "0") or "0")
if not CIRCLE_ADMIN_TOKEN or not CIRCLE_PAID_ACCESS_GROUP_ID:
    print(
        "WARNING: Circle membership verification disabled "
        "(CIRCLE_ADMIN_TOKEN or CIRCLE_PAID_ACCESS_GROUP_ID missing). "
        "All users will be treated as non-members.",
        file=sys.stderr,
    )

# Membership refresh staleness window. /me re-verifies a user against Circle
# when member_verified_at is NULL or older than this many seconds.
MEMBERSHIP_REFRESH_SECONDS: int = int(os.environ.get("MEMBERSHIP_REFRESH_SECONDS", "3600"))

OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
EMBEDDING_MODEL: str = "openai/text-embedding-3-small"
CHAT_MODEL: str = "anthropic/claude-sonnet-4.6"
CLINICAL_EXTERNAL_LLM_ENABLED: bool = os.environ.get(
    "CLINICAL_EXTERNAL_LLM_ENABLED", "false"
).strip().lower() in ("1", "true", "yes", "on")
CLINICAL_TURN_LIMIT_PER_24H: int = int(os.environ.get("CLINICAL_TURN_LIMIT_PER_24H", "25"))
VOICE_TRANSCRIPTION_ENABLED: bool = os.environ.get(
    "VOICE_TRANSCRIPTION_ENABLED", "false"
).strip().lower() in ("1", "true", "yes", "on")
VOICE_LANGUAGE: str = os.environ.get("VOICE_LANGUAGE", "es")
WHISPER_URL: str = os.environ.get("WHISPER_URL", "http://whisper:9000").rstrip("/")
WHISPER_HTTP_TIMEOUT_SECONDS: int = 100
VOICE_MAX_BYTES: int = 12 * 1024 * 1024
VOICE_MAX_DURATION_SECONDS: int = 120
VOICE_RATE_LIMIT_PER_HOUR: int = 20

# Postgres — required for all data (chat + auth). The app fails fast without it.
# In prod, docker-compose injects DATABASE_URL from the POSTGRES_* vars.
# Locally, set it manually (e.g. in .env at the app/ root).
DATABASE_URL: str = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. DynaChat now requires Postgres for all data "
        "(no SQLite fallback). Set DATABASE_URL in your environment before starting."
    )

# JWT signing secret. Required whenever auth is active. 32+ random bytes in prod.
# A local dev value is used only when JWT_SECRET is unset AND DATABASE_URL is unset
# (i.e. auth-off local mode). In any environment with DATABASE_URL set, the real
# secret must come from the environment.
JWT_SECRET: str = os.environ.get("JWT_SECRET", "")
if not JWT_SECRET and DATABASE_URL:
    print(
        "WARNING: DATABASE_URL is set but JWT_SECRET is not. Authentication will fail.",
        file=sys.stderr,
    )
JWT_ALGORITHM: str = "HS256"
JWT_EXPIRY_SECONDS: int = 7 * 24 * 60 * 60  # 7 days

# RAG settings
RETRIEVAL_TOP_K: int = 5
HYBRID_CHUNKER_MAX_TOKENS: int = 512
RETRIEVAL_EXPANSION_WINDOW: int = int(os.environ.get("RETRIEVAL_EXPANSION_WINDOW", "1"))

# Hybrid retrieval (RRF) constants
HYBRID_K_CONSTANT: int = 60
HYBRID_OVERFETCH_FACTOR: int = 2
KEYWORD_LANGUAGE: str = "english"

# Per-video diversity cap applied after each search-tool call. Prevents one
# long video from monopolizing the retrieved context on broad questions.
# Set to a very large value (e.g. 999) to effectively disable.
RETRIEVAL_MAX_PER_VIDEO: int = int(os.environ.get("RETRIEVAL_MAX_PER_VIDEO", "3"))

# Cap on non-cited citations (issue #176); cited chunks always pass through.
CITATIONS_MAX_COUNT: int = int(os.environ.get("CITATIONS_MAX_COUNT", "10"))

# RAG tool-based retrieval — the LLM drives retrieval via tool calls
# (search_videos, keyword_search_videos, semantic_search_videos,
# get_video_transcript) rather than receiving pre-retrieved chunks. Disabled
# falls back to a tools-off LLM call with no context (model answers from
# training or refuses) — useful only for diagnostic rollback. Per-turn cap
# protects the OpenRouter budget from runaway loops.
LLM_TOOLS_ENABLED: bool = os.environ.get("LLM_TOOLS_ENABLED", "true").strip().lower() in (
    "1",
    "true",
    "yes",
    "on",
)
LLM_TOOLS_MAX_PER_TURN: int = int(os.environ.get("LLM_TOOLS_MAX_PER_TURN", "6"))

# Prompt-caching: inject a video catalog block into the system prompt so
# Anthropic can cache the static content between requests.  Opt-in because
# the catalog adds tokens (even on cache hits the input tokens are counted).
CATALOG_ENABLED: bool = os.environ.get("CATALOG_ENABLED", "false").strip().lower() in (
    "1",
    "true",
    "yes",
    "on",
)
CATALOG_TIER: str = (
    os.environ.get("CATALOG_TIER", "standard").strip().lower()
)  # "standard" or "extended"
# TTL in seconds for the extended prompt-cache tier (Anthropic API requires an integer).
CATALOG_CACHE_TTL_SECONDS: int = int(os.environ.get("CATALOG_CACHE_TTL_SECONDS", "3600"))

# Cap on how many characters the get_video_transcript tool returns to the
# model. Long videos can produce 40K+ tokens of transcript; beyond ~30K
# tokens the cost per call gets uncomfortable even on Sonnet's 200K window.
# ~120K chars ≈ 30K tokens on English prose.
TRANSCRIPT_TOOL_MAX_CHARS: int = int(os.environ.get("TRANSCRIPT_TOOL_MAX_CHARS", "120000"))

# YouTube channel to sync from (used by POST /api/channels/sync)
YOUTUBE_CHANNEL_ID: str = os.environ.get("YOUTUBE_CHANNEL_ID", "")

# Content type filter for channel sync: 'all', 'video', 'short', 'live'
CHANNEL_SYNC_TYPE: str = os.environ.get("CHANNEL_SYNC_TYPE", "video")

# YouTube Data API v3 key — required for real video descriptions via videos.list?part=snippet
# Optional: if unset, video descriptions fall back to placeholder strings
YOUTUBE_API_KEY: str = os.environ.get("YOUTUBE_API_KEY", "")

# Whether startup should auto-seed the 10 mock videos bundled in data/seed.py.
# Defaults to OFF — the seed fixtures use synthesised YouTube IDs
# (AgntBld001a, etc.) which break the citation modal in production. Set
# SEED_ENABLE=true only for local development when you want the mock library
# without running a channel sync. Production gets its data via
# POST /api/channels/sync against YOUTUBE_CHANNEL_ID.
SEED_ENABLE: bool = os.environ.get("SEED_ENABLE", "false").strip().lower() in (
    "1",
    "true",
    "yes",
    "on",
)

# Frontend dist directory (built static assets from Vite build)
# When set, the SPA catch-all serves static files from this directory
FRONTEND_DIST: str = os.environ.get("FRONTEND_DIST", "")

# Server ports
BACKEND_PORT: int = 8000
FRONTEND_PORT: int = 5173

# CORS — comma-separated list of allowed origins; defaults to localhost + 127.0.0.1
# on the configured FRONTEND_PORT so the default dev setup works without any env vars.
_cors_raw: str = os.environ.get(
    "CORS_ORIGINS",
    f"http://localhost:{FRONTEND_PORT},http://127.0.0.1:{FRONTEND_PORT}",
)
CORS_ORIGINS: list[str] = [o.strip() for o in _cors_raw.split(",") if o.strip()]

# Authentication mode — backend-owned provider selection, not only presentation.
# `local` preserves email/password signup/login and disables Google auth;
# `google` enables Google auth and disables local signup/login. Unknown values
# fail startup. Google mode requires a public Google client ID.
AUTH_MODE: str = os.environ.get("AUTH_MODE", "local").strip().lower()
if AUTH_MODE not in ("local", "google"):
    raise RuntimeError(f"AUTH_MODE must be 'local' or 'google', got {AUTH_MODE!r}")

GOOGLE_CLIENT_ID: str = os.environ.get("GOOGLE_CLIENT_ID", "")
if AUTH_MODE == "google" and not GOOGLE_CLIENT_ID:
    raise RuntimeError("AUTH_MODE=google requires GOOGLE_CLIENT_ID")

# Exact allowed application origins for the GIS same-origin JSON request-context
# guard. Comma-separated; empty list fails the guard closed.
_app_origins_raw: str = os.environ.get("APP_ORIGINS", "")
APP_ORIGINS: list[str] = [o.strip() for o in _app_origins_raw.split(",") if o.strip()]

# Google Drive workspace feature switches (Phase 2+). Default off until the
# Drive connection boundary exists.
GOOGLE_DRIVE_ENABLED: bool = os.environ.get("GOOGLE_DRIVE_ENABLED", "false").strip().lower() in (
    "1",
    "true",
    "yes",
    "on",
)
GOOGLE_DRIVE_AUTO_ONBOARD: bool = os.environ.get(
    "GOOGLE_DRIVE_AUTO_ONBOARD", "false"
).strip().lower() in (
    "1",
    "true",
    "yes",
    "on",
)

# Google Drive connection boundary. Complete absence starts the app with
# GOOGLE_DRIVE_CONFIGURED=False (Drive endpoints report 503); partial or
# malformed configuration fails startup. The token keyring is an independent
# version-to-32-byte-key mapping and is never derived from JWT_SECRET.
GOOGLE_DRIVE_CLIENT_ID: str = os.environ.get("GOOGLE_DRIVE_CLIENT_ID", "")
GOOGLE_DRIVE_CLIENT_SECRET: str = os.environ.get("GOOGLE_DRIVE_CLIENT_SECRET", "")
GOOGLE_DRIVE_OAUTH_REDIRECT_URI: str = os.environ.get("GOOGLE_DRIVE_OAUTH_REDIRECT_URI", "")
GOOGLE_DRIVE_RETURN_URL: str = os.environ.get("GOOGLE_DRIVE_RETURN_URL", "")


def _parse_drive_token_keyring(raw: str) -> dict[str, bytes]:
    """Parse ``GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEYS`` ("1:<b64>,2:<b64>").

    Each value must URL-safe-base64-decode to exactly 32 bytes. Malformed
    entries raise RuntimeError — partial key material fails startup closed.
    """
    import base64
    import binascii

    keyring: dict[str, bytes] = {}
    for chunk in raw.split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        version, _, b64 = chunk.partition(":")
        if not version or not b64:
            raise RuntimeError(
                "Malformed GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEYS entry: expected 'version:<b64>'"
            )
        try:
            key = base64.urlsafe_b64decode(b64.encode())
        except (binascii.Error, ValueError) as exc:
            raise RuntimeError(
                "GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEYS contains a non-base64 key"
            ) from exc
        if len(key) != 32:
            raise RuntimeError(
                "GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEYS keys must decode to exactly 32 bytes"
            )
        keyring[version] = key
    return keyring


_drive_raw_values = (
    GOOGLE_DRIVE_CLIENT_ID,
    GOOGLE_DRIVE_CLIENT_SECRET,
    GOOGLE_DRIVE_OAUTH_REDIRECT_URI,
    GOOGLE_DRIVE_RETURN_URL,
)
_drive_keyring_raw: str = os.environ.get("GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEYS", "")
_drive_active_version: str = os.environ.get("GOOGLE_DRIVE_TOKEN_ACTIVE_KEY_VERSION", "")

GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEYS: dict[str, bytes]
GOOGLE_DRIVE_TOKEN_ACTIVE_KEY_VERSION: str
GOOGLE_DRIVE_CONFIGURED: bool

if any(_drive_raw_values) or _drive_keyring_raw or _drive_active_version:
    if not all(_drive_raw_values):
        raise RuntimeError(
            "Incomplete Google Drive configuration: GOOGLE_DRIVE_CLIENT_ID, "
            "GOOGLE_DRIVE_CLIENT_SECRET, GOOGLE_DRIVE_OAUTH_REDIRECT_URI, and "
            "GOOGLE_DRIVE_RETURN_URL must all be set"
        )
    GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEYS = _parse_drive_token_keyring(_drive_keyring_raw)
    if not GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEYS:
        raise RuntimeError("GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEYS must contain at least one key")
    if _drive_active_version not in GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEYS:
        raise RuntimeError(
            "GOOGLE_DRIVE_TOKEN_ACTIVE_KEY_VERSION must reference a key in "
            "GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEYS"
        )
    GOOGLE_DRIVE_TOKEN_ACTIVE_KEY_VERSION = _drive_active_version
    GOOGLE_DRIVE_CONFIGURED = True
else:
    GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEYS = {}
    GOOGLE_DRIVE_TOKEN_ACTIVE_KEY_VERSION = ""
    GOOGLE_DRIVE_CONFIGURED = False
