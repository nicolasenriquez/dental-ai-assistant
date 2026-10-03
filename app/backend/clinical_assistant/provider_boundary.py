"""Request-local pseudonymization of clinical provider payloads, never authorization.

Unknown names in free prose are not detected. This is not anonymization.
"""

from __future__ import annotations

import json
import re
from collections.abc import Mapping
from typing import Any

from backend.patients.rut import redact_rut_candidates

_UUID = re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b", re.I)
_EMAIL = re.compile(r"[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}")
# Require a Chilean prefix or an explicitly labelled number; dates are not phones.
_PHONE = re.compile(r"(?<!\w)\+56[\s().-]*\d(?:[\s().-]*\d){8}\b")
_PHONE_LABEL = re.compile(r"(?i)(?:tel[eé]fono|celular|phone)\s*[:=]?\s*(\+?[\d ()-]{8,20})")
_PII_KEYS = {
    "first_name": "NAME",
    "last_name": "NAME",
    "full_name": "NAME",
    "patient_name": "NAME",
    "email": "EMAIL",
    "phone": "PHONE",
    "mobile": "PHONE",
    "rut": "RUT",
    "rut_number": "RUT",
}


class ProviderBoundary:
    """Fresh symbol table for each complete outbound request."""

    def __init__(self, patient: Mapping[str, Any] | None = None) -> None:
        self.names = (
            tuple(
                sorted(
                    {
                        str(value).strip()
                        for value in (
                            f"{patient.get('first_name', '')} {patient.get('last_name', '')}",
                            patient.get("first_name", ""),
                            patient.get("last_name", ""),
                        )
                        if value and str(value).strip()
                    },
                    key=len,
                    reverse=True,
                )
            )
            if patient
            else ()
        )
        self.symbols: dict[str, str] = {}
        self.counts: dict[str, int] = {}

    def _token(self, value: str, kind: str) -> str:
        if value not in self.symbols:
            self.counts[kind] = self.counts.get(kind, 0) + 1
            self.symbols[value] = f"{kind}_{self.counts[kind]}"
        return self.symbols[value]

    def _text(self, text: str) -> str:
        for name in self.names:
            text = re.sub(
                rf"(?<!\w){re.escape(name)}(?!\w)",
                lambda m: self._token(m[0], "NAME"),
                text,
                flags=re.I,
            )
        text = _UUID.sub(lambda m: self._token(m[0], "PATIENT"), text)
        text = _EMAIL.sub(lambda m: self._token(m[0], "EMAIL"), text)
        text = _PHONE.sub(lambda m: self._token(m[0], "PHONE"), text)
        text = _PHONE_LABEL.sub(lambda m: m[0].replace(m[1], self._token(m[1], "PHONE")), text)
        return str(redact_rut_candidates(text))

    def _walk(self, value: Any, key: str = "") -> Any:
        if value is None or isinstance(value, bool | int | float):
            return (
                self._token(str(value), _PII_KEYS[key])
                if key in _PII_KEYS and value is not None
                else value
            )
        if isinstance(value, str):
            if key in _PII_KEYS:
                return self._token(value, _PII_KEYS[key]) if value else value
            # Tool results and structured drafting inputs are JSON carried in strings.
            if value.lstrip().startswith(("{", "[")):
                try:
                    decoded = json.loads(value)
                except json.JSONDecodeError:
                    return self._text(value)
                return json.dumps(self._walk(decoded), ensure_ascii=False)
            return self._text(value)
        if isinstance(value, dict):
            return {k: self._walk(v, k) for k, v in value.items()}
        if isinstance(value, list):
            return [self._walk(item) for item in value]
        raise ValueError("Unsupported clinical provider metadata")

    def prepare(self, request: dict[str, Any]) -> dict[str, Any]:
        self.symbols.clear()
        self.counts.clear()
        return dict(self._walk(request))

    def restore(self, text: str) -> str:
        reverse = {token: real for real, token in self.symbols.items()}
        if not reverse:
            return text
        pattern = "|".join(re.escape(token) for token in sorted(reverse, key=len, reverse=True))
        return re.sub(rf"(?<!\w)(?:{pattern})(?!\w)", lambda m: reverse[m[0]], text)
