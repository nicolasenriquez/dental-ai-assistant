"""Deep module for the Clinical Assistant workflow."""

from __future__ import annotations

import hashlib
import json
import logging
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Any, cast
from uuid import UUID, uuid4

from backend.db import clinical_assistant_repo as repository
from backend.db import patients_repo
from backend.services import clinical_evolutions

from .events import event
from .policy import ClinicalTurnContext
from .schemas import (
    ClinicalArtifactUpdate,
    ClinicalDraft,
    ClinicalThreadResponse,
    PrepareSaveRequest,
)
from .sensitive_input import safe_patient, sanitize_content

logger = logging.getLogger(__name__)

_FIELDS: tuple[tuple[str, str], ...] = (
    ("context", "Motivo / contexto"),
    ("findings", "Hallazgos"),
    ("assessment", "Diagnóstico / impresión clínica"),
    ("treatment", "Tratamiento / conducta"),
    ("follow_up", "Seguimiento"),
)

TurnAlreadyRunningError = repository.TurnAlreadyRunningError
TurnIdempotencyConflictError = repository.TurnIdempotencyConflictError
ClinicalRateLimitError = repository.ClinicalRateLimitError
PendingActionExistsError = repository.PendingActionExistsError
ActionExpiredError = repository.ActionExpiredError
ProposalStaleError = repository.ProposalStaleError
ClinicalGenerationDisabledError = clinical_evolutions.ClinicalGenerationDisabledError
EmptyClinicalDraftError = clinical_evolutions.EmptyClinicalDraftError
ClinicalGenerationError = clinical_evolutions.ClinicalGenerationError


class ArtifactNotDraftError(RuntimeError):
    """Raised when save preparation targets a frozen artifact."""


async def list_threads(owner: UUID) -> list[dict[str, Any]]:
    return cast(list[dict[str, Any]], await repository.list_threads(owner))


async def create_thread(owner: UUID, title: str) -> ClinicalThreadResponse:
    safe_title = (await sanitize_content(owner, title)).display_text
    return ClinicalThreadResponse(**await repository.create_thread(owner, safe_title))


async def acquire_thread(owner: UUID) -> tuple[ClinicalThreadResponse, bool]:
    thread, reused = await repository.acquire_thread(owner)
    return ClinicalThreadResponse(**thread), reused


async def rename_thread(owner: UUID, thread: UUID, title: str) -> ClinicalThreadResponse | None:
    safe_title = (await sanitize_content(owner, title)).display_text
    updated = await repository.rename_thread(owner, thread, safe_title)
    if updated is None:
        return None
    return await get_thread_response(owner, thread)


async def delete_thread(owner: UUID, thread: UUID) -> bool:
    return cast(bool, await repository.delete_thread(owner, thread))


async def get_thread_response(owner: UUID, thread: UUID) -> ClinicalThreadResponse | None:
    stored = await repository.get_thread(owner, thread)
    if stored is None:
        return None
    if stored.get("active_patient_id"):
        patient = await patients_repo.get_patient(owner, stored["active_patient_id"])
        stored["active_patient"] = safe_patient(patient) if patient else None
    else:
        stored["active_patient"] = None
    pending = stored.get("pending_action")
    if pending:
        pending_patient = await patients_repo.get_patient(owner, pending["patient_id"])
        stored["pending_action_patient"] = (
            safe_patient(pending_patient) if pending_patient else None
        )
        pending["patient"] = stored["pending_action_patient"]
    else:
        stored["pending_action_patient"] = None
    for action in stored.get("actions", []):
        action_patient = await patients_repo.get_patient(owner, action["patient_id"])
        action["patient"] = safe_patient(action_patient) if action_patient else None
    for artifact in stored.get("artifacts", []):
        artifact_patient = await patients_repo.get_patient(owner, artifact["patient_id"])
        artifact["patient"] = safe_patient(artifact_patient) if artifact_patient else None
    return ClinicalThreadResponse(**stored)


async def set_active_patient(
    owner: UUID, thread: UUID, patient_id: UUID | None
) -> ClinicalThreadResponse | None:
    updated = await repository.set_active_patient(owner, thread, patient_id)
    if updated is None:
        return None
    return await get_thread_response(owner, thread)


async def resolve_action(
    owner: UUID, action_id: UUID, decision: str, proposal_hash: str
) -> dict[str, Any]:
    return cast(
        dict[str, Any], await repository.resolve_action(owner, action_id, decision, proposal_hash)
    )


async def return_to_editing(owner: UUID, action_id: UUID) -> dict[str, Any]:
    return cast(dict[str, Any], await repository.return_to_editing(owner, action_id))


async def _get_recent_evolutions(context: ClinicalTurnContext) -> dict[str, Any]:
    if context.patient_id is None:
        return {"ok": False, "error": "PATIENT_REQUIRED"}
    patient = await patients_repo.get_patient(context.user_id, context.patient_id)
    if patient is None:
        return {"ok": False, "error": "PATIENT_NOT_FOUND"}
    history = await patients_repo.get_recent_approved_evolutions(
        context.user_id,
        context.patient_id,
        limit=clinical_evolutions.CLINICAL_HISTORY_LIMIT,
    )
    return {
        "ok": True,
        "count": len(history),
        "evolutions": [
            {"evolution_at": row["evolution_at"], "final_text": row["final_text"]}
            for row in history
        ],
    }


async def _draft_evolution(context: ClinicalTurnContext, raw_note: str) -> ClinicalDraft:
    if context.patient_id is None:
        raise LookupError("Patient required")
    return await clinical_evolutions.generate_draft(context.user_id, context.patient_id, raw_note)


async def _set_contextual_title(
    owner: UUID, thread: UUID, patient_id: UUID | None, _content: str
) -> None:
    if patient_id is None:
        return
    try:
        patient = await patients_repo.get_patient(owner, patient_id)
        if patient is None:
            return
        started = datetime.now(UTC)
        months = (
            "ene",
            "feb",
            "mar",
            "abr",
            "may",
            "jun",
            "jul",
            "ago",
            "sep",
            "oct",
            "nov",
            "dic",
        )
        title = (
            f"{patient['first_name']} {patient['last_name']} · "
            f"Evolución · {started.day} {months[started.month - 1]}"
        )
        await repository.update_title_if_default(owner, thread, title)
        logger.info("conversation.auto_title.success", extra={"thread_id": str(thread)})
    except Exception:
        logger.warning(
            "conversation.auto_title.failed", extra={"thread_id": str(thread)}, exc_info=True
        )


def compose_draft(draft: ClinicalDraft) -> str:
    """Keep the saved representation aligned with the guided evolution flow."""
    return "\n\n".join(
        f"{label}: {getattr(draft, key).strip()}"
        for key, label in _FIELDS
        if getattr(draft, key).strip()
    )


def canonical_proposal(payload: dict[str, Any]) -> tuple[dict[str, Any], str]:
    """Return the exact JSON payload and its stable approval hash."""
    canonical = json.loads(
        json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    )
    digest = hashlib.sha256(
        json.dumps(canonical, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    return canonical, digest


def _artifact_payload(
    *,
    source_note: str,
    generated_draft: ClinicalDraft,
    draft: ClinicalDraft,
    evolution_at: datetime,
) -> dict[str, Any]:
    return {
        "source_note": source_note,
        "generated_draft": generated_draft.model_dump(mode="json"),
        "draft": draft.model_dump(mode="json"),
        "evolution_at": evolution_at.astimezone(UTC).isoformat(),
    }


async def _assistant_item(
    owner_user_id: UUID,
    thread_id: UUID,
    turn_id: UUID,
    content: str,
) -> AsyncIterator[str]:
    message = await repository.append_message(
        owner_user_id, thread_id, turn_id, "assistant", content
    )
    item_id = str(message["id"])
    yield event(
        "item.completed",
        {
            "thread_id": str(thread_id),
            "turn_id": str(turn_id),
            "item_id": item_id,
            "item_type": "assistant_message",
            "status": "completed",
            "content": content,
        },
    )


def _activity(
    name: str,
    thread_id: UUID,
    turn_id: UUID,
    label: str,
    status: str = "completed",
    item_id: str | None = None,
) -> str:
    return event(
        name,
        {
            "thread_id": str(thread_id),
            "turn_id": str(turn_id),
            "item_id": item_id or str(uuid4()),
            "item_type": "activity",
            "status": status,
            "label": label,
        },
    )


async def stream_turn(
    owner_user_id: UUID | str, thread_id: UUID | str, turn_id: UUID | str, content: str
) -> AsyncIterator[str]:
    """Run one safe clinical turn and always release its thread lock."""
    claimed_new = {"value": False}
    try:
        async for chunk in _stream_turn(owner_user_id, thread_id, turn_id, content, claimed_new):
            yield chunk
    finally:
        if claimed_new["value"]:
            await repository.finish_turn(owner_user_id, thread_id, turn_id)


async def _stream_turn(
    owner_user_id: UUID | str,
    thread_id: UUID | str,
    turn_id: UUID | str,
    content: str,
    claimed_new: dict[str, bool],
) -> AsyncIterator[str]:
    """Run one safe clinical turn and emit typed lifecycle events."""
    owner = UUID(str(owner_user_id))
    thread = UUID(str(thread_id))
    turn = UUID(str(turn_id))
    try:
        sanitized = await sanitize_content(owner, content)
    except Exception:
        logger.warning("clinical_turn_failed code=SENSITIVE_INPUT_FAILURE turn_id=%s", turn)
        yield event(
            "turn.failed",
            {
                "thread_id": str(thread),
                "turn_id": str(turn),
                "item_id": str(uuid4()),
                "error_code": "SENSITIVE_INPUT_FAILURE",
            },
        )
        return
    claimed = await repository.claim_turn(owner, thread, turn, sanitized.display_text)
    claimed_new["value"] = not claimed["replay"]

    yield event(
        "turn.started",
        {
            "thread_id": str(thread),
            "turn_id": str(turn),
            "item_id": str(uuid4()),
            "status": "running",
            "user_content": sanitized.display_text,
        },
    )

    if claimed["replay"]:
        for message in claimed["messages"]:
            if message["role"] == "assistant":
                yield event(
                    "item.completed",
                    {
                        "thread_id": str(thread),
                        "turn_id": str(turn),
                        "item_id": str(message["id"]),
                        "item_type": "assistant_message",
                        "status": "completed",
                        "content": message["content"],
                    },
                )
        terminal_data = {
            "thread_id": str(thread),
            "turn_id": str(turn),
            "item_id": str(uuid4()),
        }
        if claimed["turn_status"] == "completed":
            yield event("turn.completed", terminal_data)
        else:
            terminal_data["error_code"] = claimed["turn_error_code"] or (
                "TURN_ALREADY_RUNNING"
                if claimed["turn_status"] == "running"
                else "CLINICAL_RUNTIME_FAILED"
            )
            yield event("turn.failed", terminal_data)
        return

    active_patient_id = claimed["active_patient_id"]
    if sanitized.invalid_candidates or sanitized.unresolved_candidates:
        message = (
            "No encontré un paciente asociado a ese RUT."
            if sanitized.unresolved_candidates
            else "El RUT indicado no es válido."
        )
        async for item in _assistant_item(owner, thread, turn, message):
            yield item
        await repository.finish_turn(owner, thread, turn, "completed")
        yield event(
            "turn.completed",
            {"thread_id": str(thread), "turn_id": str(turn), "item_id": str(uuid4())},
        )
        return

    if len(sanitized.patient_ids) > 1:
        message = "Detecté más de un paciente en la nota. Selecciona un paciente activo antes de continuar."
        async for item in _assistant_item(owner, thread, turn, message):
            yield item
        await repository.finish_turn(owner, thread, turn, "failed", "PATIENT_REFERENCE_AMBIGUOUS")
        yield event(
            "turn.failed",
            {
                "thread_id": str(thread),
                "turn_id": str(turn),
                "item_id": str(uuid4()),
                "error_code": "PATIENT_REFERENCE_AMBIGUOUS",
            },
        )
        return

    if sanitized.patient_ids:
        detected = sanitized.patient_ids[0]
        if active_patient_id is None:
            updated = await repository.set_active_patient(owner, thread, detected)
            if updated is None:
                await repository.finish_turn(owner, thread, turn, "failed", "THREAD_NOT_FOUND")
                yield event(
                    "turn.failed",
                    {
                        "thread_id": str(thread),
                        "turn_id": str(turn),
                        "item_id": str(uuid4()),
                        "error_code": "THREAD_NOT_FOUND",
                    },
                )
                return
            active_patient_id = detected
            patient = await patients_repo.get_patient(owner, detected)
            if patient is not None:
                yield event(
                    "patient.bound",
                    {
                        "thread_id": str(thread),
                        "turn_id": str(turn),
                        "item_id": str(uuid4()),
                        "patient": safe_patient(patient),
                    },
                )
        elif UUID(str(active_patient_id)) != detected:
            patient = await patients_repo.get_patient(owner, detected)
            active_patient = await patients_repo.get_patient(owner, active_patient_id)
            if patient is None or active_patient is None:
                await repository.finish_turn(
                    owner, thread, turn, "failed", "PATIENT_SWITCH_REQUIRED"
                )
                yield event(
                    "turn.failed",
                    {
                        "thread_id": str(thread),
                        "turn_id": str(turn),
                        "item_id": str(uuid4()),
                        "error_code": "PATIENT_SWITCH_REQUIRED",
                    },
                )
                return
            yield event(
                "patient.switch_required",
                {
                    "thread_id": str(thread),
                    "turn_id": str(turn),
                    "item_id": str(uuid4()),
                    "current_patient": safe_patient(active_patient),
                    "detected_patient": safe_patient(patient),
                },
            )
            await repository.finish_turn(owner, thread, turn, "failed", "PATIENT_SWITCH_REQUIRED")
            yield event(
                "turn.failed",
                {
                    "thread_id": str(thread),
                    "turn_id": str(turn),
                    "item_id": str(uuid4()),
                    "error_code": "PATIENT_SWITCH_REQUIRED",
                },
            )
            return

    context = ClinicalTurnContext(
        user_id=owner,
        thread_id=thread,
        turn_id=turn,
        patient_id=UUID(str(active_patient_id)) if active_patient_id is not None else None,
    )

    await _set_contextual_title(owner, thread, context.patient_id, sanitized.display_text)

    if context.patient_id is None:
        message = (
            "Selecciona un paciente activo para preparar una evolución. "
            "Puedes elegirlo desde el contexto del asistente."
        )
        if "[RUT no encontrado]" in sanitized.display_text:
            message = "No encontré un paciente asociado a ese RUT."
        elif "[RUT no válido]" in sanitized.display_text:
            message = "El RUT indicado no es válido."
        async for item in _assistant_item(owner, thread, turn, message):
            yield item
        await repository.finish_turn(owner, thread, turn, "completed")
        yield event(
            "turn.completed",
            {"thread_id": str(thread), "turn_id": str(turn), "item_id": str(uuid4())},
        )
        return

    try:
        yield _activity("item.completed", thread, turn, "Paciente identificado")
        history_item_id = str(uuid4())
        yield _activity(
            "item.started", thread, turn, "Consultando evoluciones", "running", history_item_id
        )
        history = await _get_recent_evolutions(context)
        yield _activity(
            "item.completed",
            thread,
            turn,
            f"{history.get('count', 0)} evoluciones revisadas",
            item_id=history_item_id,
        )
        if not clinical_evolutions.CLINICAL_EXTERNAL_LLM_ENABLED:
            raise clinical_evolutions.ClinicalGenerationDisabledError
        draft_item_id = str(uuid4())
        yield _activity(
            "item.started", thread, turn, "Preparando borrador", "running", draft_item_id
        )
        draft = await _draft_evolution(context, sanitized.model_text)
        evolution_at = datetime.now(UTC)
        await repository.create_artifact(
            owner,
            thread,
            turn,
            context.patient_id,
            draft_item_id,
            _artifact_payload(
                source_note=sanitized.display_text,
                generated_draft=draft,
                draft=draft,
                evolution_at=evolution_at,
            ),
        )
        yield event(
            "item.completed",
            {
                "thread_id": str(thread),
                "turn_id": str(turn),
                "item_id": draft_item_id,
                "item_type": "clinical_draft",
                "status": "completed",
                "draft": draft.model_dump(mode="json"),
                "source_note": sanitized.display_text,
                "patient_id": str(context.patient_id),
                "evolution_at": evolution_at.isoformat(),
            },
        )
        yield _activity("item.completed", thread, turn, "Borrador listo", item_id=draft_item_id)
        message = "Preparé un borrador para tu revisión. Todavía no se ha guardado."
        async for item in _assistant_item(owner, thread, turn, message):
            yield item
        await repository.finish_turn(owner, thread, turn, "completed")
        yield event(
            "turn.completed",
            {"thread_id": str(thread), "turn_id": str(turn), "item_id": str(uuid4())},
        )
    except clinical_evolutions.ClinicalGenerationDisabledError:
        logger.warning("clinical_turn_blocked code=CLINICAL_EXTERNAL_LLM_DISABLED turn_id=%s", turn)
        await repository.finish_turn(
            owner, thread, turn, "failed", "CLINICAL_EXTERNAL_LLM_DISABLED"
        )
        yield event(
            "turn.failed",
            {
                "thread_id": str(thread),
                "turn_id": str(turn),
                "item_id": str(uuid4()),
                "error_code": "CLINICAL_EXTERNAL_LLM_DISABLED",
            },
        )
    except clinical_evolutions.EmptyClinicalDraftError:
        await repository.finish_turn(owner, thread, turn, "failed", "CLINICAL_CONTENT_INSUFFICIENT")
        yield event(
            "turn.failed",
            {
                "thread_id": str(thread),
                "turn_id": str(turn),
                "item_id": str(uuid4()),
                "error_code": "CLINICAL_CONTENT_INSUFFICIENT",
            },
        )
    except clinical_evolutions.ClinicalGenerationError:
        logger.warning("clinical_turn_failed code=CLINICAL_MODEL_UNAVAILABLE turn_id=%s", turn)
        await repository.finish_turn(owner, thread, turn, "failed", "CLINICAL_MODEL_UNAVAILABLE")
        yield event(
            "turn.failed",
            {
                "thread_id": str(thread),
                "turn_id": str(turn),
                "item_id": str(uuid4()),
                "error_code": "CLINICAL_MODEL_UNAVAILABLE",
            },
        )
    except Exception:
        logger.warning("clinical_turn_failed code=TOOL_EXECUTION_FAILED turn_id=%s", turn)
        await repository.finish_turn(owner, thread, turn, "failed", "TOOL_EXECUTION_FAILED")
        yield event(
            "turn.failed",
            {
                "thread_id": str(thread),
                "turn_id": str(turn),
                "item_id": str(uuid4()),
                "error_code": "TOOL_EXECUTION_FAILED",
            },
        )


async def prepare_save(
    owner_user_id: UUID | str, thread_id: UUID | str, request: PrepareSaveRequest
) -> dict[str, Any]:
    owner = UUID(str(owner_user_id))
    thread = UUID(str(thread_id))
    stored = await repository.get_thread(owner, thread)
    if stored is None:
        raise LookupError("Thread or patient not found")
    artifact = await repository.get_artifact(owner, thread, request.artifact_id)
    if artifact is None or UUID(str(artifact["turn_id"])) != request.turn_id:
        raise LookupError("Turn not found")
    if artifact["status"] != "draft":
        raise ArtifactNotDraftError
    patient_id = UUID(str(artifact["patient_id"]))
    patient = await patients_repo.get_patient(owner, patient_id)
    if patient is None:
        raise LookupError("Patient not found")
    raw_note = await sanitize_content(owner, str(artifact["source_note"]))
    current_draft = ClinicalDraft.model_validate(artifact["draft"])
    baseline = ClinicalDraft.model_validate(artifact["generated_draft"])
    safe_fields: dict[str, str] = {}
    safe_baseline_fields: dict[str, str] = {}
    for key, _ in _FIELDS:
        safe_fields[key] = (await sanitize_content(owner, getattr(current_draft, key))).display_text
        safe_baseline_fields[key] = (
            await sanitize_content(owner, getattr(baseline, key))
        ).display_text
    generated = compose_draft(ClinicalDraft(**safe_baseline_fields, review_flags=[]))
    final = compose_draft(ClinicalDraft(**safe_fields, review_flags=[]))
    final = (await sanitize_content(owner, final)).display_text
    if not final.strip():
        raise ValueError("No hay contenido clínico para guardar")
    payload, proposal_hash = canonical_proposal(
        {
            "evolution_id": str(uuid4()),
            "patient_id": str(patient_id),
            "evolution_at": datetime.fromisoformat(str(artifact["evolution_at"]))
            .astimezone(UTC)
            .isoformat(),
            "raw_note": raw_note.display_text,
            "generated_text": generated,
            "final_text": final,
        }
    )
    pending_action = cast(
        dict[str, Any],
        await repository.create_pending_action(
            owner,
            thread,
            request.turn_id,
            request.artifact_id,
            patient_id,
            "save_evolution",
            payload,
            proposal_hash,
        ),
    )
    return pending_action | {"patient": safe_patient(patient), "proposal_hash": proposal_hash}


async def regenerate_draft(
    owner_user_id: UUID | str, thread_id: UUID | str, artifact_id: UUID
) -> ClinicalDraft:
    """Regenerate one persisted review draft without creating a message or record."""
    owner = UUID(str(owner_user_id))
    thread = UUID(str(thread_id))
    artifact = await repository.get_artifact(owner, thread, artifact_id)
    if artifact is None:
        raise LookupError("Thread or patient not found")
    patient_id = UUID(str(artifact["patient_id"]))
    if await patients_repo.get_patient(owner, patient_id) is None:
        raise LookupError("Patient not found")
    sanitized = await sanitize_content(owner, str(artifact["source_note"]))
    if not clinical_evolutions.CLINICAL_EXTERNAL_LLM_ENABLED:
        raise clinical_evolutions.ClinicalGenerationDisabledError
    draft = await clinical_evolutions.generate_draft(owner, patient_id, sanitized.model_text)
    evolution_at = datetime.fromisoformat(str(artifact["evolution_at"]))
    await repository.update_artifact(
        owner,
        thread,
        artifact_id,
        payload=_artifact_payload(
            source_note=sanitized.display_text,
            generated_draft=draft,
            draft=draft,
            evolution_at=evolution_at,
        ),
        status="draft",
    )
    return draft


async def update_artifact(
    owner_user_id: UUID | str,
    thread_id: UUID | str,
    artifact_id: UUID,
    request: ClinicalArtifactUpdate,
) -> dict[str, Any]:
    owner = UUID(str(owner_user_id))
    thread = UUID(str(thread_id))
    artifact = await repository.get_artifact(owner, thread, artifact_id)
    if artifact is None:
        raise LookupError("Artifact not found")
    patient_id = UUID(str(artifact["patient_id"]))
    if await patients_repo.get_patient(owner, patient_id) is None:
        raise LookupError("Patient not found")
    source_note = (await sanitize_content(owner, request.source_note)).display_text
    draft_fields: dict[str, str] = {}
    for key, _ in _FIELDS:
        draft_fields[key] = (
            await sanitize_content(owner, getattr(request.draft, key))
        ).display_text
    draft = ClinicalDraft(**draft_fields, review_flags=request.draft.review_flags)
    status = "stale" if source_note != str(artifact["source_note"]) else str(artifact["status"])
    if status not in {"draft", "stale"}:
        raise ValueError("Artifact is no longer editable")
    updated = await repository.update_artifact(
        owner,
        thread,
        artifact_id,
        payload={
            **_artifact_payload(
                source_note=source_note,
                generated_draft=ClinicalDraft.model_validate(artifact["generated_draft"]),
                draft=draft,
                evolution_at=request.evolution_at,
            ),
        },
        status=status,
    )
    if updated is None:
        raise LookupError("Artifact not found")
    return cast(dict[str, Any], updated)
