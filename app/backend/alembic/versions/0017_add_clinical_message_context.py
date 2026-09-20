"""Add structured context to clinical messages."""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0017"
down_revision: str | None = "0016"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column(
        "clinical_messages",
        sa.Column("context_items", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "clinical_messages",
        sa.Column("patient_switch", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("clinical_messages", "patient_switch")
    op.drop_column("clinical_messages", "context_items")
