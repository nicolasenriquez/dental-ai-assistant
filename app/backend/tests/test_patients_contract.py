"""Failing-first contracts for the owner-scoped patient directory."""

from collections.abc import AsyncGenerator
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from backend.main import app


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://testserver"
    ) as test_client:
        yield test_client


async def test_patient_routes_require_authentication(client: AsyncClient) -> None:
    for method, path, body in (
        ("GET", "/api/patients", None),
        (
            "POST",
            "/api/patients",
            {"first_name": "Ana", "last_name": "Perez", "rut": "12.345.678-5"},
        ),
        ("POST", "/api/patients/search", {"query": "Ana"}),
    ):
        response = await client.request(method, path, json=body)
        assert response.status_code == 401


async def test_patient_search_is_body_only_and_bounded(client: AsyncClient) -> None:
    query = "12.345.678-5" + "x" * 190
    response = await client.post("/api/patients/search", json={"query": query})
    assert response.status_code == 422
    assert "query=" not in str(response.request.url)
    assert query not in response.text


def test_rut_contract_accepts_common_forms_and_rejects_invalid_dv() -> None:
    from backend.patients.rut import normalize_rut

    expected = (12_345_678, "5")
    for value in ("12.345.678-5", "12345678-5", " 12 345 678 - 5 "):
        assert normalize_rut(value) == expected
    with pytest.raises(ValueError):
        normalize_rut("12.345.678-9")


def test_patient_repository_contract_is_owner_scoped() -> None:
    import inspect

    from backend.db import patients_repo

    for name in ("create_patient", "list_patients", "search_patients", "get_patient"):
        assert "owner_user_id" in inspect.signature(getattr(patients_repo, name)).parameters


def test_patient_contract_never_puts_rut_in_route_templates() -> None:
    route_paths = {getattr(route, "path", "") for route in app.routes}
    assert "/api/patients/search" in route_paths
    assert "/api/patients/{patient_id}/identifier" not in route_paths
    assert all("rut" not in path.lower() for path in route_paths)


def test_patient_responses_are_minimal_and_masked() -> None:
    from backend.routes.patients import PatientSummary

    fields = set(PatientSummary.model_fields)
    assert fields == {"id", "first_name", "last_name", "rut_masked", "last_evolution_at"}


def test_patient_rut_display_formats_are_explicit() -> None:
    from backend.patients.rut import mask_rut

    assert mask_rut(19_345_678, "9") == "••.•••.678-9"
    assert mask_rut(123, "6") == "•23-6"


def test_patient_logging_contract_contains_no_sensitive_payload_logging() -> None:
    source = (Path(__file__).parents[1] / "routes" / "patients.py").read_text(encoding="utf-8")
    forbidden = ("body.query", "body.rut", "rut_number", "rut_dv")
    assert not any(term in source for term in forbidden)
