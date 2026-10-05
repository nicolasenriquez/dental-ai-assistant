"""Active ingestion regressions independent of the retired SQLite fixtures."""

import threading
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from backend.db import repository
from backend.routes import admin, channels, ingest
from backend.services import supadata, video_ingest

CHUNK = {"content": "text", "start_seconds": 30.0, "end_seconds": 60.0, "snippet": "text"}
METADATA = {
    "title": "Video",
    "description": "Description",
    "transcript": "text",
    "youtube_video_id": "abc123",
    "segments": [],
}


@pytest.fixture
def preparation(monkeypatch: pytest.MonkeyPatch) -> tuple[MagicMock, MagicMock]:
    chunker = MagicMock(return_value=([CHUNK], False))
    embedder = MagicMock(return_value=[[0.1, 0.2]])
    monkeypatch.setattr(video_ingest, "chunk_video_fallback", chunker)
    monkeypatch.setattr(video_ingest, "embed_batch", embedder)
    return chunker, embedder


async def _invoke(kind: str, monkeypatch: pytest.MonkeyPatch) -> Any:
    url = "https://www.youtube.com/watch?v=abc123"
    if kind == "manual":
        return await ingest.ingest_video(
            ingest.IngestRequest(
                title="Video", description="Description", url=url, transcript="text"
            )
        )
    if kind == "url":
        monkeypatch.setattr(ingest, "fetch_video_for_ingest", AsyncMock(return_value=METADATA))
        return await ingest.ingest_from_url(ingest.IngestFromUrlRequest(url=url))
    monkeypatch.setattr(admin, "fetch_video_for_ingest", AsyncMock(return_value=METADATA))
    monkeypatch.setattr(repository, "get_video_by_youtube_id", AsyncMock(return_value=None))
    return await admin.add_video(admin.AddVideoRequest(url=url))


@pytest.mark.parametrize("kind", ["manual", "url", "admin"])
async def test_new_ingestion_prepares_off_loop_then_writes_once(
    kind: str, preparation: tuple[MagicMock, MagicMock], monkeypatch: pytest.MonkeyPatch
) -> None:
    _, embedder = preparation
    loop_thread = threading.get_ident()
    worker_threads: list[int] = []

    def embed(texts: list[str]) -> list[list[float]]:
        worker_threads.append(threading.get_ident())
        return [[0.1, 0.2] for _ in texts]

    embedder.side_effect = embed
    write = AsyncMock(return_value={"id": "video-1"})
    monkeypatch.setattr(repository, "create_video", write)
    result = await _invoke(kind, monkeypatch)
    assert result.chunks_created == 1
    assert worker_threads and worker_threads[0] != loop_thread
    write.assert_awaited_once()
    assert write.await_args is not None
    assert write.await_args.kwargs["chunks"] == [
        {**CHUNK, "embedding": [0.1, 0.2], "chunk_index": 0}
    ]


@pytest.mark.parametrize("kind", ["manual", "url", "admin"])
@pytest.mark.parametrize("failure", ["provider", "cardinality"])
async def test_failed_preparation_never_creates_video(
    kind: str,
    failure: str,
    preparation: tuple[MagicMock, MagicMock],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, embedder = preparation
    if failure == "provider":
        embedder.side_effect = RuntimeError("provider unavailable")
    else:
        embedder.return_value = []
    write = AsyncMock()
    monkeypatch.setattr(repository, "create_video", write)
    with pytest.raises(HTTPException) as error:
        await _invoke(kind, monkeypatch)
    assert error.value.status_code == (502 if failure == "provider" else 500)
    write.assert_not_awaited()


@pytest.mark.parametrize("existing", [None, {"id": "existing-video"}])
async def test_channel_count_mismatch_preserves_storage(
    existing: dict[str, str] | None,
    preparation: tuple[MagicMock, MagicMock],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, embedder = preparation
    embedder.return_value = []
    monkeypatch.setattr(
        supadata,
        "get_channel_video_ids",
        AsyncMock(return_value={"video_ids": ["abc123"], "short_ids": [], "live_ids": []}),
    )
    monkeypatch.setattr(channels, "fetch_video_for_ingest", AsyncMock(return_value=METADATA))
    monkeypatch.setattr(channels, "get_video_title", AsyncMock(return_value=("Video", "Channel")))
    monkeypatch.setattr(repository, "get_video_by_youtube_id", AsyncMock(return_value=existing))
    monkeypatch.setattr(repository, "create_sync_video", AsyncMock(return_value={"id": "sync-1"}))
    write, replace = AsyncMock(), AsyncMock()
    monkeypatch.setattr(repository, "create_video", write)
    monkeypatch.setattr(repository, "replace_chunks_for_video", replace)
    result = await channels.sync_channel(force=True)
    assert result.videos_error == 1
    assert result.videos_new == 0
    write.assert_not_awaited()
    replace.assert_not_awaited()


@pytest.mark.parametrize("kind", ["transcript", "channel"])
async def test_supadata_sdk_does_not_run_on_event_loop(
    kind: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    loop_thread = threading.get_ident()
    worker_threads: list[int] = []

    def sdk_call(**kwargs: object) -> SimpleNamespace:
        worker_threads.append(threading.get_ident())
        return SimpleNamespace(content="text", video_ids=[], short_ids=[], live_ids=[])

    client = SimpleNamespace(
        transcript=sdk_call,
        youtube=SimpleNamespace(channel=SimpleNamespace(videos=sdk_call)),
    )
    monkeypatch.setattr(supadata, "_get_client", lambda: client)
    if kind == "transcript":
        assert await supadata.get_transcript("abc123") == "text"
    else:
        await supadata.get_channel_video_ids("channel")
    assert worker_threads and worker_threads[0] != loop_thread


async def test_video_and_chunks_share_transaction_when_insert_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    conn, transaction, acquire = MagicMock(), MagicMock(), MagicMock()
    transaction.__aenter__ = AsyncMock()
    transaction.__aexit__ = AsyncMock(return_value=False)
    conn.transaction.return_value = transaction
    conn.execute = AsyncMock(side_effect=[None, None, RuntimeError("second chunk failed")])
    acquire.__aenter__ = AsyncMock(return_value=conn)
    acquire.__aexit__ = AsyncMock(return_value=False)
    monkeypatch.setattr(repository, "_acquire", lambda: acquire)
    chunks = [{**CHUNK, "embedding": [0.1], "chunk_index": index} for index in range(2)]
    with pytest.raises(RuntimeError, match="second chunk failed"):
        await repository.create_video(
            title="Video",
            description="Description",
            url="https://example.com",
            transcript="text",
            chunks=chunks,
        )
    transaction.__aenter__.assert_awaited_once()
    assert transaction.__aexit__.await_args is not None
    assert transaction.__aexit__.await_args.args[0] is RuntimeError
    assert conn.execute.await_count == 3


async def test_admin_mutations_invalidate_catalog(
    preparation: tuple[MagicMock, MagicMock], monkeypatch: pytest.MonkeyPatch
) -> None:
    invalidate = MagicMock()
    monkeypatch.setattr(admin.catalog, "invalidate_catalog", invalidate)
    monkeypatch.setattr(repository, "create_video", AsyncMock(return_value={"id": "video-1"}))
    await _invoke("admin", monkeypatch)
    invalidate.assert_called_once()
    monkeypatch.setattr(repository, "delete_video_cascade", AsyncMock(return_value=True))
    await admin.delete_video("video-1")
    assert invalidate.call_count == 2


async def test_empty_ingestion_refreshes_catalog_without_embeddings(
    preparation: tuple[MagicMock, MagicMock], monkeypatch: pytest.MonkeyPatch
) -> None:
    chunker, embedder = preparation
    chunker.return_value = ([], False)
    monkeypatch.setattr(repository, "create_video", AsyncMock(return_value={"id": "empty-video"}))
    invalidate = MagicMock()
    monkeypatch.setattr(ingest.catalog, "invalidate_catalog", invalidate)
    result = await _invoke("manual", monkeypatch)
    assert result.status == "stored_no_chunks"
    embedder.assert_not_called()
    invalidate.assert_called_once()
