"""Add owner-scoped patient notes and append-only revisions."""

from alembic import op

revision: str = "0021"
down_revision: str | None = "0020"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE patient_notes (
            id UUID PRIMARY KEY,
            owner_user_id UUID NOT NULL REFERENCES users(id),
            patient_id UUID NOT NULL,
            body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
            created_by_user_id UUID NOT NULL REFERENCES users(id),
            updated_by_user_id UUID NOT NULL REFERENCES users(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
            UNIQUE (id, patient_id, owner_user_id),
            FOREIGN KEY (patient_id, owner_user_id)
                REFERENCES patients(id, owner_user_id) ON DELETE CASCADE
        )
    """)
    op.execute("""
        CREATE INDEX ix_patient_notes_owner_updated
            ON patient_notes(owner_user_id, patient_id, updated_at DESC, id DESC)
    """)
    op.execute("""
        CREATE TABLE patient_note_revisions (
            id UUID PRIMARY KEY,
            note_id UUID NOT NULL,
            patient_id UUID NOT NULL,
            owner_user_id UUID NOT NULL REFERENCES users(id),
            revision INTEGER NOT NULL CHECK (revision > 0),
            previous_body TEXT,
            new_body TEXT NOT NULL CHECK (char_length(btrim(new_body)) BETWEEN 1 AND 4000),
            actor_user_id UUID NOT NULL REFERENCES users(id),
            changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            action TEXT NOT NULL CHECK (action IN ('created', 'edited')),
            UNIQUE (note_id, revision),
            FOREIGN KEY (note_id, patient_id, owner_user_id)
                REFERENCES patient_notes(id, patient_id, owner_user_id) ON DELETE CASCADE,
            FOREIGN KEY (patient_id, owner_user_id)
                REFERENCES patients(id, owner_user_id) ON DELETE CASCADE,
            CHECK ((revision = 1 AND action = 'created' AND previous_body IS NULL)
                OR (revision > 1 AND action = 'edited' AND previous_body IS NOT NULL))
        )
    """)
    op.execute("""
        CREATE INDEX ix_patient_note_revisions_owner
            ON patient_note_revisions(owner_user_id, patient_id, note_id, revision DESC, id DESC)
    """)


def downgrade() -> None:
    # Application rollback retains notes and revision history; this migration is expand-only.
    pass
