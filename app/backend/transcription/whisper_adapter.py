"""HTTP adapter for the internal Whisper sidecar."""

from __future__ import annotations

import httpx

from backend.config import VOICE_LANGUAGE, WHISPER_HTTP_TIMEOUT_SECONDS, WHISPER_URL

from .errors import (
    InvalidAudioError,
    TranscriptionBusyError,
    TranscriptionError,
    TranscriptionTimeoutError,
)
from .schemas import TranscriptionResult

_DICTATION_FILENAMES = {"audio/webm": "dictation.webm", "audio/mp4": "dictation.mp4"}


class WhisperHttpAdapter:
    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self._client = client

    async def start(self) -> None:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=WHISPER_HTTP_TIMEOUT_SECONDS)

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def transcribe(self, audio: bytes, *, mime_type: str) -> TranscriptionResult:
        filename = _DICTATION_FILENAMES.get(mime_type)
        if filename is None:
            raise InvalidAudioError

        async def send(client: httpx.AsyncClient) -> httpx.Response:
            return await client.post(
                f"{WHISPER_URL}/transcribe",
                files={"audio": (filename, audio, mime_type)},
                data={"language": VOICE_LANGUAGE},
            )

        try:
            if self._client is None:
                async with httpx.AsyncClient(timeout=WHISPER_HTTP_TIMEOUT_SECONDS) as client:
                    response = await send(client)
            else:
                response = await send(self._client)
        except httpx.TimeoutException as exc:
            raise TranscriptionTimeoutError from exc
        except httpx.TransportError as exc:
            raise TranscriptionError from exc

        if response.status_code == 422:
            raise InvalidAudioError
        if response.status_code == 503:
            raise TranscriptionBusyError
        if response.status_code == 504:
            raise TranscriptionTimeoutError
        if response.status_code != 200:
            raise TranscriptionError
        return TranscriptionResult.model_validate(response.json())
