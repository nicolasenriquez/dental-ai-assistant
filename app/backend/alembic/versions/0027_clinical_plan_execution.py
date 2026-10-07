"""Retain session cancellation and treatment-owned execution notes additively."""

from alembic import op

revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE patient_dental_clinical_notes (
            id UUID PRIMARY KEY, patient_id UUID NOT NULL, owner_user_id UUID NOT NULL,
            note_type TEXT NOT NULL CHECK(note_type='treatment'),
            treatment_id UUID NOT NULL, body TEXT NOT NULL CHECK(char_length(btrim(body)) BETWEEN 1 AND 4000),
            revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
            created_by UUID NOT NULL REFERENCES users(id), updated_by UUID NOT NULL REFERENCES users(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            deleted_at TIMESTAMPTZ,
            UNIQUE(id,patient_id,owner_user_id),
            FOREIGN KEY(treatment_id,patient_id,owner_user_id) REFERENCES patient_dental_treatments(id,patient_id,owner_user_id) ON DELETE CASCADE
        )
    """)
    op.execute("""
        CREATE TABLE patient_dental_clinical_note_revisions (
            id UUID PRIMARY KEY, note_id UUID NOT NULL, patient_id UUID NOT NULL, owner_user_id UUID NOT NULL,
            revision INTEGER NOT NULL CHECK(revision>0), action TEXT NOT NULL, before_snapshot JSONB,
            after_snapshot JSONB NOT NULL, actor_user_id UUID NOT NULL REFERENCES users(id),
            changed_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(note_id,revision),
            FOREIGN KEY(note_id,patient_id,owner_user_id) REFERENCES patient_dental_clinical_notes(id,patient_id,owner_user_id) ON DELETE CASCADE
        )
    """)
    op.execute("""
        ALTER TABLE patient_clinical_plan_stages
            ADD COLUMN cancelled_at TIMESTAMPTZ,
            ADD COLUMN cancelled_by UUID REFERENCES users(id),
            ADD COLUMN cancellation_reason TEXT CHECK(char_length(cancellation_reason)<=1000),
            ADD COLUMN clinical_note_id UUID,
            ADD CONSTRAINT fk_stage_execution_note FOREIGN KEY(clinical_note_id,patient_id,owner_user_id)
                REFERENCES patient_dental_clinical_notes(id,patient_id,owner_user_id)
    """)


def downgrade() -> None:
    # Application rollback keeps execution and note evidence.
    pass
