from pathlib import Path


def test_evolution_export_migration_enforces_identity_and_states() -> None:
    migration = (
        Path(__file__).parents[1] / "alembic" / "versions" / "0015_add_evolution_exports.py"
    ).read_text(encoding="utf-8")

    assert "google_drive_evolution_exports" in migration
    assert "uq_drive_evolution_exports_user_evolution" in migration
    assert "uq_drive_evolution_exports_operation" in migration
    assert "pending', 'syncing', 'synced', 'failed', 'unknown" in migration
    assert "evolution_export_frequency" in migration
    assert "weekly', 'daily" in migration
