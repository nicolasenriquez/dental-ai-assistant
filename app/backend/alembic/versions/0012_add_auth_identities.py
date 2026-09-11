"""Add Google provider identities and relax users.password_hash.

Revision ID: 0012
Revises: 0011
Create Date: 2026-09-10

- users.password_hash becomes nullable: NULL means federated-only and is never
  represented by a random password or sentinel hash.
- auth_identities maps unique (provider, provider_subject) to one Dental
  user_id, with at most one identity per (user_id, provider). Google `sub` is
  the authority; provider_email_snapshot is refreshed after verified sign-in
  and never authorizes account association.
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.alter_column("users", "password_hash", existing_type=sa.Text(), nullable=True)
    op.create_table(
        "auth_identities",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("provider", sa.Text(), nullable=False),
        sa.Column("provider_subject", sa.Text(), nullable=False),
        sa.Column("provider_email_snapshot", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "provider", "provider_subject", name="uq_auth_identities_provider_subject"
        ),
        sa.UniqueConstraint("user_id", "provider", name="uq_auth_identities_user_provider"),
    )


def downgrade() -> None:
    op.drop_table("auth_identities")
    op.alter_column("users", "password_hash", existing_type=sa.Text(), nullable=False)
