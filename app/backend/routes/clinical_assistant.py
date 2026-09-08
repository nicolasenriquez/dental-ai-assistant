"""HTTP transport for the isolated Clinical Assistant vertical slice."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from backend.auth.dependencies import get_current_user
from backend.clinical_assistant import repository, service
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
from backend.clinical_assistant.sensitive_input import safe_patient, sanitize_content
from backend.db import patients_repo
from backend.services import clinical_evolutions

router = APIRouter(tags=["clinical-assistant"])


def _user_id(user: dict[str, Any]) -> UUID:
    return UUID(str(user["id"]))


async def _response(owner: UUID, thread_id: UUID) -> ClinicalThreadResponse:
    thread = await repository.get_thread(owner, thread_id)
    if thread is None:
        raise HTTPException(status_code=404, detail="Hilo clínico no encontrado")
    if thread.get("active_patient_id"):
        patient = await patients_repo.get_patient(owner, thread["active_patient_id"])
        thread["active_patient"] = safe_patient(patient) if patient else None
    else:
        thread["active_patient"] = None
    pending = thread.get("pending_action")
    if pending:
        action_patient = await patients_repo.get_patient(owner, pending["patient_id"])
        thread["pending_action_patient"] = safe_patient(action_patient) if action_patient else None
    else:
        thread["pending_action_patient"] = None
    return ClinicalThreadResponse(**thread)


@router.post("/clinical-threads", response_model=ClinicalThreadResponse, status_code=201)
async def create_thread(
    request: ClinicalThreadCreate, user: dict[str, Any] = Depends(get_current_user)
) -> ClinicalThreadResponse:
    safe_title = (await sanitize_content(_user_id(user), request.title)).display_text
    return ClinicalThreadResponse(**await repository.create_thread(_user_id(user), safe_title))


@router.get("/clinical-threads")
async def list_threads(user: dict[str, Any] = Depends(get_current_user)) -> list[dict[str, Any]]:
    return await repository.list_threads(_user_id(user))


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
    updated = await repository.set_active_patient(_user_id(user), thread_id, request.patient_id)
    if updated is None:
        raise HTTPException(status_code=404, detail="Hilo o paciente no encontrado")
    return await _response(_user_id(user), thread_id)


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
        except repository.TurnAlreadyRunningError:
            yield event(
                "turn.failed",
                {
                    "thread_id": str(thread_id),
                    "turn_id": str(request.turn_id),
                    "item_id": str(request.turn_id),
                    "error_code": "TURN_ALREADY_RUNNING",
                },
            )
        except repository.TurnIdempotencyConflictError:
            yield event(
                "turn.failed",
                {
                    "thread_id": str(thread_id),
                    "turn_id": str(request.turn_id),
                    "item_id": str(request.turn_id),
                    "error_code": "TURN_IDEMPOTENCY_CONFLICT",
                },
            )
        except repository.ClinicalRateLimitError:
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
        return await service.prepare_save(_user_id(user), thread_id, request)
    except LookupError:
        raise HTTPException(status_code=404, detail="Hilo o paciente no encontrado") from None
    except ValueError:
        raise HTTPException(status_code=422, detail={"code": "CLINICAL_CONTENT_REQUIRED"}) from None


@router.post("/clinical-threads/{thread_id}/drafts", response_model=ClinicalDraft)
async def regenerate_draft(
    thread_id: UUID,
    request: RegenerateDraftRequest,
    user: dict[str, Any] = Depends(get_current_user),
) -> ClinicalDraft:
    try:
        return await service.regenerate_draft(_user_id(user), thread_id, request.raw_note)
    except LookupError:
        raise HTTPException(status_code=404, detail="Hilo o paciente no encontrado") from None
    except clinical_evolutions.ClinicalGenerationDisabledError:
        raise HTTPException(
            status_code=503, detail={"code": "CLINICAL_EXTERNAL_LLM_DISABLED"}
        ) from None
    except clinical_evolutions.EmptyClinicalDraftError:
        raise HTTPException(
            status_code=422, detail={"code": "CLINICAL_CONTENT_INSUFFICIENT"}
        ) from None
    except clinical_evolutions.ClinicalGenerationError:
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
        result = await repository.resolve_action(
            _user_id(user), action_id, request.decision, request.proposal_hash
        )
        if result.get("status") == "expired":
            raise HTTPException(status_code=410, detail={"code": "ACTION_EXPIRED"})
        if result.get("status") == "failed":
            raise HTTPException(status_code=502, detail={"code": "EVOLUTION_SAVE_FAILED"})
        return result
    except LookupError:
        raise HTTPException(status_code=404, detail="Acción no encontrada") from None
    except repository.ActionExpiredError:
        raise HTTPException(status_code=410, detail={"code": "ACTION_EXPIRED"}) from None
    except repository.ProposalStaleError:
        raise HTTPException(status_code=409, detail={"code": "PROPOSAL_STALE"}) from None
