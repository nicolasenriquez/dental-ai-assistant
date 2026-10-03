"""Fail-first Markdown export contract for the managed Drive slice (task 4.1).

The implementation seam is
``backend.integrations.google_drive.serialize_markdown_to_plain_text(text)``.
It must be deterministic, remove presentation-only Markdown/HTML delimiters,
preserve clinically meaningful text and line breaks, and return exactly one
final LF. Persisted UTF-8 byte limits are asserted by the route tests.
"""

from __future__ import annotations

from typing import Any, cast

import pytest


@pytest.fixture
def serialize_markdown_to_plain_text():
    from backend.integrations import google_drive

    return getattr(google_drive, "serialize_markdown_to_plain_text", None)


def _serialize(serializer: Any, source: str) -> str:
    assert callable(serializer), "missing serialize_markdown_to_plain_text contract"
    return cast(str, serializer(source))


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        (
            "# Evolución\r\n\r\n**Dolor** con [referencia](https://example.test).\r\n\r\n"
            "- Leve\r\n- Control\r\n",
            "Evolución\n\nDolor con referencia (https://example.test).\n\n• Leve\n• Control\n",
        ),
        (
            "> **Antecedente**\n\n`sin hallazgos`\n\n````\ntexto de código\n````\n",
            "Antecedente\n\nsin hallazgos\n\ntexto de código\n",
        ),
        (
            "- Uno\n  - Dos\n1. Primero\n2. Segundo\n\nhttps://example.test\n",
            "• Uno\n  • Dos\n1. Primero\n2. Segundo\n\nhttps://example.test\n",
        ),
        (
            "Texto <strong>importante</strong> <script>alert(1)</script>\n",
            "Texto importante alert(1)\n",
        ),
        (
            "Párrafo con   espacios horizontales   \n\n\n\nSiguiente párrafo",
            "Párrafo con   espacios horizontales\n\nSiguiente párrafo\n",
        ),
    ],
)
def test_markdown_export_matches_canonical_fixtures(
    serialize_markdown_to_plain_text, source: str, expected: str
) -> None:
    assert _serialize(serialize_markdown_to_plain_text, source) == expected


def test_markdown_export_is_deterministic(serialize_markdown_to_plain_text) -> None:
    source = "## Control\n\n- **Leve**\n- [nota](https://example.test)\n"
    assert _serialize(serialize_markdown_to_plain_text, source) == _serialize(
        serialize_markdown_to_plain_text, source
    )


def test_markdown_export_ends_with_one_newline(serialize_markdown_to_plain_text) -> None:
    result = _serialize(serialize_markdown_to_plain_text, "texto\n\n\n")
    assert result == "texto\n"
    assert not result.endswith("\n\n")


def test_markdown_export_preserves_unicode_and_link_destination(
    serialize_markdown_to_plain_text,
) -> None:
    source = "**Sensibilidad**: niño — [guía](https://example.test/guía)"
    result = _serialize(serialize_markdown_to_plain_text, source)
    assert result == "Sensibilidad: niño — guía (https://example.test/guía)\n"
    assert result.encode("utf-8").decode("utf-8") == result
