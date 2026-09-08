"""Authenticated voice dictation endpoint."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from backend.auth.dependencies import get_current_user
from backend.config import VOICE_MAX_BYTES
from backend.transcription.schemas import TranscriptionResponse
from backend.transcription.service import (
    InvalidAudioError,
    TranscriptionError,
    VoiceDisabledError,
    VoiceRateLimitError,
    transcribe,
)
from backend.transcription.whisper_adapter import WhisperHttpAdapter

router = APIRouter(tags=["transcription"])


@router.post("/transcriptions", response_model=TranscriptionResponse)
async def create_transcription(
    request: Request, user: dict[str, Any] = Depends(get_current_user)
) -> TranscriptionResponse:
    mime_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    declared_size = request.headers.get("content-length")
    if declared_size and declared_size.isdigit() and int(declared_size) > VOICE_MAX_BYTES:
        raise HTTPException(status_code=413, detail={"code": "AUDIO_TOO_LARGE"})
    chunks: list[bytes] = []
    received = 0
    async for chunk in request.stream():
        received += len(chunk)
        if received > VOICE_MAX_BYTES:
            raise HTTPException(status_code=413, detail={"code": "AUDIO_TOO_LARGE"})
        chunks.append(chunk)
    audio = b"".join(chunks)
    try:
        adapter = getattr(request.app.state, "whisper_adapter", None) or WhisperHttpAdapter()
        result = await transcribe(
            user["id"],
            audio,
            mime_type=mime_type,
            adapter=adapter,
        )
    except VoiceDisabledError:
        raise HTTPException(status_code=503, detail={"code": VoiceDisabledError.code}) from None
    except InvalidAudioError:
        raise HTTPException(status_code=422, detail={"code": InvalidAudioError.code}) from None
    except VoiceRateLimitError:
        raise HTTPException(status_code=429, detail={"code": VoiceRateLimitError.code}) from None
    except TranscriptionError:
        raise HTTPException(status_code=502, detail={"code": "TRANSCRIPTION_FAILED"}) from None
    return TranscriptionResponse(text=result.text)
