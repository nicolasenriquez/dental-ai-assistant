"""Failing-first contracts for the owner-scoped patient directory."""

from collections.abc import AsyncGenerator
from pathlib import Path
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi.routing import APIRoute
from httpx import ASGITransport, AsyncClient

from backend.auth.dependencies import get_current_user
from backend.main import app
from backend.routes import patients


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
        (
            "PATCH",
            "/api/patients/00000000-0000-0000-0000-000000000001",
            {"first_name": "Ana", "last_name": "Perez"},
        ),
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

    for name in (
        "create_patient",
        "list_patients",
        "search_patients",
        "get_patient",
        "update_patient",
    ):
        assert "owner_user_id" in inspect.signature(getattr(patients_repo, name)).parameters


def test_patient_update_contract_has_no_clinical_fields() -> None:
    from backend.routes.patients import UpdatePatientRequest

    assert set(UpdatePatientRequest.model_fields) == {
        "first_name",
        "last_name",
        "rut",
        "birth_date",
        "phone",
        "email",
    }


@pytest.mark.parametrize(
    "phone,email", [(" +56 (9) 1234-5678 ", " Ana@Example.com "), (None, None), ("  ", " ")]
)
def test_contact_normalization(phone, email) -> None:
    request = patients.CreatePatientRequest(
        first_name="Ana", last_name="Pérez", rut="12.345.678-5", phone=phone, email=email
    )
    assert request.phone == (phone.strip() or None if phone is not None else None)
    assert request.email == (email.strip() or None if email is not None else None)


@pytest.mark.parametrize(
    "field,value",
    [
        ("phone", 123),
        ("phone", "+"),
        ("phone", "123 ext 2"),
        ("phone", "1+2"),
        ("phone", "1" * 16),
        ("phone", " " + "1 " * 21),
        ("phone", "\uff11\uff12\uff13"),
        ("email", 123),
        ("email", "a@b"),
        ("email", "a@@b.com"),
        ("email", "a b@c.com"),
        ("email", "a@b..com"),
        ("email", "a" * 250 + "@b.com"),
    ],
)
async def test_invalid_contact_is_field_located_without_writes(
    client, monkeypatch, field, value
) -> None:
    create = AsyncMock(
        return_value={
            "id": uuid4(),
            "first_name": "Ana",
            "last_name": "Pérez",
            "rut_number": 12345678,
            "rut_dv": "5",
        }
    )
    monkeypatch.setattr(patients.patients_repo, "create_patient", create)
    app.dependency_overrides[get_current_user] = lambda: {"id": str(uuid4())}
    try:
        response = await client.post(
            "/api/patients",
            json={"first_name": "Ana", "last_name": "Pérez", "rut": "12.345.678-5", field: value},
        )
        assert response.status_code == 422
        assert response.json()["detail"][0]["loc"] == ["body", field]
        create.assert_not_awaited()
    finally:
        app.dependency_overrides.pop(get_current_user, None)


async def test_contact_detail_patch_omission_clearing_and_owner404(client, monkeypatch) -> None:
    owner, identifier = uuid4(), uuid4()
    row = {
        "id": identifier,
        "first_name": "Ana",
        "last_name": "Pérez",
        "rut_number": 12345678,
        "rut_dv": "5",
        "phone": "123",
        "email": "a@b.com",
    }
    get = AsyncMock(return_value=row)
    update = AsyncMock(return_value=row)
    monkeypatch.setattr(patients.patients_repo, "get_patient", get)
    monkeypatch.setattr(patients.patients_repo, "update_patient", update)
    app.dependency_overrides[get_current_user] = lambda: {"id": str(owner)}
    try:
        response = await client.get(f"/api/patients/{identifier}")
        assert response.json()["phone"] == "123"
        body = {"first_name": "Ana", "last_name": "Pérez"}
        assert (await client.patch(f"/api/patients/{identifier}", json=body)).status_code == 200
        assert update.call_args.kwargs["update_phone"] is False
        assert update.call_args.kwargs["update_email"] is False
        await client.patch(
            f"/api/patients/{identifier}", json={**body, "phone": None, "email": " "}
        )
        assert update.call_args.kwargs["update_phone"] is True
        assert update.call_args.kwargs["phone"] is None
        assert update.call_args.kwargs["email"] is None
        get.assert_awaited_once_with(str(owner), identifier)
        get.return_value = None
        update.return_value = None
        assert (await client.get(f"/api/patients/{identifier}")).status_code == 404
        assert (await client.patch(f"/api/patients/{identifier}", json=body)).status_code == 404
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.parametrize(
    "query,kind,value",
    [
        ("", "all", ""),
        ("123", "fragment", "123"),
        ("12345678", "fragment", "12345678"),
        ("12.345.678-5", "rut", "12345678"),
        ("123456785", "rut", "12345678"),
        ("12.345.678-0", "none", ""),
        ("123456780", "phone", "123456780"),
        ("+56 9 1234 5678", "phone", "56912345678"),
        ("(09) 1234-5678", "phone", "0912345678"),
        ("1234567890", "phone", "1234567890"),
        ("Ana María", "name", "ana maria"),
        ("Ana 123", "name", "ana 123"),
        ("  Ana   MARÍA ", "name", "ana maria"),
        ("()", "name", "()"),
        ("%_\\", "name", "%_\\"),
        ("12-3-4", "phone", "1234"),
        ("12.34.56", "name", "12.34.56"),
    ],
)
def test_ordered_patient_search_classification(query, kind, value) -> None:
    from backend.patients.search import classify_search

    assert classify_search(query) == (kind, value)


def test_patient_names_collapse_repeated_whitespace_at_the_boundary() -> None:
    from backend.routes.patients import CreatePatientRequest

    request = CreatePatientRequest(
        first_name="  Ana   María  ",
        last_name="  Pérez   Soto ",
        rut="12.345.678-5",
    )

    assert request.first_name == "Ana María"
    assert request.last_name == "Pérez Soto"


def test_patient_update_route_preserves_masked_response_contract() -> None:
    route = next(
        route
        for route in app.routes
        if isinstance(route, APIRoute) and route.path == "/api/patients/{patient_id}"
    )
    assert "PATCH" in route.methods
    assert route.response_model.__name__ == "PatientDetail"


def test_patient_update_preserves_rut_when_omitted_and_updates_timestamp() -> None:
    from backend.db import patients_repo

    source = Path(patients_repo.__file__).read_text(encoding="utf-8")
    assert "rut_number = COALESCE($6, rut_number)" in source
    assert "rut_dv = COALESCE($7, rut_dv)" in source
    assert "updated_at = now()" in source


def test_patient_contract_never_puts_rut_in_route_templates() -> None:
    route_paths = {getattr(route, "path", "") for route in app.routes}
    assert "/api/patients/search" in route_paths
    assert "/api/patients/{patient_id}/identifier" not in route_paths
    assert all("rut" not in path.lower() for path in route_paths)


def test_patient_responses_are_minimal_and_masked() -> None:
    from backend.routes.patients import PatientSummary

    fields = set(PatientSummary.model_fields)
    assert fields == {
        "id",
        "first_name",
        "last_name",
        "rut_masked",
        "last_evolution_at",
        "birth_date",
    }


def test_patient_rut_display_formats_are_explicit() -> None:
    from backend.patients.rut import mask_rut

    assert mask_rut(19_345_678, "9") == "••.•••.678-9"
    assert mask_rut(123, "6") == "•23-6"


def test_patient_logging_contract_contains_no_sensitive_payload_logging() -> None:
    source = (Path(__file__).parents[1] / "routes" / "patients.py").read_text(encoding="utf-8")
    forbidden = ("body.query", "body.rut", "rut_number", "rut_dv")
    assert not any(term in source for term in forbidden)
