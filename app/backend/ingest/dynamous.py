"""Ingester for paid Dynamous course/workshop transcripts (issue #147).

Walks a directory of markdown files (output of `scripts/transcribe_all.py`),
parses YAML-style frontmatter + `## [HH:MM:SS]` segment headings, and upserts
into the existing `videos` + `chunks` tables with `source_type='dynamous'`.

Idempotent: each source row stores a SHA-256 of the markdown body. Re-running
ingest skips files whose hash matches what's already in the DB.

Expected file format::

    ---
    title: "Module 5: Building a Complete Front End"
    course_slug: module-1
    section_id: 570048
    lesson_id: 2274637
    lesson_url: https://community.dynamous.ai/c/module-1/sections/570048/lessons/2274637
    source_type: dynamous
    ---

    ## [00:00:00] Intro

    Welcome to module five...

    ## [00:02:15] Architecture overview

    The agent has three layers...

The ingester runs at app startup (see `backend.main`) so transcripts that
landed in the volume during deploy are picked up automatically. Failures are
logged but never crash the app — DynaChat keeps working with whatever it has.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import re
from pathlib import Path
from typing import Any

from backend.db import dynamous_repo
from backend.rag.chunker import chunk_video_timestamped
from backend.rag.embeddings import embed_batch

logger = logging.getLogger(__name__)


# --- Frontmatter / timestamp parsing -----------------------------------------

_FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n(.*)$", re.DOTALL)
_TIMESTAMP_HEADING_RE = re.compile(
    # The trailing optional-heading group uses `[ \t]+([^\n]+)` (NOT `\s+(.+)`)
    # because `\s` matches newlines and would happily eat the body content of
    # the segment as the "heading", leaving an empty body for the chunker.
    # Anchoring to a single line is required.
    r"^##[ \t]*\[(\d{1,2}):(\d{2}):(\d{2})\](?:[ \t]+([^\n]+))?[ \t]*$",
    re.MULTILINE,
)


def _parse_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    """Split a markdown file into (frontmatter dict, body).

    Tolerates simple `key: value` and `key: "quoted value"` pairs. Numeric
    values stay as strings; the caller coerces. Non-frontmatter files are
    returned with an empty dict and the full text as body.
    """
    m = _FRONTMATTER_RE.match(text)
    if not m:
        return {}, text
    fm_block, body = m.group(1), m.group(2)
    fm: dict[str, Any] = {}
    for line in fm_block.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            continue
        key, _, raw_value = line.partition(":")
        value = raw_value.strip().strip('"').strip("'")
        fm[key.strip()] = value
    return fm, body


def _parse_segments(body: str) -> list[dict[str, Any]]:
    """Convert a body with `## [HH:MM:SS] heading` markers into segments.

    Each segment is `{start, end, text, heading}`. The end of a segment is the
    start of the next; the last segment runs to the end of the file (its
    `end_seconds` is filled in by the caller using duration heuristics).
    """
    matches = list(_TIMESTAMP_HEADING_RE.finditer(body))
    if not matches:
        # No timestamp markers — treat the whole body as one segment.
        clean = body.strip()
        if not clean:
            return []
        return [{"start": 0.0, "end": 0.0, "text": clean, "heading": ""}]

    segments: list[dict[str, Any]] = []
    for i, m in enumerate(matches):
        h, mm, ss = int(m.group(1)), int(m.group(2)), int(m.group(3))
        start = h * 3600 + mm * 60 + ss
        heading = (m.group(4) or "").strip()
        text_start = m.end()
        text_end = matches[i + 1].start() if i + 1 < len(matches) else len(body)
        text = body[text_start:text_end].strip()
        if not text:
            continue
        if heading:
            text = f"{heading}\n\n{text}"
        end = (
            int(matches[i + 1].group(1)) * 3600
            + int(matches[i + 1].group(2)) * 60
            + int(matches[i + 1].group(3))
            if i + 1 < len(matches)
            else float(start)  # filler — caller may override
        )
        segments.append(
            {"start": float(start), "end": float(end), "text": text, "heading": heading}
        )
    # The last segment's end_seconds = start_seconds (we don't know duration);
    # acceptable since the chunker preserves both for citation rendering.
    return segments


# --- Public entry point ------------------------------------------------------


def _hash_body(body: str) -> str:
    return hashlib.sha256(body.encode("utf-8")).hexdigest()


async def ingest_dynamous_content(content_dir: Path) -> dict[str, int]:
    """Walk *content_dir* and upsert all `*.md` transcripts.

    Returns a counts dict: `{scanned, unchanged, metadata_updated, ingested,
    errors}`.

    Idempotent on no-content-change: re-running with no file changes is a
    pure read-only sweep (one SELECT per file). Metadata-only changes refresh
    the source row without re-embedding.
    """
    counts = {"scanned": 0, "unchanged": 0, "metadata_updated": 0, "ingested": 0, "errors": 0}
    if not content_dir.exists():
        logger.info("Dynamous content dir %s does not exist — skipping ingest", content_dir)
        return counts

    for md_path in sorted(content_dir.rglob("*.md")):
        counts["scanned"] += 1
        rel_path = str(md_path.relative_to(content_dir))
        try:
            await _ingest_one_file(md_path, rel_path, counts)
        except Exception:
            counts["errors"] += 1
            logger.exception("Failed to ingest %s", rel_path)

    logger.info(
        "Dynamous ingest complete: scanned=%d unchanged=%d metadata_updated=%d ingested=%d errors=%d",
        counts["scanned"],
        counts["unchanged"],
        counts["metadata_updated"],
        counts["ingested"],
        counts["errors"],
    )
    return counts


async def _ingest_one_file(md_path: Path, rel_path: str, counts: dict[str, int]) -> None:
    """Process one transcript file. Idempotent; holds no connection while preparing."""
    text = await asyncio.to_thread(md_path.read_text, encoding="utf-8")
    fm, body = _parse_frontmatter(text)
    body_hash = _hash_body(body)

    title = fm.get("title", md_path.stem)
    lesson_url = fm.get("lesson_url", "")
    # course_slug stays inside metadata — we don't surface it as a top-level
    # column on `videos` (the existing schema doesn't have one) but the JSON
    # blob preserves it for future reporting / reverse lookups.
    metadata = {k: v for k, v in fm.items() if k not in {"title", "lesson_url"}}

    existing = await dynamous_repo.get_source_state(rel_path)
    if existing and existing["content_hash"] == body_hash:
        stored_meta = existing["metadata"] or {}
        if (
            existing["title"] == title
            and existing["lesson_url"] == lesson_url
            and stored_meta == metadata
        ):
            counts["unchanged"] += 1
            return
        # Body unchanged but frontmatter changed: refresh the source row only.
        await dynamous_repo.update_source_metadata(str(existing["id"]), title, lesson_url, metadata)
        counts["metadata_updated"] += 1
        return

    # Preparation (parse, chunk, embed) runs with no connection held.
    segments = _parse_segments(body)
    if not segments:
        logger.warning("No content extracted from %s; skipping", rel_path)
        return

    chunks, _ = chunk_video_timestamped(segments)
    if not chunks:
        logger.warning("Chunker returned 0 chunks for %s; skipping", rel_path)
        return

    # Embed chunks in groups of <=100 per call. text-embedding-3-small's
    # 300k-token-per-request budget is roughly enough for ~600 typical
    # chunks, but the largest workshops have >1000 chunks and overflow
    # in one shot — splitting keeps each request well under the limit.
    # Sequential per-chunk calls (the original loop) were ~30-100x slower
    # on first-time ingest; one batched call per file when possible.
    BATCH_SIZE = 100
    embeddings: list[list[float]] = []
    for start in range(0, len(chunks), BATCH_SIZE):
        group = chunks[start : start + BATCH_SIZE]
        embeddings.extend(await asyncio.to_thread(embed_batch, [ch["content"] for ch in group]))

    await dynamous_repo.replace_source(
        rel_path=rel_path,
        existing_video_id=str(existing["id"]) if existing else None,
        title=title,
        lesson_url=lesson_url,
        body_hash=body_hash,
        metadata=metadata,
        chunks=chunks,
        embeddings=embeddings,
    )

    counts["ingested"] += 1
    logger.info("Ingested %s (%d chunks)", rel_path, len(chunks))


__all__ = ["ingest_dynamous_content"]
