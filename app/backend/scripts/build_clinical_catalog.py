"""Compile reviewed clinical concept cards into the runtime glossary artifact.

The editable source of truth is ``knowledge/clinical/`` at the repository
root: one TOML-frontmatter Markdown card per concept plus a source registry
and catalog metadata. This host-side build tool validates that workspace and
renders the bundled runtime files under ``backend/data/``:

    dental_ai_glossary_es_cl_v1.json
    dental_ai_glossary_es_cl_v1.sha256
    dental_ai_glossary_es_cl_v1.manifest.json

Usage (from app/backend/):
    uv run python scripts/build_clinical_catalog.py --check
    uv run python scripts/build_clinical_catalog.py --write
    uv run python scripts/build_clinical_catalog.py --release-check

``--check`` never writes: it fails when the checked-in artifact drifts from
the workspace. ``--release-check`` fails while per-concept review or
source-level reuse rights remain unresolved; a successful build is not a
release decision (see knowledge/clinical/_meta/release-policy.md).

Exit codes: 0 success; 1 validation, drift, or build failure; 2 release gate.
"""

from __future__ import annotations

import argparse
import json
import sys
import tomllib
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# Ensure the backend package is on the path when run as a plain script
# (scripts/ is at app/backend/scripts/, parents[2] is app/).
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.clinical_assistant.terminology import (
    CATALOG_PATH,
    canonical_digest,
    normalize_term,
    validate_auto_ground_aliases,
    validate_catalog,
)

KNOWLEDGE_ROOT = Path(__file__).resolve().parents[3] / "knowledge" / "clinical"

SUPPORTED_SCHEMA_VERSION = "1.0.0"
SUPPORTED_LOCALE = "es-CL"
SUPPORTED_SECONDARY_LANGUAGE = "en"
CARD_STATUSES = frozenset({"active", "inactive"})
CARD_REVIEW_STATUSES = frozenset({"legacy_unreviewed", "in_review", "approved"})
PROVENANCE_STATUSES = frozenset({"unresolved", "documented"})
SOURCE_LICENSE_STATUSES = frozenset({"unresolved", "documented", "cleared"})
SOURCE_REVIEW_STATUSES = frozenset({"unreviewed", "reviewed"})
RESERVED_METADATA_KEYS = frozenset({"domain", "category", "tags", "source_ids"})
CATALOG_META_KEYS = (
    "schema_version",
    "dataset_id",
    "title",
    "locale",
    "secondary_language",
    "created_at",
    "intended_use",
    "not_for",
)


class CatalogSourceError(ValueError):
    """The authoring workspace is malformed or internally inconsistent."""


class CatalogBuildError(RuntimeError):
    """The compiled catalog fails runtime validation or cannot be rendered."""


class CatalogDriftError(RuntimeError):
    """The checked-in runtime artifact does not match the compiled result."""


class ReleaseGateError(RuntimeError):
    """Active content has not completed review and provenance clearance."""


@dataclass(frozen=True)
class SourceRecord:
    id: str
    name: str
    organization: str
    type: str
    url: str
    scope: str
    license_status: str
    review_status: str
    reviewed_at: str
    reuse_notes: str


@dataclass(frozen=True)
class ConceptCard:
    id: str
    ordinal: int
    domain: str
    category: str
    term_es: str
    term_en: str
    aliases: tuple[str, ...]
    tags: tuple[str, ...]
    source_ids: tuple[str, ...]
    status: str
    review_status: str
    provenance_status: str
    definition: str
    runtime_metadata: dict[str, Any]
    path: Path


@dataclass(frozen=True)
class Workspace:
    catalog_meta: dict[str, Any]
    editorial_policy: dict[str, Any]
    sources: tuple[SourceRecord, ...]
    cards: tuple[ConceptCard, ...]


def _require_nonempty_str(container: dict[str, Any], key: str, where: str) -> str:
    value = container.get(key)
    if not isinstance(value, str) or not value.strip():
        raise CatalogSourceError(f"{where}: {key} must be a nonempty string")
    return value


def _require_str_tuple(container: dict[str, Any], key: str, where: str) -> tuple[str, ...]:
    value = container.get(key)
    if not isinstance(value, list) or any(
        not isinstance(item, str) or not item.strip() for item in value
    ):
        raise CatalogSourceError(f"{where}: {key} must be a list of nonempty strings")
    return tuple(value)


def _require_choice(
    container: dict[str, Any], key: str, allowed: frozenset[str], where: str
) -> str:
    value = container.get(key)
    if not isinstance(value, str) or value not in allowed:
        options = ", ".join(sorted(allowed))
        raise CatalogSourceError(f"{where}: {key} must be one of: {options}")
    return value


def _markdown_section(body: str, heading: str) -> str | None:
    collected: list[str] | None = None
    for line in body.splitlines():
        if collected is not None and line.startswith("# "):
            break
        if collected is None:
            if line.strip() == heading:
                collected = []
            continue
        collected.append(line)
    if collected is None:
        return None
    return "\n".join(collected).strip()


def parse_card(path: Path) -> ConceptCard:
    """Parse and validate one concept card from its Markdown/TOML source."""
    text = path.read_text(encoding="utf-8").replace("\r\n", "\n")
    parts = text.split("+++", 2)
    if len(parts) != 3 or parts[0].strip():
        raise CatalogSourceError(f"{path.name}: expected a +++ TOML frontmatter block")
    try:
        frontmatter = tomllib.loads(parts[1])
    except tomllib.TOMLDecodeError as exc:
        raise CatalogSourceError(f"{path.name}: invalid TOML frontmatter") from exc
    where = f"concept {path.name}"
    ordinal = frontmatter.get("ordinal")
    if not isinstance(ordinal, int) or isinstance(ordinal, bool):
        raise CatalogSourceError(f"{where}: ordinal must be an integer")
    aliases = _require_str_tuple(frontmatter, "aliases", where)
    if any(not normalize_term(alias) for alias in aliases):
        raise CatalogSourceError(f"{where}: aliases must normalize to nonempty terms")
    runtime_metadata = frontmatter.get("runtime_metadata", {})
    if not isinstance(runtime_metadata, dict):
        raise CatalogSourceError(f"{where}: runtime_metadata must be a TOML table")
    collisions = sorted(RESERVED_METADATA_KEYS.intersection(runtime_metadata))
    if collisions:
        raise CatalogSourceError(f"{where}: runtime_metadata repeats reserved keys {collisions}")
    definition = _markdown_section(parts[2], "# Definition")
    if not definition:
        raise CatalogSourceError(f"{where}: a nonempty # Definition section is required")
    return ConceptCard(
        id=_require_nonempty_str(frontmatter, "id", where),
        ordinal=ordinal,
        domain=_require_nonempty_str(frontmatter, "domain", where),
        category=_require_nonempty_str(frontmatter, "category", where),
        term_es=_require_nonempty_str(frontmatter, "term_es", where),
        term_en=_require_nonempty_str(frontmatter, "term_en", where),
        aliases=aliases,
        tags=_require_str_tuple(frontmatter, "tags", where),
        source_ids=_require_str_tuple(frontmatter, "source_ids", where),
        status=_require_choice(frontmatter, "status", CARD_STATUSES, where),
        review_status=_require_choice(frontmatter, "review_status", CARD_REVIEW_STATUSES, where),
        provenance_status=_require_choice(
            frontmatter, "provenance_status", PROVENANCE_STATUSES, where
        ),
        definition=definition,
        runtime_metadata=dict(runtime_metadata),
        path=path,
    )


def parse_sources(path: Path) -> tuple[SourceRecord, ...]:
    """Parse the machine-readable source registry."""
    try:
        data = tomllib.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError) as exc:
        raise CatalogSourceError(f"{path.name}: source registry is unavailable") from exc
    except tomllib.TOMLDecodeError as exc:
        raise CatalogSourceError(f"{path.name}: invalid TOML") from exc
    if data.get("schema_version") != SUPPORTED_SCHEMA_VERSION:
        raise CatalogSourceError(f"{path.name}: unsupported schema_version")
    raw_sources = data.get("source")
    if not isinstance(raw_sources, list) or not raw_sources:
        raise CatalogSourceError(f"{path.name}: at least one [[source]] is required")
    records: list[SourceRecord] = []
    seen: set[str] = set()
    for raw in raw_sources:
        if not isinstance(raw, dict):
            raise CatalogSourceError(f"{path.name}: invalid [[source]] entry")
        source_id = _require_nonempty_str(raw, "id", path.name)
        if source_id in seen:
            raise CatalogSourceError(f"{path.name}: duplicate source ID {source_id}")
        seen.add(source_id)
        url = _require_nonempty_str(raw, "url", f"source {source_id}")
        if not url.startswith("https://"):
            raise CatalogSourceError(f"source {source_id}: url must use HTTPS")
        reviewed_at = raw.get("reviewed_at", "")
        reuse_notes = raw.get("reuse_notes", "")
        if not isinstance(reviewed_at, str) or not isinstance(reuse_notes, str):
            raise CatalogSourceError(f"source {source_id}: reviewed_at/reuse_notes must be text")
        records.append(
            SourceRecord(
                id=source_id,
                name=_require_nonempty_str(raw, "name", f"source {source_id}"),
                organization=_require_nonempty_str(raw, "organization", f"source {source_id}"),
                type=_require_nonempty_str(raw, "type", f"source {source_id}"),
                url=url,
                scope=_require_nonempty_str(raw, "scope", f"source {source_id}"),
                license_status=_require_choice(
                    raw, "license_status", SOURCE_LICENSE_STATUSES, f"source {source_id}"
                ),
                review_status=_require_choice(
                    raw, "review_status", SOURCE_REVIEW_STATUSES, f"source {source_id}"
                ),
                reviewed_at=reviewed_at,
                reuse_notes=reuse_notes,
            )
        )
    return tuple(records)


def parse_catalog_meta(path: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    """Parse catalog-level identity and editorial metadata."""
    try:
        data = tomllib.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError) as exc:
        raise CatalogSourceError(f"{path.name}: catalog metadata is unavailable") from exc
    except tomllib.TOMLDecodeError as exc:
        raise CatalogSourceError(f"{path.name}: invalid TOML") from exc
    meta = {key: _require_nonempty_str(data, key, path.name) for key in CATALOG_META_KEYS}
    if meta["schema_version"] != SUPPORTED_SCHEMA_VERSION:
        raise CatalogSourceError(f"{path.name}: unsupported schema_version")
    if meta["locale"] != SUPPORTED_LOCALE:
        raise CatalogSourceError(f"{path.name}: locale must be {SUPPORTED_LOCALE}")
    if meta["secondary_language"] != SUPPORTED_SECONDARY_LANGUAGE:
        raise CatalogSourceError(
            f"{path.name}: secondary_language must be {SUPPORTED_SECONDARY_LANGUAGE}"
        )
    policy = data.get("editorial_policy")
    if not isinstance(policy, dict) or not policy:
        raise CatalogSourceError(f"{path.name}: [editorial_policy] is required")
    for key, value in policy.items():
        valid_text = isinstance(value, str) and bool(value.strip())
        valid_int = isinstance(value, int) and not isinstance(value, bool)
        if not valid_text and not valid_int:
            raise CatalogSourceError(
                f"{path.name}: editorial_policy.{key} must be nonempty text or an integer"
            )
    return meta, dict(policy)


def load_workspace(root: Path = KNOWLEDGE_ROOT) -> Workspace:
    """Load, validate, and order the whole authoring workspace."""
    meta, policy = parse_catalog_meta(root / "_meta" / "catalog.toml")
    sources = parse_sources(root / "sources" / "sources.toml")
    known_sources = {source.id for source in sources}
    card_paths = sorted(
        path for path in (root / "concepts").rglob("*.md") if path.name != "CONTEXT.md"
    )
    if not card_paths:
        raise CatalogSourceError("no concept cards found")
    cards = [parse_card(path) for path in card_paths]
    by_id: dict[str, Path] = {}
    by_ordinal: dict[int, Path] = {}
    for card in cards:
        if card.id in by_id:
            raise CatalogSourceError(
                f"duplicate concept ID {card.id} in {card.path.name} and {by_id[card.id].name}"
            )
        if card.ordinal in by_ordinal:
            raise CatalogSourceError(
                f"duplicate ordinal {card.ordinal} in {card.path.name} and "
                f"{by_ordinal[card.ordinal].name}"
            )
        by_id[card.id] = card.path
        by_ordinal[card.ordinal] = card.path
        unknown = sorted(set(card.source_ids) - known_sources)
        if unknown:
            raise CatalogSourceError(f"concept {card.id}: unknown source IDs {unknown}")
    cards.sort(key=lambda card: card.ordinal)
    return Workspace(meta, policy, sources, tuple(cards))


def _derive_stats(entries: list[dict[str, Any]]) -> dict[str, Any]:
    domains = Counter(entry["metadata"]["domain"] for entry in entries)
    categories = Counter(entry["metadata"]["category"] for entry in entries)
    return {
        "entry_count": len(entries),
        "domains": dict(sorted(domains.items())),
        "categories": dict(sorted(categories.items())),
    }


def compile_catalog(workspace: Workspace) -> dict[str, Any]:
    """Render the runtime catalog from active cards, then validate it."""
    entries: list[dict[str, Any]] = [
        {
            "id": card.id,
            "term": card.term_es,
            "term_en": card.term_en,
            "aliases": list(card.aliases),
            "definition": card.definition,
            "metadata": {
                "domain": card.domain,
                "category": card.category,
                "tags": list(card.tags),
                "source_ids": list(card.source_ids),
                **card.runtime_metadata,
            },
        }
        for card in workspace.cards
        if card.status == "active"
    ]
    sources = {
        source.id: {
            "name": source.name,
            "organization": source.organization,
            "type": source.type,
            "url": source.url,
            "scope": source.scope,
        }
        for source in workspace.sources
    }
    catalog: dict[str, Any] = dict(workspace.catalog_meta)
    catalog["editorial_policy"] = workspace.editorial_policy
    catalog["sources"] = sources
    catalog["entries"] = entries
    catalog["stats"] = _derive_stats(entries)
    try:
        validate_catalog(catalog)
        validate_auto_ground_aliases(entries)
    except ValueError as exc:
        raise CatalogBuildError(f"compiled catalog failed runtime validation: {exc}") from exc
    return catalog


def render_catalog(catalog: dict[str, Any]) -> bytes:
    """Render the exact bundled JSON bytes expected by the runtime loader."""
    return json.dumps(catalog, ensure_ascii=False, indent=2).encode("utf-8")


def build_manifest(workspace: Workspace, catalog: dict[str, Any], checksum: str) -> dict[str, Any]:
    """Build the governance manifest: sources, dependents, and review state."""
    by_source: dict[str, list[str]] = {source.id: [] for source in workspace.sources}
    for card in workspace.cards:
        for source_id in card.source_ids:
            by_source[source_id].append(card.id)
    review_counts = Counter(card.review_status for card in workspace.cards)
    return {
        "dataset_id": catalog["dataset_id"],
        "schema_version": catalog["schema_version"],
        "catalog_sha256": checksum,
        "entry_count": len(catalog["entries"]),
        "inactive_count": sum(1 for card in workspace.cards if card.status == "inactive"),
        "review_status_counts": {key: review_counts[key] for key in sorted(review_counts)},
        "sources": [
            {
                "id": source.id,
                "license_status": source.license_status,
                "review_status": source.review_status,
                "concept_ids": sorted(by_source[source.id]),
            }
            for source in workspace.sources
        ],
    }


def render_manifest(manifest: dict[str, Any]) -> bytes:
    return (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def _derive_artifact_paths(catalog_path: Path) -> tuple[Path, Path]:
    digest_path = catalog_path.with_suffix(".sha256")
    manifest_path = catalog_path.parent / f"{catalog_path.stem}.manifest.json"
    return digest_path, manifest_path


def _compile_checked(root: Path) -> tuple[Workspace, dict[str, Any], str]:
    workspace = load_workspace(root)
    catalog = compile_catalog(workspace)
    return workspace, catalog, canonical_digest(catalog)


def check_workspace(root: Path = KNOWLEDGE_ROOT, catalog_path: Path = CATALOG_PATH) -> str:
    """Fail when checked-in artifacts differ from a fresh compile."""
    digest_path, manifest_path = _derive_artifact_paths(catalog_path)
    workspace, catalog, checksum = _compile_checked(root)
    manifest = build_manifest(workspace, catalog, checksum)
    try:
        current_catalog = catalog_path.read_bytes()
        current_digest = digest_path.read_text(encoding="ascii").strip()
        current_manifest = manifest_path.read_bytes()
    except OSError as exc:
        raise CatalogDriftError(f"runtime artifact missing beside {catalog_path}") from exc
    if current_catalog != render_catalog(catalog):
        raise CatalogDriftError(f"{catalog_path} is out of sync; run --write")
    if current_digest != checksum:
        raise CatalogDriftError(f"{digest_path} is out of sync; run --write")
    if current_manifest != render_manifest(manifest):
        raise CatalogDriftError(f"{manifest_path} is out of sync; run --write")
    return checksum


def write_workspace(root: Path = KNOWLEDGE_ROOT, catalog_path: Path = CATALOG_PATH) -> str:
    """Render all runtime artifacts from the authoring workspace."""
    digest_path, manifest_path = _derive_artifact_paths(catalog_path)
    workspace, catalog, checksum = _compile_checked(root)
    manifest = build_manifest(workspace, catalog, checksum)
    catalog_path.write_bytes(render_catalog(catalog))
    digest_path.write_text(f"{checksum}\n", encoding="ascii")
    manifest_path.write_bytes(render_manifest(manifest))
    return checksum


def release_check(workspace: Workspace) -> None:
    """Refuse release while active content lacks review or rights clearance."""
    active = [card for card in workspace.cards if card.status == "active"]
    blockers: list[str] = []
    for card in active:
        if card.review_status != "approved":
            blockers.append(f"concept {card.id}: review_status={card.review_status}")
        if card.provenance_status != "documented":
            blockers.append(f"concept {card.id}: provenance_status={card.provenance_status}")
    referenced = {source_id for card in active for source_id in card.source_ids}
    for source in workspace.sources:
        if source.id not in referenced:
            continue
        if source.license_status != "cleared":
            blockers.append(f"source {source.id}: license_status={source.license_status}")
        if source.review_status != "reviewed":
            blockers.append(f"source {source.id}: review_status={source.review_status}")
    if blockers:
        preview = "; ".join(blockers[:5])
        raise ReleaseGateError(f"{len(blockers)} release blockers: {preview}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true", help="fail if artifacts drift")
    mode.add_argument("--write", action="store_true", help="regenerate runtime artifacts")
    mode.add_argument("--release-check", action="store_true", help="enforce release gates")
    parser.add_argument("--workspace", type=Path, default=KNOWLEDGE_ROOT)
    parser.add_argument("--catalog", type=Path, default=CATALOG_PATH)
    args = parser.parse_args(argv)
    if args.release_check:
        try:
            workspace = load_workspace(args.workspace)
            check_workspace(args.workspace, args.catalog)
            release_check(workspace)
        except (CatalogSourceError, CatalogBuildError, CatalogDriftError) as exc:
            print(f"INVALID: {exc}")
            return 1
        except ReleaseGateError as exc:
            print(f"RELEASE HOLD: {exc}")
            return 2
        print("RELEASE OK")
        return 0
    try:
        if args.check:
            checksum = check_workspace(args.workspace, args.catalog)
            print(f"IN SYNC {checksum}")
        else:
            checksum = write_workspace(args.workspace, args.catalog)
            print(f"WRITTEN {checksum}")
        return 0
    except (CatalogSourceError, CatalogBuildError, CatalogDriftError) as exc:
        print(f"FAILED: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
