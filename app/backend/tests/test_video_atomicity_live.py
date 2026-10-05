"""Real rollback proof using connection-local copies of the migrated tables."""

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import asyncpg
import pytest

from backend.db import repository

DSN = os.environ.get("INGESTION_LIVE_TEST_DSN", "")
pytestmark = pytest.mark.skipif(not DSN, reason="INGESTION_LIVE_TEST_DSN not set")


async def test_create_and_replace_rollback_on_second_chunk_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    conn = await asyncpg.connect(DSN)
    try:
        # pg_temp shadows public tables for this connection; closing removes all test data.
        await conn.execute("CREATE TEMP TABLE videos (LIKE public.videos INCLUDING ALL)")
        await conn.execute("CREATE TEMP TABLE chunks (LIKE public.chunks INCLUDING ALL)")

        @asynccontextmanager
        async def acquire() -> AsyncIterator[asyncpg.Connection]:
            yield conn

        monkeypatch.setattr(repository, "_acquire", acquire)
        good = {
            "content": "original",
            "embedding": [0.1],
            "chunk_index": 0,
            "start_seconds": 30.0,
            "end_seconds": 60.0,
            "snippet": "original",
        }
        bad = {**good, "content": None, "chunk_index": 1}
        metadata = {
            "title": "Synthetic video",
            "description": "Rollback test",
            "url": "https://example.com/synthetic",
            "transcript": "Synthetic transcript",
        }
        with pytest.raises(asyncpg.NotNullViolationError):
            await repository.create_video(**metadata, chunks=[good, bad])
        assert await conn.fetchval("SELECT count(*) FROM videos") == 0
        assert await conn.fetchval("SELECT count(*) FROM chunks") == 0

        video = await repository.create_video(**metadata, chunks=[good])
        with pytest.raises(asyncpg.NotNullViolationError):
            await repository.replace_chunks_for_video(
                video["id"], [{**good, "content": "replacement"}, bad]
            )
        rows = await conn.fetch("SELECT content, start_seconds FROM chunks")
        assert [dict(row) for row in rows] == [{"content": "original", "start_seconds": 30.0}]
        assert await conn.fetchval("SELECT count(*) FROM videos") == 1
    finally:
        await conn.close()
