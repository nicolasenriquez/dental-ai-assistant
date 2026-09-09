"""HTTP transport for the isolated Clinical Assistant vertical slice."""

from __future__ import annotations

from typing import Any, cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from backend.auth.dependencies import get_current_user
from backend.clinical_assistant import service
from backend.clinical_assistant.events import event
from backend.clinical_assistant.schemas import (
    ActionResolutionRequest,
    ActivePatientUpdate,
    ClinicalDraft,
    ClinicalThreadCreate,
    ClinicalThreadResponse,
    ClinicalTurnRequest,
    PrepareSaveRequest,
    RegenerateDraftRequest,
)

router = APIRouter(tags=["clinical-assistant"])


def _user_id(user: dict[str, Any]) -> UUID:
    return UUID(str(user["id"]))


async def _response(owner: UUID, thread_id: UUID) -> ClinicalThreadResponse:
    thread = await service.get_thread_response(owner, thread_id)
    if thread is None:
        raise HTTPException(status_code=404, detail="Hilo clínico no encontrado")
    return thread


@router.post("/clinical-threads", response_model=ClinicalThreadResponse, status_code=201)
async def create_thread(
    request: ClinicalThreadCreate, user: dict[str, Any] = Depends(get_current_user)
) -> ClinicalThreadResponse:
    return await service.create_thread(_user_id(user), request.title)


@router.get("/clinical-threads")
async def list_threads(user: dict[str, Any] = Depends(get_current_user)) -> list[dict[str, Any]]:
    return cast(list[dict[str, Any]], await service.list_threads(_user_id(user)))


@router.get("/clinical-threads/{thread_id}", response_model=ClinicalThreadResponse)
async def get_thread(
    thread_id: UUID, user: dict[str, Any] = Depends(get_current_user)
) -> ClinicalThreadResponse:
    return await _response(_user_id(user), thread_id)


@router.patch("/clinical-threads/{thread_id}/active-patient", response_model=ClinicalThreadResponse)
async def set_active_patient(
    thread_id: UUID,
    request: ActivePatientUpdate,
    user: dict[str, Any] = Depends(get_current_user),
) -> ClinicalThreadResponse:
    updated = await service.set_active_patient(_user_id(user), thread_id, request.patient_id)
    if updated is None:
        raise HTTPException(status_code=404, detail="Hilo o paciente no encontrado")
    return updated


@router.post("/clinical-threads/{thread_id}/turns")
async def start_turn(
    thread_id: UUID,
    request: ClinicalTurnRequest,
    user: dict[str, Any] = Depends(get_current_user),
) -> StreamingResponse:
    async def body():
        try:
            async for chunk in service.stream_turn(
                _user_id(user), thread_id, request.turn_id, request.content
            ):
                yield chunk
        except service.TurnAlreadyRunningError:
            yield event(
                "turn.failed",
                {
                    "thread_id": str(thread_id),
                    "turn_id": str(request.turn_id),
                    "item_id": str(request.turn_id),
                    "error_code": "TURN_ALREADY_RUNNING",
                },
            )
        except service.TurnIdempotencyConflictError:
            yield event(
                "turn.failed",
                {
                    "thread_id": str(thread_id),
                    "turn_id": str(request.turn_id),
                    "item_id": str(request.turn_id),
                    "error_code": "TURN_IDEMPOTENCY_CONFLICT",
                },
            )
        except service.ClinicalRateLimitError:
            yield event(
                "turn.failed",
                {
                    "thread_id": str(thread_id),
                    "turn_id": str(request.turn_id),
                    "item_id": str(request.turn_id),
                    "error_code": "CLINICAL_RATE_LIMIT_EXCEEDED",
                },
            )
        except LookupError:
            yield event(
                "turn.failed",
                {
                    "thread_id": str(thread_id),
                    "turn_id": str(request.turn_id),
                    "item_id": str(request.turn_id),
                    "error_code": "THREAD_NOT_FOUND",
                },
            )
        except Exception:
            yield event(
                "turn.failed",
                {
                    "thread_id": str(thread_id),
                    "turn_id": str(request.turn_id),
                    "item_id": str(request.turn_id),
                    "error_code": "CLINICAL_RUNTIME_FAILED",
                },
            )

    return StreamingResponse(
        body(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/clinical-threads/{thread_id}/prepare-save")
async def prepare_save(
    thread_id: UUID,
    request: PrepareSaveRequest,
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    try:
        return cast(dict[str, Any], await service.prepare_save(_user_id(user), thread_id, request))
    except LookupError:
        raise HTTPException(status_code=404, detail="Hilo o paciente no encontrado") from None
    except service.ArtifactNotDraftError:
        raise HTTPException(
            status_code=409, detail={"code": "CLINICAL_ARTIFACT_NOT_DRAFT"}
        ) from None
    except service.PendingActionExistsError:
        raise HTTPException(
            status_code=409, detail={"code": "CLINICAL_PENDING_ACTION_EXISTS"}
        ) from None
    except ValueError as error:
        code = (
            "CLINICAL_ARTIFACT_STALE"
            if "regeneración" in str(error)
            else "CLINICAL_CONTENT_REQUIRED"
        )
        raise HTTPException(status_code=422, detail={"code": code}) from None


@router.post("/clinical-threads/{thread_id}/drafts", response_model=ClinicalDraft)
async def regenerate_draft(
    thread_id: UUID,
    request: RegenerateDraftRequest,
    user: dict[str, Any] = Depends(get_current_user),
) -> ClinicalDraft:
    try:
        return await service.regenerate_draft(_user_id(user), thread_id, request.artifact_id)
    except LookupError:
        raise HTTPException(status_code=404, detail="Hilo o paciente no encontrado") from None
    except service.ClinicalGenerationDisabledError:
        raise HTTPException(
            status_code=503, detail={"code": "CLINICAL_EXTERNAL_LLM_DISABLED"}
        ) from None
    except service.EmptyClinicalDraftError:
        raise HTTPException(
            status_code=422, detail={"code": "CLINICAL_CONTENT_INSUFFICIENT"}
        ) from None
    except service.ClinicalGenerationError:
        raise HTTPException(
            status_code=502, detail={"code": "CLINICAL_MODEL_UNAVAILABLE"}
        ) from None


@router.post("/clinical-actions/{action_id}/resolve")
async def resolve_action(
    action_id: UUID,
    request: ActionResolutionRequest,
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    try:
        result = cast(
            dict[str, Any],
            await service.resolve_action(
                _user_id(user), action_id, request.decision, request.proposal_hash
            ),
        )
        if result.get("status") == "expired":
            raise HTTPException(status_code=410, detail={"code": "ACTION_EXPIRED"})
        if result.get("status") == "failed":
            raise HTTPException(status_code=502, detail={"code": "EVOLUTION_SAVE_FAILED"})
        return result
    except LookupError:
        raise HTTPException(status_code=404, detail="Acción no encontrada") from None
    except service.ActionExpiredError:
        raise HTTPException(status_code=410, detail={"code": "ACTION_EXPIRED"}) from None
    except service.ProposalStaleError:
        raise HTTPException(status_code=409, detail={"code": "PROPOSAL_STALE"}) from None
