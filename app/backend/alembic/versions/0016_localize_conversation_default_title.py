"""Use Spanish default title for new conversations."""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.alter_column(
        "conversations",
        "title",
        existing_type=sa.Text(),
        server_default=sa.text("'Nueva conversación'"),
    )


def downgrade() -> None:
    op.alter_column(
        "conversations",
        "title",
        existing_type=sa.Text(),
        server_default=sa.text("'New Conversation'"),
    )
