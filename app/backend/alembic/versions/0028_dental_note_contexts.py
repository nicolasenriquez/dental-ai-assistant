"""Expand execution notes to diagnosis and clinical-plan contexts without rewriting history."""

from alembic import op

revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Parent deletion cascades both notes and stages; check their link after both cascades.
    op.execute(
        "ALTER TABLE patient_clinical_plan_stages ALTER CONSTRAINT fk_stage_execution_note DEFERRABLE INITIALLY DEFERRED"
    )
    op.execute("""
        ALTER TABLE patient_dental_clinical_notes
            DROP CONSTRAINT patient_dental_clinical_notes_note_type_check,
            ALTER COLUMN treatment_id DROP NOT NULL,
            ADD COLUMN plan_id UUID,
            ADD COLUMN dentition TEXT,
            ADD COLUMN tooth_fdi INTEGER,
            ADD CONSTRAINT dental_note_type CHECK(note_type IN ('diagnosis','treatment','treatment_plan')),
            ADD CONSTRAINT dental_note_context CHECK(
                (note_type='diagnosis' AND treatment_id IS NULL AND plan_id IS NULL) OR
                (note_type='treatment' AND treatment_id IS NOT NULL AND plan_id IS NULL AND tooth_fdi IS NULL AND dentition IS NULL) OR
                (note_type='treatment_plan' AND treatment_id IS NULL AND plan_id IS NOT NULL AND tooth_fdi IS NULL AND dentition IS NULL)),
            ADD CONSTRAINT dental_note_tooth CHECK(
                (tooth_fdi IS NULL AND dentition IS NULL) OR
                (tooth_fdi IS NOT NULL AND dentition IS NOT NULL AND
                    ((dentition='permanent' AND tooth_fdi/10 BETWEEN 1 AND 4 AND tooth_fdi%10 BETWEEN 1 AND 8) OR
                     (dentition='primary' AND tooth_fdi/10 BETWEEN 5 AND 8 AND tooth_fdi%10 BETWEEN 1 AND 5)))),
            ADD CONSTRAINT dental_note_patient FOREIGN KEY(patient_id,owner_user_id)
                REFERENCES patients(id,owner_user_id) ON DELETE CASCADE,
            ADD CONSTRAINT dental_note_plan FOREIGN KEY(plan_id,patient_id,owner_user_id)
                REFERENCES patient_clinical_plans(id,patient_id,owner_user_id) ON DELETE CASCADE
    """)


def downgrade() -> None:
    # Application rollback retains all note contexts, revisions and execution links.
    pass
