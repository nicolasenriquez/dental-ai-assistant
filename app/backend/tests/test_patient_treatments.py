"""Public catalog and authenticated treatment commands, with optional real PostgreSQL."""

import asyncio
import base64
import json
import os
from uuid import UUID, uuid4

import asyncpg
import pytest
from httpx import ASGITransport, AsyncClient

from backend.auth.dependencies import get_current_user
from backend.main import app


async def test_treatment_catalog_complete_and_authenticated():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://testserver"
    ) as client:
        assert (await client.get("/api/patients/treatment-catalog")).status_code == 401
        owner = uuid4()
        app.dependency_overrides[get_current_user] = lambda: {"id": str(owner)}
        try:
            response = await client.get("/api/patients/treatment-catalog")
            assert response.status_code == 200
            catalog = response.json()
            assert catalog["version"] == "dental-clinical-v1"
            assert len(catalog["variants"]) == 63
            assert len(catalog["findings"]) == 12
            assert len(catalog["categories"]) == 8
            assert len({v["id"] for v in catalog["variants"]}) == 63
            assert len({v["label_es"] for v in catalog["variants"]}) == 63
            for variant in catalog["variants"]:
                assert all(
                    variant[key]
                    for key in (
                        "clinical_type",
                        "scope",
                        "category_key",
                        "allowed_dentitions",
                        "visual_family",
                        "icon_key",
                        "palette_role",
                        "layer_role",
                    )
                )
                assert "surface_codes" in variant
            crowns = [
                v for v in catalog["variants"] if v["id"] in ("REST-CROWN-MC", "REST-CROWN-ZIR")
            ]
            assert len(crowns) == 2
            assert {v["clinical_type"] for v in crowns} == {"crown"}
            assert [c["key"] for c in catalog["categories"]] == [
                "diagnosis",
                "restorative",
                "surgery",
                "endodontics",
                "orthodontics",
                "preventive",
                "periodontics",
                "pediatric",
            ]
            assert catalog["variants"][0]["id"] == "PREV-SEAL"
            assert catalog["variants"][-1]["id"] == "CORE-ENDO-OVERFILL"
            assert [v["id"] for v in catalog["variants"] if v["clinical_type"] == "crown"] == [
                "REST-CROWN-MC",
                "REST-CROWN-ZIR",
                "REST-CROWN-DISI",
                "REST-CROWN-METAL",
                "REST-CROWN-PROV",
                "REST-CROWN-RECEMENT",
                "REST-CROWN-POST-ENDO",
                "PED-CROWN-SS",
            ]
        finally:
            app.dependency_overrides.pop(get_current_user, None)


async def test_treatment_authentication_and_strict_payloads(monkeypatch):
    from backend.db import patient_treatments_repo

    def forbidden():
        raise AssertionError("Invalid or unauthenticated command reached persistence")

    monkeypatch.setattr(patient_treatments_repo, "get_pg_pool", forbidden)
    patient, identifier = uuid4(), uuid4()
    base = f"/api/patients/{patient}/dental-treatments"
    body = {
        "id": str(identifier),
        "operation_id": str(uuid4()),
        "expected_revision": 0,
        "variant_id": "ORTO-BRACK",
        "dentition": "permanent",
        "teeth": [{"tooth_fdi": 16}],
    }
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://testserver"
    ) as client:
        for endpoint in (base, f"{base}/{identifier}", f"{base}/{identifier}/revisions"):
            assert (await client.get(endpoint)).status_code == 401
        assert (await client.post(base, json=body)).status_code == 401
        assert (
            await client.patch(
                f"{base}/{identifier}",
                json={"operation_id": str(uuid4()), "expected_revision": 1, "note": "test"},
            )
        ).status_code == 401
        assert (
            await client.post(
                f"{base}/{identifier}/corrections",
                json={"operation_id": str(uuid4()), "expected_revision": 1, "reason": "Error"},
            )
        ).status_code == 401
        app.dependency_overrides[get_current_user] = lambda: {"id": str(uuid4())}
        try:
            for change in (
                {"expected_revision": True},
                {"expected_revision": 1},
                {"variant_id": "REST-SPLINT-OCC"},
                {"state": "performed"},
                {"owner_user_id": str(uuid4())},
                {"note": "x" * 1001},
                {"teeth": [{"tooth_fdi": True}]},
                {"teeth": [{"tooth_fdi": 16, "surfaces": ["M", "M"]}]},
            ):
                assert (await client.post(base, json={**body, **change})).status_code == 422
            assert (
                await client.post(
                    f"{base}/{identifier}/corrections",
                    json={"operation_id": str(uuid4()), "expected_revision": 1, "reason": " "},
                )
            ).status_code == 422
        finally:
            app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
async def treatment_db(monkeypatch):
    url = os.environ.get("TREATMENT_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set TREATMENT_TEST_DATABASE_URL to an isolated migrated PostgreSQL database")
    from backend.db import patient_treatments_repo

    pool = await asyncpg.create_pool(url, min_size=1, max_size=5)
    monkeypatch.setattr(patient_treatments_repo, "get_pg_pool", lambda: pool)
    owner, foreign, patient = uuid4(), uuid4(), uuid4()
    async with pool.acquire() as conn:
        for user in (owner, foreign):
            await conn.execute(
                "INSERT INTO users(id,email,password_hash) VALUES($1,$2,'not-a-login')",
                user,
                f"{user}@example.test",
            )
        await conn.execute(
            "INSERT INTO patients(id,owner_user_id,first_name,last_name,rut_number,rut_dv) VALUES($1,$2,'Synthetic','Treatment',11111111,'1')",
            patient,
            owner,
        )
    app.dependency_overrides[get_current_user] = lambda: {"id": str(owner)}
    try:
        yield pool, owner, foreign, patient
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        async with pool.acquire() as conn:
            await conn.execute("DELETE FROM patients WHERE id=$1", patient)
            await conn.execute("DELETE FROM users WHERE id=ANY($1::uuid[])", [owner, foreign])
        await pool.close()


async def test_treatment_http_replay_conflict_correction_and_owner(treatment_db):
    pool, owner, foreign, patient = treatment_db
    base = f"/api/patients/{patient}/dental-treatments"
    command = {
        "id": str(uuid4()),
        "operation_id": str(uuid4()),
        "expected_revision": 0,
        "variant_id": "ORTO-BRACK",
        "dentition": "permanent",
        "teeth": [{"tooth_fdi": 16, "role": "tooth", "surfaces": []}],
    }
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://testserver"
    ) as client:
        response = await client.post(base, json=command)
        assert response.status_code == 201, response.text
        receipt = response.json()
        record = receipt["committed"]
        assert record["state"] == "existing"
        assert record["provenance"] == "observed_existing"
        assert record["label_es"] == "Bracket individual (reposición)"
        path = f"{base}/{record['id']}"
        edit = {"operation_id": str(uuid4()), "expected_revision": 1, "note": "Evidence retained"}
        edited = await client.patch(path, json=edit)
        assert edited.status_code == 200
        assert (await client.post(base, json=command)).json() == receipt
        assert (await client.patch(path, json=edit)).json() == edited.json()
        assert (await client.post(base, json={**command, "note": "changed"})).status_code == 409
        stale = await client.patch(
            path, json={**edit, "operation_id": str(uuid4()), "note": "Local draft"}
        )
        assert stale.status_code == 409
        assert stale.json()["detail"]["latest"]["note"] == "Evidence retained"
        fresh = {
            **edit,
            "operation_id": str(uuid4()),
            "expected_revision": 2,
            "note": "Local draft",
        }
        assert (await client.patch(path, json=fresh)).status_code == 200
        assert (await client.get(path)).json()["revision"] == 3
        assert (await client.get(base)).json()["total"] == 1
        for change in (
            {"actor": str(owner)},
            {"expected_revision": True},
            {"variant_id": "unknown"},
            {"variant_id": "REST-BRIDGE-MC"},
            {"teeth": [{"tooth_fdi": 51}]},
            {"teeth": [{"tooth_fdi": 16, "surfaces": ["Z"]}]},
        ):
            assert (await client.post(base, json={**command, **change})).status_code == 422
        replacement = {
            "id": str(uuid4()),
            "variant_id": "ORTO-BRACK-CEMENT",
            "dentition": "permanent",
            "teeth": command["teeth"],
        }
        correction = {
            "operation_id": str(uuid4()),
            "expected_revision": 3,
            "reason": "Wrong variant",
            "replacement": replacement,
        }
        result = await client.post(f"{path}/corrections", json=correction)
        assert result.status_code == 201, result.text
        assert (await client.post(f"{path}/corrections", json=correction)).json() == result.json()
        original = (await client.get(path)).json()
        assert original["state"] == "entered_in_error"
        assert original["note"] == "Local draft"
        assert original["replacement_id"] == replacement["id"]
        history = (await client.get(f"{path}/revisions")).json()
        assert history["total"] == 4
        assert history["items"][0]["before"]["state"] == "existing"
        first_history = (await client.get(f"{path}/revisions", params={"limit": 1})).json()
        older = (
            await client.get(
                f"{path}/revisions", params={"limit": 1, "cursor": first_history["next_cursor"]}
            )
        ).json()
        assert first_history["items"][0]["revision"] == 4
        assert older["items"][0]["revision"] == 3
        app.dependency_overrides[get_current_user] = lambda: {"id": str(foreign)}
        for endpoint in (base, path, f"{path}/revisions"):
            assert (await client.get(endpoint)).status_code == 404
        assert (await client.patch(path, json=fresh)).status_code == 404
        assert (await client.post(base, json=command)).status_code == 404
    async with pool.acquire() as conn:
        assert (
            await conn.fetchval(
                "SELECT count(*) FROM patient_dental_treatments WHERE patient_id=$1", patient
            )
            == 2
        )
        assert (
            await conn.fetchval(
                "SELECT count(*) FROM patient_tooth_conditions WHERE patient_id=$1", patient
            )
            == 0
        )


async def test_treatment_concurrent_replay_and_edits(treatment_db):
    pool, owner, foreign, patient = treatment_db
    base = f"/api/patients/{patient}/dental-treatments"
    body = {
        "id": str(uuid4()),
        "operation_id": str(uuid4()),
        "expected_revision": 0,
        "variant_id": "REST-CROWN-ZIR",
        "dentition": "permanent",
        "teeth": [{"tooth_fdi": 16}],
    }
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://testserver"
    ) as client:
        results = await asyncio.gather(*(client.post(base, json=body) for _ in range(4)))
        assert sorted(r.status_code for r in results) == [200, 200, 200, 201]
        assert all(r.json() == results[0].json() for r in results)
        path = f"{base}/{body['id']}"
        edits = [
            {"operation_id": str(uuid4()), "expected_revision": 1, "note": value}
            for value in ("A", "B")
        ]
        results = await asyncio.gather(*(client.patch(path, json=b) for b in edits))
        assert sorted(r.status_code for r in results) == [200, 409]
        assert (await client.get(f"{path}/revisions")).json()["total"] == 2
    async with pool.acquire() as conn:
        assert (
            await conn.fetchval(
                "SELECT count(*) FROM patient_clinical_commands WHERE patient_id=$1", patient
            )
            == 2
        )


async def test_treatment_atomic_failure_and_correction_collision(treatment_db, monkeypatch):
    from backend.db import patient_treatments_repo as repo

    pool, owner, foreign, patient = treatment_db
    base = f"/api/patients/{patient}/dental-treatments"
    body = {
        "id": str(uuid4()),
        "operation_id": str(uuid4()),
        "expected_revision": 0,
        "variant_id": "ORTO-BRACK",
        "dentition": "permanent",
        "teeth": [{"tooth_fdi": 16}],
    }
    original = repo._revision

    async def fail_revision(*args, **kwargs):
        raise RuntimeError("Injected history write failure")

    monkeypatch.setattr(repo, "_revision", fail_revision)
    with pytest.raises(RuntimeError):
        await repo.command(
            owner,
            patient,
            UUID(body["id"]),
            "create",
            {**body, "teeth": [{"tooth_fdi": 16, "role": "tooth", "surfaces": []}]},
        )
    async with pool.acquire() as conn:
        for table in (
            "patient_dental_treatments",
            "patient_dental_treatment_teeth",
            "patient_dental_treatment_revisions",
            "patient_clinical_commands",
        ):
            # Fixed test-only identifiers; runtime SQL remains parameterized in db/.
            assert (
                await conn.fetchval(f"SELECT count(*) FROM {table} WHERE patient_id=$1", patient)
                == 0
            )
    monkeypatch.setattr(repo, "_revision", original)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://testserver"
    ) as client:
        assert (await client.post(base, json=body)).status_code == 201
        other = {**body, "id": str(uuid4()), "operation_id": str(uuid4())}
        assert (await client.post(base, json=other)).status_code == 201
        correction = {
            "operation_id": str(uuid4()),
            "expected_revision": 1,
            "reason": "Wrong variant",
            "replacement": {
                k: v for k, v in other.items() if k not in ("operation_id", "expected_revision")
            },
        }
        path = f"{base}/{body['id']}"
        assert (await client.post(f"{path}/corrections", json=correction)).status_code == 409
        assert (await client.get(path)).json()["state"] == "existing"
        assert (await client.get(f"{path}/revisions")).json()["total"] == 1


async def test_treatment_cursor_binding_and_canonical_surface_reads(treatment_db):
    pool, owner, foreign, patient = treatment_db
    base = f"/api/patients/{patient}/dental-treatments"
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://testserver"
    ) as client:
        for variant in ("REST-VEN-ZIR", "PED-SEAL"):
            command = {
                "id": str(uuid4()),
                "operation_id": str(uuid4()),
                "expected_revision": 0,
                "variant_id": variant,
                "dentition": "permanent",
                "teeth": [{"tooth_fdi": 16, "surfaces": ["L", "M"]}],
            }
            result = await client.post(base, json=command)
            assert result.status_code == 201
            assert result.json()["committed"]["teeth"][0]["surfaces"] == ["M", "L"]
        first = (await client.get(base, params={"limit": 1})).json()
        assert first["total"] == 2 and first["next_cursor"]
        second = (
            await client.get(base, params={"limit": 1, "cursor": first["next_cursor"]})
        ).json()
        assert len(second["items"]) == 1 and second["next_cursor"] is None
        assert first["items"][0]["id"] != second["items"][0]["id"]
        data = json.loads(
            base64.urlsafe_b64decode(first["next_cursor"] + "=" * (-len(first["next_cursor"]) % 4))
        )
        for key in ("id", "at"):
            malformed = base64.urlsafe_b64encode(json.dumps({**data, key: {}}).encode()).decode()
            assert (await client.get(base, params={"cursor": malformed})).status_code == 422
        assert (
            await client.get(base, params={"dentition": "primary", "cursor": first["next_cursor"]})
        ).status_code == 422
        assert (
            await client.get(
                f"/api/patients/{uuid4()}/dental-treatments",
                params={"cursor": first["next_cursor"]},
            )
        ).status_code == 422
        app.dependency_overrides[get_current_user] = lambda: {"id": str(foreign)}
        assert (await client.get(base, params={"cursor": first["next_cursor"]})).status_code == 422


async def test_treatment_saved_variant_snapshots(treatment_db):
    pool, owner, foreign, patient = treatment_db
    base = f"/api/patients/{patient}/dental-treatments"
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://testserver"
    ) as client:
        saved = []
        for variant in ("REST-CROWN-MC", "REST-CROWN-ZIR"):
            body = {
                "id": str(uuid4()),
                "operation_id": str(uuid4()),
                "expected_revision": 0,
                "variant_id": variant,
                "dentition": "permanent",
                "teeth": [{"tooth_fdi": 16}],
            }
            response = await client.post(base, json=body)
            assert response.status_code == 201
            snapshot = response.json()["committed"]
            saved.append(snapshot)
            assert (await client.get(f"{base}/{snapshot['id']}")).json() == snapshot
            assert (
                await client.post(base, json={**body, "operation_id": str(uuid4())})
            ).status_code == 409
        assert {row["clinical_type"] for row in saved} == {"crown"}
        assert {row["label_es"] for row in saved} == {"Corona metal-cerámica", "Corona zirconio"}
        assert (await client.get(base)).json()["total"] == 2


async def test_anatomical_scope_http_validation(monkeypatch):
    from backend.patients import treatment_service

    calls = []

    async def capture(owner, patient, identifier, body):
        calls.append(body.model_dump(mode="json"))
        return {"committed": calls[-1]}, True

    monkeypatch.setattr(treatment_service, "execute", capture)
    app.dependency_overrides[get_current_user] = lambda: {"id": str(uuid4())}
    base = f"/api/patients/{uuid4()}/dental-treatments"
    bridge = {
        "id": str(uuid4()),
        "operation_id": str(uuid4()),
        "expected_revision": 0,
        "variant_id": "REST-BRIDGE-MC",
        "dentition": "permanent",
        "teeth": [{"tooth_fdi": 16, "role": "pillar"}, {"tooth_fdi": 15, "role": "pontic"}],
    }
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="https://testserver"
        ) as client:
            response = await client.post(base, json=bridge)
            assert response.status_code == 201, response.text
            assert [m["tooth_fdi"] for m in calls[-1]["teeth"]] == [15, 16]
            for variant in ("REST-SPLINT-PERIO", "PERIO-SPLINT-RAR"):
                response = await client.post(
                    base,
                    json={
                        **bridge,
                        "variant_id": variant,
                        "teeth": [{"tooth_fdi": 11}, {"tooth_fdi": 21}],
                    },
                )
                assert response.status_code == 201, response.text
            for dentition in ("permanent", "primary"):
                response = await client.post(
                    base,
                    json={
                        **bridge,
                        "variant_id": "REST-SPLINT-OCC",
                        "dentition": dentition,
                        "teeth": [],
                        "arch": "upper",
                    },
                )
                assert response.status_code == 201, response.text
                assert calls[-1]["teeth"] == [] and calls[-1]["arch"] == "upper"
            count = len(calls)
            for change in (
                {"teeth": bridge["teeth"][:1]},
                {"teeth": [bridge["teeth"][0], bridge["teeth"][0]]},
                {
                    "teeth": [
                        {"tooth_fdi": 16, "role": "pillar"},
                        {"tooth_fdi": 46, "role": "pontic"},
                    ]
                },
                {
                    "teeth": [
                        {"tooth_fdi": 16, "role": "pontic"},
                        {"tooth_fdi": 15, "role": "pontic"},
                    ]
                },
                {"teeth": [{"tooth_fdi": 16}, {"tooth_fdi": 15}]},
                {"dentition": "primary"},
                {"arch": "upper"},
                {"variant_id": "ORTO-BRACK"},
                {"variant_id": "REST-SPLINT-OCC", "arch": "upper"},
                {"variant_id": "REST-SPLINT-OCC", "teeth": []},
                {"variant_id": "REST-SPLINT-OCC", "teeth": [], "arch": "mouth"},
                {
                    "teeth": [
                        {"tooth_fdi": 16, "role": "pillar", "surfaces": ["M"]},
                        bridge["teeth"][1],
                    ]
                },
                {"variant_id": "REST-SPLINT-PERIO"},
            ):
                assert (await client.post(base, json={**bridge, **change})).status_code == 422
            assert len(calls) == count
    finally:
        app.dependency_overrides.pop(get_current_user, None)


async def test_scope_expansion_preserves_old_single_tooth_receipt_hash():
    from backend.patients.treatment_service import execute
    from backend.patients.treatments import CreateTreatment

    body = {
        "id": str(uuid4()),
        "operation_id": str(uuid4()),
        "expected_revision": 0,
        "variant_id": "ORTO-BRACK",
        "dentition": "permanent",
        "teeth": [{"tooth_fdi": 16, "role": "tooth", "surfaces": []}],
        "note": None,
    }

    async def old_receipt(owner, patient, identifier, action, payload):
        assert payload == body
        return {"old": "receipt"}, False

    assert await execute(
        uuid4(),
        uuid4(),
        UUID(body["id"]),
        CreateTreatment.model_validate(body),
        adapter=old_receipt,
    ) == ({"old": "receipt"}, False)


async def test_multi_arch_atomic_reads_replay_and_rollback(treatment_db, monkeypatch):
    from backend.db import patient_treatments_repo as repo

    pool, owner, foreign, patient = treatment_db
    base = f"/api/patients/{patient}/dental-treatments"
    body = {
        "id": str(uuid4()),
        "operation_id": str(uuid4()),
        "expected_revision": 0,
        "variant_id": "REST-BRIDGE-ZIR",
        "dentition": "permanent",
        "teeth": [
            {"tooth_fdi": 16, "role": "pillar"},
            {"tooth_fdi": 15, "role": "pontic"},
            {"tooth_fdi": 14, "role": "pillar"},
        ],
    }
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://testserver"
    ) as client:
        for change in (
            {"teeth": body["teeth"][:1]},
            {"teeth": [body["teeth"][0], body["teeth"][0]]},
            {"teeth": [{"tooth_fdi": 16, "role": "pillar"}, {"tooth_fdi": 36, "role": "pontic"}]},
            {"teeth": [{"tooth_fdi": 16}, {"tooth_fdi": 15}]},
            {"dentition": "primary"},
            {"variant_id": "REST-SPLINT-OCC", "teeth": []},
        ):
            assert (await client.post(base, json={**body, **change})).status_code == 422
        async with pool.acquire() as conn:
            for table in (
                "patient_dental_treatments",
                "patient_dental_treatment_teeth",
                "patient_dental_treatment_revisions",
                "patient_clinical_commands",
            ):
                assert (
                    await conn.fetchval(
                        f"SELECT count(*) FROM {table} WHERE patient_id=$1", patient
                    )
                    == 0
                )
        response = await client.post(base, json=body)
        assert response.status_code == 201, response.text
        receipt = response.json()
        assert [m["role"] for m in receipt["committed"]["teeth"]] == ["pillar", "pontic", "pillar"]
        assert (
            await client.post(base, json={**body, "teeth": list(reversed(body["teeth"]))})
        ).json() == receipt
        arch = {
            **body,
            "id": str(uuid4()),
            "operation_id": str(uuid4()),
            "variant_id": "REST-SPLINT-OCC",
            "teeth": [],
            "arch": "lower",
        }
        response = await client.post(base, json=arch)
        assert response.status_code == 201, response.text
        snapshot = response.json()["committed"]
        assert snapshot["arch"] == "lower" and snapshot["teeth"] == []
        assert (await client.get(f"{base}/{arch['id']}")).json() == snapshot
        assert (await client.get(base)).json()["total"] == 2
        app.dependency_overrides[get_current_user] = lambda: {"id": str(foreign)}
        assert (await client.get(f"{base}/{arch['id']}")).status_code == 404
        assert (await client.post(base, json=arch)).status_code == 404
        app.dependency_overrides[get_current_user] = lambda: {"id": str(owner)}
        original = repo._revision

        async def fail(*args, **kwargs):
            raise RuntimeError("Injected multi-member revision failure")

        monkeypatch.setattr(repo, "_revision", fail)
        failed = {**body, "id": str(uuid4()), "operation_id": str(uuid4())}
        with pytest.raises(RuntimeError):
            await client.post(base, json=failed)
        monkeypatch.setattr(repo, "_revision", original)
        async with pool.acquire() as conn:
            for table in (
                "patient_dental_treatments",
                "patient_dental_treatment_teeth",
                "patient_dental_treatment_revisions",
                "patient_clinical_commands",
            ):
                expected = 3 if table == "patient_dental_treatment_teeth" else 2
                assert (
                    await conn.fetchval(
                        f"SELECT count(*) FROM {table} WHERE patient_id=$1", patient
                    )
                    == expected
                )
        assert (await client.post(base, json=failed)).status_code == 201
