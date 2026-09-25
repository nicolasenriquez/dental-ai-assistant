"""Catalog integrity contracts using small, synthetic clinical vocabulary."""

from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from pathlib import Path

import pytest

from backend.clinical_assistant.terminology import (
    AUTO_GROUND_ALIASES,
    CatalogValidationError,
    canonical_digest,
    load_bundled_catalog,
    load_catalog,
    prepare_aliases,
    validate_auto_ground_aliases,
)


def _entry(concept_id: str, term: str, term_en: str, aliases: list[str]) -> dict:
    return {
        "id": concept_id,
        "term": term,
        "term_en": term_en,
        "aliases": aliases,
        "definition": f"Definición revisada de {term}.",
        "metadata": {
            "domain": "odontologia_general",
            "category": "anatomia",
            "tags": ["fixture"],
            "source_ids": ["SOURCE"],
        },
    }


def _catalog() -> dict:
    return {
        "schema_version": "1.0.0",
        "dataset_id": "synthetic-dental-fixture",
        "locale": "es-CL",
        "secondary_language": "en",
        "sources": {
            "SOURCE": {
                "name": "Synthetic source",
                "organization": "Fixture",
                "type": "test",
                "url": "https://example.test/source",
                "scope": "Test only",
            }
        },
        "entries": [
            _entry("anat.crown", "corona dental", "dental crown", ["corona"]),
            _entry("restoration.crown", "corona protésica", "dental crown", ["funda"]),
            _entry("anat.root_canal", "conducto radicular", "root canal", []),
            _entry(
                "endo.root_canal_treatment",
                "tratamiento endodóntico",
                "root canal treatment",
                ["root canal", "endodoncia"],
            ),
            _entry("specialty.endodontics", "endodoncia", "endodontics", []),
            _entry("ortho.bracket", "bracket", "bracket", ["braquet", "bráquet"]),
            _entry("ortho.tad", "microtornillo", "temporary anchorage device", ["TAD"]),
            _entry(
                "anat.tmj", "articulación temporomandibular", "temporomandibular joint", ["TMJ"]
            ),
            _entry("diag.cbct", "tomografía de haz cónico", "cone beam CT", ["CBCT"]),
            _entry("perio.bop", "sangrado al sondaje", "bleeding on probing", ["BOP"]),
        ],
    }


def _write_catalog(path: Path, data: dict) -> str:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return str(canonical_digest(data))


def test_canonical_digest_uses_exact_json_bytes() -> None:
    data = _catalog()
    expected = hashlib.sha256(
        json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    ).hexdigest()
    assert canonical_digest(data) == expected
    reordered = {key: data[key] for key in reversed(data)}
    assert canonical_digest(reordered) == expected
    reordered["entries"] = list(reversed(data["entries"]))
    assert canonical_digest(reordered) != expected


def test_bundled_catalog_matches_reviewed_manifest() -> None:
    catalog = load_bundled_catalog()
    assert catalog.schema_version == "1.0.0"
    assert len(catalog.entries) == 161
    assert catalog.checksum == "8efa6052cd045e7211d889009ffb30588cc5adc9bf53c6538dd36fd5b561f66a"


def test_load_catalog_rejects_digest_mismatch_before_database_work(tmp_path: Path) -> None:
    path = tmp_path / "catalog.json"
    _write_catalog(path, _catalog())
    with pytest.raises(CatalogValidationError, match="checksum"):
        load_catalog(path, "0" * 64)


@pytest.mark.parametrize(
    "mutation",
    [
        lambda data: data.update(schema_version="2.0.0"),
        lambda data: data["entries"].append(deepcopy(data["entries"][0])),
        lambda data: data["entries"][0]["metadata"].update(source_ids=["MISSING"]),
        lambda data: data["entries"][0].update(aliases=[{"value": "corona"}]),
        lambda data: data["entries"][0].update(definition=""),
    ],
    ids=["schema", "duplicate-id", "unknown-source", "structured-alias", "blank-definition"],
)
def test_load_catalog_rejects_invalid_structure(tmp_path: Path, mutation) -> None:
    data = _catalog()
    mutation(data)
    path = tmp_path / "catalog.json"
    expected = _write_catalog(path, data)
    with pytest.raises(CatalogValidationError):
        load_catalog(path, expected)


def test_alias_language_is_structural_and_dedupe_is_per_concept() -> None:
    data = _catalog()
    bracket = next(entry for entry in data["entries"] if entry["id"] == "ortho.bracket")
    aliases = prepare_aliases(bracket)
    assert aliases == [("braquet", "braquet", "und", "synonym")]
    tad = next(entry for entry in data["entries"] if entry["id"] == "ortho.tad")
    assert prepare_aliases(tad) == [("TAD", "tad", "und", "abbreviation")]
    assert data["entries"][0]["term_en"] == data["entries"][1]["term_en"]
    assert {entry["id"] for entry in data["entries"] if entry["term_en"] == "dental crown"} == {
        "anat.crown",
        "restoration.crown",
    }


def test_auto_ground_allowlist_requires_one_exact_active_und_alias(tmp_path: Path) -> None:
    data = _catalog()
    path = tmp_path / "catalog.json"
    catalog = load_catalog(path, _write_catalog(path, data))
    assert frozenset({"TAD", "TMJ", "CBCT", "BOP"}) == AUTO_GROUND_ALIASES
    validate_auto_ground_aliases(catalog.entries)

    tad = next(entry for entry in data["entries"] if entry["id"] == "ortho.tad")
    tad["aliases"] = []
    missing = load_catalog(path, _write_catalog(path, data))
    with pytest.raises(CatalogValidationError, match="TAD"):
        validate_auto_ground_aliases(missing.entries)

    tad["aliases"] = ["TAD"]
    data["entries"][0]["aliases"].append("TAD")
    ambiguous = load_catalog(path, _write_catalog(path, data))
    with pytest.raises(CatalogValidationError, match="TAD"):
        validate_auto_ground_aliases(ambiguous.entries)
