"""Treatment command boundary with an injectable persistence adapter."""

from collections.abc import Awaitable, Callable
from typing import Any
from uuid import UUID

from backend.db import patient_treatments_repo as repo
from backend.patients.treatments import CorrectTreatment, CreateTreatment, EditTreatment

CommandAdapter = Callable[
    [UUID, UUID, UUID, str, dict[str, Any]], Awaitable[tuple[dict[str, Any], bool]]
]


async def execute(
    owner: UUID,
    patient: UUID,
    identifier: UUID,
    body: CreateTreatment | EditTreatment | CorrectTreatment,
    *,
    adapter: CommandAdapter = repo.command,
) -> tuple[dict[str, Any], bool]:
    action = (
        "create"
        if isinstance(body, CreateTreatment)
        else "edit"
        if isinstance(body, EditTreatment)
        else "correct"
    )
    payload = body.model_dump(mode="json", exclude_unset=isinstance(body, EditTreatment))
    # Keep pre-Slice3 single-tooth payload hashes replayable after expanding the input schema.
    if payload.get("arch") is None:
        payload.pop("arch", None)
    if payload.get("expected_plan_revision") is None:
        payload.pop("expected_plan_revision", None)
    replacement = payload.get("replacement")
    if replacement and replacement.get("arch") is None:
        replacement.pop("arch", None)
    return await adapter(owner, patient, identifier, action, payload)
