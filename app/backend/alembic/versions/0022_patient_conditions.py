"""Expand-only manual tooth conditions and append-only revisions."""

from alembic import op

revision: str = "0022"
down_revision: str | None = "0021"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE patient_tooth_conditions (
            id UUID PRIMARY KEY,
            owner_user_id UUID NOT NULL REFERENCES users(id),
            patient_id UUID NOT NULL,
            dentition TEXT NOT NULL CHECK (dentition IN ('permanent','primary')),
            tooth_fdi SMALLINT NOT NULL,
            condition_code TEXT NOT NULL CHECK (condition_code IN
                ('pulpitis','caries','incipient_caries','pigmentation','fracture','missing',
                 'periapical_lt_2mm','periapical_2_4mm','periapical_gt_4mm','rotated','displaced','unerupted')),
            surfaces TEXT[] NOT NULL DEFAULT '{}',
            note TEXT CHECK (note IS NULL OR char_length(btrim(note)) BETWEEN 1 AND 1000),
            status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','resolved')),
            revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
            created_by_user_id UUID NOT NULL REFERENCES users(id),
            updated_by_user_id UUID NOT NULL REFERENCES users(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE(id,patient_id,owner_user_id),
            FOREIGN KEY(patient_id,owner_user_id) REFERENCES patients(id,owner_user_id) ON DELETE CASCADE,
            CHECK ((dentition='permanent' AND tooth_fdi/10 BETWEEN 1 AND 4 AND tooth_fdi%10 BETWEEN 1 AND 8)
                OR (dentition='primary' AND tooth_fdi/10 BETWEEN 5 AND 8 AND tooth_fdi%10 BETWEEN 1 AND 5)),
            CHECK (surfaces = array_remove(ARRAY[
                CASE WHEN 'M'=ANY(surfaces) THEN 'M' END,
                CASE WHEN 'D'=ANY(surfaces) THEN 'D' END,
                CASE WHEN 'O'=ANY(surfaces) THEN 'O' END,
                CASE WHEN 'V'=ANY(surfaces) THEN 'V' END,
                CASE WHEN 'L'=ANY(surfaces) THEN 'L' END]::text[],NULL)),
            CHECK (cardinality(surfaces)=0 OR condition_code IN ('caries','incipient_caries','pigmentation','fracture'))
        )
    """)
    op.execute("""
        CREATE UNIQUE INDEX uq_patient_condition_active ON patient_tooth_conditions
            (owner_user_id,patient_id,dentition,tooth_fdi,condition_code,surfaces) WHERE status='active'
    """)
    op.execute("""
        CREATE INDEX ix_patient_conditions_owner ON patient_tooth_conditions
            (owner_user_id,patient_id,tooth_fdi,status,created_at DESC,id DESC)
    """)
    op.execute("""
        CREATE TABLE patient_tooth_condition_revisions (
            id UUID PRIMARY KEY,
            condition_id UUID NOT NULL,
            owner_user_id UUID NOT NULL REFERENCES users(id),
            patient_id UUID NOT NULL,
            revision INTEGER NOT NULL CHECK (revision>0),
            before_snapshot JSONB,
            after_snapshot JSONB NOT NULL,
            actor_user_id UUID NOT NULL REFERENCES users(id),
            changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            action TEXT NOT NULL CHECK (action IN ('created','edited','resolved')),
            UNIQUE(condition_id,revision),
            FOREIGN KEY(condition_id,patient_id,owner_user_id)
                REFERENCES patient_tooth_conditions(id,patient_id,owner_user_id) ON DELETE CASCADE,
            FOREIGN KEY(patient_id,owner_user_id) REFERENCES patients(id,owner_user_id) ON DELETE CASCADE,
            CHECK ((revision=1 AND action='created' AND before_snapshot IS NULL)
                OR (revision>1 AND action IN ('edited','resolved') AND before_snapshot IS NOT NULL))
        )
    """)
    op.execute("""
        CREATE INDEX ix_patient_condition_revisions_owner ON patient_tooth_condition_revisions
            (owner_user_id,patient_id,condition_id,revision DESC,id DESC)
    """)


def downgrade() -> None:
    # Application rollback retains expanded clinical records and history.
    pass
