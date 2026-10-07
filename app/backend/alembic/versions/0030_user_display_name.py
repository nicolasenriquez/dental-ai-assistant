"""Nullable trusted professional display name on users, resolved in owned read queries."""

from alembic import op

revision = "0030"
down_revision = "0029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE users ADD COLUMN professional_display_name TEXT,"
        " ADD CONSTRAINT users_display_name_length CHECK("
        " professional_display_name IS NULL OR char_length(professional_display_name) BETWEEN 1 AND 120)"
    )


def downgrade() -> None:
    # Forward-only rollback compatibility: the column is nullable and read-side only.
    pass
