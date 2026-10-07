"""Plan authoring through authenticated HTTP and an isolated PostgreSQL aggregate."""

import asyncio
import os
from uuid import UUID, uuid4

import asyncpg
import pytest
from fastapi.encoders import jsonable_encoder
from httpx import ASGITransport, AsyncClient, Response

from backend.auth.dependencies import get_current_user
from backend.main import app


async def test_plan_auth_and_strict_payloads() -> None:
    base = f"/api/patients/{uuid4()}/clinical-plans"
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://testserver"
    ) as client:
        assert (await client.get(base)).status_code == 401
        assert (
            await client.post(
                f"{base}/{uuid4()}/items/{uuid4()}/stages/{uuid4()}/complete", json=command(1)
            )
        ).status_code == 401
        app.dependency_overrides[get_current_user] = lambda: {"id": str(uuid4())}
        try:
            body = {"id": str(uuid4()), "operation_id": str(uuid4()), "expected_revision": 0}
            for change in (
                {"owner_user_id": str(uuid4())},
                {"expected_revision": True},
                {"title": "x" * 201},
            ):
                assert (await client.post(base, json={**body, **change})).status_code == 422
        finally:
            app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
async def plan_db(monkeypatch):
    url = os.environ.get("TREATMENT_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Requires isolated migrated TREATMENT_TEST_DATABASE_URL")
    from backend.db import patient_clinical_plans_repo as repo
    from backend.db import patient_treatments_repo as treatments

    pool = await asyncpg.create_pool(url, min_size=1, max_size=5)
    monkeypatch.setattr(repo, "get_pg_pool", lambda: pool)
    monkeypatch.setattr(treatments, "get_pg_pool", lambda: pool)
    owner, foreign, patient = uuid4(), uuid4(), uuid4()
    async with pool.acquire() as conn:
        for user in (owner, foreign):
            await conn.execute(
                "INSERT INTO users(id,email,password_hash) VALUES($1,$2,'not-a-login')",
                user,
                f"{user}@example.test",
            )
        await conn.execute(
            "INSERT INTO patients(id,owner_user_id,first_name,last_name,rut_number,rut_dv) VALUES($1,$2,'Synthetic','Plan',11111111,'1')",
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


def command(revision: int, **fields):
    return {"operation_id": str(uuid4()), "expected_revision": revision, **fields}


async def seed_historical_plan(patient: UUID, body: dict) -> Response:
    """Seed pre-retirement evidence through the aggregate, never the retired HTTP entry."""
    from backend.patients import clinical_plan_service
    from backend.patients.clinical_plans import CreatePlan

    owner = UUID(app.dependency_overrides[get_current_user]()["id"])
    command_body = CreatePlan.model_validate(body)
    receipt, created = await clinical_plan_service.execute(
        owner, patient, command_body.id, "create", command_body
    )
    return Response(201 if created else 200, json=jsonable_encoder(receipt))


async def active_plan(client: AsyncClient, patient: UUID, stages: int = 2):
    base = f"/api/patients/{patient}/clinical-plans"
    identifier = str(uuid4())
    assert (await seed_historical_plan(patient, body=command(0, id=identifier))).status_code == 201
    path = f"{base}/{identifier}"
    response = await client.post(
        f"{path}/items",
        json=command(
            1,
            id=str(uuid4()),
            treatment={
                "id": str(uuid4()),
                "variant_id": "ORTO-BRACK",
                "dentition": "permanent",
                "teeth": [{"tooth_fdi": 16}],
            },
            stages=[{"label": f"Sesión {i + 1}"} for i in range(stages)],
        ),
    )
    assert response.status_code == 201, response.text
    assert (await client.post(f"{path}/confirm", json=command(2))).status_code == 200
    response = await client.post(f"{path}/accept", json=command(3))
    assert response.status_code == 200
    return path, response.json()["committed"]


@pytest.mark.parametrize("last_action", ["complete", "cancel"])
async def test_execution_partial_completion_replay_note_and_correction(plan_db, last_action):
    pool, owner, _, patient = plan_db
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://testserver"
    ) as client:
        path, plan = await active_plan(client, patient)
        item = plan["items"][0]
        stages = f"{path}/items/{item['id']}/stages"
        payload = command(4, clinical_note_body="Evidencia clínica sintética")
        result = await client.post(f"{stages}/{item['stages'][0]['id']}/complete", json=payload)
        assert result.status_code == 200, result.text
        partial = result.json()["committed"]
        assert partial["state"] == "active"
        assert partial["items"][0]["status"] == "pending"
        assert partial["items"][0]["treatment"]["state"] == "planned"
        evidence = partial["items"][0]["stages"][0]
        assert evidence["completed_by"] == str(owner) and evidence["completed_at"]
        assert evidence["clinical_note"]["body"] == payload["clinical_note_body"]
        assert any(r["kind"] == "clinical_note" for r in result.json()["changed_resources"])
        final = await client.post(
            f"{stages}/{item['stages'][1]['id']}/{last_action}", json=command(5)
        )
        assert final.status_code == 200, final.text
        completed = final.json()["committed"]
        assert completed["state"] == "completed"
        assert completed["items"][0]["status"] == "completed"
        assert completed["items"][0]["treatment"]["state"] == "performed"
        assert completed["items"][0]["stages"][0] == evidence
        assert (
            await client.post(f"{stages}/{item['stages'][0]['id']}/complete", json=payload)
        ).json() == result.json()
        assert (
            await client.post(
                f"{stages}/{item['stages'][0]['id']}/complete",
                json={**payload, "clinical_note_body": "Changed"},
            )
        ).status_code == 409
        treatment_path = f"/api/patients/{patient}/dental-treatments/{item['treatment_id']}"
        correction = command(
            completed["items"][0]["treatment"]["revision"],
            expected_plan_revision=6,
            reason="Registro equivocado",
            replacement={
                "id": str(uuid4()),
                "variant_id": "ORTO-BRACK",
                "dentition": "permanent",
                "teeth": [{"tooth_fdi": 17}],
            },
        )
        corrected = await client.post(f"{treatment_path}/corrections", json=correction)
        assert corrected.status_code == 201, corrected.text
        assert corrected.json()["committed"]["state"] == "entered_in_error"
        current = (await client.get(path)).json()
        assert current["state"] == "completed" and current["revision"] == 7
        assert current["items"][0]["stages"] == completed["items"][0]["stages"]
        assert corrected.json()["committed_plan"] == current
        original_history = (await client.get(f"{treatment_path}/revisions")).json()["items"]
        assert (
            original_history[0]["after"]["execution"]["stages"] == completed["items"][0]["stages"]
        )
        replacement = (
            await client.get(
                f"/api/patients/{patient}/dental-treatments/{correction['replacement']['id']}"
            )
        ).json()
        assert (
            replacement["state"] == "performed" and replacement["provenance"] == "planned_in_clinic"
        )
        assert replacement["supersedes_id"] == item["treatment_id"]
        replacement_history = (
            await client.get(
                f"/api/patients/{patient}/dental-treatments/{replacement['id']}/revisions"
            )
        ).json()
        assert replacement_history["items"][0]["after"]["execution"]["plan_id"] == completed["id"]
        assert (
            await client.post(f"{treatment_path}/corrections", json=correction)
        ).json() == corrected.json()
        assert (await client.post(f"{path}/reopen", json=command(7))).status_code == 409
        assert (await client.post(f"{path}/archive", json=command(7))).status_code == 200
    async with pool.acquire() as conn:
        assert (
            await conn.fetchval(
                "SELECT count(*) FROM patient_dental_clinical_notes WHERE patient_id=$1", patient
            )
            == 1
        )
        assert (
            await conn.fetchval(
                "SELECT count(*) FROM patient_dental_clinical_note_revisions WHERE patient_id=$1",
                patient,
            )
            == 1
        )


async def test_execution_all_cancelled_denominator_closure_and_reactivation(plan_db):
    _, _, _, patient = plan_db
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://testserver"
    ) as client:
        path, plan = await active_plan(client, patient)
        item = plan["items"][0]
        for revision, stage in enumerate(item["stages"], 4):
            result = await client.post(
                f"{path}/items/{item['id']}/stages/{stage['id']}/cancel",
                json=command(revision, reason="No se realizará"),
            )
            assert result.status_code == 200, result.text
        current = result.json()["committed"]
        assert current["state"] == "active" and current["items"][0]["status"] == "cancelled"
        assert current["items"][0]["treatment"]["state"] == "cancelled"
        assert all(
            s["completed_at"] is None and s["cancelled_at"] for s in current["items"][0]["stages"]
        )
        assert (
            await client.post(f"{path}/close", json=command(6, reason="cancelled_by_clinic"))
        ).status_code == 200
        reopened = await client.post(f"{path}/reactivate", json=command(7))
        assert reopened.status_code == 200
        assert reopened.json()["committed"]["items"] == current["items"]


async def test_execution_concurrent_closure_owner_and_note_rollback(plan_db, monkeypatch):
    from backend.db import patient_clinical_plans_repo as repo

    pool, _, foreign, patient = plan_db
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://testserver"
    ) as client:
        path, plan = await active_plan(client, patient, stages=1)
        item = plan["items"][0]
        endpoint = f"{path}/items/{item['id']}/stages/{item['stages'][0]['id']}/complete"
        payload = command(4, clinical_note_body="Atomic note")
        write_note = repo._execution_note

        async def fail(*args, **kwargs):
            await write_note(*args, **kwargs)
            raise RuntimeError("Injected note failure")

        with monkeypatch.context() as patch:
            patch.setattr(repo, "_execution_note", fail)
            with pytest.raises(RuntimeError):
                await client.post(endpoint, json=payload)
        assert (await client.get(path)).json() == plan
        async with pool.acquire() as conn:
            assert (
                await conn.fetchval(
                    "SELECT count(*) FROM patient_dental_clinical_notes WHERE patient_id=$1",
                    patient,
                )
                == 0
            )
            assert (
                await conn.fetchval(
                    "SELECT count(*) FROM patient_dental_clinical_note_revisions WHERE patient_id=$1",
                    patient,
                )
                == 0
            )
        results = await asyncio.gather(
            client.post(endpoint, json=payload),
            client.post(f"{path}/close", json=command(4, reason="other")),
        )
        assert sorted(r.status_code for r in results) == [200, 409]
        current = (await client.get(path)).json()
        assert current["revision"] == 5
        assert (current["state"], current["items"][0]["treatment"]["state"]) in [
            ("closed", "planned"),
            ("completed", "performed"),
        ]
        app.dependency_overrides[get_current_user] = lambda: {"id": str(foreign)}
        denied = await client.post(endpoint, json=payload)
        assert denied.status_code == 404 and "latest" not in denied.text
    async with pool.acquire() as conn:
        assert (
            await conn.fetchval(
                "SELECT count(*) FROM patient_clinical_commands WHERE patient_id=$1", patient
            )
            == 5
        )


async def test_execution_cancelled_item_prevents_auto_completion_and_concurrent_replay(plan_db):
    pool, _, _, patient = plan_db
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://testserver"
    ) as client:
        path, plan = await active_plan(client, patient, stages=1)
        second = await client.post(
            f"{path}/items",
            json=command(
                4,
                id=str(uuid4()),
                treatment={
                    "id": str(uuid4()),
                    "variant_id": "ORTO-BRACK",
                    "dentition": "permanent",
                    "teeth": [{"tooth_fdi": 17}],
                },
            ),
        )
        assert second.status_code == 201
        first, last = second.json()["committed"]["items"]
        cancel = f"{path}/items/{first['id']}/stages/{first['stages'][0]['id']}/cancel"
        assert (await client.post(cancel, json=command(5))).status_code == 200
        endpoint = f"{path}/items/{last['id']}/stages/{last['stages'][0]['id']}/complete"
        payload = command(6, clinical_note_body="   ")
        responses = await asyncio.gather(*(client.post(endpoint, json=payload) for _ in range(2)))
        assert [r.status_code for r in responses] == [200, 200]
        assert responses[0].json() == responses[1].json()
        current = (await client.get(path)).json()
        assert current["state"] == "active"
        assert [i["status"] for i in current["items"]] == ["cancelled", "completed"]
        assert current["revision"] == 7
        assert (await client.post(endpoint, json=command(7))).status_code == 409
        assert (await client.post(f"{path}/archive", json=command(7))).status_code == 409
    async with pool.acquire() as conn:
        assert (
            await conn.fetchval(
                "SELECT count(*) FROM patient_dental_clinical_notes WHERE patient_id=$1", patient
            )
            == 0
        )
        assert (
            await conn.fetchval(
                "SELECT count(*) FROM patient_clinical_commands WHERE patient_id=$1", patient
            )
            == 7
        )


@pytest.mark.parametrize("state", ["draft", "pending", "completed", "closed", "archived"])
async def test_execution_denied_states_and_strict_payloads(plan_db, state):
    pool, _, _, patient = plan_db
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://testserver"
    ) as client:
        path, plan = await active_plan(client, patient, stages=1)
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE patient_clinical_plans SET state=$2 WHERE id=$1", UUID(plan["id"]), state
            )
        item = plan["items"][0]
        endpoint = f"{path}/items/{item['id']}/stages/{item['stages'][0]['id']}"
        for action in ("complete", "cancel"):
            assert (await client.post(f"{endpoint}/{action}", json=command(4))).status_code == 409
        for extra in (
            {"completed_by": str(uuid4())},
            {"clinical_note_body": "x" * 4001},
            {"expected_revision": True},
        ):
            assert (
                await client.post(f"{endpoint}/complete", json=command(4, **extra))
            ).status_code == 422
        assert (
            await client.post(f"{path}/items/{uuid4()}/stages/{uuid4()}/complete", json=command(4))
        ).status_code == 404
        assert (await client.get(path)).json()["revision"] == 4


async def test_execution_linked_correction_race_revision_and_rollback(plan_db, monkeypatch):
    from backend.db import patient_clinical_plans_repo as repo

    _, _, _, patient = plan_db
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://testserver"
    ) as client:
        path, plan = await active_plan(client, patient, stages=2)
        item = plan["items"][0]
        correction_path = (
            f"/api/patients/{patient}/dental-treatments/{item['treatment_id']}/corrections"
        )
        assert (
            await client.post(correction_path, json=command(1, reason="Error"))
        ).status_code == 422
        assert (
            await client.post(
                correction_path, json=command(1, reason="Error", expected_plan_revision=3)
            )
        ).status_code == 409
        payload = command(1, reason="Error", expected_plan_revision=4)

        async def fail(*args, **kwargs):
            raise RuntimeError("Injected linked correction history failure")

        with monkeypatch.context() as patch:
            patch.setattr(repo, "_revision", fail)
            with pytest.raises(RuntimeError):
                await client.post(correction_path, json=payload)
        assert (await client.get(path)).json() == plan
        endpoint = f"{path}/items/{item['id']}/stages/{item['stages'][0]['id']}/complete"
        results = await asyncio.gather(
            client.post(correction_path, json=payload), client.post(endpoint, json=command(4))
        )
        assert sorted(r.status_code for r in results) in ([200, 409], [201, 409])
        current = (await client.get(path)).json()
        assert current["state"] == "active" and current["revision"] == 5
        if current["items"][0]["treatment"]["state"] == "entered_in_error":
            assert (await client.post(endpoint, json=command(5))).status_code == 409
            assert all(s["status"] == "pending" for s in current["items"][0]["stages"])
        else:
            assert current["items"][0]["stages"][0]["status"] == "completed"


async def test_draft_atomic_authoring_reload_replay_owner(plan_db, monkeypatch) -> None:
    from backend.db import patient_clinical_plans_repo as repo

    pool, owner, foreign, patient = plan_db
    base = f"/api/patients/{patient}/clinical-plans"
    identifier = str(uuid4())
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://testserver"
    ) as client:
        create = command(0, id=identifier, title="Plan clínico")
        response = await seed_historical_plan(patient, body=create)
        assert response.status_code == 201, response.text
        path = f"{base}/{identifier}"
        assert (await seed_historical_plan(patient, body=create)).json() == response.json()
        add = command(
            1,
            id=str(uuid4()),
            treatment={
                "id": str(uuid4()),
                "variant_id": "ORTO-BRACK",
                "dentition": "permanent",
                "teeth": [{"tooth_fdi": 16}],
            },
            stages=[{"label": "Preparación"}, {"label": "Colocación"}],
        )
        saved = await client.post(f"{path}/items", json=add)
        assert saved.status_code == 201, saved.text
        assert (await client.post(f"{path}/items", json=add)).json() == saved.json()
        first = saved.json()["committed"]["items"][0]
        assert first["treatment"]["state"] == "planned"
        assert first["treatment"]["provenance"] == "planned_in_clinic"
        assert [s["label"] for s in first["stages"]] == ["Preparación", "Colocación"]
        second = {
            **add,
            **command(2, id=str(uuid4())),
            "treatment": {**add["treatment"], "id": str(uuid4())},
            "stages": [{"label": "Sesión única"}],
        }
        assert (await client.post(f"{path}/items", json=second)).status_code == 201
        order = command(3, item_ids=[second["id"], add["id"]])
        assert (await client.post(f"{path}/reorder", json=order)).status_code == 200
        stage = first["stages"][0]
        assert (
            await client.patch(
                f"{path}/items/{add['id']}/stages/{stage['id']}",
                json=command(4, label="Preparación revisada", note="Manual"),
            )
        ).status_code == 200
        snapshot = (await client.get(path)).json()
        assert [i["id"] for i in snapshot["items"]] == order["item_ids"]
        assert snapshot["items"][1]["stages"][0]["label"] == "Preparación revisada"
        assert (await client.get(base)).json()["total"] == 1
        stale = await client.patch(path, json=command(1, title="Local"))
        assert stale.status_code == 409
        assert stale.json()["detail"]["latest"]["revision"] == 5

        async def fail(*args, **kwargs):
            raise RuntimeError("Injected revision failure")

        with monkeypatch.context() as patch:
            patch.setattr(repo, "_revision", fail)
            with pytest.raises(RuntimeError):
                await client.post(
                    f"{path}/items",
                    json={
                        **second,
                        **command(5, id=str(uuid4())),
                        "treatment": {**second["treatment"], "id": str(uuid4())},
                    },
                )
        assert (await client.get(path)).json() == snapshot
        app.dependency_overrides[get_current_user] = lambda: {"id": str(foreign)}
        for endpoint in (base, path, f"{path}/revisions"):
            assert (await client.get(endpoint)).status_code == 404
        assert (await client.post(f"{path}/items", json=add)).status_code == 404
    async with pool.acquire() as conn:
        assert (
            await conn.fetchval(
                "SELECT count(*) FROM patient_dental_treatments WHERE patient_id=$1", patient
            )
            == 2
        )
        assert (
            await conn.fetchval(
                "SELECT count(*) FROM patient_clinical_plan_stages WHERE patient_id=$1", patient
            )
            == 3
        )


async def test_concurrent_item_uuid_collision_has_no_orphan_procedure(plan_db) -> None:
    pool, _, _, patient = plan_db
    base = f"/api/patients/{patient}/clinical-plans"
    plans = [str(uuid4()), str(uuid4())]
    item_id = str(uuid4())
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://testserver"
    ) as client:
        for plan in plans:
            await seed_historical_plan(patient, body=command(0, id=plan))
        responses = await asyncio.gather(
            *(
                client.post(
                    f"{base}/{plan}/items",
                    json=command(
                        1,
                        id=item_id,
                        treatment={
                            "id": str(uuid4()),
                            "variant_id": "ORTO-BRACK",
                            "dentition": "permanent",
                            "teeth": [{"tooth_fdi": 16}],
                        },
                    ),
                )
                for plan in plans
            )
        )
        assert sorted(response.status_code for response in responses) == [201, 404]
        snapshots = [(await client.get(f"{base}/{plan}")).json() for plan in plans]
        assert sorted(len(plan["items"]) for plan in snapshots) == [0, 1]
    async with pool.acquire() as conn:
        assert (
            await conn.fetchval(
                "SELECT count(*) FROM patient_dental_treatments WHERE patient_id=$1", patient
            )
            == 1
        )
        assert (
            await conn.fetchval(
                "SELECT count(*) FROM patient_clinical_commands WHERE patient_id=$1", patient
            )
            == 3
        )


async def test_plan_lifecycle_replay_reasons_and_owner(plan_db) -> None:
    pool, owner, foreign, patient = plan_db
    base = f"/api/patients/{patient}/clinical-plans"
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://testserver"
    ) as client:
        identifier = str(uuid4())
        await seed_historical_plan(patient, body=command(0, id=identifier))
        path = f"{base}/{identifier}"
        assert (await client.post(f"{path}/confirm", json=command(1))).status_code == 409
        add = command(
            1,
            id=str(uuid4()),
            treatment={
                "id": str(uuid4()),
                "variant_id": "ORTO-BRACK",
                "dentition": "permanent",
                "teeth": [{"tooth_fdi": 16}],
            },
        )
        assert (await client.post(f"{path}/items", json=add)).status_code == 201
        confirm = command(2)
        confirmed = await client.post(f"{path}/confirm", json=confirm)
        assert confirmed.status_code == 200, confirmed.text
        assert confirmed.json()["committed"]["confirmed_by"] == str(owner)
        assert confirmed.json()["committed"]["confirmed_at"]
        assert (await client.post(f"{path}/reopen", json=command(3))).status_code == 200
        assert (await client.post(f"{path}/confirm", json=command(4))).status_code == 200
        acceptance = command(5, note="Aceptación clínica registrada manualmente")
        accepted = await client.post(f"{path}/accept", json=acceptance)
        assert accepted.status_code == 200, accepted.text
        active = accepted.json()["committed"]
        assert active["state"] == "active" and active["accepted_by"] == str(owner)
        assert active["accepted_at"] and active["acceptance_note"] == acceptance["note"]
        assert (await client.post(f"{path}/confirm", json=confirm)).json() == confirmed.json()
        assert (await client.post(f"{path}/close", json=command(6))).status_code == 422
        closure = command(6, reason="expired", note="Revisión pendiente")
        closed = await client.post(f"{path}/close", json=closure)
        assert closed.status_code == 200, closed.text
        assert closed.json()["committed"]["closure_reason"] == "expired"
        assert (await client.patch(path, json=command(7, title="Not editable"))).status_code == 409
        assert (await client.post(f"{path}/reactivate", json=command(7))).status_code == 200
        current = (await client.get(path)).json()
        assert current["state"] == "draft" and current["closed_at"] is None
        assert current["items"] == active["items"]
        assert (await client.post(f"{path}/close", json=closure)).json() == closed.json()
        changed = await client.post(f"{path}/close", json={**closure, "reason": "other"})
        assert changed.status_code == 409
        history = (await client.get(f"{path}/revisions")).json()
        assert history["items"][1]["after"]["closure_reason"] == "expired"
        assert history["items"][1]["actor"]["user_id"] == str(owner)
        app.dependency_overrides[get_current_user] = lambda: {"id": str(foreign)}
        for action in ("confirm", "accept", "reopen", "close", "reactivate", "archive"):
            body = command(8, reason="other") if action == "close" else command(8)
            assert (await client.post(f"{path}/{action}", json=body)).status_code == 404


@pytest.mark.parametrize("state", ["draft", "pending", "active", "completed", "closed", "archived"])
async def test_every_lifecycle_edge_and_read_only_state(plan_db, state) -> None:
    pool, owner, _, patient = plan_db
    allowed = {
        "confirm": {"draft"},
        "accept": {"pending"},
        "reopen": {"pending"},
        "close": {"draft", "pending", "active"},
        "reactivate": {"closed"},
        "archive": {"completed"},
    }
    targets = {
        "confirm": "pending",
        "accept": "active",
        "reopen": "draft",
        "close": "closed",
        "reactivate": "draft",
        "archive": "archived",
    }
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://testserver"
    ) as client:
        for action, sources in allowed.items():
            identifier = uuid4()
            base = f"/api/patients/{patient}/clinical-plans"
            await seed_historical_plan(patient, body=command(0, id=str(identifier)))
            path = f"{base}/{identifier}"
            await client.post(
                f"{path}/items",
                json=command(
                    1,
                    id=str(uuid4()),
                    treatment={
                        "id": str(uuid4()),
                        "variant_id": "ORTO-BRACK",
                        "dentition": "permanent",
                        "teeth": [{"tooth_fdi": 16}],
                    },
                ),
            )
            # Seed lifecycle state only; this test does not claim staged-execution proof.
            async with pool.acquire() as conn:
                await conn.execute(
                    "UPDATE patient_clinical_plans SET state=$2 WHERE id=$1", identifier, state
                )
            payload = command(2, reason="other") if action == "close" else command(2)
            response = await client.post(f"{path}/{action}", json=payload)
            assert response.status_code == (200 if state in sources else 409), response.text
            snapshot = (await client.get(path)).json()
            assert snapshot["state"] == (targets[action] if state in sources else state)
            assert snapshot["revision"] == (3 if state in sources else 2)
            if state in ("completed", "closed", "archived") and action != "reactivate":
                assert (
                    await client.patch(
                        path, json=command(snapshot["revision"], title="Local draft")
                    )
                ).status_code == 409


async def test_plan_scope_paging_and_completed_session_immutability(plan_db) -> None:
    pool, _, foreign, patient = plan_db
    base = f"/api/patients/{patient}/clinical-plans"
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://testserver"
    ) as client:
        identifiers = [str(uuid4()), str(uuid4())]
        for identifier in identifiers:
            assert (
                await seed_historical_plan(patient, body=command(0, id=identifier))
            ).status_code == 201
        page = (await client.get(base, params={"limit": 1})).json()
        assert page["total"] == 2 and page["next_cursor"]
        second = (await client.get(base, params={"limit": 1, "cursor": page["next_cursor"]})).json()
        assert page["items"][0]["id"] != second["items"][0]["id"]
        assert (
            await client.get(base, params={"state": "draft", "cursor": page["next_cursor"]})
        ).status_code == 422
        path = f"{base}/{identifiers[0]}"
        for revision, treatment in enumerate(
            [
                {
                    "id": str(uuid4()),
                    "variant_id": "REST-BRIDGE-ZIR",
                    "dentition": "permanent",
                    "teeth": [
                        {"tooth_fdi": 14, "role": "pillar"},
                        {"tooth_fdi": 15, "role": "pontic"},
                        {"tooth_fdi": 16, "role": "pillar"},
                    ],
                },
                {
                    "id": str(uuid4()),
                    "variant_id": "REST-SPLINT-OCC",
                    "dentition": "primary",
                    "arch": "lower",
                    "teeth": [],
                },
            ],
            1,
        ):
            response = await client.post(
                f"{path}/items", json=command(revision, id=str(uuid4()), treatment=treatment)
            )
            assert response.status_code == 201, response.text
        plan = (await client.get(path)).json()
        item = plan["items"][0]
        stage_id = item["stages"][0]["id"]
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE patient_clinical_plan_stages SET status='completed',completed_at=now(),completed_by=owner_user_id WHERE id=$1",
                UUID(stage_id),
            )
        invalid = await client.patch(
            f"{path}/items/{item['id']}/stages/{stage_id}",
            json=command(3, label="Rewritten evidence"),
        )
        assert invalid.status_code == 409
        add = command(3, id=str(uuid4()), label="Nueva sesión", note="Pendiente")
        saved = await client.post(f"{path}/items/{item['id']}/stages", json=add)
        assert saved.status_code == 201, saved.text
        assert (
            await client.post(f"{path}/items/{item['id']}/stages", json=add)
        ).json() == saved.json()
        assert saved.json()["committed"]["items"][0]["stages"][0]["status"] == "completed"
        app.dependency_overrides[get_current_user] = lambda: {"id": str(foreign)}
        assert (await client.get(base, params={"cursor": page["next_cursor"]})).status_code == 422


async def test_plan_concurrent_close_edit_and_atomic_transition_rollback(
    plan_db, monkeypatch
) -> None:
    from backend.db import patient_clinical_plans_repo as repo

    pool, _, _, patient = plan_db
    base = f"/api/patients/{patient}/clinical-plans"
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://testserver"
    ) as client:
        identifier = str(uuid4())
        await seed_historical_plan(patient, body=command(0, id=identifier))
        path = f"{base}/{identifier}"
        close = command(1, reason="cancelled_by_clinic")
        edit = command(1, title="Concurrent local edit")
        results = await asyncio.gather(
            client.post(f"{path}/close", json=close), client.patch(path, json=edit)
        )
        assert sorted(r.status_code for r in results) == [200, 409]
        current = (await client.get(path)).json()
        assert current["revision"] == 2
        assert (await client.get(f"{path}/revisions")).json()["total"] == 2
        if current["state"] == "closed":
            rollback_command = command(2)
            endpoint = f"{path}/reactivate"
        else:
            rollback_command = command(2, reason="cancelled_by_clinic")
            endpoint = f"{path}/close"

        async def fail(*args, **kwargs):
            raise RuntimeError("Injected lifecycle history failure")

        with monkeypatch.context() as patch:
            patch.setattr(repo, "_revision", fail)
            with pytest.raises(RuntimeError):
                await client.post(endpoint, json=rollback_command)
        assert (await client.get(path)).json() == current
        result = await client.post(endpoint, json=rollback_command)
        assert result.status_code == 200
        assert (await client.post(endpoint, json=rollback_command)).json() == result.json()
    async with pool.acquire() as conn:
        assert (
            await conn.fetchval(
                "SELECT count(*) FROM patient_clinical_commands WHERE patient_id=$1", patient
            )
            == 3
        )
