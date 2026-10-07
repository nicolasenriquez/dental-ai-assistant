"""Add observed treatments, members, revisions and durable command receipts."""

from alembic import op

revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE patient_dental_treatments (
            id UUID PRIMARY KEY, owner_user_id UUID NOT NULL REFERENCES users(id),
            patient_id UUID NOT NULL, variant_id TEXT NOT NULL, catalog_version TEXT NOT NULL,
            label_es TEXT NOT NULL, clinical_type TEXT NOT NULL, category_key TEXT NOT NULL,
            scope TEXT NOT NULL CHECK(scope IN ('tooth','multi_tooth','global_arch')),
            dentition TEXT NOT NULL CHECK(dentition IN ('permanent','primary')),
            arch TEXT CHECK(arch IN ('upper','lower')),
            provenance TEXT NOT NULL CHECK(provenance IN ('observed_existing','planned_in_clinic')),
            state TEXT NOT NULL CHECK(state IN ('existing','planned','performed','cancelled','entered_in_error')),
            note TEXT CHECK(note IS NULL OR char_length(btrim(note)) BETWEEN 1 AND 1000),
            revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
            supersedes_id UUID, replacement_id UUID,
            created_by_user_id UUID NOT NULL REFERENCES users(id),
            updated_by_user_id UUID NOT NULL REFERENCES users(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE(id,patient_id,owner_user_id),
            FOREIGN KEY(patient_id,owner_user_id) REFERENCES patients(id,owner_user_id) ON DELETE CASCADE,
            FOREIGN KEY(supersedes_id,patient_id,owner_user_id) REFERENCES patient_dental_treatments(id,patient_id,owner_user_id),
            FOREIGN KEY(replacement_id,patient_id,owner_user_id) REFERENCES patient_dental_treatments(id,patient_id,owner_user_id) DEFERRABLE INITIALLY DEFERRED,
            CHECK((scope='global_arch')=(arch IS NOT NULL))
        )
    """)
    op.execute("""
        CREATE TABLE patient_dental_treatment_teeth (
            treatment_id UUID NOT NULL, patient_id UUID NOT NULL, owner_user_id UUID NOT NULL,
            dentition TEXT NOT NULL, tooth_fdi SMALLINT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('tooth','pillar','pontic')), surfaces TEXT[] NOT NULL,
            PRIMARY KEY(treatment_id,tooth_fdi),
            FOREIGN KEY(treatment_id,patient_id,owner_user_id) REFERENCES patient_dental_treatments(id,patient_id,owner_user_id) ON DELETE CASCADE,
            CHECK((dentition='permanent' AND tooth_fdi/10 BETWEEN 1 AND 4 AND tooth_fdi%10 BETWEEN 1 AND 8)
               OR (dentition='primary' AND tooth_fdi/10 BETWEEN 5 AND 8 AND tooth_fdi%10 BETWEEN 1 AND 5)),
            CHECK(surfaces = array_remove(ARRAY[
                CASE WHEN 'M'=ANY(surfaces) THEN 'M' END, CASE WHEN 'D'=ANY(surfaces) THEN 'D' END,
                CASE WHEN 'O'=ANY(surfaces) THEN 'O' END, CASE WHEN 'V'=ANY(surfaces) THEN 'V' END,
                CASE WHEN 'L'=ANY(surfaces) THEN 'L' END]::text[],NULL))
        )
    """)
    op.execute("""
        CREATE TABLE patient_dental_treatment_revisions (
            id UUID PRIMARY KEY, treatment_id UUID NOT NULL, patient_id UUID NOT NULL,
            owner_user_id UUID NOT NULL, revision INTEGER NOT NULL CHECK(revision>0),
            action TEXT NOT NULL CHECK(action IN ('created','edited','corrected')),
            before_snapshot JSONB, after_snapshot JSONB NOT NULL, reason TEXT,
            actor_user_id UUID NOT NULL REFERENCES users(id), changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE(treatment_id,revision),
            FOREIGN KEY(treatment_id,patient_id,owner_user_id) REFERENCES patient_dental_treatments(id,patient_id,owner_user_id) ON DELETE CASCADE
        )
    """)
    op.execute("""
        CREATE TABLE patient_clinical_commands (
            owner_user_id UUID NOT NULL REFERENCES users(id), operation_id UUID NOT NULL,
            patient_id UUID NOT NULL, payload_hash TEXT NOT NULL, receipt JSONB NOT NULL,
            committed_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(owner_user_id,operation_id),
            FOREIGN KEY(patient_id,owner_user_id) REFERENCES patients(id,owner_user_id) ON DELETE CASCADE
        )
    """)
    op.execute(
        "CREATE INDEX ix_dental_treatments_owner ON patient_dental_treatments(owner_user_id,patient_id,created_at DESC,id DESC)"
    )


def downgrade() -> None:
    # Roll back application code while retaining clinical evidence.
    pass
