"""Persist typed clinical read results alongside assistant messages."""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0019"
down_revision: str | None = "0018"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column(
        "clinical_messages", sa.Column("clinical_result", postgresql.JSONB(), nullable=True)
    )
    op.create_index(
        "ix_clinical_threads_owner_patient_updated",
        "clinical_threads",
        ["owner_user_id", "active_patient_id", "updated_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_clinical_threads_owner_patient_updated", table_name="clinical_threads")
    op.drop_column("clinical_messages", "clinical_result")
