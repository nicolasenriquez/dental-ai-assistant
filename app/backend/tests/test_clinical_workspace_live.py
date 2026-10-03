"""Real SQL/lock evidence on an explicitly selected isolated database.

Creates only synthetic owned rows, then deletes those rows. Never truncates.
"""

import asyncio
import json
import os
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import asyncpg
import pytest
from httpx import ASGITransport, AsyncClient

from backend.auth.dependencies import get_current_user
from backend.clinical_assistant import pending_work, service
from backend.clinical_assistant.schemas import PrepareSaveRequest
from backend.db import clinical_assistant_repo as repo
from backend.db import clinical_pending_work_repo, patients_repo
from backend.main import app
from backend.routes import patients as patient_routes

DSN = os.environ.get("WORKSPACE_LIVE_TEST_DSN", "")
pytestmark = pytest.mark.skipif(not DSN, reason="WORKSPACE_LIVE_TEST_DSN not set")


@pytest.fixture
async def workspace_db(monkeypatch):
    pool = await asyncpg.create_pool(DSN, min_size=1, max_size=3)
    for module in (repo, clinical_pending_work_repo, patients_repo):
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
