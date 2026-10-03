"""Add the versioned clinical terminology catalog.

Revision ID: 0018
Revises: 0017
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0018"
down_revision: str | None = "0017"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "clinical_terms",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("dataset_concept_id", sa.Text(), nullable=False, unique=True),
        sa.Column("dataset_id", sa.Text(), nullable=False),
        sa.Column("preferred_es", sa.Text(), nullable=False),
        sa.Column("normalized_preferred_es", sa.Text(), nullable=False),
        sa.Column("preferred_en", sa.Text(), nullable=False),
        sa.Column("normalized_preferred_en", sa.Text(), nullable=False),
        sa.Column("definition", sa.Text(), nullable=False),
        sa.Column("domain", sa.Text(), nullable=False),
        sa.Column("category", sa.Text(), nullable=False),
        sa.Column("source_ids", postgresql.ARRAY(sa.Text()), nullable=False),
        sa.Column("metadata", postgresql.JSONB(), nullable=False),
        sa.Column("dataset_schema_version", sa.Text(), nullable=False),
        sa.Column("dataset_checksum", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint("status IN ('active', 'inactive')", name="ck_clinical_terms_status"),
    )
    op.create_index("ix_clinical_terms_preferred_es", "clinical_terms", ["normalized_preferred_es"])
    op.create_index("ix_clinical_terms_preferred_en", "clinical_terms", ["normalized_preferred_en"])

    op.create_table(
        "clinical_term_aliases",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("term_id", sa.BigInteger(), nullable=False),
        sa.Column("display_alias", sa.Text(), nullable=False),
        sa.Column("normalized_alias", sa.Text(), nullable=False),
        sa.Column("language", sa.Text(), nullable=False),
        sa.Column("alias_type", sa.Text(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(["term_id"], ["clinical_terms.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "term_id", "normalized_alias", "language", name="uq_clinical_term_alias_concept_key"
        ),
    )
    op.create_index(
        "ix_clinical_term_alias_lookup",
        "clinical_term_aliases",
        ["normalized_alias", "language"],
    )


def downgrade() -> None:
    op.drop_index("ix_clinical_term_alias_lookup", table_name="clinical_term_aliases")
    op.drop_table("clinical_term_aliases")
    op.drop_index("ix_clinical_terms_preferred_en", table_name="clinical_terms")
    op.drop_index("ix_clinical_terms_preferred_es", table_name="clinical_terms")
    op.drop_table("clinical_terms")
