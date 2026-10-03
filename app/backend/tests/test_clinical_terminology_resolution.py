"""Exact matches are authoritative; weak lexical candidates never are."""

from __future__ import annotations

from copy import deepcopy

import pytest

from backend.clinical_assistant.terminology import (
    FUZZY_MAX_CANDIDATES,
    FUZZY_MIN_RATIO,
    MAX_TERMINOLOGY_TERMS,
    resolve_terms,
)
from backend.tests.test_clinical_terminology_catalog import _catalog, _entry


def _resolve(*terms: str, entries: list[dict] | None = None):
    return resolve_terms(list(terms), entries if entries is not None else _catalog()["entries"])


@pytest.mark.parametrize(
    ("input_term", "concept_id", "match_type"),
    [
        ("corona dental", "anat.crown", "preferred_es"),
        ("temporomandibular joint", "anat.tmj", "preferred_en"),
        ("TMJ", "anat.tmj", "alias"),
        ("bráquet", "ortho.bracket", "alias"),
        ("BRAQUET", "ortho.bracket", "alias"),
    ],
)
def test_unique_exact_match_has_reviewed_definition(
    input_term: str, concept_id: str, match_type: str
) -> None:
    result = _resolve(input_term)[0]
    assert result.status == "matched"
    assert result.concept is not None
    assert result.concept.concept_id == concept_id
    assert result.concept.definition
    assert result.match_type == match_type
    assert result.confidence == 1.0


@pytest.mark.parametrize("input_term", ["dental crown", "root canal", "endodoncia"])
def test_exact_collision_is_ambiguous_without_authoritative_definition(input_term: str) -> None:
    result = _resolve(input_term)[0]
    assert result.status == "ambiguous"
    assert result.concept is None
    assert len(result.candidates) == 2
    assert all(candidate.definition is None for candidate in result.candidates)


def test_normalization_handles_accents_punctuation_hyphens_and_whitespace() -> None:
    entries = [_entry("x", "maloclusión dentaria", "dental malocclusion", [])]
    assert _resolve("  MALOCLUSIÓN--DENTARIA!  ", entries=entries)[0].status == "matched"
    assert _resolve("maloclusion dentaria", entries=entries)[0].status == "matched"


@pytest.mark.parametrize("input_term", ["TMD", "PD", "PS", "CBCTT", "T.M.J."])
def test_short_or_acronym_shaped_unknowns_do_not_fuzzy_match(input_term: str) -> None:
    result = _resolve(input_term)[0]
    assert result.status == "not_found"
    assert result.candidates == ()


def test_fuzzy_threshold_is_inclusive_and_never_authoritative() -> None:
    assert FUZZY_MIN_RATIO == 0.80
    assert FUZZY_MAX_CANDIDATES == 3
    entries = [_entry("a", "abcdf", "qwerty", [])]
    result = _resolve("abcde", entries=entries)[0]
    assert result.status == "ambiguous"
    assert result.concept is None
    assert result.candidates[0].concept_id == "a"
    assert result.candidates[0].score == 0.8
    assert result.candidates[0].definition is None
    assert _resolve("abcxy", entries=entries)[0].status == "not_found"


def test_fuzzy_candidates_are_concept_deduplicated_ranked_and_capped() -> None:
    entries = [
        _entry("c", "abcdf", "abcdf", ["abcdf"]),
        _entry("b", "abcdf", "other", []),
        _entry("a", "abcdf", "other", []),
        _entry("d", "abcdf", "other", []),
    ]
    result = _resolve("abcde", entries=entries)[0]
    assert result.status == "ambiguous"
    assert [candidate.concept_id for candidate in result.candidates] == ["a", "b", "c"]


def test_batch_bound_counts_raw_duplicates_before_normalized_dedupe() -> None:
    assert MAX_TERMINOLOGY_TERMS == 8
    assert len(_resolve(*(["TMJ"] * 8))) == 1
    assert len(_resolve("TMJ", "tmj", "T.M.J.")) == 2
    with pytest.raises(ValueError):
        _resolve(*(["TMJ"] * 9))
    with pytest.raises(ValueError):
        resolve_terms([], deepcopy(_catalog()["entries"]))


def test_mixed_known_unknown_batch_does_not_expand_unknown() -> None:
    results = _resolve("TAD", "IZC")
    assert [result.status for result in results] == ["matched", "not_found"]
    assert results[0].concept is not None
    assert results[0].concept.concept_id == "ortho.tad"
    assert results[1].concept is None
    assert results[1].candidates == ()
