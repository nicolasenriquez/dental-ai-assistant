"""Add owner-scoped patients and dental evolutions.

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-03
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "patients",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "owner_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("first_name", sa.Text(), nullable=False),
        sa.Column("last_name", sa.Text(), nullable=False),
        sa.Column("rut_number", sa.BigInteger(), nullable=False),
        sa.Column("rut_dv", sa.CHAR(length=1), nullable=False),
        sa.Column("birth_date", sa.Date(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("owner_user_id", "rut_number", name="uq_patients_owner_rut"),
        sa.UniqueConstraint("id", "owner_user_id", name="uq_patients_id_owner"),
    )
    op.create_index(
        "ix_patients_owner_name", "patients", ["owner_user_id", "last_name", "first_name"]
    )

    op.create_table(
        "evolutions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("patient_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("owner_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("evolution_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("raw_note", sa.Text(), nullable=False),
        sa.Column("generated_text", sa.Text(), nullable=False),
        sa.Column("final_text", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["patient_id", "owner_user_id"],
            ["patients.id", "patients.owner_user_id"],
            name="fk_evolutions_patient_owner",
            ondelete="RESTRICT",
        ),
    )
    op.create_index(
        "ix_evolutions_patient_history",
        "evolutions",
        ["patient_id", "owner_user_id", sa.text("evolution_at DESC"), sa.text("created_at DESC")],
    )


def downgrade() -> None:
    op.drop_table("evolutions")
    op.drop_table("patients")
