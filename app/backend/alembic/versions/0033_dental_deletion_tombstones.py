"""Paired dental deletion metadata with deletion revision actions and active-key reuse."""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0033"
down_revision: str | None = "0032"
branch_labels: str | None = None
depends_on: str | None = None

_DELETED_PAIR = "(deleted_at IS NULL) = (deleted_by_user_id IS NULL)"
_CONDITION_ACTIONS = "action IN ('created','edited','resolved','corrected','deleted')"
_CONDITION_REVISIONS = (
    "(revision=1 AND action='created' AND before_snapshot IS NULL)"
    " OR (revision>1 AND action IN ('edited','resolved','corrected','deleted')"
    " AND before_snapshot IS NOT NULL)"
)
_TREATMENT_ACTIONS = "action IN ('created','edited','corrected','deleted')"
_CONDITION_ACTIVE_KEYS = [
    "owner_user_id",
    "patient_id",
    "dentition",
    "tooth_fdi",
    "condition_code",
    "surfaces",
]


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '1s'")
    op.execute("SET LOCAL statement_timeout = '30s'")
    uuid_type = postgresql.UUID(as_uuid=True)
    timestamp_type = sa.DateTime(timezone=True)

    op.add_column(
        "patient_tooth_conditions", sa.Column("deleted_at", timestamp_type, nullable=True)
    )
    op.add_column(
        "patient_tooth_conditions", sa.Column("deleted_by_user_id", uuid_type, nullable=True)
    )
    op.create_foreign_key(
        "fk_condition_deleted_by",
        "patient_tooth_conditions",
        "users",
        ["deleted_by_user_id"],
        ["id"],
    )
    op.add_column(
        "patient_dental_treatments", sa.Column("deleted_at", timestamp_type, nullable=True)
    )
    op.add_column(
        "patient_dental_treatments", sa.Column("deleted_by_user_id", uuid_type, nullable=True)
    )
    op.create_foreign_key(
        "fk_treatment_deleted_by",
        "patient_dental_treatments",
        "users",
        ["deleted_by_user_id"],
        ["id"],
    )
    op.create_check_constraint(
        "ck_condition_deleted_pair", "patient_tooth_conditions", _DELETED_PAIR
    )
    op.create_check_constraint(
        "ck_treatment_deleted_pair", "patient_dental_treatments", _DELETED_PAIR
    )

    op.drop_constraint(
        "patient_tooth_condition_revisions_action_check",
        "patient_tooth_condition_revisions",
        type_="check",
    )
    op.create_check_constraint(
        "patient_tooth_condition_revisions_action_check",
        "patient_tooth_condition_revisions",
        _CONDITION_ACTIONS,
    )
    op.drop_constraint(
        "patient_tooth_condition_revisions_check",
        "patient_tooth_condition_revisions",
        type_="check",
    )
    op.create_check_constraint(
        "patient_tooth_condition_revisions_check",
        "patient_tooth_condition_revisions",
        _CONDITION_REVISIONS,
    )
    op.drop_constraint(
        "patient_dental_treatment_revisions_action_check",
        "patient_dental_treatment_revisions",
        type_="check",
    )
    op.create_check_constraint(
        "patient_dental_treatment_revisions_action_check",
        "patient_dental_treatment_revisions",
        _TREATMENT_ACTIONS,
    )

    op.drop_index("uq_patient_condition_active", table_name="patient_tooth_conditions")
    op.create_index(
        "uq_patient_condition_active",
        "patient_tooth_conditions",
        _CONDITION_ACTIVE_KEYS,
        unique=True,
        postgresql_where=sa.text("status='active' AND deleted_at IS NULL"),
    )


def downgrade() -> None:
    # Forward-only rollback compatibility: a deletion-aware reader is the rollback
    # floor, so an older application keeps the additive metadata and revision actions.
    pass
