"""Sensitive-input handling for clinical turns.

The raw RUT is accepted only at this request boundary. Callers receive safe
display/model text and never the original identifier.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID

from backend.db import patients_repo
from backend.patients.rut import RUT_CANDIDATE_RE, mask_rut, normalize_rut


@dataclass(frozen=True)
class SanitizedInput:
    display_text: str
    model_text: str
    patient_ids: tuple[UUID, ...]
    masked_ruts: tuple[str, ...]
    invalid_candidates: int
    unresolved_candidates: int = 0


async def sanitize_content(owner_user_id: UUID | str, content: str) -> SanitizedInput:
    patient_ids: list[UUID] = []
    masked_ruts: list[str] = []
    invalid_candidates = 0
    unresolved_candidates = 0

    display_parts: list[str] = []
    model_parts: list[str] = []
    cursor = 0
    for match in RUT_CANDIDATE_RE.finditer(content):
        display_parts.append(content[cursor : match.start()])
        model_parts.append(content[cursor : match.start()])
        candidate = match.group(0)
        if "•" in candidate:
            display_parts.append(candidate)
            model_parts.append("[RUT_REDACTED]")
            cursor = match.end()
            continue
        try:
            rut_body, check_digit = normalize_rut(candidate)
        except ValueError:
            invalid_candidates += 1
            display_parts.append("[RUT no válido]")
            model_parts.append("[RUT_NO_VALIDO]")
            cursor = match.end()
            continue

        patient = await patients_repo.get_patient_by_rut(owner_user_id, rut_body)
        if patient is None:
            unresolved_candidates += 1
            display_parts.append("[RUT no encontrado]")
            model_parts.append("[PATIENT_REF:unresolved]")
        else:
            patient_id = UUID(str(patient["id"]))
            if patient_id not in patient_ids:
                patient_ids.append(patient_id)
            masked = mask_rut(patient["rut_number"], patient["rut_dv"])
            masked_ruts.append(masked)
            display_parts.append(masked)
            model_parts.append(f"[PATIENT_REF:{patient_id}]")
        cursor = match.end()

    display_parts.append(content[cursor:])
    model_parts.append(content[cursor:])
    return SanitizedInput(
        display_text="".join(display_parts),
        model_text="".join(model_parts),
        patient_ids=tuple(patient_ids),
        masked_ruts=tuple(masked_ruts),
        invalid_candidates=invalid_candidates,
        unresolved_candidates=unresolved_candidates,
    )


def safe_patient(row: dict[str, Any]) -> dict[str, Any]:
    """Serialize only the patient fields required by the clinical UI."""
    return {
        "id": row["id"],
        "first_name": row["first_name"],
        "last_name": row["last_name"],
        "rut_masked": mask_rut(row["rut_number"], row["rut_dv"]),
    }
