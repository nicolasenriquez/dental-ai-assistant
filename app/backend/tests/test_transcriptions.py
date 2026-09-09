from __future__ import annotations

from uuid import UUID, uuid4

import httpx
import pytest
from httpx import ASGITransport, AsyncClient, MockTransport, Request, Response

from backend.auth.dependencies import get_current_user
from backend.main import app
from backend.routes import transcriptions as transcriptions_route
from backend.transcription import service
from backend.transcription.errors import (
    InvalidAudioError,
    TranscriptionBusyError,
    TranscriptionError,
    TranscriptionTimeoutError,
    VoiceDisabledError,
    VoiceRateLimitError,
)
from backend.transcription.schemas import TranscriptionResult
from backend.transcription.whisper_adapter import WhisperHttpAdapter


class _RecordingAdapter:
    def __init__(self, result: TranscriptionResult | None = None) -> None:
        self.audio: bytes | None = None
        self.mime_type: str | None = None
        self.result = result or TranscriptionResult(text="texto")

    async def transcribe(self, audio: bytes, *, mime_type: str) -> TranscriptionResult:
        self.audio = audio
        self.mime_type = mime_type
        return self.result


async def test_service_accepts_only_canonical_audio_mime_types(monkeypatch) -> None:
    monkeypatch.setattr(service, "VOICE_TRANSCRIPTION_ENABLED", True)
    monkeypatch.setattr(service, "check_and_record", lambda user_id: _noop(user_id))
    adapter = _RecordingAdapter()
    user_id = uuid4()

    result = await service.transcribe(user_id, b"audio", mime_type="audio/webm", adapter=adapter)

    assert result.text == "texto"
    assert adapter.mime_type == "audio/webm"
    for mime_type in ("audio/webm;codecs=opus", "audio/wav", "audio/mpeg"):
        with pytest.raises(InvalidAudioError):
            await service.transcribe(user_id, b"audio", mime_type=mime_type, adapter=adapter)


async def test_service_preserves_shared_adapter_errors(monkeypatch) -> None:
    monkeypatch.setattr(service, "VOICE_TRANSCRIPTION_ENABLED", True)
    monkeypatch.setattr(service, "check_and_record", lambda user_id: _noop(user_id))

    class FailingAdapter:
        async def transcribe(self, audio: bytes, *, mime_type: str) -> TranscriptionResult:
            del audio, mime_type
            raise TranscriptionTimeoutError

    with pytest.raises(TranscriptionTimeoutError):
        await service.transcribe(uuid4(), b"audio", mime_type="audio/mp4", adapter=FailingAdapter())


async def test_adapter_sends_language_and_deterministic_filename() -> None:
    def handler(request: Request) -> Response:
        body = request.content
        assert b'filename="dictation.mp4"' in body
        assert b'name="language"\r\n\r\nes\r\n' in body
        assert b'name="task"' not in body
        assert b'name="temperature"' not in body
        return Response(200, json={"text": "texto"})

    client = httpx.AsyncClient(transport=MockTransport(handler))
    try:
        result = await WhisperHttpAdapter(client=client).transcribe(b"audio", mime_type="audio/mp4")
    finally:
        await client.aclose()

    assert result.text == "texto"


@pytest.mark.parametrize(
    ("response", "error"),
    [
        (Response(422), InvalidAudioError),
        (Response(503), TranscriptionBusyError),
        (Response(504), TranscriptionTimeoutError),
    ],
)
async def test_adapter_maps_whisper_statuses(response: Response, error: type[Exception]) -> None:
    client = httpx.AsyncClient(transport=MockTransport(lambda request: response))
    try:
        with pytest.raises(error):
            await WhisperHttpAdapter(client=client).transcribe(b"audio", mime_type="audio/webm")
    finally:
        await client.aclose()


@pytest.mark.parametrize(
    ("failure", "error"),
    [
        (httpx.ReadTimeout("timed out"), TranscriptionTimeoutError),
        (httpx.ConnectError("unavailable"), TranscriptionError),
    ],
)
async def test_adapter_maps_httpx_failures(
    failure: httpx.TransportError, error: type[Exception]
) -> None:
    def handler(request: Request) -> Response:
        failure.request = request
        raise failure

    client = httpx.AsyncClient(transport=MockTransport(handler))
    try:
        with pytest.raises(error):
            await WhisperHttpAdapter(client=client).transcribe(b"audio", mime_type="audio/webm")
    finally:
        await client.aclose()


async def test_route_preserves_raw_body_and_returns_text(monkeypatch) -> None:
    user_id = uuid4()
    observed: dict[str, object] = {}

    async def fake_transcribe(
        received_user_id: UUID,
        audio: bytes,
        *,
        mime_type: str,
        adapter: object,
    ) -> TranscriptionResult:
        observed.update(user_id=received_user_id, audio=audio, mime_type=mime_type)
        return TranscriptionResult(text="texto")

    monkeypatch.setattr(transcriptions_route, "transcribe", fake_transcribe)
    app.dependency_overrides[get_current_user] = lambda: {"id": user_id}
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/transcriptions",
                content=b"raw-audio",
                headers={"content-type": "audio/webm"},
            )
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 200
    assert response.json() == {"text": "texto"}
    assert observed == {"user_id": user_id, "audio": b"raw-audio", "mime_type": "audio/webm"}


@pytest.mark.parametrize(
    ("error", "status", "code"),
    [
        (VoiceDisabledError, 503, "VOICE_TRANSCRIPTION_DISABLED"),
        (InvalidAudioError, 422, "INVALID_AUDIO"),
        (VoiceRateLimitError, 429, "VOICE_RATE_LIMIT_EXCEEDED"),
        (TranscriptionBusyError, 503, "TRANSCRIPTION_BUSY"),
        (TranscriptionTimeoutError, 504, "TRANSCRIPTION_TIMEOUT"),
        (TranscriptionError, 502, "TRANSCRIPTION_FAILED"),
    ],
)
async def test_route_maps_public_transcription_errors(
    monkeypatch, error: type[TranscriptionError], status: int, code: str
) -> None:
    async def fail(*args, **kwargs) -> TranscriptionResult:
        raise error

    monkeypatch.setattr(transcriptions_route, "transcribe", fail)
    app.dependency_overrides[get_current_user] = lambda: {"id": uuid4()}
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/transcriptions",
                content=b"raw-audio",
                headers={"content-type": "audio/webm"},
            )
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == status
    assert response.json() == {"detail": {"code": code}}


async def _noop(user_id: UUID) -> None:
    del user_id
