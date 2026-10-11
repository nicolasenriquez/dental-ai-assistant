"""Receipt migration shape and real PostgreSQL upgrade/rollback proof."""

from __future__ import annotations

import importlib.util
import os
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import create_async_engine

from alembic.migration import MigrationContext
from alembic.operations import Operations


def _migration() -> Any:
    path = Path(__file__).parents[1] / "alembic/versions/0031_clinical_discard_receipts.py"
    spec = importlib.util.spec_from_file_location("discard_migration", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_receipt_migration_has_one_linear_revision_and_no_backfill() -> None:
    migration = _migration()
    assert (migration.revision, migration.down_revision) == ("0031", "0030")
    assert "discarded" in migration._STATUS_CHECK
    assert "discarded_by = owner_user_id" in migration._RECEIPT_CHECK
    assert "resolved_at IS NOT NULL" in migration._RECEIPT_CHECK
    assert "discard_operation_id IS NULL" in migration._RECEIPT_CHECK


async def test_live_migration_preserves_legacy_rows_and_refuses_receipt_loss() -> None:
    dsn = os.environ.get("CLINICAL_LIVE_TEST_DSN", "")
    if not dsn:
        pytest.skip("CLINICAL_LIVE_TEST_DSN not set")
    engine = create_async_engine(dsn.replace("postgresql://", "postgresql+asyncpg://"))
    migration = _migration()
    schema = f"dismissal_migration_{uuid4().hex}"
    owner = uuid4()
    try:
        async with engine.connect() as conn, conn.begin():
            # Transactional private schema; no application tables are changed.
            await conn.execute(sa.schema.CreateSchema(schema))
            await conn.execute(
                sa.text("SELECT set_config('search_path', :schema, true)"), {"schema": schema}
            )
            await conn.execute(
                sa.text("""
                CREATE TABLE clinical_turn_artifacts (
                    id UUID PRIMARY KEY, owner_user_id UUID NOT NULL, status TEXT NOT NULL,
                    payload JSONB NOT NULL, resolved_at TIMESTAMPTZ,
                    CONSTRAINT ck_clinical_turn_artifacts_status CHECK (
                        status IN ('draft', 'stale', 'pending', 'approved', 'declined', 'failed')
                    )
                )
            """)
            )
            for status in ("draft", "stale", "pending", "approved", "declined", "failed"):
                await conn.execute(
                    sa.text("""
                    INSERT INTO clinical_turn_artifacts (id, owner_user_id, status, payload, resolved_at)
                    VALUES (:id, :owner, :status, '{"retained":"contenido"}', now())
                """),
                    {"id": uuid4(), "owner": owner, "status": status},
                )
            before = (
                await conn.execute(
                    sa.text(
                        "SELECT id, owner_user_id, status, payload, resolved_at FROM clinical_turn_artifacts ORDER BY id"
                    )
                )
            ).all()

            def run(sync_conn: Any, direction: str) -> None:
                migration.op = Operations(MigrationContext.configure(sync_conn))
                getattr(migration, direction)()

            await conn.run_sync(run, "upgrade")
            after = (
                await conn.execute(
                    sa.text(
                        "SELECT id, owner_user_id, status, payload, resolved_at FROM clinical_turn_artifacts ORDER BY id"
                    )
                )
            ).all()
            assert after == before
            assert (
                await conn.execute(
                    sa.text("""
                SELECT count(*) FROM clinical_turn_artifacts
                WHERE discard_operation_id IS NOT NULL OR discarded_by IS NOT NULL
                   OR discard_expected_updated_at IS NOT NULL
            """)
                )
            ).scalar_one() == 0
            await conn.execute(
                sa.text("""
                INSERT INTO clinical_turn_artifacts (
                    id, owner_user_id, status, payload, resolved_at,
                    discard_operation_id, discarded_by, discard_expected_updated_at
                ) VALUES (:id, :owner, 'discarded', '{}', now(), :operation, :owner, now())
            """),
                {"id": uuid4(), "owner": owner, "operation": uuid4()},
            )
            with pytest.raises(RuntimeError, match="receipts exist"):
                await conn.run_sync(run, "downgrade")
            assert (
                await conn.execute(
                    sa.text(
                        "SELECT count(*) FROM clinical_turn_artifacts WHERE status = 'discarded'"
                    )
                )
            ).scalar_one() == 1
            # Remove only this test's synthetic receipt to exercise the empty rollback.
            await conn.execute(
                sa.text("DELETE FROM clinical_turn_artifacts WHERE status = 'discarded'")
            )
            await conn.run_sync(run, "downgrade")
            assert (
                await conn.execute(
                    sa.text(
                        "SELECT id, owner_user_id, status, payload, resolved_at FROM clinical_turn_artifacts ORDER BY id"
                    )
                )
            ).all() == before
            await conn.run_sync(run, "upgrade")
            await conn.execute(sa.schema.DropSchema(schema, cascade=True))
    finally:
        await engine.dispose()
