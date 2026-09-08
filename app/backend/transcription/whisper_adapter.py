"""HTTP adapter for the internal Whisper sidecar."""

from __future__ import annotations

import httpx

from backend.config import WHISPER_URL

from .schemas import TranscriptionResult


class WhisperHttpAdapter:
    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self._client = client

    async def start(self) -> None:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=90)

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def transcribe(self, audio: bytes, *, mime_type: str) -> TranscriptionResult:
        if self._client is None:
            async with httpx.AsyncClient(timeout=90) as client:
                response = await client.post(
                    f"{WHISPER_URL}/transcribe",
                    files={"audio": ("dictation", audio, mime_type)},
                    data={"language": "es", "task": "transcribe", "temperature": "0"},
                )
        else:
            response = await self._client.post(
                f"{WHISPER_URL}/transcribe",
                files={"audio": ("dictation", audio, mime_type)},
                data={"language": "es", "task": "transcribe", "temperature": "0"},
            )
        if response.status_code != 200:
            raise RuntimeError("Whisper transcription failed")
        return TranscriptionResult.model_validate(response.json())
