"""Temporal access indexes for the dental-history reader."""

from alembic import op

revision: str = "0034"
down_revision: str | None = "0033"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.execute("""
        CREATE INDEX ix_patient_condition_revisions_history
            ON patient_tooth_condition_revisions
            (owner_user_id,patient_id,changed_at DESC,id DESC)
    """)
    op.execute("""
        CREATE INDEX ix_patient_treatment_revisions_history
            ON patient_dental_treatment_revisions
            (owner_user_id,patient_id,changed_at DESC,id DESC)
    """)


def downgrade() -> None:
    op.drop_index(
        "ix_patient_treatment_revisions_history",
        table_name="patient_dental_treatment_revisions",
    )
    op.drop_index(
        "ix_patient_condition_revisions_history",
        table_name="patient_tooth_condition_revisions",
    )
