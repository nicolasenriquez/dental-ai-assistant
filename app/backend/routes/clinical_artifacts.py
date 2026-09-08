"""HTTP endpoints for persisted clinical review artifacts."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from backend.auth.dependencies import get_current_user
from backend.clinical_assistant import service
from backend.clinical_assistant.schemas import ClinicalArtifactUpdate, ClinicalTurnArtifact

router = APIRouter(tags=["clinical-assistant"])


def _user_id(user: dict[str, Any]) -> UUID:
    return UUID(str(user["id"]))


@router.patch(
    "/clinical-threads/{thread_id}/artifacts/{artifact_id}",
    response_model=ClinicalTurnArtifact,
)
async def update_artifact(
    thread_id: UUID,
    artifact_id: UUID,
    request: ClinicalArtifactUpdate,
    user: dict[str, Any] = Depends(get_current_user),
) -> ClinicalTurnArtifact:
    try:
        result = await service.update_artifact(_user_id(user), thread_id, artifact_id, request)
    except LookupError:
        raise HTTPException(status_code=404, detail="Artifact clínico no encontrado") from None
    except ValueError:
        raise HTTPException(status_code=409, detail={"code": "CLINICAL_ARTIFACT_LOCKED"}) from None
    return ClinicalTurnArtifact(**result)
