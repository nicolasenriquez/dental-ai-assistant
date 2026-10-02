"""Real SQL/lock evidence on an explicitly selected isolated database.

Creates only synthetic owned rows, then deletes those rows. Never truncates.
"""

import asyncio
import os
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import asyncpg
import pytest

from backend.clinical_assistant import pending_work, service
from backend.clinical_assistant.schemas import PrepareSaveRequest
from backend.db import clinical_assistant_repo as repo
from backend.db import clinical_pending_work_repo, patients_repo

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
