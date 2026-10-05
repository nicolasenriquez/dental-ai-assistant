from __future__ import annotations

from typing import Protocol

from .schemas import TranscriptionResult


class TranscriptionPort(Protocol):
    async def transcribe(self, audio: bytes, *, mime_type: str) -> TranscriptionResult:
        """Decode and transcribe one ephemeral audio payload."""
