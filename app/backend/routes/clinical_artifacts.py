"""HTTP endpoints for persisted clinical review artifacts."""

from __future__ import annotations

from typing import Any, cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request

from backend import config
from backend.auth.dependencies import get_current_user
from backend.clinical_assistant import service
from backend.clinical_assistant.schemas import (
    ClinicalArtifactUpdate,
    ClinicalTurnArtifact,
    DiscardArtifactRequest,
)

router = APIRouter(tags=["clinical-assistant"])


def _user_id(user: dict[str, Any]) -> UUID:
    return UUID(str(user["id"]))


def _require_same_origin(request: Request) -> None:
    """Guard dismissal mutations against cross-site requests."""
    origin = request.headers.get("Origin", "")
    fetch_site = request.headers.get("Sec-Fetch-Site")
    if origin not in config.APP_ORIGINS or (fetch_site is not None and fetch_site != "same-origin"):
        raise HTTPException(status_code=403, detail="Invalid origin")


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


@router.post("/clinical-threads/{thread_id}/artifacts/{artifact_id}/discard")
async def discard_artifact(
    thread_id: UUID,
    artifact_id: UUID,
    request: DiscardArtifactRequest,
    http_request: Request,
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    _require_same_origin(http_request)
    try:
        return cast(
            dict[str, Any],
            await service.discard_artifact(_user_id(user), thread_id, artifact_id, request),
        )
    except LookupError:
        raise HTTPException(status_code=404, detail="Artifact clínico no encontrado") from None
    except service.DiscardStaleError:
        raise HTTPException(status_code=409, detail={"code": "CLINICAL_DISCARD_STALE"}) from None
    except service.DiscardIneligibleError:
        raise HTTPException(
            status_code=409, detail={"code": "CLINICAL_DISCARD_INELIGIBLE"}
        ) from None
    except service.DiscardIdempotencyConflictError:
        raise HTTPException(
            status_code=409, detail={"code": "CLINICAL_DISCARD_IDEMPOTENCY_CONFLICT"}
        ) from None
    except service.DismissalBusyError:
        raise HTTPException(status_code=409, detail={"code": "CLINICAL_DISMISSAL_BUSY"}) from None
