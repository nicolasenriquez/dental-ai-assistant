"""Retain the failed turn associated with a clinical retry."""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0023"
down_revision: str | None = "0022"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column(
        "clinical_messages", sa.Column("retry_of_turn_id", postgresql.UUID(), nullable=True)
    )
    op.create_check_constraint(
        "ck_clinical_message_retry",
        "clinical_messages",
        "retry_of_turn_id IS NULL OR (role = 'user' AND retry_of_turn_id <> turn_id)",
    )


def downgrade() -> None:
    op.drop_constraint("ck_clinical_message_retry", "clinical_messages", type_="check")
    op.drop_column("clinical_messages", "retry_of_turn_id")
