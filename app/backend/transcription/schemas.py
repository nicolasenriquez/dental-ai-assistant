from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints


class TranscriptionResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40_000)]


class TranscriptionResponse(BaseModel):
    text: str
