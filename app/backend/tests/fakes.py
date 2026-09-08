"""Test-only adapters for external boundaries."""

from __future__ import annotations

from dataclasses import dataclass

from backend.transcription.schemas import TranscriptionResult


@dataclass(frozen=True)
class FakeTranscriber:
    text: str = "Nota clínica de prueba."

    async def transcribe(self, audio: bytes, *, mime_type: str) -> TranscriptionResult:
        del audio, mime_type
        return TranscriptionResult(text=self.text)
