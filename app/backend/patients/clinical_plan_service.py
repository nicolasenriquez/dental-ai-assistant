"""Clinical plan command boundary; persistence adapter is injectable."""

from typing import Any
from uuid import UUID

from backend.db import patient_clinical_plans_repo as repo
from backend.patients.clinical_plans import PlanCommand
from backend.patients.treatment_service import CommandAdapter


async def execute(
    owner: UUID,
    patient: UUID,
    identifier: UUID,
    action: str,
    body: PlanCommand,
    *,
    item_id: UUID | None = None,
    stage_id: UUID | None = None,
    adapter: CommandAdapter = repo.command,
) -> tuple[dict[str, Any], bool]:
    payload = body.model_dump(mode="json", exclude_unset=True)
    # Defaults are meaningful for initial sessions and canonical treatment members.
    if action in ("add_item", "add_stage"):
        payload = body.model_dump(mode="json")
    payload["item_id"] = str(item_id) if item_id else None
    payload["stage_id"] = str(stage_id) if stage_id else None
    receipt, changed = await adapter(owner, patient, identifier, action, payload)
    return dict(receipt), bool(changed)
