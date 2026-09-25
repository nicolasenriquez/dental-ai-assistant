"""Validated dental catalog data and conservative lexical terminology helpers."""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from dataclasses import dataclass, replace
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Literal, cast

AUTO_GROUND_ALIASES = frozenset({"TAD", "TMJ", "CBCT", "BOP"})
SUPPORTED_SCHEMA_VERSION = "1.0.0"
MAX_TERMINOLOGY_TERMS = 8
FUZZY_MIN_RATIO = 0.80
FUZZY_MAX_CANDIDATES = 3
CATALOG_PATH = Path(__file__).resolve().parents[1] / "data" / "dental_ai_glossary_es_cl_v1.json"


class CatalogValidationError(ValueError):
    """The bundled catalog cannot safely be used for clinical grounding."""


@dataclass(frozen=True)
class Catalog:
    data: dict[str, Any]
    checksum: str

    @property
    def entries(self) -> list[dict[str, Any]]:
        return cast(list[dict[str, Any]], self.data["entries"])

    @property
    def schema_version(self) -> str:
        return cast(str, self.data["schema_version"])

    @property
    def dataset_id(self) -> str:
        return cast(str, self.data["dataset_id"])


@dataclass(frozen=True)
class TermCandidate:
    concept_id: str
    term: str
    term_en: str
    definition: str | None
    aliases: tuple[str, ...]
    domain: str
    category: str
    source_ids: tuple[str, ...]
    matched_term: str | None
    match_type: Literal["preferred_es", "preferred_en", "alias", "fuzzy"]
    score: float


@dataclass(frozen=True)
class TermResolution:
    raw_term: str
    normalized_term: str
    status: Literal["matched", "ambiguous", "not_found"]
    concept: TermCandidate | None = None
    candidates: tuple[TermCandidate, ...] = ()
    match_type: str | None = None
    confidence: float | None = None


def normalize_term(value: str) -> str:
    """Case-fold, remove accents, separate punctuation, and collapse spaces."""
    decomposed = unicodedata.normalize("NFKD", value.casefold())
    text = "".join(
        " " if unicodedata.category(char)[0] in {"P", "S"} else char
        for char in decomposed
        if not unicodedata.combining(char)
    )
    return " ".join(text.split())


def canonical_digest(data: dict[str, Any]) -> str:
    encoded = json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode(
        "utf-8"
    )
    return hashlib.sha256(encoded).hexdigest()


def _nonempty(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _validate_catalog(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict) or data.get("schema_version") != SUPPORTED_SCHEMA_VERSION:
        raise CatalogValidationError("Unsupported catalog schema version")
    if (
        not _nonempty(data.get("dataset_id"))
        or data.get("locale") != "es-CL"
        or data.get("secondary_language") != "en"
    ):
        raise CatalogValidationError("Invalid catalog identity or locale")
    sources = data.get("sources")
    entries = data.get("entries")
    if not isinstance(sources, dict) or not sources or not isinstance(entries, list) or not entries:
        raise CatalogValidationError("Catalog sources and entries are required")
    for source_id, source in sources.items():
        if not _nonempty(source_id) or not isinstance(source, dict):
            raise CatalogValidationError("Invalid catalog source")
        if not all(
            _nonempty(source.get(key)) for key in ("name", "organization", "type", "url", "scope")
        ):
            raise CatalogValidationError("Catalog source fields are incomplete")
        if not str(source["url"]).startswith("https://"):
            raise CatalogValidationError("Catalog source URL must use HTTPS")
    seen_ids: set[str] = set()
    for entry in entries:
        if not isinstance(entry, dict):
            raise CatalogValidationError("Invalid catalog entry")
        concept_id = entry.get("id")
        if not _nonempty(concept_id) or concept_id in seen_ids:
            raise CatalogValidationError("Duplicate or missing catalog concept ID")
        seen_ids.add(cast(str, concept_id))
        if not all(_nonempty(entry.get(key)) for key in ("term", "term_en", "definition")):
            raise CatalogValidationError("Catalog entry terms and definition are required")
        aliases = entry.get("aliases")
        if not isinstance(aliases, list) or any(
            not _nonempty(alias) or not normalize_term(alias) for alias in aliases
        ):
            raise CatalogValidationError("Catalog aliases must be nonempty strings")
        metadata = entry.get("metadata")
        if not isinstance(metadata, dict) or not all(
            _nonempty(metadata.get(key)) for key in ("domain", "category")
        ):
            raise CatalogValidationError("Catalog metadata domain/category are required")
        if not isinstance(metadata.get("tags"), list) or any(
            not _nonempty(tag) for tag in metadata["tags"]
        ):
            raise CatalogValidationError("Catalog tags must be strings")
        source_ids = metadata.get("source_ids")
        if (
            not isinstance(source_ids, list)
            or not source_ids
            or any(
                not isinstance(source_id, str) or source_id not in sources
                for source_id in source_ids
            )
        ):
            raise CatalogValidationError("Catalog entry references an unknown source")
    return cast(dict[str, Any], data)


def load_catalog(path: Path, expected_digest: str) -> Catalog:
    """Parse, validate, then verify the complete canonical JSON document."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise CatalogValidationError("Bundled catalog is not valid UTF-8 JSON") from exc
    validated = _validate_catalog(data)
    checksum = canonical_digest(validated)
    if checksum != expected_digest:
        raise CatalogValidationError("Bundled catalog checksum mismatch")
    return Catalog(validated, checksum)


def load_bundled_catalog() -> Catalog:
    """Read the reviewed digest beside the data before any database work."""
    try:
        expected = CATALOG_PATH.with_suffix(".sha256").read_text(encoding="ascii").strip()
    except (OSError, UnicodeError) as exc:
        raise CatalogValidationError("Bundled catalog digest is unavailable") from exc
    if not re.fullmatch(r"[0-9a-f]{64}", expected):
        raise CatalogValidationError("Bundled catalog digest is malformed")
    return load_catalog(CATALOG_PATH, expected)


def prepare_aliases(entry: dict[str, Any]) -> list[tuple[str, str, str, str]]:
    """Assign V1 alias language structurally and deduplicate within a concept."""
    aliases: dict[str, tuple[str, str, str, str]] = {}
    for alias in entry["aliases"]:
        normalized = normalize_term(alias)
        if normalized not in aliases:
            abbreviation = (
                bool(re.fullmatch(r"[A-Z][A-Z0-9.-]*", alias))
                and sum(char.isalpha() for char in alias) >= 2
            )
            aliases[normalized] = (
                alias,
                normalized,
                "und",
                "abbreviation" if abbreviation else "synonym",
            )
    return list(aliases.values())


def validate_auto_ground_aliases(entries: list[dict[str, Any]]) -> None:
    """Every reviewed alias must identify exactly one active source concept."""
    for alias in AUTO_GROUND_ALIASES:
        matches = {
            entry["id"]
            for entry in entries
            if entry.get("status", "active") == "active"
            and any(normalize_term(value) == normalize_term(alias) for value in entry["aliases"])
        }
        if len(matches) != 1:
            raise CatalogValidationError(f"Auto-ground alias {alias} is missing or ambiguous")


def _candidate(
    entry: dict[str, Any],
    *,
    match_type: Literal["preferred_es", "preferred_en", "alias", "fuzzy"],
    score: float,
    matched_term: str | None,
    authoritative: bool,
) -> TermCandidate:
    metadata = entry["metadata"]
    return TermCandidate(
        concept_id=entry["id"],
        term=entry["term"],
        term_en=entry["term_en"],
        definition=entry["definition"] if authoritative else None,
        aliases=tuple(entry["aliases"]),
        domain=metadata["domain"],
        category=metadata["category"],
        source_ids=tuple(metadata["source_ids"]),
        matched_term=matched_term,
        match_type=match_type,
        score=score,
    )


def _acronym_shaped(raw: str) -> bool:
    compact = raw.replace(".", "").replace("-", "")
    return (
        bool(re.fullmatch(r"[A-Z0-9]+", compact)) and sum(char.isalpha() for char in compact) >= 2
    )


def resolve_terms(raw_terms: list[str], entries: list[dict[str, Any]]) -> list[TermResolution]:
    """Resolve bounded raw expressions against active preferred terms and aliases."""
    if not 1 <= len(raw_terms) <= MAX_TERMINOLOGY_TERMS:
        raise ValueError("Terminology batch must contain one through eight raw terms")
    active = [entry for entry in entries if entry.get("status", "active") == "active"]
    results: list[TermResolution] = []
    seen: set[str] = set()
    for raw in raw_terms:
        if not isinstance(raw, str) or not (normalized := normalize_term(raw)):
            raise ValueError("Terminology terms must be nonempty strings")
        if normalized in seen:
            continue
        seen.add(normalized)

        exact: dict[str, TermCandidate] = {}
        for entry in active:
            match_type: Literal["preferred_es", "preferred_en", "alias"] | None = None
            matched_term: str | None = None
            if normalize_term(entry["term"]) == normalized:
                match_type, matched_term = "preferred_es", entry["term"]
            elif normalize_term(entry["term_en"]) == normalized:
                match_type, matched_term = "preferred_en", entry["term_en"]
            else:
                matched_term = next(
                    (alias for alias in entry["aliases"] if normalize_term(alias) == normalized),
                    None,
                )
                if matched_term is not None:
                    match_type = "alias"
            if match_type is not None:
                exact[entry["id"]] = _candidate(
                    entry,
                    match_type=match_type,
                    score=1.0,
                    matched_term=matched_term,
                    authoritative=True,
                )
        if exact:
            ordered = tuple(exact[key] for key in sorted(exact))
            if len(ordered) == 1:
                concept = ordered[0]
                results.append(
                    TermResolution(
                        raw,
                        normalized,
                        "matched",
                        concept=concept,
                        match_type=concept.match_type,
                        confidence=1.0,
                    )
                )
            else:
                results.append(
                    TermResolution(
                        raw,
                        normalized,
                        "ambiguous",
                        candidates=tuple(
                            replace(candidate, definition=None) for candidate in ordered
                        ),
                    )
                )
            continue

        if len(normalized) < 5 or _acronym_shaped(raw):
            results.append(TermResolution(raw, normalized, "not_found"))
            continue
        fuzzy: list[TermCandidate] = []
        for entry in active:
            forms = (entry["term"], entry["term_en"], *entry["aliases"])
            score = max(
                SequenceMatcher(None, normalized, normalize_term(form)).ratio() for form in forms
            )
            if score >= FUZZY_MIN_RATIO:
                fuzzy.append(
                    _candidate(
                        entry,
                        match_type="fuzzy",
                        score=score,
                        matched_term=None,
                        authoritative=False,
                    )
                )
        fuzzy.sort(key=lambda candidate: (-candidate.score, candidate.concept_id))
        results.append(
            TermResolution(
                raw,
                normalized,
                "ambiguous" if fuzzy else "not_found",
                candidates=tuple(fuzzy[:FUZZY_MAX_CANDIDATES]),
            )
        )
    return results
