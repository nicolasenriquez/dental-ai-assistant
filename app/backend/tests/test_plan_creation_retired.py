"""Retired authoring entry point preserves auth and never writes a new plan."""

from uuid import uuid4

from httpx import ASGITransport, AsyncClient

from backend.auth.dependencies import get_current_user
from backend.main import app


async def test_plan_creation_is_retired_without_executing_a_command(monkeypatch) -> None:
    from backend.routes import patient_treatment_plans

    async def unexpected_write(*args, **kwargs):
        raise AssertionError("Retired plan creation must not reach persistence")

    monkeypatch.setattr(patient_treatment_plans.service, "execute", unexpected_write)
    path = f"/api/patients/{uuid4()}/clinical-plans"
    body = {"id": str(uuid4()), "operation_id": str(uuid4()), "expected_revision": 0}
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://testserver"
    ) as client:
        assert (await client.post(path, json=body)).status_code == 401
        app.dependency_overrides[get_current_user] = lambda: {"id": str(uuid4())}
        try:
            response = await client.post(path, json=body)
            assert response.status_code == 410
            assert "historial" in response.json()["detail"]
        finally:
            app.dependency_overrides.pop(get_current_user, None)
