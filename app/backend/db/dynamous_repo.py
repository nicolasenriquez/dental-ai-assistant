"""PostgreSQL persistence for Dynamous course content.

Owns the SQL for the Dynamous ingest pipeline: source-state read, metadata
update, and atomic source replace (drop chunks + upsert row + insert chunks).
The ingester keeps no connection while parsing, chunking, or embedding.
"""

from __future__ import annotations

import json
from typing import Any
from uuid import uuid4

from backend.db.postgres import get_pg_pool


async def get_source_state(rel_path: str) -> dict[str, Any] | None:
    async with get_pg_pool().acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, content_hash, title, lesson_url, metadata
            FROM videos
            WHERE content_path = $1 AND source_type = 'dynamous'
            LIMIT 1
            """,
            rel_path,
        )
    return dict(row) if row else None


async def update_source_metadata(
    video_id: str, title: str, lesson_url: str, metadata: dict[str, Any]
) -> None:
    """Refresh title/lesson_url/metadata without touching content or chunks."""
    async with get_pg_pool().acquire() as conn:
        await conn.execute(
            """
            UPDATE videos
            SET title = $2, lesson_url = $3, metadata = $4::jsonb
            WHERE id = $1
            """,
            video_id,
            title,
            lesson_url,
            json.dumps(metadata),
        )


async def replace_source(
    *,
    rel_path: str,
    existing_video_id: str | None,
    title: str,
    lesson_url: str,
    body_hash: str,
    metadata: dict[str, Any],
    chunks: list[dict[str, Any]],
    embeddings: list[list[float]],
) -> str:
    """Atomically replace one source: drop old chunks, upsert the row, insert new chunks."""
    async with get_pg_pool().acquire() as conn, conn.transaction():
        if existing_video_id:
            video_id = existing_video_id
            await conn.execute("DELETE FROM chunks WHERE video_id = $1", video_id)
            await conn.execute(
                """
                UPDATE videos
                SET title = $2,
                    lesson_url = $3,
                    content_hash = $4,
                    metadata = $5::jsonb
                WHERE id = $1
                """,
                video_id,
                title,
                lesson_url,
                body_hash,
                json.dumps(metadata),
            )
        else:
            video_id = str(uuid4())
            await conn.execute(
                """
                INSERT INTO videos (
                    id, title, description, url, transcript,
                    source_type, content_hash, content_path, lesson_url, metadata
                )
                VALUES (
                    $1, $2, '', '', '',
                    'dynamous', $3, $4, $5, $6::jsonb
                )
                """,
                video_id,
                title,
                body_hash,
                rel_path,
                lesson_url,
                json.dumps(metadata),
            )

        for idx, (ch, emb) in enumerate(zip(chunks, embeddings, strict=True)):
            await conn.execute(
                """
                INSERT INTO chunks (
                    id, video_id, content, embedding, chunk_index,
                    start_seconds, end_seconds, snippet, source_type
                )
                VALUES (
                    $1, $2, $3, $4, $5,
                    $6, $7, $8, 'dynamous'
                )
                """,
                str(uuid4()),
                video_id,
                ch["content"],
                json.dumps(emb),
                idx,
                float(ch.get("start_seconds", 0.0)),
                float(ch.get("end_seconds", 0.0)),
                str(ch.get("snippet", ""))[:300],
            )
    return video_id
