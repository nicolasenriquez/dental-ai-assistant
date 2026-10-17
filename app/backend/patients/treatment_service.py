"""Treatment command boundary with an injectable persistence adapter."""

from collections.abc import Awaitable, Callable
from typing import Any
from uuid import UUID

from backend.db import patient_treatments_repo as repo
from backend.patients.treatments import CreateTreatment, EditTreatment

CommandAdapter = Callable[
    [UUID, UUID, UUID, str, dict[str, Any]], Awaitable[tuple[dict[str, Any], bool]]
]


async def execute(
    owner: UUID,
    patient: UUID,
    identifier: UUID,
    body: CreateTreatment | EditTreatment,
    *,
    adapter: CommandAdapter = repo.command,
) -> tuple[dict[str, Any], bool]:
    action = "create" if isinstance(body, CreateTreatment) else "edit"
    payload = body.model_dump(mode="json", exclude_unset=isinstance(body, EditTreatment))
    # Keep pre-Slice3 single-tooth payload hashes replayable after expanding the input schema.
    if payload.get("arch") is None:
        payload.pop("arch", None)
    return await adapter(owner, patient, identifier, action, payload)
