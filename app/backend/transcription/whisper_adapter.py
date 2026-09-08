"""HTTP adapter for the internal Whisper sidecar."""

from __future__ import annotations

import httpx

from backend.config import WHISPER_URL

from .schemas import TranscriptionResult


class WhisperHttpAdapter:
    async def transcribe(self, audio: bytes, *, mime_type: str) -> TranscriptionResult:
        async with httpx.AsyncClient(timeout=90) as client:
            response = await client.post(
                f"{WHISPER_URL}/transcribe",
                files={"audio": ("dictation", audio, mime_type)},
                data={"language": "es", "task": "transcribe", "temperature": "0"},
            )
        if response.status_code != 200:
            raise RuntimeError("Whisper transcription failed")
        return TranscriptionResult.model_validate(response.json())
