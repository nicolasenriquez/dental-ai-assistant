"""Basic optional contact validation; no country or deliverability inference."""

import re
import unicodedata


def normalize_phone(value: str | None) -> str | None:
    if value is None or not value.strip():
        return None
    value = value.strip()
    digits = re.sub(r"[^0-9]", "", value)
    if len(value) > 40 or not re.fullmatch(r"\+?[0-9 ()-]+", value) or not 1 <= len(digits) <= 15:
        raise ValueError("Ingresa un teléfono de 1 a 15 dígitos, sin extensiones.")
    return value


def normalize_email(value: str | None) -> str | None:
    if value is None or not value.strip():
        return None
    value = value.strip()
    if (
        len(value) > 254
        or any(unicodedata.category(character) == "Cc" for character in value)
        or not re.fullmatch(
            r"[^\s\x00-\x1f\x7f@]+@[^\s\x00-\x1f\x7f@.]+(?:\.[^\s\x00-\x1f\x7f@.]+)+", value
        )
    ):
        raise ValueError("Ingresa un correo válido, como nombre@dominio.cl.")
    return value
