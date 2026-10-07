"""Dental-note contracts through authenticated HTTP and real PostgreSQL."""

from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from backend.auth.dependencies import get_current_user
from backend.main import app
from backend.tests.test_patient_clinical_plans import active_plan, command, plan_db  # noqa: F401


async def test_dental_note_auth_and_templates() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://testserver"
    ) as client:
        assert (await client.get(f"/api/patients/{uuid4()}/clinical-notes")).status_code == 401
        app.dependency_overrides[get_current_user] = lambda: {"id": str(uuid4())}
        try:
            response = await client.get("/api/patients/clinical-note-templates?category=diagnosis")
            assert response.status_code == 200
            assert {t["id"] for t in response.json()["items"]} == {
                "diagnosis_caries",
                "diagnosis_periapical",
            }
            patient = str(uuid4())
            invalid = await client.post(
                f"/api/patients/{patient}/clinical-notes",
                json=command(
                    0,
                    id=str(uuid4()),
                    note_type="diagnosis",
                    entity_kind="patient",
                    entity_id=patient,
                    body="PRIVATE_SYNTHETIC_TEXT" * 201,
                ),
            )
            assert invalid.status_code == 422 and "PRIVATE_SYNTHETIC_TEXT" not in invalid.text
        finally:
            app.dependency_overrides.pop(get_current_user, None)


async def test_dental_note_create_edit_delete_replay_and_ownership(plan_db, monkeypatch) -> None:  # noqa: F811
    from backend.db import patient_clinical_notes_repo as repo

    pool, owner, foreign, patient = plan_db
    monkeypatch.setattr(repo, "get_pg_pool", lambda: pool)
    base = f"/api/patients/{patient}/clinical-notes"
    identifier = str(uuid4())
    payload = command(
        0,
        id=identifier,
        note_type="diagnosis",
        entity_kind="patient",
        entity_id=str(patient),
        body="Hallazgo sintético",
        dentition="permanent",
        tooth_fdi=16,
    )
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://testserver"
    ) as client:
        result = await client.post(base, json=payload)
        assert result.status_code == 201, result.text
        assert (await client.post(base, json=payload)).json() == result.json()
        assert (await client.post(base, json={**payload, "body": "Changed"})).status_code == 409
        path = f"{base}/{identifier}"
        for extra in ({"tooth_fdi": 17}, {"entity_id": str(uuid4())}, {"body": " "}):
            assert (
                await client.patch(path, json=command(1, **{"body": "Cambio", **extra}))
            ).status_code == 422
        edit = command(1, body="Texto revisado")
        updated = await client.patch(path, json=edit)
        assert updated.status_code == 200, updated.text
        assert updated.json()["committed"]["tooth_fdi"] == 16
        stale = await client.patch(path, json=command(1, body="Local"))
        assert (
            stale.status_code == 409
            and stale.json()["detail"]["latest"]["body"] == "Texto revisado"
        )
        deletion = command(2)
        deleted = await client.post(f"{path}/delete", json=deletion)
        assert deleted.status_code == 200
        assert (await client.post(f"{path}/delete", json=deletion)).json() == deleted.json()
        assert (await client.patch(path, json=edit)).json() == updated.json()
        assert (await client.get(base)).json()["total"] == 0
        assert len((await client.get(f"{path}/revisions")).json()["items"]) == 3
        app.dependency_overrides[get_current_user] = lambda: {"id": str(foreign)}
        assert (await client.get(path)).status_code == 404
        assert (await client.get(f"{path}/revisions")).status_code == 404


@pytest.mark.parametrize("bound", [False, True])
async def test_dental_note_twenty_item_pages(plan_db, monkeypatch, bound) -> None:  # noqa: F811
    from backend.db import patient_clinical_notes_repo as repo

    pool, _, _, patient = plan_db
    monkeypatch.setattr(repo, "get_pg_pool", lambda: pool)
    base = f"/api/patients/{patient}/clinical-notes"
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://testserver"
    ) as client:
        for index in range(21):
            anatomy = {"dentition": "permanent", "tooth_fdi": 16} if bound else {}
            response = await client.post(
                base,
                json=command(
                    0,
                    id=str(uuid4()),
                    note_type="diagnosis",
                    entity_kind="patient",
                    entity_id=str(patient),
                    body=f"Note {index}",
                    **anatomy,
                ),
            )
            assert response.status_code == 201, response.text
        first = (await client.get(base)).json()
        assert len(first["items"]) == 20 and first["total"] == 21
        second = (await client.get(base, params={"cursor": first["next_cursor"]})).json()
        assert len(second["items"]) == 1 and second["next_cursor"] is None
        assert not {n["id"] for n in first["items"]} & {n["id"] for n in second["items"]}


async def test_typed_note_links_and_atomic_rollback(plan_db, monkeypatch) -> None:  # noqa: F811
    from backend.db import patient_clinical_notes_repo as repo
    from backend.db import patient_notes_repo as general_notes

    pool, owner, foreign, patient = plan_db
    monkeypatch.setattr(repo, "get_pg_pool", lambda: pool)
    monkeypatch.setattr(general_notes, "get_pg_pool", lambda: pool)
    base = f"/api/patients/{patient}/clinical-notes"
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://testserver"
    ) as client:
        _, plan = await active_plan(client, patient)
        general_id = str(uuid4())
        general_path = f"/api/patients/{patient}/notes"
        general = await client.post(
            general_path, json={"id": general_id, "body": "Nota general conservada"}
        )
        assert general.status_code == 201
        for kind, note_type, entity in (
            ("treatment", "treatment", plan["items"][0]["treatment_id"]),
            ("plan", "treatment_plan", plan["id"]),
        ):
            payload = command(
                0,
                id=str(uuid4()),
                note_type=note_type,
                entity_kind=kind,
                entity_id=entity,
                body="Contexto sintético",
            )
            response = await client.post(base, json=payload)
            assert response.status_code == 201, response.text
            note = response.json()["committed"]
            assert note["entity_id"] == entity
            assert note["linked_teeth"] == ([16] if kind == "treatment" else [])
            assert (
                await client.post(
                    base,
                    json={
                        **payload,
                        "id": str(uuid4()),
                        "operation_id": str(uuid4()),
                        "entity_id": str(uuid4()),
                    },
                )
            ).status_code == 404
            app.dependency_overrides[get_current_user] = lambda: {"id": str(foreign)}
            assert (await client.get(f"{base}/{note['id']}")).status_code == 404
            app.dependency_overrides[get_current_user] = lambda: {"id": str(owner)}
        identifier, operation = uuid4(), uuid4()
        original = repo._record

        async def fail_snapshot(*args, **kwargs):
            raise RuntimeError("Injected snapshot failure after insertion")

        monkeypatch.setattr(repo, "_record", fail_snapshot)
        with pytest.raises(RuntimeError, match="Injected snapshot"):
            await client.post(
                base,
                json={
                    **command(
                        0,
                        id=str(identifier),
                        note_type="diagnosis",
                        entity_kind="patient",
                        entity_id=str(patient),
                        body="Rollback",
                    ),
                    "operation_id": str(operation),
                },
            )
        monkeypatch.setattr(repo, "_record", original)
        feed = (await client.get(base)).json()["items"]
        administrative = next(note for note in feed if note["id"] == general_id)
        assert (
            administrative["note_type"] == "administrative" and administrative["linked_teeth"] == []
        )
        assert (await client.get(f"{general_path}/{general_id}")).json()[
            "body"
        ] == "Nota general conservada"
        async with pool.acquire() as conn:
            assert (
                await conn.fetchval(
                    "SELECT count(*) FROM patient_dental_clinical_notes WHERE id=$1", identifier
                )
                == 0
            )
            assert (
                await conn.fetchval(
                    "SELECT count(*) FROM patient_dental_clinical_note_revisions WHERE note_id=$1",
                    identifier,
                )
                == 0
            )
            assert (
                await conn.fetchval(
                    "SELECT count(*) FROM patient_clinical_commands WHERE owner_user_id=$1 AND operation_id=$2",
                    owner,
                    operation,
                )
                == 0
            )
