"""Add the patient-scoped dismissal receipt to clinical artifacts."""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0031"
down_revision: str | None = "0030"
branch_labels: str | None = None
depends_on: str | None = None

_LEGACY_STATUS_CHECK = "status IN ('draft', 'stale', 'pending', 'approved', 'declined', 'failed')"
_STATUS_CHECK = (
    "status IN ('draft', 'stale', 'pending', 'approved', 'declined', 'failed', 'discarded')"
)
_RECEIPT_CHECK = (
    "(status = 'discarded' AND discard_operation_id IS NOT NULL"
    " AND discarded_by IS NOT NULL AND discarded_by = owner_user_id"
    " AND discard_expected_updated_at IS NOT NULL AND resolved_at IS NOT NULL)"
    " OR (status <> 'discarded' AND discard_operation_id IS NULL"
    " AND discarded_by IS NULL AND discard_expected_updated_at IS NULL)"
)


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '1s'")
    op.execute("SET LOCAL statement_timeout = '30s'")
    uuid_type = postgresql.UUID(as_uuid=True)
    timestamp_type = sa.DateTime(timezone=True)

    op.drop_constraint(
        "ck_clinical_turn_artifacts_status", "clinical_turn_artifacts", type_="check"
    )
    op.create_check_constraint(
        "ck_clinical_turn_artifacts_status", "clinical_turn_artifacts", _STATUS_CHECK
    )
    op.add_column(
        "clinical_turn_artifacts", sa.Column("discard_operation_id", uuid_type, nullable=True)
    )
    op.add_column("clinical_turn_artifacts", sa.Column("discarded_by", uuid_type, nullable=True))
    op.add_column(
        "clinical_turn_artifacts",
        sa.Column("discard_expected_updated_at", timestamp_type, nullable=True),
    )
    op.create_check_constraint(
        "ck_clinical_turn_artifacts_discard_receipt", "clinical_turn_artifacts", _RECEIPT_CHECK
    )
    op.create_index(
        "uq_clinical_turn_artifacts_discard_operation",
        "clinical_turn_artifacts",
        ["owner_user_id", "discard_operation_id"],
        unique=True,
        postgresql_where=sa.text("discard_operation_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '1s'")
    op.execute("LOCK TABLE clinical_turn_artifacts IN ACCESS EXCLUSIVE MODE")
    receipts = op.get_bind().execute(
        sa.text(
            "SELECT 1 FROM clinical_turn_artifacts"
            " WHERE status = 'discarded' OR discard_operation_id IS NOT NULL LIMIT 1"
        )
    )
    if receipts.first() is not None:
        raise RuntimeError("Refusing downgrade: clinical discard receipts exist")
    # Validate the legacy states before removing any receipt schema.
    op.drop_constraint(
        "ck_clinical_turn_artifacts_status", "clinical_turn_artifacts", type_="check"
    )
    op.create_check_constraint(
        "ck_clinical_turn_artifacts_status", "clinical_turn_artifacts", _LEGACY_STATUS_CHECK
    )
    op.drop_index(
        "uq_clinical_turn_artifacts_discard_operation", table_name="clinical_turn_artifacts"
    )
    op.drop_constraint(
        "ck_clinical_turn_artifacts_discard_receipt", "clinical_turn_artifacts", type_="check"
    )
    op.drop_column("clinical_turn_artifacts", "discard_expected_updated_at")
    op.drop_column("clinical_turn_artifacts", "discarded_by")
    op.drop_column("clinical_turn_artifacts", "discard_operation_id")
