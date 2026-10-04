"""Shared cursor transport; domain modules validate decoded payloads."""

import base64
import json
from typing import Any

from pydantic import BaseModel


def decode_cursor_payload(value: str) -> Any:
    return json.loads(
        base64.b64decode(value + "=" * (-len(value) % 4), altchars=b"-_", validate=True)
    )


def encode_cursor_payload(cursor: BaseModel) -> str:
    return base64.urlsafe_b64encode(cursor.model_dump_json().encode()).decode().rstrip("=")
