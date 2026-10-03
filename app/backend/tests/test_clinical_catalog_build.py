"""Compiler contracts: workspace validation, deterministic output, parity.

The authoring workspace under ``knowledge/clinical/`` must compile to the
exact bundled runtime catalog, and every failure mode must stop the build
instead of shipping a partial artifact.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend.scripts import build_clinical_catalog as build

BUNDLED_DIGEST = "8efa6052cd045e7211d889009ffb30588cc5adc9bf53c6538dd36fd5b561f66a"
AUTO_GROUND = (
    ("ortho.tad", ["TAD"]),
    ("anat.tmj", ["TMJ"]),
    ("diag.cbct", ["CBCT"]),
    ("perio.bop", ["BOP"]),
)


def _toml_str(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def _card(
    folder: Path,
    concept_id: str,
    ordinal: int,
    *,
    term_es: str | None = None,
    term_en: str | None = None,
    aliases: tuple[str, ...] = (),
    tags: tuple[str, ...] = ("sintetico",),
    source_ids: tuple[str, ...] = ("SOURCE",),
    status: str = "active",
    review_status: str = "legacy_unreviewed",
    provenance_status: str = "unresolved",
    definition: str = "Definición sintética para pruebas.",
    runtime_metadata: dict[str, str] | None = None,
) -> Path:
    lines = ["+++"]
    lines.append(f"id = {_toml_str(concept_id)}")
    lines.append(f"ordinal = {ordinal}")
    lines.append('domain = "odontologia_general"')
    lines.append('category = "anatomia"')
    lines.append(f"term_es = {_toml_str(term_es or concept_id)}")
    lines.append(f"term_en = {_toml_str(term_en or concept_id)}")
    lines.append(f"aliases = {json.dumps(list(aliases), ensure_ascii=False)}")
    lines.append(f"tags = {json.dumps(list(tags), ensure_ascii=False)}")
    lines.append(f"source_ids = {json.dumps(list(source_ids), ensure_ascii=False)}")
    lines.append(f"status = {_toml_str(status)}")
    lines.append(f"review_status = {_toml_str(review_status)}")
    lines.append(f"provenance_status = {_toml_str(provenance_status)}")
    if runtime_metadata:
        lines.append("")
        lines.append("[runtime_metadata]")
        for key, value in runtime_metadata.items():
            lines.append(f"{key} = {_toml_str(value)}")
    lines.append("+++")
    lines.append("")
    lines.append("# Definition")
    lines.append("")
    lines.append(definition)
    lines.append("")
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / f"{concept_id}.md"
    target.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    return target


def _catalog_meta(root: Path) -> None:
    (root / "_meta").mkdir(parents=True, exist_ok=True)
    (root / "_meta" / "catalog.toml").write_text(
        "\n".join(
            [
                'schema_version = "1.0.0"',
                'dataset_id = "synthetic-workspace"',
                'title = "Synthetic workspace"',
                'locale = "es-CL"',
                'secondary_language = "en"',
                'created_at = "2026-01-01"',
                'intended_use = "Tests only."',
                'not_for = "Not clinical content."',
                "",
                "[editorial_policy]",
                'definitions = "Synthetic paraphrases."',
                "recommended_top_k = 3",
            ]
        )
        + "\n",
        encoding="utf-8",
        newline="\n",
    )


def _sources_registry(
    root: Path, *, license_status: str = "unresolved", review_status: str = "unreviewed"
) -> None:
    (root / "sources").mkdir(parents=True, exist_ok=True)
    (root / "sources" / "sources.toml").write_text(
        "\n".join(
            [
                'schema_version = "1.0.0"',
                "",
                "[[source]]",
                'id = "SOURCE"',
                'name = "Synthetic source"',
                'organization = "Fixture"',
                'type = "test"',
                'url = "https://example.test/source"',
                'scope = "Tests only."',
                f"license_status = {_toml_str(license_status)}",
                f"review_status = {_toml_str(review_status)}",
            ]
        )
        + "\n",
        encoding="utf-8",
        newline="\n",
    )


def _workspace(
    root: Path,
    *,
    review_status: str = "legacy_unreviewed",
    provenance_status: str = "unresolved",
    source_license: str = "unresolved",
    source_review: str = "unreviewed",
) -> Path:
    _catalog_meta(root)
    _sources_registry(root, license_status=source_license, review_status=source_review)
    concepts = root / "concepts" / "odontologia_general"
    for ordinal, (concept_id, aliases) in enumerate(AUTO_GROUND):
        _card(
            concepts,
            concept_id,
            ordinal,
            term_es=concept_id,
            term_en=concept_id,
            aliases=tuple(aliases),
            review_status=review_status,
            provenance_status=provenance_status,
        )
    _card(
        concepts,
        "general.checkup",
        len(AUTO_GROUND),
        term_es="control",
        term_en="checkup",
        review_status=review_status,
        provenance_status=provenance_status,
    )
    return root


def _artifact_path(tmp_path: Path) -> Path:
    path = tmp_path / "artifacts" / "glossary.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def test_compiles_deterministically_and_passes_runtime_validation(tmp_path: Path) -> None:
    root = _workspace(tmp_path / "ws")
    first = build.compile_catalog(build.load_workspace(root))
    second = build.compile_catalog(build.load_workspace(root))
    assert first == second
    assert build.render_catalog(first) == build.render_catalog(second)
    assert build.canonical_digest(first) == build.canonical_digest(second)
    assert first["stats"]["entry_count"] == 5
    assert first["stats"]["domains"] == {"odontologia_general": 5}


def test_write_then_check_round_trips_and_detects_drift(tmp_path: Path) -> None:
    root = _workspace(tmp_path / "ws")
    catalog_path = _artifact_path(tmp_path)
    checksum = build.write_workspace(root, catalog_path)
    assert build.check_workspace(root, catalog_path) == checksum
    assert catalog_path.with_suffix(".sha256").read_text(encoding="ascii").strip() == checksum
    assert catalog_path.parent.joinpath("glossary.manifest.json").exists()
    _card(
        root / "concepts" / "odontologia_general",
        "general.checkup",
        len(AUTO_GROUND),
        term_es="control modificado",
        term_en="checkup",
    )
    with pytest.raises(build.CatalogDriftError):
        build.check_workspace(root, catalog_path)


def test_duplicate_concept_id_fails(tmp_path: Path) -> None:
    root = _workspace(tmp_path / "ws")
    _card(root / "concepts" / "ortodoncia", "anat.tmj", 99, aliases=("TMJ-ALT",))
    with pytest.raises(build.CatalogSourceError, match="duplicate concept ID"):
        build.load_workspace(root)


def test_duplicate_ordinal_fails(tmp_path: Path) -> None:
    root = _workspace(tmp_path / "ws")
    _card(root / "concepts" / "ortodoncia", "ortho.extra", 0)
    with pytest.raises(build.CatalogSourceError, match="duplicate ordinal"):
        build.load_workspace(root)


def test_unknown_source_id_fails(tmp_path: Path) -> None:
    root = _workspace(tmp_path / "ws")
    _card(root / "concepts" / "ortodoncia", "ortho.extra", 99, source_ids=("MISSING",))
    with pytest.raises(build.CatalogSourceError, match="unknown source IDs"):
        build.load_workspace(root)


def test_malformed_alias_fails(tmp_path: Path) -> None:
    root = _workspace(tmp_path / "ws")
    _card(root / "concepts" / "ortodoncia", "ortho.extra", 99, aliases=("   ",))
    with pytest.raises(build.CatalogSourceError, match="aliases"):
        build.load_workspace(root)


def test_missing_required_field_fails(tmp_path: Path) -> None:
    root = _workspace(tmp_path / "ws")
    card = _card(root / "concepts" / "ortodoncia", "ortho.extra", 99)
    text = card.read_text(encoding="utf-8")
    card.write_text(
        "\n".join(line for line in text.splitlines() if "review_status" not in line),
        encoding="utf-8",
        newline="\n",
    )
    with pytest.raises(build.CatalogSourceError, match="review_status"):
        build.load_workspace(root)


def test_blank_definition_fails(tmp_path: Path) -> None:
    root = _workspace(tmp_path / "ws")
    _card(root / "concepts" / "ortodoncia", "ortho.extra", 99, definition="")
    with pytest.raises(build.CatalogSourceError, match="# Definition"):
        build.load_workspace(root)


@pytest.mark.parametrize(
    ("old", "new", "match"),
    [
        ('locale = "es-CL"', 'locale = "en-US"', "locale"),
        ('schema_version = "1.0.0"', 'schema_version = "2.0.0"', "schema_version"),
    ],
)
def test_invalid_locale_and_schema_fail(tmp_path: Path, old: str, new: str, match: str) -> None:
    root = _workspace(tmp_path / "ws")
    path = root / "_meta" / "catalog.toml"
    path.write_text(
        path.read_text(encoding="utf-8").replace(old, new),
        encoding="utf-8",
    )
    with pytest.raises(build.CatalogSourceError, match=match):
        build.load_workspace(root)


def test_missing_auto_ground_alias_fails_compilation(tmp_path: Path) -> None:
    root = _workspace(tmp_path / "ws")
    tad = root / "concepts" / "odontologia_general" / "ortho.tad.md"
    tad.write_text(
        tad.read_text(encoding="utf-8").replace('aliases = ["TAD"]', "aliases = []"),
        encoding="utf-8",
        newline="\n",
    )
    with pytest.raises(build.CatalogBuildError, match="TAD"):
        build.compile_catalog(build.load_workspace(root))


def test_inactive_card_leaves_runtime_and_is_reported(tmp_path: Path) -> None:
    root = _workspace(tmp_path / "ws")
    _card(
        root / "concepts" / "odontologia_general",
        "general.checkup",
        len(AUTO_GROUND),
        term_es="control",
        term_en="checkup",
        status="inactive",
    )
    workspace = build.load_workspace(root)
    compiled = build.compile_catalog(workspace)
    assert [entry["id"] for entry in compiled["entries"]] == [item[0] for item in AUTO_GROUND]
    manifest = build.build_manifest(workspace, compiled, build.canonical_digest(compiled))
    assert manifest["inactive_count"] == 1
    assert manifest["entry_count"] == 4


def test_runtime_metadata_is_preserved_in_compiled_entry(tmp_path: Path) -> None:
    root = _workspace(tmp_path / "ws")
    _card(
        root / "concepts" / "odontologia_general",
        "general.checkup",
        len(AUTO_GROUND),
        term_es="control",
        term_en="checkup",
        runtime_metadata={"chile_usage": "Uso local sintético."},
    )
    compiled = build.compile_catalog(build.load_workspace(root))
    entry = next(item for item in compiled["entries"] if item["id"] == "general.checkup")
    assert entry["metadata"]["chile_usage"] == "Uso local sintético."


def test_release_gate_blocks_legacy_and_accepts_cleared_workspace(tmp_path: Path) -> None:
    legacy = _workspace(tmp_path / "legacy")
    with pytest.raises(build.ReleaseGateError, match="legacy_unreviewed"):
        build.release_check(build.load_workspace(legacy))
    cleared = _workspace(
        tmp_path / "cleared",
        review_status="approved",
        provenance_status="documented",
        source_license="cleared",
        source_review="reviewed",
    )
    build.release_check(build.load_workspace(cleared))


def test_release_cli_checks_generated_artifacts_before_approval(tmp_path: Path) -> None:
    cleared = _workspace(
        tmp_path / "cleared",
        review_status="approved",
        provenance_status="documented",
        source_license="cleared",
        source_review="reviewed",
    )
    artifact = _artifact_path(tmp_path)
    args = ["--release-check", "--workspace", str(cleared), "--catalog", str(artifact)]
    assert build.main(args) == 1  # No generated artifact yet.
    build.write_workspace(cleared, artifact)
    assert build.main(args) == 0
    artifact.with_suffix(".sha256").write_text("0" * 64, encoding="ascii")
    assert build.main(args) == 1


def test_bundled_workspace_reproduces_reviewed_catalog() -> None:
    workspace = build.load_workspace()
    compiled = build.compile_catalog(workspace)
    assert len(workspace.cards) == 161
    assert len(workspace.sources) == 12
    assert build.canonical_digest(compiled) == BUNDLED_DIGEST
    assert build.render_catalog(compiled) == build.CATALOG_PATH.read_bytes()
    assert build.check_workspace() == BUNDLED_DIGEST


def test_bundled_workspace_release_hold_is_enforced() -> None:
    with pytest.raises(build.ReleaseGateError):
        build.release_check(build.load_workspace())
