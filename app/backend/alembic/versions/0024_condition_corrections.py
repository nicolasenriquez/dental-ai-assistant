"""Expand manual conditions with atomic error correction and stable receipts."""

from alembic import op

revision: str = "0024"
down_revision: str | None = "0023"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE patient_tooth_conditions
            DROP CONSTRAINT patient_tooth_conditions_status_check,
            ADD CONSTRAINT patient_tooth_conditions_status_check
                CHECK (status IN ('active','resolved','entered_in_error')),
            ADD COLUMN supersedes_condition_id UUID,
            ADD CONSTRAINT fk_condition_supersedes
                FOREIGN KEY(supersedes_condition_id,patient_id,owner_user_id)
                REFERENCES patient_tooth_conditions(id,patient_id,owner_user_id),
            ADD CONSTRAINT ck_condition_supersedes_not_self
                CHECK (supersedes_condition_id IS NULL OR supersedes_condition_id<>id)
    """)
    op.execute("""
        CREATE UNIQUE INDEX uq_condition_direct_replacement
            ON patient_tooth_conditions(supersedes_condition_id)
            WHERE supersedes_condition_id IS NOT NULL
    """)
    op.execute("""
        ALTER TABLE patient_tooth_condition_revisions
            DROP CONSTRAINT patient_tooth_condition_revisions_action_check,
            DROP CONSTRAINT patient_tooth_condition_revisions_check,
            ADD CONSTRAINT patient_tooth_condition_revisions_action_check
                CHECK (action IN ('created','edited','resolved','corrected')),
            ADD CONSTRAINT patient_tooth_condition_revisions_check
                CHECK ((revision=1 AND action='created' AND before_snapshot IS NULL)
                    OR (revision>1 AND action IN ('edited','resolved','corrected') AND before_snapshot IS NOT NULL)),
            ADD COLUMN operation_id UUID,
            ADD COLUMN correction_reason TEXT,
            ADD COLUMN command_snapshot JSONB,
            ADD COLUMN replacement_condition_id UUID,
            ADD COLUMN replacement_revision_id UUID,
            ADD CONSTRAINT ck_condition_correction_metadata CHECK (
                (action='corrected' AND operation_id IS NOT NULL AND correction_reason IS NOT NULL
                    AND char_length(btrim(correction_reason)) BETWEEN 1 AND 1000
                    AND command_snapshot IS NOT NULL
                    AND ((replacement_condition_id IS NULL AND replacement_revision_id IS NULL)
                        OR (replacement_condition_id IS NOT NULL AND replacement_revision_id IS NOT NULL)))
                OR (action<>'corrected' AND operation_id IS NULL AND correction_reason IS NULL
                    AND command_snapshot IS NULL AND replacement_condition_id IS NULL AND replacement_revision_id IS NULL))
    """)
    op.execute("""
        CREATE UNIQUE INDEX uq_condition_correction_operation
            ON patient_tooth_condition_revisions(owner_user_id,operation_id)
            WHERE operation_id IS NOT NULL
    """)


def downgrade() -> None:
    # Retain error evidence, linkage and replay receipts on application rollback.
    # A status-unaware application cannot safely consume corrected records.
    pass
