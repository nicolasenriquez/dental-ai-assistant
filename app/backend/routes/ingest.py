"""
Ingest route — POST /api/ingest

Accepts a video (title, description, url, transcript), runs the full
chunking → embedding → storage pipeline, and returns a summary.

All DB access goes through repository.py — no raw SQL here.
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, HTTPException
from pydantic import AnyUrl, BaseModel, Field, field_validator
from supadata import SupadataError

from backend.db import repository
from backend.ingest.youtube_url import parse_youtube_url
from backend.rag import catalog, retriever_hybrid
from backend.services.video_ingest import (
    VideoEmbeddingCountError,
    VideoEmbeddingError,
    VideoIngestError,
    fetch_video_for_ingest,
    prepare_video_chunks,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class IngestRequest(BaseModel):
    title: str = Field(..., min_length=1, description="Video title (non-empty)")
    description: str = Field(..., min_length=1, description="Short description (non-empty)")
    url: AnyUrl = Field(..., description="Valid URL to the YouTube video")
    transcript: str = Field(..., min_length=1, description="Full transcript text (non-empty)")
    segments: list[dict] | None = Field(
        default=None,
        description=(
            "Optional timestamped segments from Supadata. Each dict must have "
            "'start' (float seconds), 'end' (float seconds), 'text' (str). "
            "If provided, real timestamps are stored. If absent, timestamps "
            "are estimated evenly across the transcript."
        ),
    )

    @field_validator("segments", mode="before")
    @classmethod
    def validate_segments(cls, v: list[dict] | None) -> list[dict] | None:
        if v is None:
            return None
        for seg in v:
            if not isinstance(seg, dict):
                raise ValueError("Each segment must be a dict")
            for key in ("start", "end", "text"):
                if key not in seg:
                    raise ValueError(f"Segment missing required key: '{key}'")
            # Validate types: start and end must be numeric, text must be string
            start = seg.get("start")
            end = seg.get("end")
            text = seg.get("text")
            if not isinstance(start, int | float):
                raise ValueError(f"Segment 'start' must be a number, got {type(start).__name__}")
            if not isinstance(end, int | float):
                raise ValueError(f"Segment 'end' must be a number, got {type(end).__name__}")
            if not isinstance(text, str):
                raise ValueError(f"Segment 'text' must be a string, got {type(text).__name__}")
        return v

    @field_validator("title", "description", "transcript", mode="before")
    @classmethod
    def no_empty_strings(cls, v: str) -> str:
        if isinstance(v, str) and v.strip() == "":
            raise ValueError("Field must not be an empty string")
        return v


class IngestResponse(BaseModel):
    video_id: str
    chunks_created: int
    status: str


class IngestFromUrlRequest(BaseModel):
    url: AnyUrl = Field(..., description="YouTube video URL")


class IngestFromUrlResponse(BaseModel):
    video_id: str
    chunks_created: int
    status: str


# ---------------------------------------------------------------------------
# Route handler
# ---------------------------------------------------------------------------


@router.post("/ingest", response_model=IngestResponse)
async def ingest_video(body: IngestRequest) -> IngestResponse:
    """
    Ingest a new video: chunk transcript → embed chunks → store in DB.

    Returns:
        { video_id, chunks_created, status }

    Raises:
        HTTP 422 for validation errors (handled automatically by FastAPI/Pydantic).
        HTTP 502 if the embeddings API is unavailable.
        HTTP 500 for unexpected errors.
    """
    url_str = str(body.url)
    logger.info("Ingesting video: '%s'", body.title)

    return await _store_video(
        title=body.title,
        description=body.description,
        url=url_str,
        transcript=body.transcript,
        segments=body.segments,
    )


async def _store_video(
    *, title: str, description: str, url: str, transcript: str, segments: list[dict] | None
) -> IngestResponse:
    """Prepare before writing, then atomically persist one video and its chunks."""
    try:
        chunks = await asyncio.to_thread(prepare_video_chunks, title, transcript, segments)
    except VideoEmbeddingError as exc:
        raise HTTPException(
            status_code=502, detail=f"Embeddings API request failed: {exc}"
        ) from exc
    except VideoEmbeddingCountError as exc:
        raise HTTPException(
            status_code=500, detail="Mismatch between chunk count and embedding count."
        ) from exc
    video = await repository.create_video(
        title=title, description=description, url=url, transcript=transcript, chunks=chunks
    )
    catalog.invalidate_catalog()
    if chunks:
        retriever_hybrid.invalidate_cache()
    return IngestResponse(
        video_id=video["id"],
        chunks_created=len(chunks),
        status="ok" if chunks else "stored_no_chunks",
    )


@router.post("/ingest/from-url", response_model=IngestFromUrlResponse)
async def ingest_from_url(body: IngestFromUrlRequest) -> IngestFromUrlResponse:
    """
    Ingest a YouTube video by URL alone — fetches transcript via Supadata.

    Returns:
        { video_id, chunks_created, status }

    Raises:
        HTTP 400 if the URL is not a valid YouTube URL.
        HTTP 503 if Supadata is rate-limited.
        HTTP 502 if Supadata or the embeddings API is unavailable.
        HTTP 422 for validation errors.
        HTTP 401 for unauthenticated callers.
    """
    url_str = str(body.url)

    # 1. Parse + validate URL early so bad input fails with 400 before any network call.
    try:
        parse_youtube_url(url_str)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    logger.info("Ingesting from URL: '%s'", url_str)

    # 2. Fetch transcript + title via the unified helper (Supadata SDK + oEmbed).
    try:
        supadata_data = await fetch_video_for_ingest(url_str, lang="en")
    except VideoIngestError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except SupadataError as exc:
        logger.error("Supadata fetch failed for '%s': %s", url_str, exc)
        raise HTTPException(
            status_code=503,
            detail=f"Transcript fetch failed: {exc}",
        ) from exc

    result = await _store_video(
        title=supadata_data["title"],
        description=supadata_data["description"],
        url=url_str,
        transcript=supadata_data["transcript"],
        segments=supadata_data.get("segments"),
    )
    return IngestFromUrlResponse(**result.model_dump())
