"""Versioned SSE event encoder for the clinical protocol."""

from __future__ import annotations

import json
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

SCHEMA_VERSION = 1
_sequence: ContextVar[int] = ContextVar("clinical_event_sequence", default=0)


def event(name: str, payload: dict[str, Any]) -> str:
    sequence = _sequence.get() + 1
    _sequence.set(sequence)
    body = {
        "schema_version": SCHEMA_VERSION,
        "event_id": str(uuid4()),
        "sequence": sequence,
        "thread_id": payload.get("thread_id"),
        "turn_id": payload.get("turn_id"),
        "item_id": payload.get("item_id"),
        "item_type": payload.get("item_type", name),
        "status": payload.get("status"),
        "data": {"created_at": datetime.now(UTC).isoformat(), **payload},
    }
    return f"event: {name}\ndata: {json.dumps(body, ensure_ascii=False, default=str)}\n\n"
