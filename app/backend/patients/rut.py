"""Normalization and masking for Chilean RUT values."""

from __future__ import annotations

import re
from typing import Any

_RUT_PATTERN = re.compile(r"^([0-9]{1,8})([0-9K])$")

# Boundary candidates for redaction: formatted, masked, and compact RUTs.
# Compact bodies are 5-8 digits and must pass normalize_rut() before anything
# is redacted, so plain numbers in prose are not corrupted.
_FORMATTED_CANDIDATE = r"(?<!\d)(?:(?:[\d•]{1,2}(?:[.\s][\d•]{3}){1,2}|[\d•]{4,8})-[0-9kK])(?!\d)"
_COMPACT_CANDIDATE = r"(?<![\d.])(\d{5,8})([0-9kK])(?!\d)"
RUT_CANDIDATE_RE = re.compile(f"(?:{_FORMATTED_CANDIDATE}|{_COMPACT_CANDIDATE})")


def redact_rut_candidates(text: str, replacement: str = "[RUT_REDACTED]") -> str:
    """Replace every RUT-like boundary candidate in text with `replacement`."""
    return RUT_CANDIDATE_RE.sub(replacement, text)


def normalize_rut(value: str) -> tuple[int, str]:
    if not isinstance(value, str):
        raise ValueError("Formato o DV invalido")
    compact = re.sub(r"[.\s-]", "", value).upper()
    match = _RUT_PATTERN.fullmatch(compact)
    if not match:
        raise ValueError("Formato o DV invalido")

    number_text, supplied_dv = match.groups()
    number = int(number_text)
    if number <= 0 or _check_digit(number) != supplied_dv:
        raise ValueError("Formato o DV invalido")
    return number, supplied_dv


def mask_rut(number: int, check_digit: str) -> str:
    digits = str(number)
    visible_count = min(3, len(digits) - 1)
    visible = digits[-visible_count:] if visible_count else ""
    masked = "•" * (len(digits) - visible_count) + visible
    groups: list[str] = []
    while masked:
        groups.insert(0, masked[-3:])
        masked = masked[:-3]
    return f"{'.'.join(groups)}-{check_digit.upper()}"


def public_patient(row: dict[str, Any]) -> dict[str, Any]:
    """Return the public patient fields without exposing stored RUT components."""
    return {
        "id": row["id"],
        "first_name": row["first_name"],
        "last_name": row["last_name"],
        "rut_masked": mask_rut(row["rut_number"], row["rut_dv"]),
        "last_evolution_at": row.get("last_evolution_at"),
        "birth_date": row.get("birth_date"),
    }


def _check_digit(number: int) -> str:
    total = 0
    factor = 2
    for digit in reversed(str(number)):
        total += int(digit) * factor
        factor = 2 if factor == 7 else factor + 1
    remainder = 11 - total % 11
    return "0" if remainder == 11 else "K" if remainder == 10 else str(remainder)
