"""Shared transcription error vocabulary across service and HTTP boundaries."""

from __future__ import annotations


class TranscriptionError(RuntimeError):
    """Base error for failures that can be exposed by the transcription route."""

    code = "TRANSCRIPTION_FAILED"
    status_code = 502


class VoiceDisabledError(TranscriptionError):
    code = "VOICE_TRANSCRIPTION_DISABLED"
    status_code = 503


class InvalidAudioError(TranscriptionError):
    code = "INVALID_AUDIO"
    status_code = 422


class VoiceRateLimitError(TranscriptionError):
    code = "VOICE_RATE_LIMIT_EXCEEDED"
    status_code = 429


class TranscriptionBusyError(TranscriptionError):
    code = "TRANSCRIPTION_BUSY"
    status_code = 503


class TranscriptionTimeoutError(TranscriptionError):
    code = "TRANSCRIPTION_TIMEOUT"
    status_code = 504
