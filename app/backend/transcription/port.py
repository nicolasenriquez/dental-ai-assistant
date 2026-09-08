from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from .schemas import TranscriptionResult


class TranscriptionPort(Protocol):
    async def transcribe(self, audio: bytes, *, mime_type: str) -> TranscriptionResult:
        """Decode and transcribe one ephemeral audio payload."""


@dataclass(frozen=True)
class FakeTranscriber:
    """Small deterministic adapter for route and browser tests."""

    text: str = "Nota clínica de prueba."

    async def transcribe(self, audio: bytes, *, mime_type: str) -> TranscriptionResult:
        del audio, mime_type
        return TranscriptionResult(text=self.text)
