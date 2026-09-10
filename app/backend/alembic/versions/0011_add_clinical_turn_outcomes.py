"""Persist terminal outcomes for idempotent clinical turn replay.

Revision ID: 0011
Revises: 0010
Create Date: 2026-09-10
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column("clinical_messages", sa.Column("turn_status", sa.Text(), nullable=True))
    op.add_column("clinical_messages", sa.Column("turn_error_code", sa.Text(), nullable=True))
    op.create_check_constraint(
        "ck_clinical_messages_turn_status",
        "clinical_messages",
        "turn_status IS NULL OR "
        "(role = 'user' AND turn_status IN ('running', 'completed', 'failed'))",
    )
    op.create_check_constraint(
        "ck_clinical_messages_turn_error",
        "clinical_messages",
        "turn_error_code IS NULL OR (role = 'user' AND turn_status = 'failed')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_clinical_messages_turn_error", "clinical_messages", type_="check")
    op.drop_constraint("ck_clinical_messages_turn_status", "clinical_messages", type_="check")
    op.drop_column("clinical_messages", "turn_error_code")
    op.drop_column("clinical_messages", "turn_status")
