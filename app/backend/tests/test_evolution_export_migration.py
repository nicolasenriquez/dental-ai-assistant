from __future__ import annotations

import importlib.util
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import pytest
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

MIGRATION_PATH = (
    Path(__file__).parents[1] / "alembic" / "versions" / "0015_add_evolution_exports.py"
)


def _load_migration() -> Any:
    spec = importlib.util.spec_from_file_location("migration_0015", MIGRATION_PATH)
    assert spec is not None and spec.loader is not None
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    return migration


class _MigrationOperations:
    def __init__(self) -> None:
        self.added_columns: dict[str, sa.Column[Any]] = {}
        self.checks: dict[str, str] = {}
        self.tables: dict[str, tuple[Any, ...]] = {}
        self.dropped: list[str] = []

    def add_column(self, table_name: str, column: sa.Column[Any]) -> None:
        self.added_columns[f"{table_name}.{column.name}"] = column

    def create_check_constraint(self, name: str, _table_name: str, condition: str) -> None:
        self.checks[name] = condition

    def create_table(self, table_name: str, *items: Any) -> None:
        table = sa.Table(table_name, sa.MetaData(), *items)
        self.tables[table_name] = tuple(table.columns) + tuple(table.constraints)

    def drop_table(self, table_name: str) -> None:
        self.dropped.append(table_name)

    def drop_constraint(self, name: str, _table_name: str, *, type_: str) -> None:
        self.dropped.append(name)

    def drop_column(self, table_name: str, column_name: str) -> None:
        self.dropped.append(f"{table_name}.{column_name}")


def test_evolution_export_migration_enforces_identity_and_states() -> None:
    migration = MIGRATION_PATH.read_text(encoding="utf-8")

    assert "google_drive_evolution_exports" in migration
    assert "uq_drive_evolution_exports_user_evolution" in migration
    assert "uq_drive_evolution_exports_operation" in migration
    assert "pending', 'syncing', 'synced', 'failed', 'unknown" in migration
    assert "evolution_export_frequency" in migration
    assert "weekly', 'daily" in migration


def test_upgrade_declares_exact_export_lineage_schema(monkeypatch: pytest.MonkeyPatch) -> None:
    migration = _load_migration()
    operations = _MigrationOperations()
    monkeypatch.setattr(migration, "op", operations)

    migration.upgrade()

    frequency = operations.added_columns["google_drive_connections.evolution_export_frequency"]
    assert frequency.nullable is False
    assert frequency.server_default is not None
    assert cast(Any, frequency.server_default).arg == "weekly"
    assert operations.checks["ck_google_drive_connections_export_frequency"] == (
        "evolution_export_frequency IN ('weekly', 'daily')"
    )

    items = operations.tables["google_drive_evolution_exports"]
    columns = {item.name: item for item in items if isinstance(item, sa.Column)}
    assert set(columns) == {
        "id",
        "user_id",
        "evolution_id",
        "operation_id",
        "period_type",
        "period_key",
        "journal_part",
        "drive_file_id",
        "drive_version",
        "status",
        "journal_block",
        "content_hash",
        "last_error_code",
        "created_at",
        "updated_at",
        "synced_at",
    }
    for name in ("id", "user_id", "evolution_id", "operation_id"):
        assert isinstance(columns[name].type, postgresql.UUID)
        assert cast(postgresql.UUID, columns[name].type).as_uuid is True
    assert columns["journal_block"].nullable is False
    assert columns["journal_part"].nullable is True
    assert columns["journal_part"].server_default is None

    checks = {
        item.name: str(item.sqltext) for item in items if isinstance(item, sa.CheckConstraint)
    }
    assert checks == {
        "ck_drive_evolution_exports_period_type": "period_type IN ('weekly', 'daily')",
        "ck_drive_evolution_exports_status": "status IN ('pending', 'syncing', 'synced', 'failed', 'unknown')",
        "ck_drive_evolution_exports_journal_part": "journal_part IS NULL OR journal_part >= 1",
    }

    foreign_keys = {
        next(iter(item.elements)).target_fullname: next(iter(item.elements)).ondelete
        for item in items
        if isinstance(item, sa.ForeignKeyConstraint)
    }
    assert foreign_keys == {"users.id": "CASCADE", "evolutions.id": "CASCADE"}

    uniques = {
        item.name: tuple(column.name for column in item.columns)
        for item in items
        if isinstance(item, sa.UniqueConstraint)
    }
    assert uniques == {
        "uq_drive_evolution_exports_user_evolution": ("user_id", "evolution_id"),
        "uq_drive_evolution_exports_operation": ("operation_id",),
    }


def test_downgrade_is_blocked_without_explicit_data_loss_opt_in(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    migration = _load_migration()
    operations = _MigrationOperations()
    monkeypatch.setattr(migration, "op", operations)
    monkeypatch.setattr(
        migration,
        "context",
        SimpleNamespace(get_x_argument=lambda *, as_dictionary: {}),
    )

    with pytest.raises(RuntimeError, match="non-destructive"):
        migration.downgrade()

    assert operations.dropped == []


def test_downgrade_requires_explicit_opt_in_and_then_drops_only_new_schema(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    migration = _load_migration()
    operations = _MigrationOperations()
    monkeypatch.setattr(migration, "op", operations)
    monkeypatch.setattr(
        migration,
        "context",
        SimpleNamespace(
            get_x_argument=lambda *, as_dictionary: {"allow_destructive_rollback": "true"}
        ),
    )

    migration.downgrade()

    assert operations.dropped == [
        "google_drive_evolution_exports",
        "ck_google_drive_connections_export_frequency",
        "google_drive_connections.evolution_export_frequency",
    ]
