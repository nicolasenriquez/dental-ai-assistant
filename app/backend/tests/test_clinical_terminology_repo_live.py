"""Run with CLINICAL_LIVE_TEST_DSN against a scratch database at Alembic head."""

from __future__ import annotations

import os
from pathlib import Path

import asyncpg
import pytest

from backend.clinical_assistant.terminology import load_catalog, resolve_terms
from backend.db import terminology_repo
from backend.tests.test_clinical_terminology_catalog import _catalog, _write_catalog

DSN = os.environ.get("CLINICAL_LIVE_TEST_DSN", "")
if not DSN:
    pytestmark = pytest.mark.skip(reason="CLINICAL_LIVE_TEST_DSN not set")


class _Acquire:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self.conn = conn

    async def __aenter__(self) -> asyncpg.Connection:
        return self.conn

    async def __aexit__(self, *_args: object) -> None:
        return None


class _Pool:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self.conn = conn

    def acquire(self) -> _Acquire:
        return _Acquire(self.conn)


@pytest.fixture
async def catalog_db(monkeypatch):
    try:
        conn = await asyncpg.connect(DSN)
    except OSError as exc:
        pytest.skip(f"live Postgres unreachable: {exc}")
    outer = conn.transaction()
    await outer.start()
    monkeypatch.setattr(terminology_repo, "get_pg_pool", lambda: _Pool(conn))
    try:
        yield conn
    finally:
        await outer.rollback()
        await conn.close()


def _loaded(tmp_path: Path, data: dict):
    path = tmp_path / "catalog.json"
    return load_catalog(path, _write_catalog(path, data))


async def test_live_schema_has_nonunique_lookup_and_timestamptz(
    catalog_db: asyncpg.Connection,
) -> None:
    indexes = {
        row["indexname"]: row["indexdef"]
        for row in await catalog_db.fetch(
            "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = ANY($1::text[])",
            ["clinical_terms", "clinical_term_aliases"],
        )
    }
    for name in (
        "ix_clinical_terms_preferred_es",
        "ix_clinical_terms_preferred_en",
        "ix_clinical_term_alias_lookup",
    ):
        assert name in indexes
        assert "UNIQUE" not in indexes[name]
    assert "UNIQUE" in indexes["uq_clinical_term_alias_concept_key"]
    status_constraint = await catalog_db.fetchval(
        "SELECT pg_get_constraintdef(oid) FROM pg_constraint "
        "WHERE conname = 'ck_clinical_terms_status'"
    )
    assert "active" in status_constraint and "inactive" in status_constraint
    timestamps = await catalog_db.fetch(
        "SELECT table_name, column_name, data_type FROM information_schema.columns "
        "WHERE table_name = ANY($1::text[]) AND column_name IN ('created_at', 'updated_at')",
        ["clinical_terms", "clinical_term_aliases"],
    )
    assert len(timestamps) == 3
    assert {row["data_type"] for row in timestamps} == {"timestamp with time zone"}


async def test_live_sync_is_locked_idempotent_and_preserves_identity(
    catalog_db: asyncpg.Connection, tmp_path: Path
) -> None:
    data = _catalog()
    catalog = _loaded(tmp_path, data)
    assert await terminology_repo.sync_catalog(catalog) is True

    # The transaction-scoped lock remains held by the outer test transaction.
    second = await asyncpg.connect(DSN)
    try:
        assert not await second.fetchval(
            "SELECT pg_try_advisory_xact_lock($1)", terminology_repo.CATALOG_LOCK_KEY
        )
    finally:
        await second.close()

    rows = await catalog_db.fetch(
        "SELECT dataset_concept_id, id, status, normalized_preferred_en "
        "FROM clinical_terms WHERE dataset_concept_id = ANY($1::text[])",
        [entry["id"] for entry in data["entries"]],
    )
    by_id = {row["dataset_concept_id"]: row for row in rows}
    assert len(by_id) == len(data["entries"])
    assert {row["status"] for row in rows} == {"active"}
    assert by_id["anat.crown"]["normalized_preferred_en"] == "dental crown"
    assert by_id["restoration.crown"]["normalized_preferred_en"] == "dental crown"
    assert resolve_terms(["dental crown"], await terminology_repo.get_active_terms())[0].status == (
        "ambiguous"
    )
    assert (
        await catalog_db.fetchval(
            "SELECT count(*) FROM clinical_term_aliases a JOIN clinical_terms t ON t.id = a.term_id "
            "WHERE t.dataset_concept_id = 'ortho.bracket' AND a.normalized_alias = 'braquet' "
            "AND a.language = 'und'"
        )
        == 1
    )
    assert await terminology_repo.sync_catalog(catalog) is False

    data["entries"] = [entry for entry in data["entries"] if entry["id"] != "anat.crown"]
    assert await terminology_repo.sync_catalog(_loaded(tmp_path, data)) is True
    assert (
        await catalog_db.fetchval(
            "SELECT status FROM clinical_terms WHERE dataset_concept_id = 'anat.crown'"
        )
        == "inactive"
    )
    surviving = resolve_terms(["dental crown"], await terminology_repo.get_active_terms())[0]
    assert surviving.status == "matched"
    assert surviving.concept is not None
    assert surviving.concept.concept_id == "restoration.crown"

    data = _catalog()
    assert await terminology_repo.sync_catalog(_loaded(tmp_path, data)) is True
    restored = await catalog_db.fetchrow(
        "SELECT id, status FROM clinical_terms WHERE dataset_concept_id = 'anat.crown'"
    )
    assert restored["id"] == by_id["anat.crown"]["id"]
    assert restored["status"] == "active"


async def test_live_sync_rolls_back_on_alias_failure(
    catalog_db: asyncpg.Connection, tmp_path: Path
) -> None:
    data = _catalog()
    data["dataset_id"] = "synthetic-rollback-fixture"
    await catalog_db.execute(
        "CREATE FUNCTION pg_temp.reject_catalog_alias() RETURNS trigger "
        "LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic alias failure'; END $$"
    )
    await catalog_db.execute(
        "CREATE TRIGGER reject_catalog_alias BEFORE INSERT ON clinical_term_aliases "
        "FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_catalog_alias()"
    )
    with pytest.raises(terminology_repo.CatalogSyncError):
        await terminology_repo.sync_catalog(_loaded(tmp_path, data))
    assert (
        await catalog_db.fetchval(
            "SELECT count(*) FROM clinical_terms WHERE dataset_concept_id = 'ortho.tad'"
        )
        == 0
    )
