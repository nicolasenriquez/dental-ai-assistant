"""Rate-limited transcription service with ephemeral audio handling."""

from __future__ import annotations

import logging
from typing import Final
from uuid import UUID

from backend.config import (
    VOICE_MAX_BYTES,
    VOICE_TRANSCRIPTION_ENABLED,
)
from backend.db.voice_rate_limit_repo import VoiceRateLimitReached, check_and_record

from .port import TranscriptionPort
from .schemas import TranscriptionResult

logger = logging.getLogger(__name__)
ALLOWED_MIME_TYPES: Final = frozenset({"audio/webm", "audio/webm;codecs=opus", "audio/mp4"})


class TranscriptionError(RuntimeError):
    code = "TRANSCRIPTION_FAILED"


class VoiceDisabledError(TranscriptionError):
    code = "VOICE_TRANSCRIPTION_DISABLED"


class InvalidAudioError(TranscriptionError):
    code = "INVALID_AUDIO"


class VoiceRateLimitError(TranscriptionError):
    code = "VOICE_RATE_LIMIT_EXCEEDED"


async def _check_rate_limit(user_id: UUID) -> None:
    try:
        await check_and_record(user_id)
    except VoiceRateLimitReached:
        raise VoiceRateLimitError from None


async def transcribe(
    user_id: UUID, audio: bytes, *, mime_type: str, adapter: TranscriptionPort
) -> TranscriptionResult:
    if not VOICE_TRANSCRIPTION_ENABLED:
        raise VoiceDisabledError
    if mime_type not in ALLOWED_MIME_TYPES or not audio or len(audio) > VOICE_MAX_BYTES:
        raise InvalidAudioError
    await _check_rate_limit(user_id)
    try:
        result = await adapter.transcribe(audio, mime_type=mime_type)
        logger.info(
            "transcription_completed user_id=%s size_bucket=%s status=200",
            user_id,
            _size_bucket(len(audio)),
        )
        return result
    except TranscriptionError:
        raise
    except Exception as exc:
        logger.warning("transcription_failed user_id=%s error_code=TRANSCRIPTION_FAILED", user_id)
        raise TranscriptionError from exc


def _size_bucket(size: int) -> str:
    if size <= 256 * 1024:
        return "small"
    if size <= 2 * 1024 * 1024:
        return "medium"
    return "large"
