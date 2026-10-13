"""Enable the database type used by the existing hybrid retrieval queries."""

from alembic import op

revision: str = "0032"
down_revision: str | None = "0031"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")


def downgrade() -> None:
    # Older retrieval code also depends on this shared type. Never remove it.
    pass
