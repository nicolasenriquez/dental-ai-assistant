"""Manual condition boundaries, including validation before SQL."""

from uuid import uuid4

from httpx import ASGITransport, AsyncClient

from backend.auth.dependencies import get_current_user
from backend.main import app


async def test_condition_catalog_and_invalid_inputs():
    async def user():
        return {"id": str(uuid4())}

    app.dependency_overrides[get_current_user] = user
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="https://testserver"
        ) as client:
            catalog = await client.get("/api/patients/condition-catalog")
            assert catalog.status_code == 200
            assert catalog.json()["version"] == 1
            assert len(catalog.json()["conditions"]) == 12
            base = f"/api/patients/{uuid4()}/conditions"
            valid = {
                "id": str(uuid4()),
                "dentition": "permanent",
                "tooth_fdi": 36,
                "condition_code": "caries",
            }
            for change in (
                {"tooth_fdi": 19},
                {"tooth_fdi": 51},
                {"tooth_fdi": True},
                {"condition_code": "invented"},
                {"surfaces": ["M", "M"]},
                {"surfaces": ["X"]},
                {"surfaces": None},
                {"note": "x" * 1001},
                {"condition_code": "missing", "surfaces": ["O"]},
                {"status": "resolved"},
            ):
                result = await client.post(base, json={**valid, **change})
                assert result.status_code == 422, change
            for change in (
                {},
                {"tooth_fdi": 35},
                {"status": "active"},
                {"surfaces": None},
                {"expected_revision": True},
            ):
                body = {"expected_revision": 1, **change}
                assert (await client.patch(f"{base}/{uuid4()}", json=body)).status_code == 422
    finally:
        app.dependency_overrides.pop(get_current_user, None)


async def test_condition_catalog_and_cursor_schema():
    import base64
    import json
    from datetime import UTC, datetime

    import pytest

    from backend.patients.conditions import (
        ConditionsCursor,
        decode_cursor,
        encode_cursor,
        valid_tooth,
    )

    patient = uuid4()
    cursor = ConditionsCursor(
        v=1,
        patient_id=patient,
        dentition="primary",
        status="active",
        tooth_fdi=51,
        created_at=datetime.now(UTC),
        id=uuid4(),
    )
    encoded = encode_cursor(cursor)
    assert decode_cursor(encoded, patient, "primary", "active") == cursor
    for foreign, mode, status in (
        (uuid4(), "primary", "active"),
        (patient, "permanent", "active"),
        (patient, "primary", "all"),
    ):
        with pytest.raises(ValueError):
            decode_cursor(encoded, foreign, mode, status)
    data = cursor.model_dump(mode="json")
    for change in (
        {"v": True},
        {"unexpected": "text"},
        {"tooth_fdi": 59},
        {"created_at": "2026-10-03T12:00:00"},
        {"id": "bad"},
    ):
        bad = base64.urlsafe_b64encode(json.dumps({**data, **change}).encode()).decode()
        with pytest.raises(ValueError):
            decode_cursor(bad, patient, "primary", "active")
    assert sum(valid_tooth("permanent", tooth) for tooth in range(100)) == 32
    assert sum(valid_tooth("primary", tooth) for tooth in range(100)) == 20


async def test_condition_routes_require_authentication():
    patient, condition = uuid4(), uuid4()
    base = f"/api/patients/{patient}/conditions"
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://testserver"
    ) as client:
        for path in (
            "/api/patients/condition-catalog",
            base,
            f"{base}/{condition}",
            f"{base}/{condition}/revisions",
        ):
            assert (await client.get(path)).status_code == 401
        value = {
            "id": str(condition),
            "dentition": "permanent",
            "tooth_fdi": 36,
            "condition_code": "caries",
        }
        assert (await client.post(base, json=value)).status_code == 401
        assert (
            await client.patch(
                f"{base}/{condition}", json={"expected_revision": 1, "status": "resolved"}
            )
        ).status_code == 401
        assert (
            await client.post(
                f"{base}/{condition}/corrections",
                json={"operation_id": str(uuid4()), "expected_revision": 1, "reason": "Error"},
            )
        ).status_code == 401


async def test_correction_validation_precedes_persistence(monkeypatch):
    from backend.db import patient_conditions_repo

    async def forbidden(*args, **kwargs):
        raise AssertionError("Invalid correction reached persistence")

    # No default fake database result may turn malformed input into a passing test.
    monkeypatch.setattr(patient_conditions_repo, "get_pg_pool", forbidden)

    async def user():
        return {"id": str(uuid4())}

    app.dependency_overrides[get_current_user] = user
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="https://testserver"
        ) as client:
            path = f"/api/patients/{uuid4()}/conditions/{uuid4()}/corrections"
            valid = {"operation_id": str(uuid4()), "expected_revision": 1, "reason": "Error"}
            replacement = {
                "id": str(uuid4()),
                "dentition": "permanent",
                "tooth_fdi": 26,
                "condition_code": "caries",
            }
            for change in (
                {"operation_id": "bad"},
                {"operation_id": None},
                {"expected_revision": True},
                {"expected_revision": 0},
                {"expected_revision": "1"},
                {"reason": " "},
                {"reason": None},
                {"reason": "x" * 1001},
                {"owner_user_id": str(uuid4())},
                {"actor": str(uuid4())},
                {"status": "entered_in_error"},
                {"supersedes_condition_id": str(uuid4())},
                {"replacement": {}},
                *(
                    {"replacement": {**replacement, **bad}}
                    for bad in (
                        {"tooth_fdi": 51},
                        {"tooth_fdi": True},
                        {"dentition": "mixed"},
                        {"condition_code": "unknown"},
                        {"surfaces": ["M", "M"]},
                        {"surfaces": ["X"]},
                        {"surfaces": None},
                        {"note": "x" * 1001},
                        {"condition_code": "missing", "surfaces": ["O"]},
                        {"status": "active"},
                        {"category_key": "diagnosis"},
                        {"supersedes_condition_id": str(uuid4())},
                    )
                ),
            ):
                result = await client.post(path, json={**valid, **change})
                assert result.status_code == 422, change
    finally:
        app.dependency_overrides.pop(get_current_user, None)
