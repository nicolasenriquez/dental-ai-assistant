"""Add isolated Clinical Assistant persistence.

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-08
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    uuid_type = postgresql.UUID(as_uuid=True)
    timestamp_type = sa.DateTime(timezone=True)

    op.create_table(
        "clinical_threads",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column(
            "owner_user_id",
            uuid_type,
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("title", sa.Text(), nullable=False, server_default="Asistente clínico"),
        sa.Column("active_patient_id", uuid_type, nullable=True),
        sa.Column("active_turn_id", uuid_type, nullable=True),
        sa.Column("created_at", timestamp_type, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", timestamp_type, nullable=False, server_default=sa.func.now()),
    )
    op.create_index(
        "ix_clinical_threads_owner_updated",
        "clinical_threads",
        ["owner_user_id", "updated_at"],
    )

    op.create_table(
        "clinical_messages",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column(
            "thread_id",
            uuid_type,
            sa.ForeignKey("clinical_threads.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("turn_id", uuid_type, nullable=False),
        sa.Column("role", sa.Text(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", timestamp_type, nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("role IN ('user', 'assistant')", name="ck_clinical_messages_role"),
    )
    op.create_index(
        "ix_clinical_messages_thread_created",
        "clinical_messages",
        ["thread_id", "created_at"],
    )
    op.create_index("ix_clinical_messages_turn", "clinical_messages", ["turn_id"])

    op.create_table(
        "clinical_pending_actions",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column("owner_user_id", uuid_type, nullable=False),
        sa.Column(
            "thread_id",
            uuid_type,
            sa.ForeignKey("clinical_threads.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("turn_id", uuid_type, nullable=False),
        sa.Column("patient_id", uuid_type, nullable=False),
        sa.Column("action_type", sa.Text(), nullable=False),
        sa.Column("proposal_payload", postgresql.JSONB(), nullable=True),
        sa.Column("proposal_hash", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("expires_at", timestamp_type, nullable=False),
        sa.Column("created_at", timestamp_type, nullable=False, server_default=sa.func.now()),
        sa.Column("resolved_at", timestamp_type, nullable=True),
        sa.Column("resolved_by", uuid_type, nullable=True),
        sa.Column("result_resource_id", uuid_type, nullable=True),
        sa.CheckConstraint(
            "status IN ('pending', 'approved', 'declined', 'expired', 'failed')",
            name="ck_clinical_pending_actions_status",
        ),
    )
    op.create_index(
        "ix_clinical_pending_actions_thread_status",
        "clinical_pending_actions",
        ["thread_id", "status", "expires_at"],
    )
    op.create_index(
        "ix_clinical_pending_actions_owner_status",
        "clinical_pending_actions",
        ["owner_user_id", "status"],
    )


def downgrade() -> None:
    op.drop_table("clinical_pending_actions")
    op.drop_table("clinical_messages")
    op.drop_table("clinical_threads")
