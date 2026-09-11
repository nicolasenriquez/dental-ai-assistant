"""Add durable assistant-message termination semantics."""

from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE messages ADD COLUMN termination_reason TEXT")
    op.execute(
        "ALTER TABLE messages ADD CONSTRAINT messages_termination_reason_check "
        "CHECK (termination_reason IS NULL OR termination_reason IN "
        "('completed', 'user_cancelled', 'client_disconnected', 'provider_timeout', 'length', 'failed'))"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE messages DROP CONSTRAINT messages_termination_reason_check")
    op.execute("ALTER TABLE messages DROP COLUMN termination_reason")
