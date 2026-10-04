"""Response schemas shared by patient resources."""

from uuid import UUID

from pydantic import BaseModel


class Actor(BaseModel):
    user_id: UUID
    display_name: str | None = None
