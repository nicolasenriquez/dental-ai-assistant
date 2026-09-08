"""Postgres-backed rate limiting for expensive voice requests."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from backend.config import VOICE_RATE_LIMIT_PER_HOUR
from backend.db.postgres import get_pg_pool


class VoiceRateLimitReached(Exception):
    """The user has exhausted the rolling transcription window."""


async def check_and_record(user_id: UUID) -> None:
    """Reserve one request atomically across workers and process restarts."""
    now = datetime.now(UTC)
    cutoff = now - timedelta(hours=1)
    async with get_pg_pool().acquire() as conn, conn.transaction():
        await conn.fetchval(
            "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))",
            str(user_id),
        )
        await conn.execute(
            "DELETE FROM voice_transcription_requests WHERE requested_at <= $1",
            cutoff,
        )
        count = await conn.fetchval(
            """
            SELECT count(*)
            FROM voice_transcription_requests
            WHERE user_id = $1 AND requested_at > $2
            """,
            user_id,
            cutoff,
        )
        if int(count or 0) >= VOICE_RATE_LIMIT_PER_HOUR:
            raise VoiceRateLimitReached
        await conn.execute(
            "INSERT INTO voice_transcription_requests (user_id, requested_at) VALUES ($1, $2)",
            user_id,
            now,
        )
