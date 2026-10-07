"""Add patient-local clinical plan aggregates without changing historical records."""

from alembic import op

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE patient_clinical_plans (
            id UUID PRIMARY KEY, patient_id UUID NOT NULL, owner_user_id UUID NOT NULL,
            title TEXT CHECK(char_length(title)<=200), diagnosis TEXT CHECK(char_length(diagnosis)<=2000),
            internal_notes TEXT CHECK(char_length(internal_notes)<=2000),
            state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','pending','active','completed','closed','archived')),
            revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
            created_by UUID NOT NULL REFERENCES users(id), updated_by UUID NOT NULL REFERENCES users(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            confirmed_at TIMESTAMPTZ, confirmed_by UUID REFERENCES users(id),
            accepted_at TIMESTAMPTZ, accepted_by UUID REFERENCES users(id), acceptance_note TEXT CHECK(char_length(acceptance_note)<=2000),
            closed_at TIMESTAMPTZ, closed_by UUID REFERENCES users(id), closure_reason TEXT, closure_note TEXT CHECK(char_length(closure_note)<=2000),
            UNIQUE(id,patient_id,owner_user_id),
            FOREIGN KEY(patient_id,owner_user_id) REFERENCES patients(id,owner_user_id) ON DELETE CASCADE
        )
    """)
    op.execute("""
        CREATE TABLE patient_clinical_plan_items (
            id UUID PRIMARY KEY, plan_id UUID NOT NULL, patient_id UUID NOT NULL, owner_user_id UUID NOT NULL,
            treatment_id UUID NOT NULL UNIQUE, sequence INTEGER NOT NULL CHECK(sequence>0),
            status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','cancelled')),
            UNIQUE(id,plan_id,patient_id,owner_user_id),
            UNIQUE(plan_id,sequence) DEFERRABLE INITIALLY DEFERRED,
            FOREIGN KEY(plan_id,patient_id,owner_user_id) REFERENCES patient_clinical_plans(id,patient_id,owner_user_id) ON DELETE CASCADE,
            FOREIGN KEY(treatment_id,patient_id,owner_user_id) REFERENCES patient_dental_treatments(id,patient_id,owner_user_id) ON DELETE CASCADE
        )
    """)
    op.execute("""
        CREATE TABLE patient_clinical_plan_stages (
            id UUID PRIMARY KEY, item_id UUID NOT NULL, plan_id UUID NOT NULL, patient_id UUID NOT NULL, owner_user_id UUID NOT NULL,
            label TEXT NOT NULL CHECK(char_length(btrim(label)) BETWEEN 1 AND 200), note TEXT CHECK(char_length(note)<=1000),
            sequence INTEGER NOT NULL CHECK(sequence>0), status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','cancelled')),
            completed_at TIMESTAMPTZ, completed_by UUID REFERENCES users(id),
            UNIQUE(item_id,sequence) DEFERRABLE INITIALLY DEFERRED,
            FOREIGN KEY(item_id,plan_id,patient_id,owner_user_id) REFERENCES patient_clinical_plan_items(id,plan_id,patient_id,owner_user_id) ON DELETE CASCADE
        )
    """)
    op.execute("""
        CREATE TABLE patient_clinical_plan_revisions (
            id UUID PRIMARY KEY, plan_id UUID NOT NULL, patient_id UUID NOT NULL, owner_user_id UUID NOT NULL,
            revision INTEGER NOT NULL CHECK(revision>0), action TEXT NOT NULL, before_snapshot JSONB,
            after_snapshot JSONB NOT NULL, reason TEXT, actor_user_id UUID NOT NULL REFERENCES users(id),
            changed_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(plan_id,revision),
            FOREIGN KEY(plan_id,patient_id,owner_user_id) REFERENCES patient_clinical_plans(id,patient_id,owner_user_id) ON DELETE CASCADE
        )
    """)
    op.execute(
        "CREATE INDEX ix_clinical_plans_owner ON patient_clinical_plans(owner_user_id,patient_id,created_at DESC,id DESC)"
    )


def downgrade() -> None:
    # Application rollback retains clinical evidence; no destructive schema rollback.
    pass
