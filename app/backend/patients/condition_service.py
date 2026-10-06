"""Validated human condition commands; repositories own locks and transactions."""

from typing import Any
from uuid import UUID

from backend.db import patient_conditions_repo as repo
from backend.patients.conditions import (
    CorrectCondition,
    CorrectionReceipt,
    CreateCondition,
    UpdateCondition,
)


async def record(
    owner: UUID, patient: UUID, command: CreateCondition
) -> tuple[dict[str, Any], bool]:
    result: tuple[dict[str, Any], bool] = await repo.create_condition(
        owner, patient, command.id, command.model_dump(exclude={"id"})
    )
    return result


async def edit(
    owner: UUID, patient: UUID, identifier: UUID, command: UpdateCondition
) -> dict[str, Any]:
    changes = command.model_dump(exclude={"expected_revision"}, exclude_unset=True)
    result: dict[str, Any] = await repo.update_condition(
        owner, patient, identifier, command.expected_revision, changes
    )
    return result


async def resolve(
    owner: UUID, patient: UUID, identifier: UUID, command: UpdateCondition
) -> dict[str, Any]:
    # The existing PATCH contract permits note/surface changes together with resolution.
    return await edit(owner, patient, identifier, command)


async def correct(
    owner: UUID, patient: UUID, identifier: UUID, command: CorrectCondition
) -> tuple[CorrectionReceipt, bool]:
    # Normalize defaults/nulls, text and canonical surfaces once before immutable replay comparison.
    normalized = {
        "patient_id": str(patient),
        "condition_id": str(identifier),
        **command.model_dump(mode="json"),
    }
    receipt, created = await repo.correct_condition(owner, patient, identifier, normalized)
    return CorrectionReceipt.model_validate(receipt), created
