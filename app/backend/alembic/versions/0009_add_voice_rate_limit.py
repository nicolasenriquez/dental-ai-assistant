"""Persist the per-user voice transcription window.

Revision ID: 0009
Revises: 0008
Create Date: 2026-09-08
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "voice_transcription_requests",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "requested_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_voice_transcription_requests_user_requested",
        "voice_transcription_requests",
        ["user_id", "requested_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_voice_transcription_requests_user_requested",
        table_name="voice_transcription_requests",
    )
    op.drop_table("voice_transcription_requests")
