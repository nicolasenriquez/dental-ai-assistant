"""Feature-local, owner-scoped Clinical Assistant capabilities."""

from __future__ import annotations

from typing import Any

from backend.db import patients_repo
from backend.services import clinical_evolutions

from .policy import ClinicalTurnContext
from .sensitive_input import safe_patient


async def get_patient_context(context: ClinicalTurnContext) -> dict[str, Any]:
    if context.patient_id is None:
        return {"ok": False, "error": "PATIENT_REQUIRED"}
    patient = await patients_repo.get_patient(context.user_id, context.patient_id)
    if patient is None:
        return {"ok": False, "error": "PATIENT_NOT_FOUND"}
    return {"ok": True, "patient": safe_patient(patient)}


async def get_recent_evolutions(context: ClinicalTurnContext) -> dict[str, Any]:
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


async def draft_evolution(
    context: ClinicalTurnContext, raw_note: str
) -> clinical_evolutions.ClinicalDraft:
    if context.patient_id is None:
        raise LookupError("Patient required")
    return await clinical_evolutions.generate_draft(context.user_id, context.patient_id, raw_note)
