"""Plan authoring through authenticated HTTP and an isolated PostgreSQL aggregate."""

import asyncio
import os
from uuid import UUID, uuid4

import asyncpg
import pytest
from httpx import ASGITransport, AsyncClient

from backend.auth.dependencies import get_current_user
from backend.main import app


async def test_plan_auth_and_strict_payloads() -> None:
    base = f"/api/patients/{uuid4()}/clinical-plans"
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://testserver"
    ) as client:
        assert (await client.get(base)).status_code == 401
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

    pool = await asyncpg.create_pool(url, min_size=1, max_size=5)
    monkeypatch.setattr(repo, "get_pg_pool", lambda: pool)
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


async def test_draft_atomic_authoring_reload_replay_owner(plan_db, monkeypatch) -> None:
    from backend.db import patient_clinical_plans_repo as repo

    pool, owner, foreign, patient = plan_db
    base = f"/api/patients/{patient}/clinical-plans"
    identifier = str(uuid4())
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://testserver"
    ) as client:
        create = command(0, id=identifier, title="Plan clínico")
        response = await client.post(base, json=create)
        assert response.status_code == 201, response.text
        path = f"{base}/{identifier}"
        assert (await client.post(base, json=create)).json() == response.json()
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
            await client.post(base, json=command(0, id=plan))
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
        await client.post(base, json=command(0, id=identifier))
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
            await client.post(base, json=command(0, id=str(identifier)))
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
            assert (await client.post(base, json=command(0, id=identifier))).status_code == 201
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
        await client.post(base, json=command(0, id=identifier))
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
