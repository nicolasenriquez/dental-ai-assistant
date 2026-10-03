"""Add Google Drive connection and OAuth-transaction tables.

Revision ID: 0013
Revises: 0012
Create Date: 2026-09-10

- ``google_drive_connections``: one encrypted connection row per Dental user.
  ``status`` is the sole persisted connection-state source; ``active`` carries
  complete refresh credentials plus exact ``drive.file``, terminal statuses
  clear refresh credentials and scopes while retaining account/folder identity
  and the encrypted binding secret for reconnect.
- ``google_drive_oauth_transactions``: short-lived one-shot OAuth state. Only
  the state hash is persisted (never the raw state); the row binds the
  initiating Dental user, session fingerprint, expected Google email (Google
  mode), and folder operation ID. ``claim_oauth_transaction`` consumes the row
  atomically before code exchange.
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "google_drive_connections",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("google_account_id", sa.Text(), nullable=True),
        sa.Column("refresh_token_ciphertext", sa.LargeBinary(), nullable=True),
        sa.Column("refresh_token_nonce", sa.LargeBinary(), nullable=True),
        sa.Column("token_key_version", sa.Text(), nullable=True),
        sa.Column("binding_secret_ciphertext", sa.LargeBinary(), nullable=False),
        sa.Column("binding_secret_nonce", sa.LargeBinary(), nullable=False),
        sa.Column("binding_key_version", sa.Text(), nullable=False),
        sa.Column(
            "granted_scopes",
            postgresql.ARRAY(sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("folder_id", sa.Text(), nullable=True),
        sa.Column("folder_name", sa.Text(), nullable=True),
        sa.Column("folder_creation_operation_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("pending_folder_operation_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("status_changed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("connected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('active', 'disconnected', 'revoked')",
            name="ck_google_drive_connections_status",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_table(
        "google_drive_oauth_transactions",
        sa.Column("state_hash", sa.LargeBinary(), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("session_fingerprint", sa.LargeBinary(), nullable=False),
        sa.Column("expected_google_email", sa.Text(), nullable=True),
        sa.Column("folder_operation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )


def downgrade() -> None:
    op.drop_table("google_drive_oauth_transactions")
    op.drop_table("google_drive_connections")
