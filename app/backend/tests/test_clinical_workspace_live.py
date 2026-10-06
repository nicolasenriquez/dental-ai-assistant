"""Real SQL/lock evidence on an explicitly selected isolated database.

Creates only synthetic owned rows, then deletes those rows. Never truncates.
"""

import asyncio
import base64
import json
import os
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
from uuid import UUID, uuid4

import asyncpg
import pytest
from httpx import ASGITransport, AsyncClient

from backend.auth.dependencies import get_current_user
from backend.clinical_assistant import pending_work, service
from backend.clinical_assistant.schemas import PrepareSaveRequest
from backend.db import clinical_assistant_repo as repo
from backend.db import (
    clinical_pending_work_repo,
    patient_activity_repo,
    patient_conditions_repo,
    patient_notes_repo,
    patients_repo,
)
from backend.main import app
from backend.routes import patients as patient_routes

DSN = os.environ.get("WORKSPACE_LIVE_TEST_DSN", "")
pytestmark = pytest.mark.skipif(not DSN, reason="WORKSPACE_LIVE_TEST_DSN not set")


async def test_catalog_domain_http_and_migrated_sql_agree(workspace_db):
    from itertools import combinations

    from backend.patients.conditions import CATALOG, CreateCondition

    pool, owner, _, patient, _, _ = workspace_db

    async def user():
        return {"id": str(owner)}

    sql = """INSERT INTO patient_tooth_conditions
        (id,owner_user_id,patient_id,dentition,tooth_fdi,condition_code,
         surfaces,status,created_by_user_id,updated_by_user_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,'resolved',$2,$2)"""

    app.dependency_overrides[get_current_user] = user
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="https://testserver"
        ) as client:
            catalog = (await client.get("/api/patients/condition-catalog")).json()
            assert [entry["code"] for entry in catalog["conditions"]] == list(CATALOG)
            assert catalog["categories"] == [{"key": "diagnosis", "label_es": "Diagnóstico"}]
            base = f"/api/patients/{patient}/conditions"
            for entry in catalog["conditions"]:
                assert entry["allowed_dentitions"] == ["permanent", "primary"]
                for dentition, tooth in (("permanent", 16), ("primary", 51)):
                    for size in range(6):
                        for selected in combinations(("M", "D", "O", "V", "L"), size):
                            body = {
                                "id": str(uuid4()),
                                "dentition": dentition,
                                "tooth_fdi": tooth,
                                "condition_code": entry["code"],
                                "surfaces": list(selected),
                            }
                            allowed = not selected or bool(entry["surface_codes"])
                            if allowed:
                                command = CreateCondition.model_validate(body)
                                assert command.surfaces == list(selected)
                            else:
                                with pytest.raises(ValueError):
                                    CreateCondition.model_validate(body)
                            response = await client.post(base, json=body)
                            assert response.status_code == (201 if allowed else 422), body
                            # Probe CHECKs directly, independently of service validation/active uniqueness.
                            async with pool.acquire() as conn:
                                args = (
                                    uuid4(),
                                    owner,
                                    patient,
                                    dentition,
                                    tooth,
                                    entry["code"],
                                    list(selected),
                                )
                                if allowed:
                                    await conn.execute(sql, *args)
                                else:
                                    with pytest.raises(asyncpg.CheckViolationError):
                                        await conn.execute(sql, *args)
            for extra in ("category_key", "icon", "draft", "allowed_dentitions"):
                response = await client.post(
                    base,
                    json={
                        "id": str(uuid4()),
                        "dentition": "primary",
                        "tooth_fdi": 52,
                        "condition_code": "caries",
                        extra: "untrusted",
                    },
                )
                assert response.status_code == 422
            async with pool.acquire() as conn:
                assert await conn.fetchval("SELECT version_num FROM alembic_version") == "0024"
                for code, surfaces in (("unknown", []), ("missing", ["O"])):
                    with pytest.raises(asyncpg.CheckViolationError):
                        await conn.execute(
                            sql, uuid4(), owner, patient, "permanent", 16, code, surfaces
                        )
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
async def workspace_db(monkeypatch):
    pool = await asyncpg.create_pool(DSN, min_size=1, max_size=3)
    for module in (
        repo,
        clinical_pending_work_repo,
        patients_repo,
        patient_notes_repo,
        patient_conditions_repo,
        patient_activity_repo,
    ):
        monkeypatch.setattr(module, "get_pg_pool", lambda: pool)
    owner, other = uuid4(), uuid4()
    patient, second, foreign = uuid4(), uuid4(), uuid4()
    async with pool.acquire() as conn:
        for user in (owner, other):
            await conn.execute(
                "INSERT INTO users (id, email) VALUES ($1, $2)",
                user,
                f"workspace-{user}@example.com",
            )
        for index, (identifier, user) in enumerate(
            ((patient, owner), (second, owner), (foreign, other))
        ):
            await conn.execute(
                """INSERT INTO patients (id, owner_user_id, first_name, last_name, rut_number, rut_dv)
                   VALUES ($1, $2, 'Synthetic', 'Patient', $3, '5')""",
                identifier,
                user,
                12000000 + index,
            )
    yield pool, owner, other, patient, second, foreign
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM clinical_threads WHERE owner_user_id = ANY($1::uuid[])", [owner, other]
        )
        await conn.execute(
            "DELETE FROM evolutions WHERE owner_user_id = ANY($1::uuid[])", [owner, other]
        )
        await conn.execute(
            "DELETE FROM patients WHERE owner_user_id = ANY($1::uuid[])", [owner, other]
        )
        await conn.execute("DELETE FROM users WHERE id = ANY($1::uuid[])", [owner, other])
    await pool.close()


async def test_activity_revision_identity_filters_ties_and_ownership(workspace_db):
    pool, owner, _, patient, second, foreign = workspace_db

    async def user(session=None):
        return {"id": str(owner)}

    app.dependency_overrides[get_current_user] = user
    try:
        note, condition, evolution = uuid4(), uuid4(), uuid4()
        await patient_notes_repo.create_note(owner, patient, note, "Private note body")
        await patient_notes_repo.update_note(owner, patient, note, 1, "Private edit")
        await patient_conditions_repo.create_condition(
            owner,
            patient,
            condition,
            {
                "dentition": "primary",
                "tooth_fdi": 51,
                "condition_code": "missing",
                "surfaces": [],
                "note": "Private diagnosis",
            },
        )
        await patient_conditions_repo.update_condition(
            owner, patient, condition, 1, {"status": "resolved"}
        )
        timestamp = datetime(2026, 10, 3, 12, tzinfo=UTC)
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO evolutions(id,patient_id,owner_user_id,evolution_at,
                   raw_note,generated_text,final_text,created_at)
                   VALUES($1,$2,$3,'2000-01-01','Private raw','Private generated','Private final',$4)""",
                evolution,
                patient,
                owner,
                timestamp,
            )
            for table in ("patient_note_revisions", "patient_tooth_condition_revisions"):
                # Fixed fixture table names only, never request input.
                await conn.execute(
                    f"UPDATE {table} SET changed_at=$1 WHERE patient_id=$2", timestamp, patient
                )
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="https://testserver"
        ) as client:
            base = f"/api/patients/{patient}/activity"
            first = await client.get(base, params={"limit": 1})
            assert first.status_code == 200
            initial = first.json()
            assert initial["total"] == 5
            events = initial["items"]
            cursor = initial["next_cursor"]
            final_cursor = cursor
            while cursor:
                final_cursor = cursor
                page = (await client.get(base, params={"limit": 1, "cursor": cursor})).json()
                assert page["total"] == 5
                events.extend(page["items"])
                cursor = page["next_cursor"]
            assert len(events) == 5
            assert len({(e["kind"], e["event_id"]) for e in events}) == 5
            assert [e["kind"] for e in events] == [
                "diagnoses",
                "diagnoses",
                "evolutions",
                "notes",
                "notes",
            ]
            for kind in ("notes", "diagnoses"):
                pair = [e for e in events if e["kind"] == kind]
                assert pair[0]["resource_id"] == pair[1]["resource_id"]
                assert pair[0]["event_id"] > pair[1]["event_id"]
                assert all(
                    e["actor"] == {"user_id": str(owner), "display_name": None} for e in pair
                )
            saved = next(e for e in events if e["kind"] == "evolutions")
            assert saved["occurred_at"].startswith("2026-10-03")
            assert saved["href"] == f"/patients/{patient}/evolutions/{evolution}"
            assert "Private" not in json.dumps(events)
            for kind, total in (("notes", 2), ("diagnoses", 2), ("evolutions", 1)):
                page = (await client.get(base, params={"kind": kind})).json()
                assert page["total"] == total and all(e["kind"] == kind for e in page["items"])
            for params in (
                {"kind": "notes", "cursor": final_cursor},
                {"cursor": "bad"},
                {"limit": 51},
            ):
                assert (await client.get(base, params=params)).status_code == 422
            assert (await client.get(f"/api/patients/{foreign}/activity")).status_code == 404
            assert (await client.get(f"/api/patients/{uuid4()}/activity")).status_code == 404
            assert (
                await client.get(
                    f"/api/patients/{second}/activity", params={"cursor": final_cursor}
                )
            ).status_code == 422
            assert (await client.get(f"/api/patients/{second}/activity")).json() == {
                "items": [],
                "total": 0,
                "next_cursor": None,
            }
            # A valid cursor beyond the last event still retains the pre-cursor count.
            last = events[-1]
            exhausted = (
                base64.urlsafe_b64encode(
                    json.dumps(
                        {
                            "v": 1,
                            "patient_id": str(patient),
                            "filter": "all",
                            "occurred_at": last["occurred_at"],
                            "kind": last["kind"],
                            "event_id": last["event_id"],
                        }
                    ).encode()
                )
                .decode()
                .rstrip("=")
            )
            assert (await client.get(base, params={"cursor": exhausted})).json() == {
                "items": [],
                "total": 5,
                "next_cursor": None,
            }
    finally:
        app.dependency_overrides.pop(get_current_user, None)


async def test_notes_lifecycle_retry_ownership_and_cursor(workspace_db):
    pool, owner, other, patient, second, foreign = workspace_db
    current_owner = owner

    async def user(session=None):
        return {"id": str(current_owner)}

    app.dependency_overrides[get_current_user] = user
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="https://testserver"
        ) as client:
            base = f"/api/patients/{patient}/notes"
            identifier = str(uuid4())
            payload = {"id": identifier, "body": "  Nota sintética  "}
            created = await client.post(base, json=payload)
            assert created.status_code == 201
            record = created.json()
            assert record["body"] == "Nota sintética" and record["revision"] == 1
            assert record["created_by"]["user_id"] == str(owner)
            assert record["created_by"]["display_name"] is None
            assert (await client.post(base, json=payload)).status_code == 200
            assert (
                await client.post(base, json={**payload, "body": "Distinta"})
            ).status_code == 409
            patch = {"expected_revision": 1, "body": "Nueva versión"}
            updated = await client.patch(f"{base}/{identifier}", json=patch)
            assert updated.status_code == 200 and updated.json()["revision"] == 2
            assert (await client.patch(f"{base}/{identifier}", json=patch)).json()["revision"] == 2
            # Retry creation compares revision1, never the edited body.
            assert (await client.post(base, json=payload)).json()["body"] == "Nueva versión"
            assert (
                await client.patch(
                    f"{base}/{identifier}", json={"expected_revision": 2, "body": "Nueva versión"}
                )
            ).json()["revision"] == 2
            conflict = await client.patch(
                f"{base}/{identifier}", json={"expected_revision": 1, "body": "Otro cambio"}
            )
            assert (
                conflict.status_code == 409
                and conflict.json()["detail"]["code"] == "revision_conflict"
            )
            for body in (
                {"id": str(uuid4()), "body": " "},
                {"id": str(uuid4()), "body": "x" * 4001},
                {"id": str(uuid4()), "body": "ok", "actor": str(other)},
            ):
                assert (await client.post(base, json=body)).status_code == 422
            for body in (
                {"expected_revision": 0, "body": "ok"},
                {"expected_revision": 2, "body": None},
                {"expected_revision": 2, "body": "ok", "unknown": 1},
            ):
                assert (await client.patch(f"{base}/{identifier}", json=body)).status_code == 422
            revisions = await client.get(f"{base}/{identifier}/revisions?limit=1")
            page = revisions.json()
            assert revisions.status_code == 200 and page["total"] == 2
            assert page["items"][0]["previous_body"] == "Nota sintética"
            next_page = (
                await client.get(
                    f"{base}/{identifier}/revisions",
                    params={"limit": 1, "cursor": page["next_cursor"]},
                )
            ).json()
            assert next_page["total"] == 2 and next_page["items"][0]["revision"] == 1
            assert next_page["items"][0]["previous_body"] is None
            exhausted = (
                await client.get(
                    f"{base}/{identifier}/revisions", params={"cursor": page["next_cursor"]}
                )
            ).json()
            assert exhausted["total"] == 2
            for invalid in ("invalid", "e30="):
                assert (await client.get(base, params={"cursor": invalid})).status_code == 422
            for limit in (0, 51):
                assert (await client.get(base, params={"limit": limit})).status_code == 422
            new_id = str(uuid4())
            assert (
                await client.post(base, json={"id": new_id, "body": "Otra nota"})
            ).status_code == 201
            notes = (await client.get(base, params={"limit": 1})).json()
            assert notes["total"] == 2 and notes["items"][0]["id"] == new_id
            assert (await client.get(f"{base}/{identifier}")).json()["id"] == identifier
            assert (
                await client.get(
                    f"/api/patients/{second}/notes", params={"cursor": notes["next_cursor"]}
                )
            ).status_code == 422
            for path in (
                f"/api/patients/{second}/notes/{identifier}",
                f"/api/patients/{foreign}/notes",
                f"/api/patients/{foreign}/notes/{identifier}/revisions",
            ):
                response = await client.get(path)
                assert (
                    response.status_code == 404 and response.json()["detail"]["code"] == "not_found"
                )
            assert (
                await client.post(f"/api/patients/{second}/notes", json=payload)
            ).status_code == 404
            current_owner = other
            assert (
                await client.post(f"/api/patients/{foreign}/notes", json=payload)
            ).status_code == 404
            assert (await client.get(f"{base}/{identifier}")).status_code == 404
            assert (await client.patch(f"{base}/{identifier}", json=patch)).status_code == 404
            current_owner = owner
            async with pool.acquire() as conn:
                assert (
                    await conn.fetchval(
                        "SELECT count(*) FROM patient_note_revisions WHERE note_id=$1",
                        UUID(identifier),
                    )
                    == 2
                )
    finally:
        app.dependency_overrides.pop(get_current_user, None)


async def test_note_concurrent_retry_and_atomic_revision(workspace_db):
    pool, owner, _, patient, _, _ = workspace_db

    async def user(session=None):
        return {"id": str(owner)}

    app.dependency_overrides[get_current_user] = user
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="https://testserver"
        ) as client:
            base = f"/api/patients/{patient}/notes"
            payload = {"id": str(uuid4()), "body": "Concurrente"}
            responses = await asyncio.gather(
                client.post(base, json=payload), client.post(base, json=payload)
            )
            assert sorted(r.status_code for r in responses) == [200, 201]
            path = f"{base}/{payload['id']}"
            patches = await asyncio.gather(
                client.patch(path, json={"expected_revision": 1, "body": "A"}),
                client.patch(path, json={"expected_revision": 1, "body": "B"}),
            )
            assert sorted(r.status_code for r in patches) == [200, 409]
            assert (await client.get(f"{path}/revisions")).json()["total"] == 2
    finally:
        app.dependency_overrides.pop(get_current_user, None)


async def test_note_revision_failure_rolls_back_resource(workspace_db, monkeypatch):
    pool, owner, _, patient, _, _ = workspace_db
    identifier = uuid4()

    async def failed_revision(*args, **kwargs):
        raise RuntimeError("synthetic revision failure")

    original = patient_notes_repo._revision
    monkeypatch.setattr(patient_notes_repo, "_revision", failed_revision)
    with pytest.raises(RuntimeError, match="synthetic revision failure"):
        await patient_notes_repo.create_note(owner, patient, identifier, "Synthetic")
    async with pool.acquire() as conn:
        assert (
            await conn.fetchval("SELECT count(*) FROM patient_notes WHERE id=$1", identifier) == 0
        )
    monkeypatch.setattr(patient_notes_repo, "_revision", original)
    await patient_notes_repo.create_note(owner, patient, identifier, "Original")
    monkeypatch.setattr(patient_notes_repo, "_revision", failed_revision)
    with pytest.raises(RuntimeError, match="synthetic revision failure"):
        await patient_notes_repo.update_note(owner, patient, identifier, 1, "Changed")
    confirmed = await patient_notes_repo.get_note(owner, patient, identifier)
    assert confirmed["body"] == "Original" and confirmed["revision"] == 1


async def test_patient_contact_and_search_live(workspace_db, monkeypatch, caplog):
    pool, owner, other, _, _, foreign = workspace_db
    current_owner = owner

    async def user(session=None):
        return {"id": str(current_owner)}

    app.dependency_overrides[get_current_user] = user
    monkeypatch.setattr(patient_routes, "get_current_user", user)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="https://testserver"
        ) as client:
            body = {
                "first_name": "Ana María",
                "last_name": "Pérez",
                "rut": "12.345.678-5",
                "phone": " +56 (9) 1234-5678 ",
                "email": " Ana@Example.com ",
            }
            created = await client.post("/api/patients", json=body)
            assert created.status_code == 201
            identifier = created.json()["id"]
            assert "phone" not in created.json() and "email" not in created.json()
            detail = (await client.get(f"/api/patients/{identifier}")).json()
            assert detail["phone"] == "+56 (9) 1234-5678"
            assert detail["email"] == "Ana@Example.com"
            duplicate = await client.post("/api/patients", json=body)
            assert duplicate.status_code == 409
            assert duplicate.json()["detail"]["patient"]["id"] == identifier
            assert "phone" not in duplicate.json()["detail"]["patient"]
            identity = {"first_name": "Ana María", "last_name": "Pérez"}
            kept = (await client.patch(f"/api/patients/{identifier}", json=identity)).json()
            assert kept["phone"] == detail["phone"] and kept["email"] == detail["email"]
            assert (
                await client.patch(
                    f"/api/patients/{identifier}",
                    json={**identity, "phone": "123", "email": "invalid"},
                )
            ).status_code == 422
            assert (await client.get(f"/api/patients/{identifier}")).json()["phone"] == detail[
                "phone"
            ]

            collision = await patients_repo.create_patient(
                owner,
                first_name="Collision",
                last_name="Search",
                rut_body=87654321,
                check_digit="4",
                birth_date=None,
                phone="123456785 0",
            )
            compact_phone = await patients_repo.create_patient(
                owner,
                first_name="Phone",
                last_name="Search",
                rut_body=76543210,
                check_digit="0",
                birth_date=None,
                phone="123456780",
            )
            literal = await patients_repo.create_patient(
                owner,
                first_name="Literal %_\\",
                last_name="Search",
                rut_body=65432109,
                check_digit="0",
                birth_date=None,
            )
            async with pool.acquire() as conn:
                await conn.execute(
                    "UPDATE patients SET first_name='Ana María', last_name='Pérez', phone='+56 (9) 1234-5678' WHERE id=$1",
                    foreign,
                )

            cases = [
                ("123", {identifier, str(collision["id"]), str(compact_phone["id"])}),
                ("12345678", {identifier, str(collision["id"]), str(compact_phone["id"])}),
                ("12.345.678-5", {identifier}),
                ("123456785", {identifier}),
                ("12.345.678-0", set()),
                ("123456780", {str(compact_phone["id"])}),
                ("+56 9 1234 5678", {identifier}),
                ("(09) 1234-5678", set()),
                ("1234567890", set()),
                ("Ana María", {identifier}),
                ("ANA MARIA", {identifier}),
                ("Ana 123", set()),
                ("%_\\", {str(literal["id"])}),
                ("()", set()),
                ("12.34.56", set()),
            ]
            for term, expected in cases:
                response = await client.post("/api/patients/search", json={"query": term})
                assert response.status_code == 200
                assert {row["id"] for row in response.json()} == expected, term
                assert all("phone" not in row and "email" not in row for row in response.json())
                assert "query=" not in str(response.request.url)
            cleared = (
                await client.patch(
                    f"/api/patients/{identifier}", json={**identity, "phone": None, "email": " "}
                )
            ).json()
            assert cleared["phone"] is None and cleared["email"] is None
            current_owner = other
            assert (await client.get(f"/api/patients/{identifier}")).status_code == 404
            assert (
                await client.patch(f"/api/patients/{identifier}", json=identity)
            ).status_code == 404
            assert "12345678" not in caplog.text and "Ana@Example.com" not in caplog.text
    finally:
        app.dependency_overrides.pop(get_current_user, None)


async def test_patient_search_query_plan_live(workspace_db):
    pool, owner, other, *_ = workspace_db
    # Use the production SQL, not a second hand-written search query.
    sql = next(
        value
        for value in patients_repo.search_patients.__code__.co_consts
        if isinstance(value, str) and "SELECT p.id" in value
    )
    async with pool.acquire() as conn:
        transaction = conn.transaction()
        await transaction.start()
        try:
            await conn.execute(
                """INSERT INTO patients (id,owner_user_id,first_name,last_name,rut_number,rut_dv,phone)
                SELECT gen_random_uuid(), CASE WHEN g<=1000 THEN $1::uuid ELSE $2::uuid END,
                'Synthetic', 'Plan ' || g, 20000000+g, '0', '+56 9 ' || (10000000+g)::text
                FROM generate_series(1,10000) g""",
                owner,
                other,
            )
            await conn.execute("ANALYZE patients")
            for kind, exact, pattern in (
                ("rut", 20000123, "%20000123%"),
                ("fragment", None, "%123%"),
                ("phone", None, "%56910000123%"),
                ("name", None, "%synthetic plan 123%"),
            ):
                result = await conn.fetchval(
                    "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + sql, owner, kind, exact, pattern
                )
                plan = json.loads(result)[0]
                serialized = json.dumps(plan)
                assert "owner_user_id" in serialized
                assert (
                    "ix_patients_owner_name" in serialized or "uq_patients_owner_rut" in serialized
                )
                print(f"patient-search-plan {kind}: {serialized}")
        finally:
            await transaction.rollback()


async def test_open_context_serializes_reuse_and_preserves_history(workspace_db):
    pool, owner, other, patient, second, foreign = workspace_db
    results = await asyncio.gather(*(repo.open_context(owner, patient) for _ in range(3)))
    assert len({row[0] for row in results}) == 1
    assert sum(not reused for _, reused in results) == 1
    thread = results[0][0]
    with pytest.raises(LookupError):
        await repo.open_context(owner, foreign)
    with pytest.raises(LookupError):
        await repo.open_context(other, foreign, thread)
    with pytest.raises(repo.ContextConflictError):
        await repo.open_context(owner, second, thread)
    turn = uuid4()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE clinical_threads SET active_turn_id = $2 WHERE id = $1", thread, turn
        )
    await repo.append_message(
        owner,
        thread,
        turn,
        "assistant",
        "Evoluciones consultadas",
        clinical_result={"result_kind": "evolution_list", "payload": {"evolutions": []}},
    )
    loaded = await repo.get_thread(owner, thread)
    assert loaded["messages"][0]["clinical_result"]["result_kind"] == "evolution_list"
    assert (await repo.open_context(owner, patient))[0] == thread
    general = (await repo.create_thread(owner, "Consulta general"))["id"]
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO clinical_messages (id, thread_id, turn_id, role, content) VALUES ($1, $2, $3, 'user', 'general')",
            uuid4(),
            general,
            uuid4(),
        )
    with pytest.raises(repo.ContextConflictError) as conflict:
        await repo.open_context(owner, patient, general)
    assert conflict.value.reason == "thread_has_history"
    new_thread, reused = await repo.open_context(owner, second, create_new=True)
    assert not reused and new_thread != thread
    async with pool.acquire() as conn:
        assert (
            await conn.fetchval(
                "SELECT active_patient_id FROM clinical_threads WHERE id=$1", thread
            )
            == patient
        )


async def test_pending_kind_totals_before_cursor_and_foreign_patient404(workspace_db):
    pool, owner, other, patient, second, foreign = workspace_db
    for user, patient_id in ((owner, patient), (owner, second), (other, foreign)):
        async with pool.acquire() as conn:
            for index in range(4):
                thread, _ = await repo.open_context(user, patient_id, create_new=True)
                artifact, turn = uuid4(), uuid4()
                await conn.execute(
                    """INSERT INTO clinical_turn_artifacts
                    (id,owner_user_id,thread_id,turn_id,patient_id,payload,status)
                    VALUES ($1,$2,$3,$4,$5,'{}'::jsonb,'draft')""",
                    artifact,
                    user,
                    thread,
                    turn,
                    patient_id,
                )
                if index < 2:
                    await conn.execute(
                        """INSERT INTO clinical_pending_actions
                        (id,owner_user_id,thread_id,turn_id,patient_id,artifact_id,action_type,proposal_payload,proposal_hash,status,expires_at)
                        VALUES ($1,$2,$3,$4,$5,$6,'save_evolution','{}'::jsonb,'hash','pending',now()+interval '1 hour')""",
                        uuid4(),
                        user,
                        thread,
                        turn,
                        patient_id,
                        artifact,
                    )
            for _ in range(2):
                evolution = uuid4()
                await conn.execute(
                    """INSERT INTO evolutions(id,patient_id,owner_user_id,evolution_at,raw_note,generated_text,final_text)
                    VALUES ($1,$2,$3,now(),'synthetic','synthetic','synthetic')""",
                    evolution,
                    patient_id,
                    user,
                )
                await conn.execute(
                    """INSERT INTO google_drive_evolution_exports
                    (id,user_id,evolution_id,operation_id,period_type,period_key,status,journal_block,content_hash,created_at,updated_at)
                    VALUES ($1,$2,$3,$4,'weekly','2026-W40','failed','synthetic','hash',now(),now())""",
                    uuid4(),
                    user,
                    evolution,
                    uuid4(),
                )
    # Task1.4 fail-first: optional kind must be implemented in the existing projection.
    for kind in ("approval_required", "recoverable_draft", "drive_export_failed"):
        first = await pending_work.list_pending_work(owner, patient, 1, None, kind=kind)
        assert first.total == 2 and len(first.items) == 1 and first.next_cursor
        assert first.items[0].kind == kind and first.items[0].patient.id == patient
        last = await pending_work.list_pending_work(owner, patient, 1, first.next_cursor, kind=kind)
        exhausted_cursor = base64.urlsafe_b64encode(
            json.dumps([last.items[0].updated_at.isoformat(), last.items[0].id]).encode()
        ).decode()
        exhausted = await pending_work.list_pending_work(
            owner, patient, 1, exhausted_cursor, kind=kind
        )
        assert exhausted.total == 2 and exhausted.items == []
        assert last.total == 2 and len(last.items) == 1 and not last.next_cursor
        assert last.items[0].id != first.items[0].id
        with pytest.raises(LookupError):
            await pending_work.list_pending_work(owner, foreign, 1, None, kind=kind)
    mixed = await pending_work.list_pending_work(owner, patient, 20, None)
    assert mixed.total == 6 and {item.kind for item in mixed.items} == {
        "approval_required",
        "recoverable_draft",
        "drive_export_failed",
    }


async def test_pending_projection_deduplicates_and_respects_cursor(workspace_db):
    pool, owner, _, patient, second, _ = workspace_db
    thread, _ = await repo.open_context(owner, patient)
    artifact, action, turn = uuid4(), uuid4(), uuid4()
    now = datetime.now(UTC)
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO clinical_turn_artifacts
               (id, owner_user_id, thread_id, turn_id, patient_id, payload, status)
               VALUES ($1, $2, $3, $4, $5, '{}'::jsonb, 'draft')""",
            artifact,
            owner,
            thread,
            turn,
            patient,
        )
        await conn.execute(
            """INSERT INTO clinical_pending_actions
               (id, owner_user_id, thread_id, turn_id, patient_id, artifact_id, action_type,
                proposal_payload, proposal_hash, status, expires_at, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, 'save_evolution', '{}'::jsonb, $7, 'pending', $8, $9)""",
            action,
            owner,
            thread,
            turn,
            patient,
            artifact,
            "a" * 64,
            now + timedelta(hours=1),
            now,
        )
    page = await pending_work.list_pending_work(owner, patient, 20, None)
    assert [item.kind for item in page.items] == ["approval_required"]
    assert (await pending_work.list_pending_work(owner, second, 20, None)).items == []
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE clinical_pending_actions SET expires_at = $2 WHERE id=$1",
            action,
            now - timedelta(seconds=1),
        )
    page = await pending_work.list_pending_work(owner, patient, 20, None)
    assert [item.kind for item in page.items] == ["recoverable_draft"]


async def test_reviewed_evolution_is_saved_once_and_export_failure_is_separate(workspace_db):
    pool, owner, _, patient, _, _ = workspace_db
    thread, _ = await repo.open_context(owner, patient)
    turn, artifact = uuid4(), uuid4()
    await repo.claim_turn(owner, thread, turn, "Control sin dolor")
    draft = {
        "context": "Control",
        "findings": "Sin dolor",
        "assessment": "",
        "treatment": "",
        "follow_up": "",
        "review_flags": [],
    }
    await repo.create_artifact(
        owner,
        thread,
        turn,
        patient,
        artifact,
        {
            "source_note": "Control sin dolor",
            "draft": draft,
            "generated_draft": draft,
            "evolution_at": datetime.now(UTC).isoformat(),
        },
    )
    await repo.finish_turn(owner, thread, turn, "completed")
    action = await service.prepare_save(
        owner, thread, PrepareSaveRequest(turn_id=turn, artifact_id=artifact)
    )
    results = await asyncio.gather(
        *(
            service.resolve_action(owner, action["id"], "approve", action["proposal_hash"])
            for _ in range(2)
        )
    )
    assert all(result["status"] == "approved" for result in results)
    evolution_id = results[0]["result_resource_id"]
    async with pool.acquire() as conn:
        assert (
            await conn.fetchval("SELECT count(*) FROM evolutions WHERE patient_id=$1", patient) == 1
        )
        await conn.execute(
            """INSERT INTO google_drive_evolution_exports
               (id, user_id, evolution_id, operation_id, period_type, period_key, status,
                journal_block, content_hash, created_at, updated_at)
               VALUES ($1, $2, $3, $4, 'weekly', '2026-W40', 'failed', 'synthetic', 'hash', now(), now())""",
            uuid4(),
            owner,
            evolution_id,
            uuid4(),
        )
    page = await pending_work.list_pending_work(owner, patient, 20, None)
    assert [item.kind for item in page.items] == ["drive_export_failed"]
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE google_drive_evolution_exports SET status='synced' WHERE evolution_id=$1",
            evolution_id,
        )
    assert not (await pending_work.list_pending_work(owner, patient, 20, None)).items


async def test_manual_failed_exports_are_visible_only_to_their_owner(workspace_db):
    pool, owner, other, patient, second, foreign = workspace_db
    evolution = uuid4()
    async with pool.acquire() as conn:
        for user, patient_id, identifier in (
            (owner, patient, evolution),
            (other, foreign, uuid4()),
        ):
            await conn.execute(
                """INSERT INTO evolutions
                   (id, patient_id, owner_user_id, evolution_at, raw_note, generated_text, final_text)
                   VALUES ($1, $2, $3, now(), 'synthetic', 'synthetic', 'synthetic')""",
                identifier,
                patient_id,
                user,
            )
            await conn.execute(
                """INSERT INTO google_drive_evolution_exports
                   (id, user_id, evolution_id, operation_id, period_type, period_key, status,
                    journal_block, content_hash, created_at, updated_at)
                   VALUES ($1, $2, $3, $4, 'weekly', '2026-W40', 'failed',
                           'synthetic', 'hash', now(), now())""",
                uuid4(),
                user,
                identifier,
                uuid4(),
            )
    page = await pending_work.list_pending_work(owner, None, 20, None)
    assert page.total == 1
    assert page.items[0].action.evolution_id == evolution
    assert page.items[0].action.thread_id is None
    assert (await pending_work.list_pending_work(owner, patient, 20, None)).total == 1
    assert (await pending_work.list_pending_work(owner, second, 20, None)).total == 0


async def test_conditions_lifecycle_retry_and_ownership(workspace_db):
    _, owner, other, patient, second, foreign = workspace_db
    current_owner = owner

    async def user():
        return {"id": str(current_owner)}

    app.dependency_overrides[get_current_user] = user
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="https://testserver"
        ) as client:
            base = f"/api/patients/{patient}/conditions"
            payload = {
                "id": str(uuid4()),
                "dentition": "permanent",
                "tooth_fdi": 36,
                "condition_code": "caries",
                "surfaces": ["O", "M"],
                "note": "  Sintética  ",
            }
            created = await client.post(base, json=payload)
            assert created.status_code == 201
            record = created.json()
            assert record["surfaces"] == ["M", "O"] and record["note"] == "Sintética"
            assert record["created_by"]["user_id"] == str(owner)
            assert (await client.post(base, json=payload)).status_code == 200
            duplicate = await client.post(base, json={**payload, "id": str(uuid4())})
            assert duplicate.status_code == 409
            assert duplicate.json()["detail"]["code"] == "active_condition_exists"
            assert duplicate.json()["detail"]["existing"]["id"] == payload["id"]
            path = f"{base}/{payload['id']}"
            patch = {"expected_revision": 1, "note": None, "surfaces": ["D"]}
            edited = await client.patch(path, json=patch)
            assert edited.status_code == 200 and edited.json()["revision"] == 2
            assert edited.json()["note"] is None
            assert (await client.patch(path, json=patch)).json()["revision"] == 2
            assert (await client.post(base, json=payload)).json()["revision"] == 2
            assert (
                await client.post(base, json={**payload, "note": "different"})
            ).status_code == 409
            assert (await client.patch(path, json={"expected_revision": 2, "note": None})).json()[
                "revision"
            ] == 2
            assert (
                await client.patch(path, json={"expected_revision": 1, "note": "stale"})
            ).status_code == 409
            for body in (
                {"expected_revision": 2, "tooth_fdi": 35},
                {"expected_revision": 2, "dentition": "primary"},
                {"expected_revision": 2, "condition_code": "missing"},
            ):
                assert (await client.patch(path, json=body)).status_code == 422
            resolve = {"expected_revision": 2, "status": "resolved"}
            assert (await client.patch(path, json=resolve)).json()["revision"] == 3
            assert (await client.patch(path, json=resolve)).json()["revision"] == 3
            assert (
                await client.patch(path, json={"expected_revision": 3, "note": "reopen"})
            ).json()["detail"]["code"] == "condition_resolved"
            history = (await client.get(f"{path}/revisions", params={"limit": 1})).json()
            assert history["total"] == 3 and history["items"][0]["action"] == "resolved"
            assert history["items"][0]["before"]["status"] == "active"
            history2 = (
                await client.get(f"{path}/revisions", params={"cursor": history["next_cursor"]})
            ).json()
            assert len(history2["items"]) == 2 and history2["total"] == 3
            # Recurrence is another resource; resolved history remains.
            assert (
                await client.post(base, json={**payload, "id": str(uuid4()), "surfaces": ["D"]})
            ).status_code == 201
            primary = {
                "id": str(uuid4()),
                "dentition": "primary",
                "tooth_fdi": 51,
                "condition_code": "missing",
            }
            assert (await client.post(base, json=primary)).status_code == 201
            page = (await client.get(base, params={"limit": 1})).json()
            assert page["total"] == 3 and page["next_cursor"]
            rest = (await client.get(base, params={"cursor": page["next_cursor"]})).json()
            assert rest["total"] == 3 and len(rest["items"]) == 2
            assert (
                await client.get(base, params={"dentition": "primary", "status": "active"})
            ).json()["total"] == 1
            for params in (
                {"cursor": page["next_cursor"], "status": "active"},
                {"cursor": "bad"},
                {"limit": 51},
            ):
                assert (await client.get(base, params=params)).status_code == 422
            assert (await client.get(path)).json()["id"] == payload["id"]
            for url in (
                f"/api/patients/{second}/conditions/{payload['id']}",
                f"/api/patients/{foreign}/conditions",
            ):
                assert (await client.get(url)).status_code == 404
            assert (
                await client.post(f"/api/patients/{second}/conditions", json=payload)
            ).status_code == 404
            current_owner = other
            assert (
                await client.post(f"/api/patients/{foreign}/conditions", json=payload)
            ).status_code == 404
            for url in (base, path, f"{path}/revisions"):
                assert (await client.get(url)).status_code == 404
            assert (await client.patch(path, json=resolve)).status_code == 404
    finally:
        app.dependency_overrides.pop(get_current_user, None)


async def test_conditions_concurrency(workspace_db):
    _, owner, _, patient, _, _ = workspace_db

    async def user():
        return {"id": str(owner)}

    app.dependency_overrides[get_current_user] = user
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="https://testserver"
        ) as client:
            base = f"/api/patients/{patient}/conditions"
            payload = {
                "id": str(uuid4()),
                "dentition": "permanent",
                "tooth_fdi": 11,
                "condition_code": "pulpitis",
            }
            same = await asyncio.gather(
                client.post(base, json=payload), client.post(base, json=payload)
            )
            assert sorted(r.status_code for r in same) == [200, 201]
            duplicates = await asyncio.gather(
                *[
                    client.post(base, json={**payload, "id": str(uuid4()), "tooth_fdi": 12})
                    for _ in range(2)
                ]
            )
            assert sorted(r.status_code for r in duplicates) == [201, 409]
            path = f"{base}/{payload['id']}"
            updates = await asyncio.gather(
                *[
                    client.patch(path, json={"expected_revision": 1, "note": note})
                    for note in ("A", "B")
                ]
            )
            assert sorted(r.status_code for r in updates) == [200, 409]
            identical = await asyncio.gather(
                *[client.patch(path, json={"expected_revision": 2, "note": "C"}) for _ in range(2)]
            )
            assert [r.status_code for r in identical] == [200, 200]
            assert (await client.get(f"{path}/revisions")).json()["total"] == 3
    finally:
        app.dependency_overrides.pop(get_current_user, None)


async def test_condition_revision_failure_rolls_back(workspace_db, monkeypatch):
    pool, owner, _, patient, _, _ = workspace_db
    identifier = uuid4()
    value = {
        "dentition": "permanent",
        "tooth_fdi": 36,
        "condition_code": "caries",
        "surfaces": ["M"],
        "note": None,
    }
    original = patient_conditions_repo._revision

    async def fail(*args, **kwargs):
        raise RuntimeError("synthetic revision failure")

    monkeypatch.setattr(patient_conditions_repo, "_revision", fail)
    with pytest.raises(RuntimeError, match="synthetic revision failure"):
        await patient_conditions_repo.create_condition(owner, patient, identifier, value)
    async with pool.acquire() as conn:
        assert (
            await conn.fetchval(
                "SELECT count(*) FROM patient_tooth_conditions WHERE id=$1", identifier
            )
            == 0
        )
    monkeypatch.setattr(patient_conditions_repo, "_revision", original)
    await patient_conditions_repo.create_condition(owner, patient, identifier, value)
    monkeypatch.setattr(patient_conditions_repo, "_revision", fail)
    with pytest.raises(RuntimeError, match="synthetic revision failure"):
        await patient_conditions_repo.update_condition(
            owner, patient, identifier, 1, {"note": "changed"}
        )
    record = await patient_conditions_repo.get_condition(owner, patient, identifier)
    assert record["revision"] == 1 and record["note"] is None
    async with pool.acquire() as conn:
        # Database also rejects noncanonical arrays, independently of HTTP validation.
        for invalid in (["O", "M"], ["M", "M"], ["X"], [None]):
            with pytest.raises(asyncpg.CheckViolationError):
                async with conn.transaction():
                    await conn.execute(
                        "UPDATE patient_tooth_conditions SET surfaces=$2 WHERE id=$1",
                        identifier,
                        invalid,
                    )


async def test_condition_overlapping_surfaces_patch_duplicate_and_empty_cursor(workspace_db):
    _, owner, _, patient, _, _ = workspace_db

    async def user():
        return {"id": str(owner)}

    app.dependency_overrides[get_current_user] = user
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="https://testserver"
        ) as client:
            base = f"/api/patients/{patient}/conditions"
            value = {
                "id": str(uuid4()),
                "dentition": "permanent",
                "tooth_fdi": 36,
                "condition_code": "caries",
                "surfaces": ["M"],
            }
            first = await client.post(base, json=value)
            assert first.status_code == 201
            second_id = str(uuid4())
            second = await client.post(
                base, json={**value, "id": second_id, "surfaces": ["M", "O"]}
            )
            assert second.status_code == 201  # overlapping sets coexist, no clinical merge.
            duplicate = await client.patch(
                f"{base}/{second_id}",
                json={"expected_revision": 1, "surfaces": ["M"], "note": "must not persist"},
            )
            assert (
                duplicate.status_code == 409
                and duplicate.json()["detail"]["existing"]["id"] == value["id"]
            )
            actual = (await client.get(f"{base}/{second_id}")).json()
            assert (
                actual["revision"] == 1
                and actual["note"] is None
                and actual["surfaces"] == ["M", "O"]
            )
            page = (await client.get(base, params={"limit": 1})).json()
            decoded = json.loads(
                base64.urlsafe_b64decode(
                    page["next_cursor"] + "=" * (-len(page["next_cursor"]) % 4)
                )
            )
            decoded.update(tooth_fdi=48, created_at="2099-01-01T00:00:00Z", id=str(uuid4()))
            end = base64.urlsafe_b64encode(json.dumps(decoded).encode()).decode().rstrip("=")
            exhausted = (await client.get(base, params={"cursor": end})).json()
            assert exhausted == {"items": [], "next_cursor": None, "total": 2}
            unsupported = await client.post(
                base, json={**value, "id": str(uuid4()), "created_by": {"user_id": str(owner)}}
            )
            assert unsupported.status_code == 422
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
async def condition_client(workspace_db):
    _, owner, *_ = workspace_db

    async def user():
        return {"id": str(owner)}

    app.dependency_overrides[get_current_user] = user
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="https://testserver"
        ) as client:
            yield client
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def condition_body(tooth=16, **changes):
    return {
        "id": str(uuid4()),
        "dentition": "permanent",
        "tooth_fdi": tooth,
        "condition_code": "caries",
        "surfaces": ["O", "M"],
        "note": "Original",
        **changes,
    }


def correction_body(**changes):
    return {
        "operation_id": str(uuid4()),
        "expected_revision": 1,
        "reason": "  Error sintético  ",
        **changes,
    }


@pytest.mark.parametrize(
    "resolved,replacement", [(False, False), (False, True), (True, False), (True, True)]
)
async def test_correction_receipt_history_and_terminal_guards(
    workspace_db, condition_client, resolved, replacement
):
    pool, owner, _, patient, *_ = workspace_db
    client = condition_client
    base = f"/api/patients/{patient}/conditions"
    original = condition_body()
    assert (await client.post(base, json=original)).status_code == 201
    path = f"{base}/{original['id']}"
    if resolved:
        assert (
            await client.patch(path, json={"expected_revision": 1, "status": "resolved"})
        ).status_code == 200
    legacy = (await client.get(f"{path}/revisions")).json()["items"]
    assert all(
        row["correction"] is None and row["supersedes_condition_id"] is None for row in legacy
    )
    command = correction_body(expected_revision=2 if resolved else 1)
    if replacement:
        command["replacement"] = condition_body(
            51, dentition="primary", surfaces=[], note="  Nueva  "
        )
    response = await client.post(f"{path}/corrections", json=command)
    assert response.status_code == 201
    receipt = response.json()
    assert set(receipt) == {
        "operation_id",
        "condition_id",
        "correction_revision_id",
        "replacement_condition_id",
        "replacement_revision_id",
    }
    assert (
        receipt["operation_id"] == command["operation_id"]
        and receipt["condition_id"] == original["id"]
    )
    corrected = (await client.get(path)).json()
    assert (
        corrected["status"] == "entered_in_error"
        and corrected["revision"] == command["expected_revision"] + 1
    )
    assert corrected["tooth_fdi"] == 16 and corrected["surfaces"] == ["M", "O"]
    metadata = {**receipt, "reason": "Error sintético"}
    assert corrected["correction"] == metadata and corrected["supersedes_condition_id"] is None
    history = (await client.get(f"{path}/revisions", params={"limit": 1})).json()
    revision = history["items"][0]
    assert revision["id"] == receipt["correction_revision_id"] and revision["action"] == "corrected"
    assert revision["correction"] == metadata and revision["actor"]["user_id"] == str(owner)
    assert revision["before"]["status"] == ("resolved" if resolved else "active")
    assert revision["after"]["status"] == "entered_in_error"
    older = (
        await client.get(f"{path}/revisions", params={"cursor": history["next_cursor"]})
    ).json()["items"]
    assert older == legacy  # Earlier evidence unchanged, including resolution.
    if replacement:
        replacement_path = f"{base}/{command['replacement']['id']}"
        new = (await client.get(replacement_path)).json()
        assert new["status"] == "active" and new["revision"] == 1 and new["note"] == "Nueva"
        assert new["supersedes_condition_id"] == original["id"] and new["correction"] is None
        initial = (await client.get(f"{replacement_path}/revisions")).json()["items"][0]
        assert (
            initial["id"] == receipt["replacement_revision_id"] and initial["action"] == "created"
        )
        assert (
            initial["supersedes_condition_id"] == original["id"] and initial["correction"] is None
        )
        assert (
            await client.patch(replacement_path, json={"expected_revision": 1, "note": "Later"})
        ).status_code == 200
    else:
        assert (
            receipt["replacement_condition_id"] is None
            and receipt["replacement_revision_id"] is None
        )
    normalized_retry = {
        **command,
        "reason": "Error sintético",
        "replacement": command.get("replacement"),
    }
    if replacement:
        normalized_retry["replacement"] = {**command["replacement"], "note": "Nueva"}
    retry = await client.post(f"{path}/corrections", json=normalized_retry)
    assert retry.status_code == 200 and retry.json() == receipt
    for change in (
        {"reason": "Different"},
        {"expected_revision": 1 if resolved else 2},
        {"replacement": condition_body(26)},
    ):
        conflict = await client.post(f"{path}/corrections", json={**command, **change})
        assert (
            conflict.status_code == 409
            and conflict.json()["detail"]["code"] == "idempotency_conflict"
        )
    blocked = await client.post(
        f"{path}/corrections", json=correction_body(expected_revision=corrected["revision"])
    )
    assert (
        blocked.status_code == 409
        and blocked.json()["detail"]["code"] == "condition_entered_in_error"
    )
    for changes in ({"note": "Edit"}, {"status": "resolved"}, {"surfaces": ["M", "O"]}):
        blocked = await client.patch(
            path, json={"expected_revision": corrected["revision"], **changes}
        )
        assert (
            blocked.status_code == 409
            and blocked.json()["detail"]["code"] == "condition_entered_in_error"
        )
    assert (
        await client.post(base, json=original)
    ).status_code == 200  # Legacy create retry still read-only.
    page = (await client.get(base, params={"status": "entered_in_error", "limit": 1})).json()
    assert page["total"] == 1 and page["items"][0]["id"] == original["id"]
    assert (await client.get(base)).json()["total"] == (2 if replacement else 1)
    activity = (await client.get(f"/api/patients/{patient}/activity")).json()["items"]
    event = next(row for row in activity if row["event_id"] == receipt["correction_revision_id"])
    assert (
        event["action"] == "corrected"
        and event["title"] == "Condición corregida"
        and event["resource_id"] == original["id"]
    )
    assert "Error sintético" not in json.dumps(activity)
    assert "command_snapshot" not in json.dumps([corrected, history, activity])
    async with pool.acquire() as conn:
        saved = await conn.fetchrow(
            "SELECT * FROM patient_tooth_condition_revisions WHERE id=$1",
            UUID(receipt["correction_revision_id"]),
        )
        assert (
            saved["operation_id"] == UUID(command["operation_id"])
            and saved["correction_reason"] == "Error sintético"
        )
        assert json.loads(saved["command_snapshot"])["condition_id"] == original["id"]
        assert (
            await conn.fetchval(
                "SELECT count(*) FROM patient_tooth_condition_revisions WHERE condition_id=$1",
                UUID(original["id"]),
            )
            == corrected["revision"]
        )


async def test_correction_duplicates_uuid_ownership_and_overlap(workspace_db, condition_client):
    _, owner, other, patient, second, foreign = workspace_db
    client = condition_client
    base = f"/api/patients/{patient}/conditions"
    source, duplicate = condition_body(), condition_body(26)
    for body in (source, duplicate):
        assert (await client.post(base, json=body)).status_code == 201
    path = f"{base}/{source['id']}"
    command = correction_body(replacement={**duplicate, "id": str(uuid4())})
    result = await client.post(f"{path}/corrections", json=command)
    assert (
        result.status_code == 409 and result.json()["detail"]["code"] == "active_condition_exists"
    )
    assert result.json()["detail"]["existing"]["id"] == duplicate["id"]
    assert (await client.get(path)).json()["revision"] == 1
    # A globally colliding replacement UUID is not a create retry, even if owned.
    for replacement_id in (duplicate["id"], source["id"]):
        result = await client.post(
            f"{path}/corrections",
            json=correction_body(replacement=condition_body(27, id=replacement_id)),
        )
        assert (
            result.status_code == 409 and result.json()["detail"]["code"] == "idempotency_conflict"
        )
    foreign_id = uuid4()
    await patient_conditions_repo.create_condition(
        other,
        foreign,
        foreign_id,
        {
            "dentition": "permanent",
            "tooth_fdi": 26,
            "condition_code": "caries",
            "surfaces": [],
            "note": None,
        },
    )
    for target in (
        f"/api/patients/{foreign}/conditions/{foreign_id}/corrections",
        f"/api/patients/{second}/conditions/{source['id']}/corrections",
        f"/api/patients/{patient}/conditions/{foreign_id}/corrections",
        f"/api/patients/{uuid4()}/conditions/{source['id']}/corrections",
    ):
        result = await client.post(target, json=command)
        assert result.status_code == 404 and result.json()["detail"]["code"] == "not_found"
    for identifier in (foreign_id,):
        result = await client.post(
            f"{path}/corrections",
            json=correction_body(replacement=condition_body(27, id=str(identifier))),
        )
        assert result.status_code == 404 and "existing" not in result.json()["detail"]
    second_id = uuid4()
    await patient_conditions_repo.create_condition(
        owner,
        second,
        second_id,
        {
            "dentition": "permanent",
            "tooth_fdi": 26,
            "condition_code": "caries",
            "surfaces": [],
            "note": None,
        },
    )
    assert (
        await client.post(
            f"{path}/corrections",
            json=correction_body(replacement=condition_body(27, id=str(second_id))),
        )
    ).status_code == 404
    assert (await client.get(path)).json()["revision"] == 1
    assert (await client.get(f"{path}/revisions")).json()["total"] == 1
    # Overlapping extents are allowed; exact original identity is also replaceable.
    overlap = correction_body(replacement=condition_body(26, surfaces=["M"]))
    assert (await client.post(f"{path}/corrections", json=overlap)).status_code == 201
    same_identity = correction_body(replacement={**duplicate, "id": str(uuid4())})
    assert (
        await client.post(f"{base}/{duplicate['id']}/corrections", json=same_identity)
    ).status_code == 201


@pytest.mark.parametrize(
    "failure_stage", ["corrected_revision", "replacement_insert", "replacement_revision"]
)
async def test_correction_failure_rolls_back_every_write(
    workspace_db, condition_client, monkeypatch, failure_stage
):
    pool, _, _, patient, *_ = workspace_db
    client = condition_client
    base = f"/api/patients/{patient}/conditions"
    source = condition_body()
    assert (await client.post(base, json=source)).status_code == 201
    path = f"{base}/{source['id']}"
    original_revision = patient_conditions_repo._revision

    async def fail_revision(*args, **kwargs):
        before = args[5]
        if (failure_stage == "corrected_revision" and before is not None) or (
            failure_stage == "replacement_revision" and before is None
        ):
            raise RuntimeError("synthetic correction failure")
        return await original_revision(*args, **kwargs)

    command = correction_body(replacement=condition_body(26))
    if failure_stage == "replacement_insert":
        # Real insert failure at DB boundary, after source mutation/revision.
        async with pool.acquire() as conn:
            await conn.execute("""CREATE FUNCTION fail_s1_replacement() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN IF NEW.supersedes_condition_id IS NOT NULL THEN RAISE EXCEPTION 'synthetic correction failure'; END IF; RETURN NEW; END $$""")
            await conn.execute(
                "CREATE TRIGGER fail_s1_replacement BEFORE INSERT ON patient_tooth_conditions FOR EACH ROW EXECUTE FUNCTION fail_s1_replacement()"
            )
    else:
        monkeypatch.setattr(patient_conditions_repo, "_revision", fail_revision)
    try:
        with pytest.raises(
            (RuntimeError, asyncpg.RaiseError), match="synthetic correction failure"
        ):
            await client.post(f"{path}/corrections", json=command)
    finally:
        if failure_stage == "replacement_insert":
            async with pool.acquire() as conn:
                await conn.execute("DROP TRIGGER fail_s1_replacement ON patient_tooth_conditions")
                await conn.execute("DROP FUNCTION fail_s1_replacement()")
    assert (await client.get(path)).json()["revision"] == 1
    assert (await client.get(path)).json()["status"] == "active"
    assert (await client.get(f"{path}/revisions")).json()["total"] == 1
    assert (await client.get(base)).json()["total"] == 1
    async with pool.acquire() as conn:
        assert (
            await conn.fetchval(
                "SELECT count(*) FROM patient_tooth_condition_revisions WHERE operation_id=$1",
                UUID(command["operation_id"]),
            )
            == 0
        )


@pytest.mark.parametrize("race", ["identical", "distinct", "across_sources", "resolve", "edit"])
async def test_correction_races_have_one_atomic_result(
    workspace_db, condition_client, monkeypatch, race
):
    pool, _, _, patient, *_ = workspace_db
    client = condition_client
    base = f"/api/patients/{patient}/conditions"
    sources = [condition_body(16), condition_body(17)]
    for source in sources:
        assert (await client.post(base, json=source)).status_code == 201
    path = f"{base}/{sources[0]['id']}"
    command = correction_body(replacement=condition_body(26))
    if race == "across_sources":
        # Synchronize different source locks so both reach the owner/operation unique index.
        original_revision = patient_conditions_repo._revision
        arrivals = 0
        barrier = asyncio.Event()

        async def synchronized(*args, **kwargs):
            nonlocal arrivals
            if args[5] is not None:
                arrivals += 1
                if arrivals == 2:
                    barrier.set()
                await asyncio.wait_for(barrier.wait(), 10)
            return await original_revision(*args, **kwargs)

        monkeypatch.setattr(patient_conditions_repo, "_revision", synchronized)
        second_request = client.post(
            f"{base}/{sources[1]['id']}/corrections",
            json={**command, "replacement": condition_body(27)},
        )
    elif race == "resolve":
        second_request = client.patch(path, json={"expected_revision": 1, "status": "resolved"})
    elif race == "edit":
        second_request = client.patch(path, json={"expected_revision": 1, "note": "Concurrent"})
    else:
        second_request = client.post(
            f"{path}/corrections",
            json=command if race == "identical" else {**command, "operation_id": str(uuid4())},
        )
    responses = await asyncio.wait_for(
        asyncio.gather(client.post(f"{path}/corrections", json=command), second_request), 20
    )
    if race == "identical":
        assert sorted(row.status_code for row in responses) == [200, 201]
        assert responses[0].json() == responses[1].json()
    else:
        assert sum(row.status_code in (200, 201) for row in responses) == 1
        assert sum(row.status_code == 409 for row in responses) == 1
        error = next(row for row in responses if row.status_code == 409)
        assert error.json()["detail"]["code"] in (
            {"idempotency_conflict"} if race == "across_sources" else {"revision_conflict"}
        )
    async with pool.acquire() as conn:
        revisions = await conn.fetch(
            "SELECT action FROM patient_tooth_condition_revisions WHERE patient_id=$1 AND revision>1",
            patient,
        )
        assert len(revisions) == 1
        corrections = sum(row["action"] == "corrected" for row in revisions)
        assert (
            await conn.fetchval(
                "SELECT count(*) FROM patient_tooth_conditions WHERE patient_id=$1", patient
            )
            == 2 + corrections
        )
    if race in ("edit", "resolve") and responses[0].status_code == 409:
        # Explicit newly reviewed command may correct a freshly edited/resolved source.
        revised = correction_body(expected_revision=2, replacement=command["replacement"])
        assert (await client.post(f"{path}/corrections", json=revised)).status_code == 201


async def test_correction_operation_scope_cursor_and_chained_replacement(
    workspace_db, condition_client
):
    _, _, other, patient, second, foreign = workspace_db
    client = condition_client
    base = f"/api/patients/{patient}/conditions"
    source = condition_body()
    assert (await client.post(base, json=source)).status_code == 201
    command = correction_body(replacement=condition_body(26))
    first = await client.post(f"{base}/{source['id']}/corrections", json=command)
    assert first.status_code == 201
    second_source = condition_body(17)
    assert (
        await client.post(f"/api/patients/{second}/conditions", json=second_source)
    ).status_code == 201
    other_path = f"/api/patients/{second}/conditions/{second_source['id']}/corrections"
    assert (await client.post(other_path, json=command)).json()["detail"][
        "code"
    ] == "idempotency_conflict"
    foreign_source = uuid4()
    await patient_conditions_repo.create_condition(
        other,
        foreign,
        foreign_source,
        {
            "dentition": "permanent",
            "tooth_fdi": 26,
            "condition_code": "caries",
            "surfaces": [],
            "note": None,
        },
    )

    async def foreign_user():
        return {"id": str(other)}

    app.dependency_overrides[get_current_user] = foreign_user
    foreign_result = await client.post(
        f"/api/patients/{foreign}/conditions/{foreign_source}/corrections",
        json={**command, "replacement": None},
    )
    assert (
        foreign_result.status_code == 201
        and foreign_result.json()["operation_id"] == command["operation_id"]
    )
    assert foreign_result.json()["condition_id"] == str(foreign_source)

    async def owned_user():
        return {"id": str(workspace_db[1])}

    app.dependency_overrides[get_current_user] = owned_user
    replacement_id = command["replacement"]["id"]
    second_correction = await client.post(
        f"{base}/{replacement_id}/corrections", json=correction_body()
    )
    assert second_correction.status_code == 201
    linked = (await client.get(f"{base}/{replacement_id}")).json()
    assert (
        linked["supersedes_condition_id"] == source["id"]
        and linked["correction"]["operation_id"] == second_correction.json()["operation_id"]
    )
    page = (await client.get(base, params={"status": "entered_in_error", "limit": 1})).json()
    assert page["total"] == 2 and page["next_cursor"]
    rest = (
        await client.get(base, params={"status": "entered_in_error", "cursor": page["next_cursor"]})
    ).json()
    assert rest["total"] == 2 and len(rest["items"]) == 1
    assert (
        await client.get(base, params={"status": "active", "cursor": page["next_cursor"]})
    ).status_code == 422
    assert (
        await client.post(f"{base}/{source['id']}/corrections", json=command)
    ).json() == first.json()


async def test_correction_migration_preserves_legacy_evidence_and_sql_guards(monkeypatch):
    """Migrate real 0023 rows, not legacy-shaped fixtures created after 0024."""
    database = "odontogram_s1_" + uuid4().hex
    url = urlsplit(DSN)
    migration_dsn = urlunsplit(url._replace(path="/" + database))
    admin = await asyncpg.connect(DSN)
    pool = None

    async def migrate(target):
        process = await asyncio.create_subprocess_exec(
            sys.executable,
            "-m",
            "alembic",
            "-c",
            "backend/alembic.ini",
            "upgrade",
            target,
            cwd=Path(__file__).resolve().parents[2],
            env={**os.environ, "DATABASE_URL": migration_dsn},
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()
        assert process.returncode == 0, (stdout + stderr).decode()

    try:
        # Only UUID-generated fixture identifiers are interpolated into DDL.
        await admin.execute(f'CREATE DATABASE "{database}"')
        await migrate("0023")
        pool = await asyncpg.create_pool(migration_dsn, min_size=1, max_size=3)
        owner, patient, other_patient, source, replacement = (uuid4() for _ in range(5))
        active = {
            "dentition": "permanent",
            "tooth_fdi": 16,
            "condition_code": "caries",
            "surfaces": ["M"],
            "note": "Legacy",
        }
        before = {**active, "note": None}
        resolved = {**active, "status": "resolved"}
        legacy_snapshots = [
            {**before, "status": "active"},
            {**active, "status": "active"},
            resolved,
        ]
        async with pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO users(id,email) VALUES($1,$2)", owner, f"migration-{owner}@example.com"
            )
            for index, identifier in enumerate((patient, other_patient)):
                await conn.execute(
                    "INSERT INTO patients(id,owner_user_id,first_name,last_name,rut_number,rut_dv) VALUES($1,$2,'Synthetic','Migration',$3,'5')",
                    identifier,
                    owner,
                    12000000 + index,
                )
            await conn.execute(
                """INSERT INTO patient_tooth_conditions
                (id,owner_user_id,patient_id,dentition,tooth_fdi,condition_code,surfaces,note,status,revision,created_by_user_id,updated_by_user_id)
                VALUES($1,$2,$3,'permanent',16,'caries',ARRAY['M'],'Legacy','resolved',3,$2,$2)""",
                source,
                owner,
                patient,
            )
            for index, snapshot_value in enumerate(legacy_snapshots):
                await conn.execute(
                    """INSERT INTO patient_tooth_condition_revisions
                    (id,condition_id,owner_user_id,patient_id,revision,before_snapshot,after_snapshot,actor_user_id,action)
                    VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$3,$8)""",
                    uuid4(),
                    source,
                    owner,
                    patient,
                    index + 1,
                    json.dumps(legacy_snapshots[index - 1]) if index else None,
                    json.dumps(snapshot_value),
                    ("created", "edited", "resolved")[index],
                )
            original = [
                dict(row)
                for row in await conn.fetch(
                    "SELECT * FROM patient_tooth_condition_revisions WHERE condition_id=$1 ORDER BY revision",
                    source,
                )
            ]
            original_condition = dict(
                await conn.fetchrow("SELECT * FROM patient_tooth_conditions WHERE id=$1", source)
            )
        await migrate("head")
        monkeypatch.setattr(patient_conditions_repo, "get_pg_pool", lambda: pool)
        # The new application reads null additive metadata without altering earlier rows.
        current = await patient_conditions_repo.get_condition(owner, patient, source)
        assert current["status"] == "resolved" and current["correction"] is None
        async with pool.acquire() as conn:
            assert await conn.fetchval("SELECT version_num FROM alembic_version") == "0024"
            actual = [
                dict(row)
                for row in await conn.fetch(
                    "SELECT * FROM patient_tooth_condition_revisions WHERE condition_id=$1 ORDER BY revision",
                    source,
                )
            ]
            for old, new in zip(original, actual, strict=True):
                assert all(new[key] == value for key, value in old.items())
                assert all(
                    new[key] is None
                    for key in (
                        "operation_id",
                        "correction_reason",
                        "command_snapshot",
                        "replacement_condition_id",
                        "replacement_revision_id",
                    )
                )
            migrated_condition = dict(
                await conn.fetchrow("SELECT * FROM patient_tooth_conditions WHERE id=$1", source)
            )
            assert all(
                migrated_condition[key] == value for key, value in original_condition.items()
            )
            assert migrated_condition["supersedes_condition_id"] is None
        from backend.patients import condition_service
        from backend.patients.conditions import CorrectCondition

        command = CorrectCondition.model_validate(
            correction_body(
                expected_revision=3, replacement=condition_body(26, id=str(replacement))
            )
        )
        receipt, created = await condition_service.correct(owner, patient, source, command)
        assert created and receipt.replacement_condition_id == replacement
        async with pool.acquire() as conn:
            # Both expanded 0022 checks admitted revision4/corrected; invalid revision shape and metadata still fail.
            for revision, action, reason in (
                (1, "corrected", "Error"),
                (5, "created", "Error"),
                (5, "corrected", " "),
            ):
                with pytest.raises(asyncpg.CheckViolationError):
                    async with conn.transaction():
                        await conn.execute(
                            """INSERT INTO patient_tooth_condition_revisions
                            (id,condition_id,owner_user_id,patient_id,revision,before_snapshot,after_snapshot,actor_user_id,action,operation_id,correction_reason,command_snapshot)
                            VALUES($1,$2,$3,$4,$5,'{}','{}',$3,$6,$7,$8,'{}')""",
                            uuid4(),
                            source,
                            owner,
                            patient,
                            revision,
                            action,
                            uuid4(),
                            reason,
                        )
            for target_patient, expected_error in (
                (patient, asyncpg.UniqueViolationError),
                (other_patient, asyncpg.ForeignKeyViolationError),
            ):
                with pytest.raises(expected_error):
                    async with conn.transaction():
                        await conn.execute(
                            """INSERT INTO patient_tooth_conditions
                            (id,owner_user_id,patient_id,dentition,tooth_fdi,condition_code,surfaces,created_by_user_id,updated_by_user_id,supersedes_condition_id)
                            VALUES($1,$2,$3,'permanent',27,'caries','{}',$2,$2,$4)""",
                            uuid4(),
                            owner,
                            target_patient,
                            source if target_patient == patient else replacement,
                        )
        # Expand-only rollback leaves the corrected status and receipt untouched.
        process = await asyncio.create_subprocess_exec(
            sys.executable,
            "-m",
            "alembic",
            "-c",
            "backend/alembic.ini",
            "downgrade",
            "0023",
            cwd=Path(__file__).resolve().parents[2],
            env={**os.environ, "DATABASE_URL": migration_dsn},
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()
        assert process.returncode == 0, (stdout + stderr).decode()
        replay, created = await condition_service.correct(owner, patient, source, command)
        assert not created and replay == receipt
        assert (await patient_conditions_repo.get_condition(owner, patient, source))[
            "status"
        ] == "entered_in_error"
    finally:
        if pool is not None:
            await pool.close()
        await admin.execute(f'DROP DATABASE IF EXISTS "{database}"')
        await admin.close()
