"""Persist the review artifact produced by each clinical turn."""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    uuid_type = postgresql.UUID(as_uuid=True)
    timestamp_type = sa.DateTime(timezone=True)

    op.create_table(
        "clinical_turn_artifacts",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column("owner_user_id", uuid_type, nullable=False),
        sa.Column("thread_id", uuid_type, nullable=False),
        sa.Column("turn_id", uuid_type, nullable=False),
        sa.Column("patient_id", uuid_type, nullable=False),
        sa.Column("artifact_type", sa.Text(), nullable=False, server_default="clinical_draft"),
        sa.Column("status", sa.Text(), nullable=False, server_default="draft"),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", timestamp_type, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", timestamp_type, nullable=False, server_default=sa.func.now()),
        sa.Column("resolved_at", timestamp_type, nullable=True),
        sa.ForeignKeyConstraint(["thread_id"], ["clinical_threads.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["patient_id", "owner_user_id"],
            ["patients.id", "patients.owner_user_id"],
            name="fk_clinical_artifacts_patient_owner",
            ondelete="RESTRICT",
        ),
        sa.CheckConstraint(
            "artifact_type IN ('clinical_draft')",
            name="ck_clinical_turn_artifacts_type",
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'stale', 'pending', 'approved', 'declined', 'failed')",
            name="ck_clinical_turn_artifacts_status",
        ),
        sa.UniqueConstraint(
            "thread_id", "turn_id", "artifact_type", name="uq_clinical_turn_artifacts_turn"
        ),
        sa.UniqueConstraint(
            "thread_id", "turn_id", "patient_id", name="uq_clinical_turn_artifacts_patient_turn"
        ),
    )
    op.create_index(
        "ix_clinical_turn_artifacts_thread_created",
        "clinical_turn_artifacts",
        ["thread_id", "created_at"],
    )
    op.create_index(
        "ix_clinical_turn_artifacts_owner_status",
        "clinical_turn_artifacts",
        ["owner_user_id", "status"],
    )

    op.add_column(
        "clinical_pending_actions",
        sa.Column("artifact_id", uuid_type, nullable=True),
    )
    op.create_foreign_key(
        "fk_clinical_pending_actions_artifact",
        "clinical_pending_actions",
        "clinical_turn_artifacts",
        ["artifact_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        "ix_clinical_pending_actions_artifact",
        "clinical_pending_actions",
        ["artifact_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_clinical_pending_actions_artifact", table_name="clinical_pending_actions")
    op.drop_constraint(
        "fk_clinical_pending_actions_artifact", "clinical_pending_actions", type_="foreignkey"
    )
    op.drop_column("clinical_pending_actions", "artifact_id")
    op.drop_index("ix_clinical_turn_artifacts_owner_status", table_name="clinical_turn_artifacts")
    op.drop_index("ix_clinical_turn_artifacts_thread_created", table_name="clinical_turn_artifacts")
    op.drop_table("clinical_turn_artifacts")
