"""Real SQL/lock evidence on an explicitly selected isolated database.

Creates only synthetic owned rows, then deletes those rows. Never truncates.
"""

import asyncio
import base64
import json
import os
from datetime import UTC, datetime, timedelta
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
