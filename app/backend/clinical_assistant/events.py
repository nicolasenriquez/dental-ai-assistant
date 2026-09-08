"""Small SSE event encoder for the clinical protocol."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any


def event(name: str, payload: dict[str, Any]) -> str:
    body = {"created_at": datetime.now(UTC).isoformat(), **payload}
    return f"event: {name}\ndata: {json.dumps(body, ensure_ascii=False, default=str)}\n\n"
