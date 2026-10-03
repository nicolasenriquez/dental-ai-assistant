"""Representative terminology eval baseline for the bundled clinical catalog.

These cases record current conservative resolver behavior so retrieval
changes are measured against a known baseline instead of optimized blind.
Exact preferred terms and aliases are authoritative; fuzzy candidates are
suggestions only; unknown or differently worded expressions are never
expanded by guessing.
"""

from __future__ import annotations

import pytest

from backend.clinical_assistant.terminology import load_bundled_catalog, resolve_terms

ENTRIES = load_bundled_catalog().entries

CASES: list[tuple[str, str, str | None, bool]] = [
    # Exact preferred terms and aliases are authoritative.
    ("TAD", "matched", "ortho.tad", True),
    ("temporary anchorage device", "matched", "ortho.tad", True),
    ("microtornillo de anclaje temporal", "matched", "ortho.tad", True),
    ("minitornillo", "matched", "ortho.tad", True),
    ("orthodontic miniscrew", "matched", "ortho.tad", True),
    ("TMJ", "matched", "anat.tmj", True),
    ("ATM", "matched", "anat.tmj", True),
    ("CBCT", "matched", "diag.cbct", True),
    ("BOP", "matched", "perio.bop", True),
    ("sangrado al sondaje", "matched", "perio.bop", True),
    ("braquet", "matched", "ortho.bracket", True),
    ("xerostomia", "matched", "common.xerostomia", True),
    # Exact collisions stay ambiguous with no authoritative definition.
    ("dental crown", "ambiguous", None, False),
    ("endodoncia", "ambiguous", None, False),
    # Fuzzy candidates are suggestions only, never authority.
    ("microtornillo", "ambiguous", None, False),
    ("cariess", "ambiguous", None, False),
    ("mini-implante ortodonico", "ambiguous", None, False),
    # Unknown or differently worded expressions are not invented.
    ("T.A.D.", "not_found", None, False),
    ("dispositivo de anclaje temporal", "not_found", None, False),
    ("mini implante", "not_found", None, False),
    ("IZC", "not_found", None, False),
    ("profilaxis", "not_found", None, False),
    ("xy", "not_found", None, False),
]


@pytest.mark.parametrize(("raw", "status", "concept_id", "authoritative"), CASES)
def test_bundled_resolver_baseline(
    raw: str, status: str, concept_id: str | None, authoritative: bool
) -> None:
    result = resolve_terms([raw], ENTRIES)[0]
    assert result.status == status
    if concept_id is None:
        assert result.concept is None
    else:
        assert result.concept is not None
        assert result.concept.concept_id == concept_id
    if authoritative:
        assert result.concept is not None
        assert result.concept.definition
    elif result.concept is not None:
        assert result.concept.definition is None
    assert all(candidate.definition is None for candidate in result.candidates)


def test_known_and_unknown_batch_keeps_matched_and_unknown_separate() -> None:
    results = resolve_terms(["TAD", "IZC"], ENTRIES)
    assert [result.status for result in results] == ["matched", "not_found"]
    assert results[0].concept is not None
    assert results[0].concept.concept_id == "ortho.tad"
    assert results[1].concept is None
    assert results[1].candidates == ()
