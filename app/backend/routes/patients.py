"""Authenticated, owner-scoped patient directory routes."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Any
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Cookie, Depends, HTTPException, status
from pydantic import BaseModel, Field, StringConstraints, field_validator

from backend.auth.dependencies import get_current_user
from backend.db import patients_repo
from backend.patients.rut import normalize_rut, public_patient

MAX_PATIENT_SEARCH_LENGTH = 200
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]

router = APIRouter(prefix="/patients", tags=["patients"])


class PatientSummary(BaseModel):
    id: UUID
    first_name: str
    last_name: str
    rut_masked: str
    last_evolution_at: datetime | None = None
    birth_date: date | None = None


class PatientDetail(PatientSummary):
    pass


class CreatePatientRequest(BaseModel):
    first_name: Name
    last_name: Name
    rut: str = Field(min_length=1, max_length=32)
    birth_date: date | None = None

    @field_validator("first_name", "last_name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return " ".join(value.split())

    @field_validator("rut")
    @classmethod
    def validate_rut(cls, value: str) -> str:
        try:
            normalize_rut(value)
        except ValueError as exc:
            raise ValueError("Formato o DV invalido") from exc
        return value


class UpdatePatientRequest(BaseModel):
    first_name: Name
    last_name: Name
    rut: str | None = Field(default=None, min_length=1, max_length=32)
    birth_date: date | None = None

    @field_validator("first_name", "last_name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return " ".join(value.split())

    @field_validator("rut")
    @classmethod
    def validate_rut(cls, value: str | None) -> str | None:
        if value is None:
            return None
        try:
            normalize_rut(value)
        except ValueError as exc:
            raise ValueError("Formato o DV invalido") from exc
        return value


class SearchPatientsRequest(BaseModel):
    query: str = Field(max_length=MAX_PATIENT_SEARCH_LENGTH)


def _summary(row: dict[str, Any]) -> PatientSummary:
    return PatientSummary(**public_patient(row))


@router.get("", response_model=list[PatientSummary])
async def list_patients(user: dict[str, Any] = Depends(get_current_user)) -> list[PatientSummary]:
    return [_summary(row) for row in await patients_repo.list_patients(user["id"])]


@router.post("/search", response_model=list[PatientSummary])
async def search_patients(
    request: SearchPatientsRequest,
    session: str | None = Cookie(default=None),
) -> list[PatientSummary]:
    user = await get_current_user(session)
    term = " ".join(request.query.split())
    if not term:
        return [_summary(row) for row in await patients_repo.list_patients(user["id"])]

    try:
        rut_body, _ = normalize_rut(term)
    except ValueError:
        rows = await patients_repo.search_patients(user["id"], query=term)
    else:
        rows = await patients_repo.search_patients(user["id"], rut_body=rut_body)
    return [_summary(row) for row in rows]


@router.post("", response_model=PatientSummary, status_code=status.HTTP_201_CREATED)
async def create_patient(
    request: CreatePatientRequest,
    user: dict[str, Any] = Depends(get_current_user),
) -> PatientSummary:
    rut_body, check_digit = normalize_rut(request.rut)
    try:
        row = await patients_repo.create_patient(
            user["id"],
            first_name=request.first_name,
            last_name=request.last_name,
            rut_body=rut_body,
            check_digit=check_digit,
            birth_date=request.birth_date,
        )
    except asyncpg.UniqueViolationError:
        existing = await patients_repo.get_patient_by_rut(user["id"], rut_body)
        if existing is None:
            raise
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "patient_exists",
                "patient": _summary(existing).model_dump(mode="json"),
            },
        ) from None
    return _summary(row)


@router.patch("/{patient_id}", response_model=PatientDetail)
async def update_patient(
    patient_id: UUID,
    request: UpdatePatientRequest,
    user: dict[str, Any] = Depends(get_current_user),
) -> PatientDetail:
    rut_body: int | None = None
    check_digit: str | None = None
    if request.rut is not None:
        rut_body, check_digit = normalize_rut(request.rut)

    try:
        row = await patients_repo.update_patient(
            user["id"],
            patient_id,
            first_name=request.first_name,
            last_name=request.last_name,
            birth_date=request.birth_date,
            rut_body=rut_body,
            check_digit=check_digit,
        )
    except asyncpg.UniqueViolationError:
        if rut_body is None:
            raise
        existing = await patients_repo.get_patient_by_rut(user["id"], rut_body)
        if existing is None:
            raise
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "patient_exists",
                "patient": _summary(existing).model_dump(mode="json"),
            },
        ) from None

    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paciente no encontrado")
    return PatientDetail(**_summary(row).model_dump())


@router.get("/{patient_id}", response_model=PatientDetail)
async def get_patient(
    patient_id: UUID,
    user: dict[str, Any] = Depends(get_current_user),
) -> PatientDetail:
    row = await patients_repo.get_patient(user["id"], patient_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paciente no encontrado")
    return PatientDetail(**_summary(row).model_dump())
