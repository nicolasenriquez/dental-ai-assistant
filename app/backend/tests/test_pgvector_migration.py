"""The installed pgvector image must also enable its extension in the database."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from unittest.mock import Mock


def test_pgvector_migration_is_idempotent_and_keeps_shared_types_on_downgrade() -> None:
    path = Path(__file__).parents[1] / "alembic/versions/0032_enable_pgvector.py"
    spec = importlib.util.spec_from_file_location("pgvector_migration", path)
    assert spec is not None and spec.loader is not None
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    operation = Mock()
    migration.__dict__["op"] = operation
    assert (migration.revision, migration.down_revision) == ("0032", "0031")
    migration.upgrade()
    operation.execute.assert_called_once_with("CREATE EXTENSION IF NOT EXISTS vector")
    operation.reset_mock()
    migration.downgrade()
    operation.execute.assert_not_called()
