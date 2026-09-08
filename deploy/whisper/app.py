"""Small internal-only Whisper dictation sidecar."""

from __future__ import annotations

import asyncio
import os
import subprocess
import tempfile
from contextlib import suppress
from pathlib import Path
from typing import Any

import whisper
from fastapi import FastAPI, File, HTTPException, UploadFile

MAX_BYTES = 12 * 1024 * 1024
MAX_DURATION_SECONDS = 120
INFERENCE_TIMEOUT_SECONDS = 90
ALLOWED_MIME_TYPES = {"audio/webm", "audio/mp4", "audio/wav", "audio/mpeg"}

app = FastAPI(title="Dental AI Whisper")
model = whisper.load_model(os.environ.get("WHISPER_MODEL", "turbo"))
inference_slot = asyncio.Semaphore(1)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


def _duration(path: str) -> float:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            path,
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return float(result.stdout.strip())


def _finish_timed_out_inference(task: asyncio.Task[Any], path: str) -> None:
    try:
        task.exception()
    except asyncio.CancelledError:
        pass
    finally:
        inference_slot.release()
        with suppress(FileNotFoundError):
            os.unlink(path)


@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)) -> dict[str, str]:
    if audio.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=422, detail="invalid audio")
    if inference_slot.locked():
        raise HTTPException(status_code=503, detail="busy")
    payload = await audio.read(MAX_BYTES + 1)
    if not payload or len(payload) > MAX_BYTES:
        raise HTTPException(status_code=422, detail="invalid audio")
    suffix = Path(audio.filename or "dictation.webm").suffix or ".webm"
    temporary_path: str | None = None
    inference_task: asyncio.Task[Any] | None = None
    if inference_slot.locked():
        raise HTTPException(status_code=503, detail="busy")
    await inference_slot.acquire()
    slot_held = True
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temporary:
            temporary.write(payload)
            temporary_path = temporary.name
        duration = await asyncio.to_thread(_duration, temporary_path)
        if duration <= 0 or duration > MAX_DURATION_SECONDS:
            raise HTTPException(status_code=422, detail="audio duration exceeds limit")
        inference_task = asyncio.create_task(
            asyncio.to_thread(
                model.transcribe,
                temporary_path,
                language="es",
                task="transcribe",
                temperature=0,
            )
        )
        result = await asyncio.wait_for(
            asyncio.shield(inference_task), timeout=INFERENCE_TIMEOUT_SECONDS
        )
        return {"text": str(result.get("text", "")).strip()}
    except TimeoutError:
        slot_held = False
        if inference_task is not None:
            inference_task.add_done_callback(
                lambda task, path=temporary_path: _finish_timed_out_inference(task, path or "")
            )
            inference_task = None
            temporary_path = None
        raise HTTPException(status_code=504, detail="transcription timeout") from None
    except HTTPException:
        raise
    except (OSError, ValueError, subprocess.SubprocessError):
        raise HTTPException(status_code=422, detail="invalid audio") from None
    finally:
        if slot_held:
            inference_slot.release()
        if temporary_path:
            with suppress(FileNotFoundError):
                os.unlink(temporary_path)
