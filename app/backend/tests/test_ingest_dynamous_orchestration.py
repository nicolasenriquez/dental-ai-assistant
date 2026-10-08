"""Orchestration tests for the Dynamous ingest pipeline (BUG-006, ARCH-001).

The repository layer is mocked at the module boundary; these tests prove the
orchestrator's contract: metadata-only changes never re-embed, preparation
failures never write, and body changes still replace atomically.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

os.environ.setdefault("JWT_SECRET", "test-secret-please-do-not-use-in-prod")
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")

from backend.db import dynamous_repo
from backend.ingest import dynamous


def _markdown(title: str = "Lesson One", lesson_url: str = "https://example.com/l") -> str:
    return (
        f"---\n"
        f'title: "{title}"\n'
        f"lesson_url: {lesson_url}\n"
        f"course_slug: module-1\n"
        f"---\n\n"
        f"## [00:00:00] Intro\n\n"
        f"Body here.\n"
    )


BODY_HASH = dynamous._hash_body(
    dynamous._parse_frontmatter(_markdown("Lesson One", "https://example.com/l"))[1]
)


@pytest.fixture(autouse=True)
def patch_pipeline(monkeypatch):
    calls: dict[str, list] = {"embed": [], "metadata": [], "replace": []}
    monkeypatch.setattr(dynamous_repo, "get_source_state", _async_none_getter())
    monkeypatch.setattr(dynamous_repo, "update_source_metadata", _capture(calls, "metadata"))
    monkeypatch.setattr(dynamous_repo, "replace_source", _capture_replace(calls))
    monkeypatch.setattr(
        dynamous,
        "chunk_video_timestamped",
        lambda segments: (
            [
                {
                    "content": "Body here.",
                    "start_seconds": 0.0,
                    "end_seconds": 1.0,
                    "snippet": "Body",
                }
            ],
            None,
        ),
    )
    monkeypatch.setattr(
        dynamous,
        "embed_batch",
        lambda contents: [[0.1, 0.2] for _ in contents],
    )
    return calls


def _async_none_getter():
    async def _fn(rel_path):
        return None

    return _fn


def _capture(calls: dict, key: str):
    async def _fn(*args, **_kwargs):
        calls[key].append(args)
        return None

    return _fn


def _capture_replace(calls: dict):
    async def _fn(**_kwargs):
        calls["replace"].append(dict(_kwargs))
        return "video-id-1"

    return _fn


async def test_identical_file_is_unchanged_and_embeds_nothing(
    tmp_path: Path, monkeypatch, patch_pipeline
):
    calls = patch_pipeline
    md = tmp_path / "a.md"
    md.write_text(_markdown(), encoding="utf-8")

    async def get_state(_rel_path):
        return {
            "id": "v1",
            "content_hash": BODY_HASH,
            "title": "Lesson One",
            "lesson_url": "https://example.com/l",
            "metadata": {"course_slug": "module-1"},
        }

    monkeypatch.setattr(dynamous_repo, "get_source_state", get_state)

    counts = await dynamous.ingest_dynamous_content(tmp_path)

    assert counts == {
        "scanned": 1,
        "unchanged": 1,
        "metadata_updated": 0,
        "ingested": 0,
        "errors": 0,
    }
    assert calls["embed"] == []
    assert calls["metadata"] == []
    assert calls["replace"] == []


async def test_metadata_only_change_updates_source_without_embedding(
    tmp_path: Path, monkeypatch, patch_pipeline
):
    calls = patch_pipeline
    md = tmp_path / "a.md"
    md.write_text(_markdown(title="New Title"), encoding="utf-8")

    async def get_state(_rel_path):
        return {
            "id": "v1",
            "content_hash": BODY_HASH,
            "title": "Old Title",
            "lesson_url": "https://example.com/l",
            "metadata": {"course_slug": "module-1"},
        }

    monkeypatch.setattr(dynamous_repo, "get_source_state", get_state)

    counts = await dynamous.ingest_dynamous_content(tmp_path)

    assert counts == {
        "scanned": 1,
        "unchanged": 0,
        "metadata_updated": 1,
        "ingested": 0,
        "errors": 0,
    }
    assert calls["metadata"] == [
        ("v1", "New Title", "https://example.com/l", {"course_slug": "module-1"})
    ]
    assert calls["embed"] == []
    assert calls["replace"] == []


async def test_new_file_replaces_source_atomically(tmp_path: Path, patch_pipeline):
    calls = patch_pipeline
    md = tmp_path / "a.md"
    md.write_text(_markdown(), encoding="utf-8")

    counts = await dynamous.ingest_dynamous_content(tmp_path)

    assert counts == {
        "scanned": 1,
        "unchanged": 0,
        "metadata_updated": 0,
        "ingested": 1,
        "errors": 0,
    }
    assert len(calls["replace"]) == 1
    assert calls["replace"][0]["existing_video_id"] is None
    assert calls["replace"][0]["rel_path"] == "a.md"
    assert len(calls["replace"][0]["chunks"]) == 1


async def test_changed_body_replaces_existing_source(tmp_path: Path, monkeypatch, patch_pipeline):
    calls = patch_pipeline
    md = tmp_path / "a.md"
    md.write_text(_markdown(), encoding="utf-8")

    async def get_state(_rel_path):
        return {
            "id": "v1",
            "content_hash": "other-hash",
            "title": "Lesson One",
            "lesson_url": "https://example.com/l",
            "metadata": {"course_slug": "module-1"},
        }

    monkeypatch.setattr(dynamous_repo, "get_source_state", get_state)

    counts = await dynamous.ingest_dynamous_content(tmp_path)

    assert counts["ingested"] == 1
    assert calls["replace"][0]["existing_video_id"] == "v1"


async def test_preparation_failure_conserves_previous_data(
    tmp_path: Path, monkeypatch, patch_pipeline
):
    calls = patch_pipeline
    md = tmp_path / "a.md"
    md.write_text(_markdown(), encoding="utf-8")

    def failing_embed(contents):
        raise RuntimeError("provider down")

    monkeypatch.setattr(dynamous, "embed_batch", failing_embed)

    counts = await dynamous.ingest_dynamous_content(tmp_path)

    assert counts["errors"] == 1
    assert calls["replace"] == []
