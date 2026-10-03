"""Add optional patient contact without changing existing rows."""

import sqlalchemy as sa

from alembic import op

revision: str = "0020"
down_revision: str | None = "0019"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent")
    op.add_column("patients", sa.Column("phone", sa.String(40), nullable=True))
    op.add_column("patients", sa.Column("email", sa.String(254), nullable=True))


def downgrade() -> None:
    # Keep contact data on application rollback; schema remains expand-only.
    pass
