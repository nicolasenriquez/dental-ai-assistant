"""Strict note commands and independently authored blank Spanish templates."""

from collections.abc import Awaitable, Callable
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from backend.patients.conditions import Dentition, valid_tooth

Body = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]


class NoteCommand(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation_id: UUID
    expected_revision: Annotated[int, Field(strict=True, ge=1)]


class CreateClinicalNote(NoteCommand):
    expected_revision: Annotated[int, Field(strict=True, ge=0, le=0)]
    id: UUID
    note_type: Literal["diagnosis", "treatment", "treatment_plan"]
    entity_kind: Literal["patient", "treatment", "plan"]
    entity_id: UUID
    body: Body
    dentition: Dentition | None = None
    tooth_fdi: Annotated[int, Field(strict=True)] | None = None

    @model_validator(mode="after")
    def context(self) -> "CreateClinicalNote":
        expected = {"diagnosis": "patient", "treatment": "treatment", "treatment_plan": "plan"}
        if self.entity_kind != expected[self.note_type]:
            raise ValueError("El tipo de nota no corresponde a su contexto")
        if self.tooth_fdi is not None:
            if (
                self.note_type != "diagnosis"
                or self.dentition is None
                or not valid_tooth(self.dentition, self.tooth_fdi)
            ):
                raise ValueError("Pieza inválida para esta nota")
        elif self.dentition is not None:
            raise ValueError("Dentición sin pieza")
        return self


class EditClinicalNote(NoteCommand):
    body: Body


TEMPLATES = [
    {
        "id": "diagnosis_caries",
        "category": "diagnosis",
        "label": "Caries",
        "body": "Hallazgo:\nProfundidad:\nSíntomas:\nVitalidad:\nTratamiento sugerido:",
    },
    {
        "id": "diagnosis_periapical",
        "category": "diagnosis",
        "label": "Lesión periapical",
        "body": "Pieza:\nImagen / radiografía:\nPercusión / palpación:\nDiagnóstico:",
    },
    {
        "id": "general_follow_up",
        "category": "general",
        "label": "Seguimiento general",
        "body": "Hallazgos:\nProcedimiento:\nIndicaciones:",
    },
    {
        "id": "endo_single_visit",
        "category": "endodontics",
        "label": "Endodoncia (sesión única)",
        "body": "Diagnóstico:\nAnestesia:\nConductos:\nLongitud de trabajo:\nObturación:\nPostoperatorio:",
    },
    {
        "id": "endo_multi_visit",
        "category": "endodontics",
        "label": "Endodoncia (varias sesiones)",
        "body": "Sesión:\nConductos trabajados:\nMedicación:\nSiguiente revisión:",
    },
    {
        "id": "perio_scaling",
        "category": "periodontics",
        "label": "Tartrectomía / RAR",
        "body": "Cuadrantes:\nSondaje:\nSangrado:\nIndicaciones de higiene:",
    },
    {
        "id": "implant_placement",
        "category": "implantology",
        "label": "Colocación de implante",
        "body": "Identificación / dimensiones:\nTorque:\nEstabilidad:\nInjerto:\nPostoperatorio:",
    },
]

CommandAdapter = Callable[
    [UUID, UUID, UUID, str, dict[str, Any]], Awaitable[tuple[dict[str, Any], bool]]
]


async def execute(
    owner: UUID, patient: UUID, identifier: UUID, body: NoteCommand, *, adapter: CommandAdapter
) -> tuple[dict[str, Any], bool]:
    action = (
        "create"
        if isinstance(body, CreateClinicalNote)
        else "edit"
        if isinstance(body, EditClinicalNote)
        else "delete"
    )
    return await adapter(owner, patient, identifier, action, body.model_dump(mode="json"))
