"""Authenticated patient-local clinical plan authoring and history."""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Response

from backend.db import patient_clinical_plans_repo as repo
from backend.patients import clinical_plan_service as service
from backend.patients.clinical_plans import (
    AcceptPlan,
    AddItem,
    AddStage,
    CancelStage,
    ClosePlan,
    CompleteStage,
    CreatePlan,
    EditItem,
    EditPlan,
    EditStage,
    PlanCommand,
    PlanState,
    ReorderItems,
)
from backend.routes.patient_treatments import Cursor, Limit, User, _before, _owned, _page

router = APIRouter(prefix="/patients/{patient_id}/clinical-plans", tags=["patient-clinical-plans"])


@router.get("")
async def plans(
    patient_id: UUID,
    user: User,
    limit: Limit = 20,
    cursor: Cursor = None,
    state: PlanState | None = None,
) -> dict[str, Any]:
    owner = UUID(str(user["id"]))
    binding = {"owner": str(owner), "patient": str(patient_id), "state": state, "kind": "plans"}
    rows, total = await _owned(
        repo.list_plans(owner, patient_id, limit, _before(cursor, binding), state)
    )
    return dict(_page(rows, total, limit, binding, "created_at"))


@router.post("", status_code=201)
async def create(
    patient_id: UUID, body: CreatePlan, user: User, response: Response
) -> dict[str, Any]:
    raise HTTPException(
        status_code=410,
        detail="La creación de planes clínicos ya no está disponible. El historial se conserva.",
    )


@router.get("/{plan_id}")
async def detail(patient_id: UUID, plan_id: UUID, user: User) -> dict[str, Any]:
    return dict(await _owned(repo.get_plan(UUID(str(user["id"])), patient_id, plan_id)))


@router.patch("/{plan_id}")
async def edit(patient_id: UUID, plan_id: UUID, body: EditPlan, user: User) -> dict[str, Any]:
    receipt, _ = await _owned(
        service.execute(UUID(str(user["id"])), patient_id, plan_id, "edit", body)
    )
    return dict(receipt)


@router.post("/{plan_id}/items", status_code=201)
async def add_item(
    patient_id: UUID, plan_id: UUID, body: AddItem, user: User, response: Response
) -> dict[str, Any]:
    receipt, created = await _owned(
        service.execute(UUID(str(user["id"])), patient_id, plan_id, "add_item", body)
    )
    response.status_code = 201 if created else 200
    return dict(receipt)


@router.patch("/{plan_id}/items/{item_id}")
async def edit_item(
    patient_id: UUID, plan_id: UUID, item_id: UUID, body: EditItem, user: User
) -> dict[str, Any]:
    receipt, _ = await _owned(
        service.execute(
            UUID(str(user["id"])), patient_id, plan_id, "edit_item", body, item_id=item_id
        )
    )
    return dict(receipt)


@router.post("/{plan_id}/reorder")
async def reorder(
    patient_id: UUID, plan_id: UUID, body: ReorderItems, user: User
) -> dict[str, Any]:
    receipt, _ = await _owned(
        service.execute(UUID(str(user["id"])), patient_id, plan_id, "reorder", body)
    )
    return dict(receipt)


@router.post("/{plan_id}/items/{item_id}/stages", status_code=201)
async def add_stage(
    patient_id: UUID, plan_id: UUID, item_id: UUID, body: AddStage, user: User, response: Response
) -> dict[str, Any]:
    receipt, created = await _owned(
        service.execute(
            UUID(str(user["id"])), patient_id, plan_id, "add_stage", body, item_id=item_id
        )
    )
    response.status_code = 201 if created else 200
    return dict(receipt)


@router.patch("/{plan_id}/items/{item_id}/stages/{stage_id}")
async def edit_stage(
    patient_id: UUID, plan_id: UUID, item_id: UUID, stage_id: UUID, body: EditStage, user: User
) -> dict[str, Any]:
    receipt, _ = await _owned(
        service.execute(
            UUID(str(user["id"])),
            patient_id,
            plan_id,
            "edit_stage",
            body,
            item_id=item_id,
            stage_id=stage_id,
        )
    )
    return dict(receipt)


@router.get("/{plan_id}/revisions")
async def revisions(
    patient_id: UUID, plan_id: UUID, user: User, limit: Limit = 20, cursor: Cursor = None
) -> dict[str, Any]:
    owner = UUID(str(user["id"]))
    binding = {
        "owner": str(owner),
        "patient": str(patient_id),
        "resource": str(plan_id),
        "kind": "plan_revisions",
    }
    rows, total = await _owned(
        repo.list_revisions(owner, patient_id, plan_id, limit, _before(cursor, binding))
    )
    return dict(_page(rows, total, limit, binding, "changed_at"))


@router.post("/{plan_id}/items/{item_id}/stages/{stage_id}/complete")
async def complete_stage(
    patient_id: UUID, plan_id: UUID, item_id: UUID, stage_id: UUID, body: CompleteStage, user: User
) -> dict[str, Any]:
    receipt, _ = await _owned(
        service.execute(
            UUID(str(user["id"])),
            patient_id,
            plan_id,
            "complete_stage",
            body,
            item_id=item_id,
            stage_id=stage_id,
        )
    )
    return dict(receipt)


@router.post("/{plan_id}/items/{item_id}/stages/{stage_id}/cancel")
async def cancel_stage(
    patient_id: UUID, plan_id: UUID, item_id: UUID, stage_id: UUID, body: CancelStage, user: User
) -> dict[str, Any]:
    receipt, _ = await _owned(
        service.execute(
            UUID(str(user["id"])),
            patient_id,
            plan_id,
            "cancel_stage",
            body,
            item_id=item_id,
            stage_id=stage_id,
        )
    )
    return dict(receipt)


async def _transition(
    patient: UUID, plan: UUID, action: str, body: PlanCommand, user: dict[str, Any]
) -> dict[str, Any]:
    receipt, _ = await _owned(service.execute(UUID(str(user["id"])), patient, plan, action, body))
    return dict(receipt)


@router.post("/{plan_id}/confirm")
async def confirm(patient_id: UUID, plan_id: UUID, body: PlanCommand, user: User) -> dict[str, Any]:
    return await _transition(patient_id, plan_id, "confirm", body, user)


@router.post("/{plan_id}/accept")
async def accept(patient_id: UUID, plan_id: UUID, body: AcceptPlan, user: User) -> dict[str, Any]:
    return await _transition(patient_id, plan_id, "accept", body, user)


@router.post("/{plan_id}/reopen")
async def reopen(patient_id: UUID, plan_id: UUID, body: PlanCommand, user: User) -> dict[str, Any]:
    return await _transition(patient_id, plan_id, "reopen", body, user)


@router.post("/{plan_id}/close")
async def close(patient_id: UUID, plan_id: UUID, body: ClosePlan, user: User) -> dict[str, Any]:
    return await _transition(patient_id, plan_id, "close", body, user)


@router.post("/{plan_id}/reactivate")
async def reactivate(
    patient_id: UUID, plan_id: UUID, body: PlanCommand, user: User
) -> dict[str, Any]:
    return await _transition(patient_id, plan_id, "reactivate", body, user)


@router.post("/{plan_id}/archive")
async def archive(patient_id: UUID, plan_id: UUID, body: PlanCommand, user: User) -> dict[str, Any]:
    return await _transition(patient_id, plan_id, "archive", body, user)
