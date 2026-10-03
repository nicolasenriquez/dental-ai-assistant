"""Ordered, private patient search grammar, independent of create validation."""

import re
import unicodedata
from typing import Literal

from backend.patients.rut import normalize_rut

SearchKind = Literal["all", "phone", "rut", "fragment", "name", "none"]


def classify_search(query: str) -> tuple[SearchKind, str]:
    term = " ".join(query.split())
    digits = re.sub(r"[^0-9]", "", term)
    if not term:
        return "all", ""
    phone_format = re.fullmatch(r"\+?[0-9 ()-]+", term)
    if digits and phone_format and (term.startswith("+") or re.search(r"\([0-9 ]+\)", term)):
        return "phone", digits
    explicit = re.fullmatch(r"[0-9.]+-[0-9Kk]|[0-9.]+[Kk]", term)
    if explicit:
        body = term[:-2] if "-" in term else term[:-1]
        explicit = (
            re.fullmatch(r"[0-9]+(?:\.[0-9]+)*", body)
            if 1 <= len(re.sub(r"[^0-9]", "", body)) <= 8
            else None
        )
    compact = re.fullmatch(r"[0-9]{9}", term)
    if explicit or compact:
        try:
            body_number, _ = normalize_rut(term)
            return "rut", str(body_number)
        except ValueError:
            return ("none", "") if explicit else ("phone", digits)
    if re.fullmatch(r"[0-9]{1,8}", term):
        return "fragment", term
    if digits and phone_format:
        return "phone", digits
    normalized = unicodedata.normalize("NFKD", term.lower())
    return "name", "".join(
        character for character in normalized if not unicodedata.combining(character)
    )
