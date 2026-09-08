"""Enforce single pending proposal per thread and single user message per turn.

Revision ID: 0008
Revises: 0007
Create Date: 2026-09-08
"""

from __future__ import annotations

from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.execute(
        """
        WITH ranked AS (
            SELECT id, row_number() OVER (
                PARTITION BY thread_id ORDER BY created_at DESC
            ) AS rn
            FROM clinical_pending_actions
            WHERE status = 'pending'
        )
        UPDATE clinical_pending_actions a
        SET status = 'expired', proposal_payload = NULL, resolved_at = now()
        FROM ranked
        WHERE a.id = ranked.id AND ranked.rn > 1
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX uq_clinical_pending_actions_thread_pending
        ON clinical_pending_actions (thread_id)
        WHERE status = 'pending'
        """
    )
    op.execute(
        """
        WITH ranked AS (
            SELECT id, row_number() OVER (
                PARTITION BY thread_id, turn_id ORDER BY created_at
            ) AS rn
            FROM clinical_messages
            WHERE role = 'user'
        )
        DELETE FROM clinical_messages m
        USING ranked
        WHERE m.id = ranked.id AND ranked.rn > 1
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX uq_clinical_messages_thread_turn_user
        ON clinical_messages (thread_id, turn_id)
        WHERE role = 'user'
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_clinical_messages_thread_turn_user")
    op.execute("DROP INDEX IF EXISTS uq_clinical_pending_actions_thread_pending")
