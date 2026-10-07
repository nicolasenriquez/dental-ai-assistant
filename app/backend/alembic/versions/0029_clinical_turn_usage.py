"""Record clinical turn usage in a durable per-user audit table.

Revision ID: 0029
Revises: 0028
Create Date: 2026-10-07
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0029"
down_revision: str | None = "0028"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "clinical_turn_usage",
        sa.Column("owner_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_clinical_turn_usage_owner_created",
        "clinical_turn_usage",
        ["owner_user_id", "created_at"],
    )
    # Backfill the current 24h window so existing users keep their consumed quota.
    op.execute("""
        INSERT INTO clinical_turn_usage (owner_user_id, created_at)
        SELECT t.owner_user_id, m.created_at
        FROM clinical_messages m
        JOIN clinical_threads t ON t.id = m.thread_id
        WHERE m.role = 'user'
          AND m.created_at > now() - interval '24 hours'
    """)


def downgrade() -> None:
    op.drop_index("ix_clinical_turn_usage_owner_created", table_name="clinical_turn_usage")
    op.drop_table("clinical_turn_usage")
