"""Deep module for the Clinical Assistant workflow."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Any, cast
from uuid import UUID, uuid4

from backend.db import clinical_assistant_repo as repository
from backend.db import evolution_exports_repo, patients_repo
from backend.evolution_exports.service import drive_export_state
from backend.services import clinical_evolutions

from .agent import ClinicalAgentError, ClinicalToolResult, run_clinical_agent
from .events import event
from .policy import ClinicalTurnContext
from .schemas import (
    ClinicalArtifactUpdate,
    ClinicalContextItem,
    ClinicalDraft,
    ClinicalThreadResponse,
    PatientSwitchResolution,
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
StaleClinicalTurnError = repository.StaleClinicalTurnError
ActionExpiredError = repository.ActionExpiredError
ProposalStaleError = repository.ProposalStaleError
ClinicalGenerationDisabledError = clinical_evolutions.ClinicalGenerationDisabledError
EmptyClinicalDraftError = clinical_evolutions.EmptyClinicalDraftError
ClinicalGenerationError = clinical_evolutions.ClinicalGenerationError


class ArtifactNotDraftError(RuntimeError):
    """Raised when save preparation targets a frozen artifact."""


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
        resource_id = action.get("result_resource_id")
        if action.get("status") == "approved" and resource_id:
            export = await evolution_exports_repo.get_export(owner, resource_id)
            action["drive_export"] = drive_export_state(export) if export else None
    for artifact in stored.get("artifacts", []):
        artifact_patient = await patients_repo.get_patient(owner, artifact["patient_id"])
        artifact["patient"] = safe_patient(artifact_patient) if artifact_patient else None
    return ClinicalThreadResponse(**stored)


async def resolve_patient_switch(
    owner: UUID,
    thread: UUID,
    turn: UUID,
    request: PatientSwitchResolution,
) -> ClinicalThreadResponse | None:
    stored = await repository.get_thread(owner, thread)
    if stored is None:
        return None
    message = next(
        (
            item
            for item in stored["messages"]
            if UUID(str(item["turn_id"])) == turn and item.get("patient_switch")
        ),
        None,
    )
    if message is None:
        return None
    resolution = "kept_current"
    if request.decision == "change_patient":
        resolution = "changed_patient"
    if not await repository.resolve_patient_switch(owner, thread, turn, resolution):
        return None
    return await get_thread_response(owner, thread)


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
    result = cast(
        dict[str, Any], await repository.resolve_action(owner, action_id, decision, proposal_hash)
    )
    resource_id = result.get("result_resource_id")
    if result.get("status") == "approved" and resource_id:
        export = await evolution_exports_repo.get_export(owner, resource_id)
        result["drive_export"] = drive_export_state(export) if export else None
    return result


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
            {
                "evolution_at": row["evolution_at"],
                "final_text": (
                    await sanitize_content(context.user_id, row["final_text"])
                ).model_text,
            }
            for row in history
        ],
    }


async def _draft_evolution(context: ClinicalTurnContext, raw_note: str) -> ClinicalDraft:
    if context.patient_id is None:
        raise LookupError("Patient required")
    return await clinical_evolutions.generate_draft(context.user_id, context.patient_id, raw_note)


async def _set_contextual_title(
    owner: UUID, thread: UUID, turn: UUID, patient_id: UUID | None, _content: str
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
        await repository.update_title_if_default(owner, thread, title, turn_id=turn)
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


def _active_artifact_id(stored: dict[str, Any], patient_id: UUID | None) -> UUID | None:
    if patient_id is None:
        return None
    candidates = [
        artifact
        for artifact in stored.get("artifacts", [])
        if UUID(str(artifact["patient_id"])) == patient_id
        and artifact["status"] in {"draft", "stale", "pending"}
    ]
    if not candidates:
        return None
    return UUID(str(candidates[-1]["id"]))


async def _conversation_messages(
    owner: UUID,
    stored: dict[str, Any],
    model_text: str,
    active_artifact_id: UUID | None,
) -> list[dict]:
    if active_artifact_id is not None:
        artifact = next(
            (
                item
                for item in stored.get("artifacts", [])
                if UUID(str(item["id"])) == active_artifact_id
            ),
            None,
        )
        if artifact is not None:
            current_draft = ClinicalDraft.model_validate(artifact["draft"])
            fields = {
                key: (await sanitize_content(owner, getattr(current_draft, key))).model_text
                for key, _ in _FIELDS
            }
            model_text = json.dumps(
                {"USER_REQUEST": model_text, "CURRENT_DRAFT": fields}, ensure_ascii=False
            )
    messages = [
        {"role": message["role"], "content": str(message["content"])}
        for message in stored.get("messages", [])[-12:]
        if message["role"] in {"user", "assistant"}
    ]
    for message in reversed(messages):
        if message["role"] == "user":
            message["content"] = model_text
            break
    return messages or [{"role": "user", "content": model_text}]


def _clinical_tool_handlers(
    context: ClinicalTurnContext,
    source_note: str,
    model_note: str,
) -> dict[str, Any]:
    active_artifact = {"id": context.active_artifact_id}

    async def patient_context(_arguments: dict[str, Any]) -> ClinicalToolResult:
        if context.patient_id is None:
            return ClinicalToolResult({"ok": False, "error": "PATIENT_REQUIRED"})
        patient = await patients_repo.get_patient(context.user_id, context.patient_id)
        if patient is None:
            return ClinicalToolResult({"ok": False, "error": "PATIENT_NOT_FOUND"})
        return ClinicalToolResult({"ok": True, "patient_selected": True})

    async def recent_evolutions(_arguments: dict[str, Any]) -> ClinicalToolResult:
        return ClinicalToolResult(await _get_recent_evolutions(context))

    async def create_draft(_arguments: dict[str, Any]) -> ClinicalToolResult:
        if context.patient_id is None:
            return ClinicalToolResult({"ok": False, "error": "PATIENT_REQUIRED"})
        draft = await _draft_evolution(context, model_note)
        item_id = uuid4()
        evolution_at = datetime.now(UTC)
        await repository.create_artifact(
            context.user_id,
            context.thread_id,
            context.turn_id,
            context.patient_id,
            item_id,
            _artifact_payload(
                source_note=source_note,
                generated_draft=draft,
                draft=draft,
                evolution_at=evolution_at,
            ),
        )
        active_artifact["id"] = item_id
        draft_data = draft.model_dump(mode="json")
        return ClinicalToolResult(
            {"ok": True, "artifact_id": str(item_id), "draft": draft_data},
            {
                "kind": "draft",
                "item_id": str(item_id),
                "draft": draft_data,
                "generated_draft": draft_data,
                "source_note": source_note,
                "patient_id": str(context.patient_id),
                "evolution_at": evolution_at.isoformat(),
            },
        )

    async def update_draft(arguments: dict[str, Any]) -> ClinicalToolResult:
        artifact_id = active_artifact["id"]
        if context.patient_id is None:
            return ClinicalToolResult({"ok": False, "error": "PATIENT_REQUIRED"})
        if artifact_id is None:
            return ClinicalToolResult({"ok": False, "error": "ACTIVE_ARTIFACT_REQUIRED"})
        stored = await repository.get_thread(context.user_id, context.thread_id)
        if stored is None:
            return ClinicalToolResult({"ok": False, "error": "THREAD_NOT_FOUND"})
        pending = stored.get("pending_action")
        if pending and UUID(str(pending["artifact_id"])) == artifact_id:
            await repository.return_to_editing(context.user_id, pending["id"])
        artifact = await repository.get_artifact(context.user_id, context.thread_id, artifact_id)
        if artifact is None or UUID(str(artifact["patient_id"])) != context.patient_id:
            return ClinicalToolResult({"ok": False, "error": "ARTIFACT_NOT_FOUND"})
        if artifact["status"] not in {"draft", "stale"}:
            return ClinicalToolResult({"ok": False, "error": "ARTIFACT_NOT_EDITABLE"})
        draft = ClinicalDraft.model_validate(artifact["draft"])
        fields = draft.model_dump()
        for key, value in arguments.items():
            fields[key] = (await sanitize_content(context.user_id, value)).display_text
        updated_draft = ClinicalDraft(**fields)
        updated = await repository.update_artifact(
            context.user_id,
            context.thread_id,
            artifact_id,
            payload=_artifact_payload(
                source_note=str(artifact["source_note"]),
                generated_draft=ClinicalDraft.model_validate(artifact["generated_draft"]),
                draft=updated_draft,
                evolution_at=datetime.fromisoformat(str(artifact["evolution_at"])),
            ),
            status=str(artifact["status"]),
        )
        if updated is None:
            return ClinicalToolResult({"ok": False, "error": "ARTIFACT_NOT_FOUND"})
        draft_data = updated_draft.model_dump(mode="json")
        baseline_data = ClinicalDraft.model_validate(artifact["generated_draft"]).model_dump(
            mode="json"
        )
        return ClinicalToolResult(
            {"ok": True, "artifact_id": str(artifact_id), "draft": draft_data},
            {
                "kind": "draft",
                "item_id": str(artifact_id),
                "draft": draft_data,
                "generated_draft": baseline_data,
                "source_note": str(artifact["source_note"]),
                "patient_id": str(context.patient_id),
                "evolution_at": str(artifact["evolution_at"]),
            },
        )

    async def prepare_draft(_arguments: dict[str, Any]) -> ClinicalToolResult:
        artifact_id = active_artifact["id"]
        if artifact_id is None:
            return ClinicalToolResult({"ok": False, "error": "ACTIVE_ARTIFACT_REQUIRED"})
        artifact = await repository.get_artifact(context.user_id, context.thread_id, artifact_id)
        if artifact is None or (
            context.patient_id is not None
            and UUID(str(artifact["patient_id"])) != context.patient_id
        ):
            return ClinicalToolResult({"ok": False, "error": "ARTIFACT_NOT_FOUND"})
        action = await prepare_save(
            context.user_id,
            context.thread_id,
            PrepareSaveRequest(turn_id=UUID(str(artifact["turn_id"])), artifact_id=artifact_id),
        )
        return ClinicalToolResult(
            {"ok": True, "approval_required": True, "action_id": str(action["id"])},
            {"kind": "approval", "item_id": str(action["id"]), "action": action},
        )

    return {
        "get_patient_context": patient_context,
        "get_recent_evolutions": recent_evolutions,
        "create_evolution_draft": create_draft,
        "update_evolution_draft": update_draft,
        "prepare_evolution_save": prepare_draft,
    }


async def stream_turn(
    owner_user_id: UUID | str,
    thread_id: UUID | str,
    turn_id: UUID | str,
    content: str,
    context_items: list[ClinicalContextItem] | None = None,
) -> AsyncIterator[str]:
    """Run one safe clinical turn and always release its thread lock."""
    claimed_new = {"value": False}
    cancellation_handled = False
    try:
        async for chunk in _stream_turn(
            owner_user_id, thread_id, turn_id, content, context_items or [], claimed_new
        ):
            yield chunk
    except asyncio.CancelledError:
        cancellation_handled = True
        if claimed_new["value"]:
            try:
                await asyncio.shield(
                    repository.finish_turn(
                        owner_user_id,
                        thread_id,
                        turn_id,
                        "failed",
                        "CLINICAL_TURN_CANCELLED",
                    )
                )
            except asyncio.CancelledError:
                logger.warning("clinical_turn_cancel_cleanup_interrupted turn_id=%s", turn_id)
            except Exception:
                logger.exception("clinical_turn_cancel_cleanup_failed turn_id=%s", turn_id)
        raise
    finally:
        if claimed_new["value"] and not cancellation_handled:
            await repository.finish_turn(owner_user_id, thread_id, turn_id)


async def _stream_turn(
    owner_user_id: UUID | str,
    thread_id: UUID | str,
    turn_id: UUID | str,
    content: str,
    context_items: list[ClinicalContextItem],
    claimed_new: dict[str, bool],
) -> AsyncIterator[str]:
    """Run one safe clinical turn and emit typed lifecycle events."""
    owner = UUID(str(owner_user_id))
    thread = UUID(str(thread_id))
    turn = UUID(str(turn_id))
    try:
        sanitized = await sanitize_content(owner, content)
        sanitized_context = []
        for context_item in context_items:
            safe_content = await sanitize_content(owner, context_item.content)
            safe_name = await sanitize_content(owner, context_item.source_name)
            sanitized_context.append(
                {
                    **context_item.model_dump(mode="json", exclude={"content"}),
                    "source_name": safe_name.display_text,
                    "content": safe_content.display_text,
                    "model_content": safe_content.model_text,
                }
            )
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
    stored_context = [
        {key: value for key, value in item.items() if key != "model_content"}
        for item in sanitized_context
    ]
    claimed = await repository.claim_turn(
        owner, thread, turn, sanitized.display_text, stored_context
    )
    claimed_new["value"] = not claimed["replay"]

    yield event(
        "turn.started",
        {
            "thread_id": str(thread),
            "turn_id": str(turn),
            "item_id": str(uuid4()),
            "status": "running",
            "user_content": sanitized.display_text,
            "context_items": stored_context,
        },
    )

    if claimed["replay"]:
        artifacts = await repository.list_turn_artifacts(owner, thread, turn)
        for artifact in artifacts:
            if artifact.get("artifact_type") != "clinical_draft":
                continue
            yield event(
                "item.completed",
                {
                    "thread_id": str(thread),
                    "turn_id": str(turn),
                    "item_id": str(artifact["id"]),
                    "item_type": "clinical_draft",
                    "status": "completed",
                    "artifact_status": artifact["status"],
                    "draft": artifact["draft"],
                    "generated_draft": artifact["generated_draft"],
                    "source_note": artifact["source_note"],
                    "patient_id": str(artifact["patient_id"]),
                    "evolution_at": str(artifact["evolution_at"]),
                },
            )
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
            updated = await repository.set_active_patient(owner, thread, detected, turn_id=turn)
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
            switch_item_id = uuid4()
            patient_switch = {
                "item_id": str(switch_item_id),
                "current_patient": safe_patient(active_patient),
                "detected_patient": safe_patient(patient),
                "resolution": "pending",
            }
            await repository.set_patient_switch(owner, thread, turn, patient_switch)
            yield event(
                "patient.switch_required",
                {
                    "thread_id": str(thread),
                    "turn_id": str(turn),
                    "item_id": str(switch_item_id),
                    **patient_switch,
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

    patient_id = UUID(str(active_patient_id)) if active_patient_id is not None else None
    await _set_contextual_title(owner, thread, turn, patient_id, sanitized.display_text)
    stored = await repository.get_thread(owner, thread)
    if stored is None:
        raise LookupError("Thread not found")
    model_text = sanitized.model_text
    if sanitized_context:
        sources = "\n\n".join(item["model_content"] for item in sanitized_context)
        model_text = f"{model_text}\n\n{sources}"
    context = ClinicalTurnContext(
        user_id=owner,
        thread_id=thread,
        turn_id=turn,
        patient_id=patient_id,
        active_artifact_id=_active_artifact_id(stored, patient_id),
    )
    messages = await _conversation_messages(owner, stored, model_text, context.active_artifact_id)

    try:
        if not clinical_evolutions.CLINICAL_EXTERNAL_LLM_ENABLED:
            raise clinical_evolutions.ClinicalGenerationDisabledError
        activity_ids: dict[str, str] = {}
        produced_artifact = False
        async for output in run_clinical_agent(
            context=context,
            messages=messages,
            handlers=_clinical_tool_handlers(context, sanitized.display_text, model_text),
        ):
            if output.kind == "heartbeat":
                yield ": keepalive\n\n"
            elif output.kind == "activity_started":
                activity_id = str(uuid4())
                activity_ids[output.tool_name] = activity_id
                yield _activity("item.started", thread, turn, output.label, "running", activity_id)
            elif output.kind == "activity_completed":
                yield _activity(
                    "item.completed",
                    thread,
                    turn,
                    output.label,
                    item_id=activity_ids.get(output.tool_name),
                )
            elif output.kind == "effect" and output.effect:
                effect = output.effect
                if effect["kind"] == "draft":
                    produced_artifact = True
                    yield event(
                        "item.completed",
                        {
                            "thread_id": str(thread),
                            "turn_id": str(turn),
                            "item_id": effect["item_id"],
                            "item_type": "clinical_draft",
                            "status": "completed",
                            **{key: value for key, value in effect.items() if key != "kind"},
                        },
                    )
                elif effect["kind"] == "approval":
                    action = effect["action"]
                    yield event(
                        "item.completed",
                        {
                            "thread_id": str(thread),
                            "turn_id": str(turn),
                            "item_id": effect["item_id"],
                            "item_type": "approval_request",
                            "status": "pending",
                            "action": action,
                            "patient": action["patient"],
                        },
                    )
            elif output.kind == "assistant" and not produced_artifact:
                async for item in _assistant_item(owner, thread, turn, output.content):
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
    except (clinical_evolutions.ClinicalGenerationError, ClinicalAgentError):
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
    except repository.StaleClinicalTurnError:
        logger.info("clinical_turn_stale turn_id=%s", turn)
        yield event(
            "turn.failed",
            {
                "thread_id": str(thread),
                "turn_id": str(turn),
                "item_id": str(uuid4()),
                "error_code": "CLINICAL_TURN_STALE",
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
    stored = await repository.get_thread(owner, thread)
    if stored is None:
        raise LookupError("Thread or patient not found")
    sanitized = await sanitize_content(owner, str(artifact["source_note"]))
    context_items = next(
        (
            message.get("context_items") or []
            for message in stored.get("messages", [])
            if UUID(str(message["turn_id"])) == UUID(str(artifact["turn_id"]))
            and message["role"] == "user"
        ),
        [],
    )
    sources = []
    for item in context_items:
        safe_content = await sanitize_content(owner, str(item["content"]))
        sources.append(safe_content.model_text)
    model_note = sanitized.model_text
    if sources:
        sources_text = "\n\n".join(sources)
        model_note = f"{model_note}\n\n{sources_text}"
    if not clinical_evolutions.CLINICAL_EXTERNAL_LLM_ENABLED:
        raise clinical_evolutions.ClinicalGenerationDisabledError
    draft = await clinical_evolutions.generate_draft(owner, patient_id, model_note)
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
