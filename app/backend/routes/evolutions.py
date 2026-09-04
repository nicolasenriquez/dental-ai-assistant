"""Authenticated dental evolution generation routes."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Cookie, HTTPException, status
from pydantic import AfterValidator, BaseModel, ConfigDict, StringConstraints, field_validator

from backend.auth.dependencies import get_current_user
from backend.db import evolutions_repo
from backend.services import clinical_evolutions

router = APIRouter(prefix="/evolutions", tags=["evolutions"])
patient_router = APIRouter(prefix="/patients", tags=["evolutions"])


def _validate_raw_note(value: str) -> str:
    length = len(value.strip())
    if length == 0:
        raise ValueError("La nota no puede estar vacia")
    if length > clinical_evolutions.MAX_RAW_NOTE_LENGTH:
        raise ValueError("La nota supera el limite de 40.000 caracteres")
    return value


RawNote = Annotated[str, AfterValidator(_validate_raw_note)]
EvolutionText = Annotated[
    str, StringConstraints(max_length=clinical_evolutions.MAX_RAW_NOTE_LENGTH)
]


class GenerateEvolutionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    patient_id: UUID
    raw_note: RawNote


class SaveEvolutionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    evolution_at: datetime
    raw_note: RawNote
    generated_text: EvolutionText
    final_text: EvolutionText

    @field_validator("final_text")
    @classmethod
    def validate_non_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("El texto no puede estar vacio")
        return value

    @field_validator("evolution_at")
    @classmethod
    def validate_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("evolution_at debe incluir zona horaria")
        return value


@router.post("/generate", response_model=clinical_evolutions.ClinicalDraft)
async def generate_evolution(
    request: GenerateEvolutionRequest,
    session: str | None = Cookie(default=None),
) -> clinical_evolutions.ClinicalDraft:
    user: dict[str, Any] = await get_current_user(session)
    try:
        return await clinical_evolutions.generate_draft(
            user["id"], request.patient_id, request.raw_note
        )
    except clinical_evolutions.ClinicalGenerationDisabledError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "clinical_generation_disabled",
                "message": "Clinical generation is disabled in this environment",
            },
        ) from None
    except LookupError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Paciente no encontrado"
        ) from None
    except clinical_evolutions.ClinicalGenerationError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "code": clinical_evolutions.ClinicalGenerationError.code,
                "message": "La redacción asistida no está disponible temporalmente",
            },
        ) from None


@patient_router.post(
    "/{patient_id}/evolutions",
    status_code=status.HTTP_201_CREATED,
    responses={409: {"description": "UUID conflict"}, 422: {"description": "Invalid record"}},
)
async def save_evolution(
    patient_id: UUID,
    request: SaveEvolutionRequest,
    session: str | None = Cookie(default=None),
) -> dict[str, Any]:
    user: dict[str, Any] = await get_current_user(session)
    try:
        return await evolutions_repo.create_evolution(
            user["id"],
            patient_id,
            evolution_id=request.id,
            evolution_at=request.evolution_at,
            raw_note=request.raw_note,
            generated_text=request.generated_text,
            final_text=request.final_text,
        )
    except LookupError:
        raise HTTPException(status_code=404, detail="Paciente no encontrado") from None
    except evolutions_repo.EvolutionConflictError:
        raise HTTPException(
            status_code=409, detail="El UUID ya fue usado con otro contenido"
        ) from None


@patient_router.get("/{patient_id}/evolutions")
async def list_evolutions(
    patient_id: UUID,
    session: str | None = Cookie(default=None),
) -> list[dict[str, Any]]:
    user: dict[str, Any] = await get_current_user(session)
    records = await evolutions_repo.list_evolutions(user["id"], patient_id)
    if records is None:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    return records


@router.get("/{evolution_id}")
async def get_evolution(
    evolution_id: UUID,
    session: str | None = Cookie(default=None),
) -> dict[str, Any]:
    user: dict[str, Any] = await get_current_user(session)
    record = await evolutions_repo.get_evolution(user["id"], evolution_id)
    if not record:
        raise HTTPException(status_code=404, detail="Evolucion no encontrada")
    return record
