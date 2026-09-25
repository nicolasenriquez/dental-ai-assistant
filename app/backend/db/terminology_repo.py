"""Transactional PostgreSQL catalog synchronization and active lookup reads."""

from __future__ import annotations

import json
import logging
from typing import Any

from backend.clinical_assistant.terminology import (
    AUTO_GROUND_ALIASES,
    Catalog,
    CatalogValidationError,
    normalize_term,
    prepare_aliases,
    validate_auto_ground_aliases,
)
from backend.db.postgres import get_pg_pool

logger = logging.getLogger(__name__)

# Stable across processes and replicas. PostgreSQL holds this until transaction end.
CATALOG_LOCK_KEY = 0x434C494E5445524D


class CatalogSyncError(RuntimeError):
    """The catalog could not be made available atomically."""


async def get_active_terms() -> list[dict[str, Any]]:
    """Return only active concepts with their current aliases for lexical resolution."""
    async with get_pg_pool().acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT t.dataset_concept_id, t.preferred_es, t.preferred_en, t.definition,
                   t.domain, t.category, t.source_ids,
                   ARRAY(
                       SELECT a.display_alias FROM clinical_term_aliases AS a
                       WHERE a.term_id = t.id ORDER BY a.id
                   ) AS aliases
            FROM clinical_terms AS t
            WHERE t.status = 'active'
            ORDER BY t.dataset_concept_id
            """
        )
    return [
        {
            "id": row["dataset_concept_id"],
            "term": row["preferred_es"],
            "term_en": row["preferred_en"],
            "definition": row["definition"],
            "aliases": list(row["aliases"]),
            "metadata": {
                "domain": row["domain"],
                "category": row["category"],
                "source_ids": list(row["source_ids"]),
            },
        }
        for row in rows
    ]


async def _validate_active_allowlist(conn: Any) -> None:
    aliases = [normalize_term(alias) for alias in sorted(AUTO_GROUND_ALIASES)]
    rows = await conn.fetch(
        """
        SELECT a.normalized_alias, count(DISTINCT t.id) AS concept_count
        FROM clinical_term_aliases AS a
        JOIN clinical_terms AS t ON t.id = a.term_id
        WHERE t.status = 'active' AND a.language = 'und'
          AND a.normalized_alias = ANY($1::text[])
        GROUP BY a.normalized_alias
        """,
        aliases,
    )
    counts = {row["normalized_alias"]: row["concept_count"] for row in rows}
    for alias in AUTO_GROUND_ALIASES:
        if counts.get(normalize_term(alias)) != 1:
            raise CatalogValidationError(f"Auto-ground alias {alias} is missing or ambiguous")


async def sync_catalog(catalog: Catalog) -> bool:
    """Mirror reviewed content in one locked transaction; return whether it changed."""
    validate_auto_ground_aliases(catalog.entries)
    try:
        async with get_pg_pool().acquire() as conn, conn.transaction():
            await conn.execute("SELECT pg_advisory_xact_lock($1)", CATALOG_LOCK_KEY)
            state = await conn.fetchrow(
                """
                    SELECT count(*) AS active_count,
                           count(*) FILTER (
                               WHERE dataset_id = $1
                                 AND dataset_schema_version = $2
                                 AND dataset_checksum = $3
                           ) AS matching_count
                    FROM clinical_terms WHERE status = 'active'
                    """,
                catalog.dataset_id,
                catalog.schema_version,
                catalog.checksum,
            )
            if state and state["active_count"] == state["matching_count"] == len(catalog.entries):
                await _validate_active_allowlist(conn)
                return False

            for entry in catalog.entries:
                metadata = entry["metadata"]
                term_id = await conn.fetchval(
                    """
                        INSERT INTO clinical_terms (
                            dataset_concept_id, dataset_id, preferred_es, normalized_preferred_es,
                            preferred_en, normalized_preferred_en, definition, domain, category,
                            source_ids, metadata, dataset_schema_version, dataset_checksum, status
                        ) VALUES (
                            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, 'active'
                        )
                        ON CONFLICT (dataset_concept_id) DO UPDATE SET
                            dataset_id = EXCLUDED.dataset_id,
                            preferred_es = EXCLUDED.preferred_es,
                            normalized_preferred_es = EXCLUDED.normalized_preferred_es,
                            preferred_en = EXCLUDED.preferred_en,
                            normalized_preferred_en = EXCLUDED.normalized_preferred_en,
                            definition = EXCLUDED.definition,
                            domain = EXCLUDED.domain,
                            category = EXCLUDED.category,
                            source_ids = EXCLUDED.source_ids,
                            metadata = EXCLUDED.metadata,
                            dataset_schema_version = EXCLUDED.dataset_schema_version,
                            dataset_checksum = EXCLUDED.dataset_checksum,
                            status = 'active',
                            updated_at = now()
                        RETURNING id
                        """,
                    entry["id"],
                    catalog.dataset_id,
                    entry["term"],
                    normalize_term(entry["term"]),
                    entry["term_en"],
                    normalize_term(entry["term_en"]),
                    entry["definition"],
                    metadata["domain"],
                    metadata["category"],
                    metadata["source_ids"],
                    json.dumps(metadata, ensure_ascii=False),
                    catalog.schema_version,
                    catalog.checksum,
                )
                await conn.execute("DELETE FROM clinical_term_aliases WHERE term_id = $1", term_id)
                aliases = prepare_aliases(entry)
                if aliases:
                    await conn.executemany(
                        """
                            INSERT INTO clinical_term_aliases (
                                term_id, display_alias, normalized_alias, language, alias_type
                            ) VALUES ($1, $2, $3, $4, $5)
                            """,
                        [(term_id, *alias) for alias in aliases],
                    )

            await conn.execute(
                """
                    UPDATE clinical_terms SET status = 'inactive', updated_at = now()
                    WHERE status = 'active' AND dataset_concept_id <> ALL($1::text[])
                    """,
                [entry["id"] for entry in catalog.entries],
            )
            await _validate_active_allowlist(conn)
            logger.info(
                "clinical_catalog.synced",
                extra={
                    "entry_count": len(catalog.entries),
                    "schema_version": catalog.schema_version,
                },
            )
            return True
    except CatalogValidationError:
        raise
    except Exception as exc:
        logger.error("clinical_catalog.sync_failed", extra={"failure_class": "grounding"})
        raise CatalogSyncError("Clinical terminology catalog synchronization failed") from exc
