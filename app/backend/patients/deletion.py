"""Shared explicit-deletion request, immutable receipt and owned conflicts."""

from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from backend.patients.schemas import Actor


class DeleteDentalRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation_id: UUID
    expected_revision: Annotated[int, Field(strict=True, ge=1)]


class DentalDeletionReceipt(BaseModel):
    operation_id: UUID
    resource_kind: Literal["condition", "procedure"]
    resource_id: UUID
    action: Literal["deleted"]
    revision: Annotated[int, Field(ge=2)]
    revision_id: UUID
    deleted_at: datetime
    actor: Actor


class DeletionConflict(ValueError):
    def __init__(self, code: str, latest: dict[str, Any] | None = None) -> None:
        super().__init__(code)
        self.detail: dict[str, Any] = {"code": code}
        if latest is not None:
            self.detail["latest"] = latest
