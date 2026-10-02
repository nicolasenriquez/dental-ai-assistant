"""Workspace boundaries: authorization, pagination and actual provider payloads."""

import json
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from backend.auth.dependencies import get_current_user
from backend.clinical_assistant import pending_work
from backend.clinical_assistant.provider_boundary import ProviderBoundary
from backend.db import clinical_assistant_repo as repo
from backend.llm.tool_loop import stream_tool_loop
from backend.routes import clinical_assistant, clinical_pending_work


def test_boundary_handles_structured_and_free_identifiers_and_fails_closed() -> None:
    boundary = ProviderBoundary({"first_name": "Camila", "last_name": "Soto"})
    patient = str(UUID(int=4))
    request = {
        "messages": [
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "patient_id": patient,
                        "email": "camila@example.com",
                        "phone": "+56912345678",
                        "note": "Camila Soto RUT 12.345.678-5; apertura limitada, sin dolor",
                    }
                ),
            }
        ]
    }
    result = boundary.prepare(request)
    text = json.dumps(result)
    for raw in (patient, "Camila", "Soto", "camila@example.com", "+56912345678", "12.345.678-5"):
        assert raw not in text
    assert "apertura limitada, sin dolor" in text
    assert request["messages"][0]["content"] != result["messages"][0]["content"]
    assert boundary.restore("PATIENT_1") == patient
    with pytest.raises(ValueError):
        boundary.prepare({"attachment": object()})


async def test_each_tool_round_redacts_real_provider_input() -> None:
    requests = []
    identifier = str(UUID(int=9))

    async def chunks(tool: bool):
        yield SimpleNamespace(
            choices=[
                SimpleNamespace(
                    delta=SimpleNamespace(
                        content=None if tool else "Sin dolor",
                        tool_calls=[
                            SimpleNamespace(
                                index=0,
                                id="call-1",
                                type="function",
                                function=SimpleNamespace(name="history", arguments="{}"),
                            )
                        ]
                        if tool
                        else None,
                    ),
                    finish_reason="tool_calls" if tool else "stop",
                )
            ]
        )

    async def create(**kwargs):
        requests.append(kwargs)
        return chunks(len(requests) == 1)

    async def execute(_name, _args):
        return json.dumps({"patient_id": identifier, "email": "test@example.com"})

    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    boundary = ProviderBoundary()
    outputs = [
        item
        async for item in stream_tool_loop(
            client=client,
            model="test",
            system_content="Clinical",
            messages=[{"role": "user", "content": identifier}],
            tools=[{"type": "function"}],
            tool_executor=execute,
            max_tool_calls=4,
            buffer_text=True,
            prepare_request=boundary.prepare,
            restore_text=boundary.restore,
        )
    ]
    assert len(requests) == 2
    assert all(identifier not in json.dumps(request) for request in requests)
    assert "test@example.com" not in json.dumps(requests[1])
    assert outputs[-1].text == "Sin dolor"


async def test_boundary_failure_never_calls_provider() -> None:
    create = AsyncMock()
    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    with pytest.raises(ValueError):
        _ = [
            item
            async for item in stream_tool_loop(
                client=client,
                model="test",
                system_content="Clinical",
                messages=[{"role": "user", "content": object()}],
                prepare_request=ProviderBoundary().prepare,
            )
        ]
    create.assert_not_awaited()


async def test_context_route_status_and_typed_conflict(monkeypatch) -> None:
    app = FastAPI()
    app.include_router(clinical_assistant.router, prefix="/api")
    app.dependency_overrides[get_current_user] = lambda: {"id": str(UUID(int=1))}
    patient = {
        "id": UUID(int=4),
        "first_name": "Camila",
        "last_name": "Soto",
        "rut_number": 12345678,
        "rut_dv": "5",
    }
    monkeypatch.setattr(
        clinical_assistant.patients_repo, "get_patient", AsyncMock(return_value=patient)
    )
    monkeypatch.setattr(
        clinical_assistant, "_response", AsyncMock(return_value={"id": str(UUID(int=2))})
    )
    opener = AsyncMock(return_value=(UUID(int=2), False))
    monkeypatch.setattr(repo, "open_context", opener)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        body = {"patient_id": str(UUID(int=4))}
        assert (
            await client.post("/api/clinical-threads/open-context", json=body)
        ).status_code == 201
        opener.return_value = (UUID(int=2), True)
        assert (
            await client.post("/api/clinical-threads/open-context", json=body)
        ).status_code == 200
        opener.side_effect = LookupError()
        assert (
            await client.post("/api/clinical-threads/open-context", json=body)
        ).status_code == 404
        opener.side_effect = ValueError()
        assert (
            await client.post("/api/clinical-threads/open-context", json=body)
        ).status_code == 422
        opener.side_effect = repo.ContextConflictError(
            {"id": UUID(int=2), "active_patient_id": None}, "thread_has_history"
        )
        response = await client.post("/api/clinical-threads/open-context", json=body)
        assert response.status_code == 409
        assert response.json()["detail"]["current"]["patient"] is None
        assert response.json()["detail"]["allowed_actions"] == [
            "continue_current",
            "open_new_thread",
        ]


async def test_pending_cursor_and_route_bounds(monkeypatch) -> None:
    for cursor in ("bad", "e30=", "WyJubyIsICJkcmFmdDpiYWQiXQ=="):
        with pytest.raises(ValueError):
            pending_work.decode_cursor(cursor)
    row = {
        "id": f"draft:{UUID(int=3)}",
        "kind": "recoverable_draft",
        "patient_id": UUID(int=4),
        "thread_id": UUID(int=2),
        "resource_id": UUID(int=3),
        "updated_at": datetime.now(UTC),
        "first_name": "Camila",
        "last_name": "Soto",
        "rut_number": 12345678,
        "rut_dv": "5",
        "total": 2,
    }
    monkeypatch.setattr(
        pending_work.clinical_pending_work_repo,
        "list_pending_work",
        AsyncMock(return_value=[row, row]),
    )
    page = await pending_work.list_pending_work(UUID(int=1), None, 1, None)
    assert page.total == 2
    assert page.next_cursor
    assert pending_work.decode_cursor(page.next_cursor) == (row["updated_at"], row["id"])
    row.update(kind="drive_export_failed", thread_id=None)
    page = await pending_work.list_pending_work(UUID(int=1), None, 1, None)
    assert page.items[0].action.kind == "retry_drive_export"
    assert page.items[0].action.thread_id is None
    assert page.items[0].action.evolution_id == row["resource_id"]
    app = FastAPI()
    app.include_router(clinical_pending_work.router, prefix="/api")
    app.dependency_overrides[get_current_user] = lambda: {"id": str(UUID(int=1))}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.get("/api/clinical-pending-work?limit=51")).status_code == 422
        assert (await client.get("/api/clinical-pending-work?cursor=bad")).status_code == 422
