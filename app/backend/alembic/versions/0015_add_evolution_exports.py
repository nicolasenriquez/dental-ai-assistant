"""Add durable Google Drive evolution export lineage.

Revision ID: 0015
Revises: 0014
Create Date: 2026-09-13
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column(
        "google_drive_connections",
        sa.Column("evolution_export_frequency", sa.Text(), nullable=False, server_default="weekly"),
    )
    op.create_check_constraint(
        "ck_google_drive_connections_export_frequency",
        "google_drive_connections",
        "evolution_export_frequency IN ('weekly', 'daily')",
    )
    op.create_table(
        "google_drive_evolution_exports",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("evolution_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("operation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("period_type", sa.Text(), nullable=False),
        sa.Column("period_key", sa.Text(), nullable=False),
        sa.Column("journal_part", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("drive_file_id", sa.Text(), nullable=True),
        sa.Column("drive_version", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("content_hash", sa.Text(), nullable=False),
        sa.Column("last_error_code", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "period_type IN ('weekly', 'daily')", name="ck_drive_evolution_exports_period_type"
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'syncing', 'synced', 'failed', 'unknown')",
            name="ck_drive_evolution_exports_status",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["evolution_id"], ["evolutions.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "user_id", "evolution_id", name="uq_drive_evolution_exports_user_evolution"
        ),
        sa.UniqueConstraint("operation_id", name="uq_drive_evolution_exports_operation"),
    )


def downgrade() -> None:
    op.drop_table("google_drive_evolution_exports")
    op.drop_constraint(
        "ck_google_drive_connections_export_frequency",
        "google_drive_connections",
        type_="check",
    )
    op.drop_column("google_drive_connections", "evolution_export_frequency")
