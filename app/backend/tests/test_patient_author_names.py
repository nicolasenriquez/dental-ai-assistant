"""Trusted professional display names resolved in owned author reads, with optional real PostgreSQL.

Every author-bearing read (conditions, notes, treatments, clinical notes, activity and
plan history) must expose the nullable users.professional_display_name when stored and
a distinguishable fallback when absent. Names never derive from email or patient data.
"""

import os
from uuid import uuid4

import asyncpg
import pytest
from httpx import ASGITransport, AsyncClient

from backend.auth.dependencies import get_current_user
from backend.main import app

NAME = "Dra. Camila Ríos"


@pytest.fixture
async def author_db(monkeypatch):
    url = os.environ.get("AUTHOR_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set AUTHOR_TEST_DATABASE_URL to an isolated migrated PostgreSQL database")
    from backend.db import (
        patient_activity_repo,
        patient_clinical_notes_repo,
        patient_clinical_plans_repo,
        patient_conditions_repo,
        patient_notes_repo,
        patient_treatments_repo,
    )

    pool = await asyncpg.create_pool(url, min_size=1, max_size=5)
    for module in (
        patient_activity_repo,
        patient_clinical_notes_repo,
        patient_clinical_plans_repo,
        patient_conditions_repo,
        patient_notes_repo,
        patient_treatments_repo,
    ):
        monkeypatch.setattr(module, "get_pg_pool", lambda: pool)
    owner, unnamed, patient, unnamed_patient = uuid4(), uuid4(), uuid4(), uuid4()
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO users(id,email,password_hash,professional_display_name) VALUES($1,$2,'not-a-login',$3)",
            owner,
            f"{owner}@example.test",
            NAME,
        )
        await conn.execute(
            "INSERT INTO users(id,email,password_hash) VALUES($1,$2,'not-a-login')",
            unnamed,
            f"{unnamed}@example.test",
        )
        await conn.execute(
            "INSERT INTO patients(id,owner_user_id,first_name,last_name,rut_number,rut_dv) VALUES($1,$2,'Synthetic','Author',11111111,'1')",
            patient,
            owner,
        )
        await conn.execute(
            "INSERT INTO patients(id,owner_user_id,first_name,last_name,rut_number,rut_dv) VALUES($1,$2,'Synthetic','Unnamed',11111112,'K')",
            unnamed_patient,
            unnamed,
        )
    app.dependency_overrides[get_current_user] = lambda: {"id": str(owner)}
    try:
        yield pool, owner, unnamed, patient, unnamed_patient
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        async with pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM patients WHERE id=ANY($1::uuid[])", [patient, unnamed_patient]
            )
            await conn.execute("DELETE FROM users WHERE id=ANY($1::uuid[])", [owner, unnamed])
        await pool.close()


async def test_named_authors_resolve_across_owned_reads(author_db):
    pool, owner, _, patient, _ = author_db
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://testserver"
    ) as client:
        condition = {
            "id": str(uuid4()),
            "dentition": "permanent",
            "tooth_fdi": 16,
            "condition_code": "caries",
            "surfaces": ["M"],
        }
        created = await client.post(f"/api/patients/{patient}/conditions", json=condition)
        assert created.status_code == 201, created.text
        assert created.json()["created_by"]["display_name"] == NAME
        assert created.json()["updated_by"]["display_name"] == NAME
        listed = await client.get(f"/api/patients/{patient}/conditions")
        assert listed.json()["items"][0]["created_by"]["display_name"] == NAME
        history = await client.get(
            f"/api/patients/{patient}/conditions/{condition['id']}/revisions"
        )
        assert history.json()["items"][0]["actor"]["display_name"] == NAME

        note = {"id": str(uuid4()), "body": "Nota general"}
        created_note = await client.post(f"/api/patients/{patient}/notes", json=note)
        assert created_note.status_code == 201, created_note.text
        assert created_note.json()["created_by"]["display_name"] == NAME
        notes = await client.get(f"/api/patients/{patient}/notes")
        assert notes.json()["items"][0]["created_by"]["display_name"] == NAME
        note_history = await client.get(f"/api/patients/{patient}/notes/{note['id']}/revisions")
        assert note_history.json()["items"][0]["actor"]["display_name"] == NAME

        treatment = {
            "id": str(uuid4()),
            "operation_id": str(uuid4()),
            "expected_revision": 0,
            "variant_id": "ORTO-BRACK",
            "dentition": "permanent",
            "teeth": [{"tooth_fdi": 16}],
        }
        created_treatment = await client.post(
            f"/api/patients/{patient}/dental-treatments", json=treatment
        )
        assert created_treatment.status_code == 201, created_treatment.text
        assert created_treatment.json()["committed"]["created_by"]["display_name"] == NAME
        treatments = await client.get(f"/api/patients/{patient}/dental-treatments")
        assert treatments.json()["items"][0]["created_by"]["display_name"] == NAME
        treatment_history = await client.get(
            f"/api/patients/{patient}/dental-treatments/{treatment['id']}/revisions"
        )
        assert treatment_history.json()["items"][0]["actor"]["display_name"] == NAME

        clinical = {
            "id": str(uuid4()),
            "operation_id": str(uuid4()),
            "expected_revision": 0,
            "note_type": "diagnosis",
            "entity_kind": "patient",
            "entity_id": str(patient),
            "body": "Nota diagnóstica",
            "dentition": "permanent",
            "tooth_fdi": 16,
        }
        created_clinical = await client.post(
            f"/api/patients/{patient}/clinical-notes", json=clinical
        )
        assert created_clinical.status_code == 201, created_clinical.text
        assert created_clinical.json()["committed"]["author"]["display_name"] == NAME
        clinical_notes = await client.get(f"/api/patients/{patient}/clinical-notes")
        matching = next(
            item for item in clinical_notes.json()["items"] if item["id"] == clinical["id"]
        )
        assert matching["author"]["display_name"] == NAME
        clinical_history = await client.get(
            f"/api/patients/{patient}/clinical-notes/{clinical['id']}/revisions"
        )
        assert clinical_history.json()["items"][0]["actor_display_name"] == NAME

        activity = await client.get(f"/api/patients/{patient}/activity")
        actors = [item["actor"] for item in activity.json()["items"] if item["actor"]]
        assert actors
        assert all(actor["display_name"] == NAME for actor in actors)

        plan = uuid4()
        async with pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO patient_clinical_plans(id,patient_id,owner_user_id,title,created_by,updated_by) VALUES($1,$2,$3,'Plan histórico',$3,$3)",
                plan,
                patient,
                owner,
            )
            await conn.execute(
                "INSERT INTO patient_clinical_plan_revisions(id,plan_id,patient_id,owner_user_id,revision,action,before_snapshot,after_snapshot,actor_user_id) VALUES($1,$2,$3,$4,1,'created',NULL::jsonb,'{}'::jsonb,$4)",
                uuid4(),
                plan,
                patient,
                owner,
            )
        plan_history = await client.get(f"/api/patients/{patient}/clinical-plans/{plan}/revisions")
        assert plan_history.json()["items"][0]["actor"]["display_name"] == NAME


async def test_unnamed_author_keeps_null_display_name(author_db):
    _, owner, unnamed, _, patient = author_db
    app.dependency_overrides[get_current_user] = lambda: {"id": str(unnamed)}
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="https://testserver"
        ) as client:
            condition = {
                "id": str(uuid4()),
                "dentition": "permanent",
                "tooth_fdi": 11,
                "condition_code": "caries",
                "surfaces": [],
            }
            created = await client.post(f"/api/patients/{patient}/conditions", json=condition)
            assert created.status_code == 201, created.text
            assert created.json()["created_by"] == {
                "user_id": str(unnamed),
                "display_name": None,
            }
    finally:
        app.dependency_overrides[get_current_user] = lambda: {"id": str(owner)}
