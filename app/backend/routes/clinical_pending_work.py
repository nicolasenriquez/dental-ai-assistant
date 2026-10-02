"""Read-only pending work API, scoped to the authenticated owner."""

from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.auth.dependencies import get_current_user
from backend.clinical_assistant.pending_work import PendingWorkPage, list_pending_work

router = APIRouter(tags=["clinical-assistant"])


@router.get("/clinical-pending-work", response_model=PendingWorkPage)
async def pending_work(
    user: Annotated[dict[str, Any], Depends(get_current_user)],
    patient_id: UUID | None = None,
    cursor: Annotated[str | None, Query(max_length=512)] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> PendingWorkPage:
    try:
        return await list_pending_work(UUID(str(user["id"])), patient_id, limit, cursor)
    except LookupError:
        raise HTTPException(status_code=404, detail="Paciente no encontrado") from None
    except ValueError:
        raise HTTPException(status_code=422, detail={"code": "INVALID_PENDING_CURSOR"}) from None
