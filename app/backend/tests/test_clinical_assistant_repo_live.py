"""Live-Postgres proof for clinical turn locks and stale-turn fences.

Run with ``CLINICAL_LIVE_TEST_DSN`` set to a scratch database after the Alembic
head is applied. The tests intentionally use two concurrent connections for
the per-user quota boundary; mocked repository tests cannot prove that lock.
"""

from __future__ import annotations

import asyncio
import os
from uuid import UUID, uuid4

import asyncpg
import pytest

from backend.db import clinical_assistant_repo

DSN = os.environ.get("CLINICAL_LIVE_TEST_DSN", "")
if not DSN:
    pytestmark = pytest.mark.skip(reason="CLINICAL_LIVE_TEST_DSN not set")


@pytest.fixture
async def db(monkeypatch):
    try:
        pool = await asyncpg.create_pool(DSN, min_size=1, max_size=2)
    except OSError as exc:
        pytest.skip(f"live Postgres unreachable: {exc}")
    monkeypatch.setattr(clinical_assistant_repo, "get_pg_pool", lambda: pool)
    async with pool.acquire() as conn:
        await conn.execute("TRUNCATE clinical_threads, users CASCADE;")
    yield pool
    await pool.close()


async def _make_user(db) -> UUID:
    user_id = uuid4()
    async with db.acquire() as conn:
        await conn.execute(
            "INSERT INTO users (id, email, password_hash) VALUES ($1, $2, NULL)",
            user_id,
            f"clinical-{user_id.hex[:12]}@example.com",
        )
    return user_id


async def _make_thread(db, owner: UUID) -> UUID:
    thread_id = uuid4()
    async with db.acquire() as conn:
        await conn.execute(
            "INSERT INTO clinical_threads (id, owner_user_id, title) VALUES ($1, $2, $3)",
            thread_id,
            owner,
            "Live clinical test",
        )
    return thread_id


async def _make_patient(db, owner: UUID) -> UUID:
    patient_id = uuid4()
    async with db.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO patients (id, owner_user_id, first_name, last_name, rut_number, rut_dv)
            VALUES ($1, $2, 'Live', 'Patient', $3, '1')
            """,
            patient_id,
            owner,
            int(patient_id.int % 2_000_000_000),
        )
    return patient_id


async def test_live_advisory_lock_serializes_quota_count_and_insert(db):
    owner = await _make_user(db)
    history_thread = await _make_thread(db, owner)
    async with db.acquire() as conn:
        for _ in range(clinical_assistant_repo.CLINICAL_TURN_LIMIT_PER_24H - 1):
            await conn.execute(
                """
                INSERT INTO clinical_messages (id, thread_id, turn_id, role, content)
                VALUES ($1, $2, $3, 'user', 'history')
                """,
                uuid4(),
                history_thread,
                uuid4(),
            )

    thread_a = await _make_thread(db, owner)
    thread_b = await _make_thread(db, owner)
    results = await asyncio.gather(
        clinical_assistant_repo.claim_turn(owner, thread_a, uuid4(), "turn-a"),
        clinical_assistant_repo.claim_turn(owner, thread_b, uuid4(), "turn-b"),
        return_exceptions=True,
    )

    assert sum(not isinstance(result, Exception) for result in results) == 1
    assert (
        sum(
            isinstance(result, clinical_assistant_repo.ClinicalRateLimitError) for result in results
        )
        == 1
    )


async def test_live_stale_turn_cannot_write_message_artifact_or_action(db):
    owner = await _make_user(db)
    thread = await _make_thread(db, owner)
    patient = await _make_patient(db, owner)
    old_turn = uuid4()
    new_turn = uuid4()
    await clinical_assistant_repo.claim_turn(owner, thread, old_turn, "old turn")

    async with db.acquire() as conn:
        await conn.execute(
            "UPDATE clinical_threads SET active_turn_id = $2, updated_at = now() WHERE id = $1",
            thread,
            new_turn,
        )

    with pytest.raises(clinical_assistant_repo.StaleClinicalTurnError):
        await clinical_assistant_repo.append_message(owner, thread, old_turn, "assistant", "late")
    with pytest.raises(clinical_assistant_repo.StaleClinicalTurnError):
        await clinical_assistant_repo.set_active_patient(owner, thread, patient, turn_id=old_turn)
    with pytest.raises(clinical_assistant_repo.StaleClinicalTurnError):
        await clinical_assistant_repo.create_artifact(
            owner, thread, old_turn, patient, uuid4(), {"draft": "late"}
        )
    with pytest.raises(clinical_assistant_repo.StaleClinicalTurnError):
        await clinical_assistant_repo.create_pending_action(
            owner,
            thread,
            old_turn,
            uuid4(),
            patient,
            "save_evolution",
            {"draft": "late"},
            "hash-late",
        )

    async with db.acquire() as conn:
        assistant_messages = await conn.fetchval(
            "SELECT count(*) FROM clinical_messages WHERE thread_id = $1 AND role = 'assistant'",
            thread,
        )
        artifacts = await conn.fetchval(
            "SELECT count(*) FROM clinical_turn_artifacts WHERE thread_id = $1", thread
        )
        actions = await conn.fetchval(
            "SELECT count(*) FROM clinical_pending_actions WHERE thread_id = $1", thread
        )
    assert assistant_messages == 0
    assert artifacts == 0
    assert actions == 0


async def test_live_completed_turn_draft_can_create_pending_action(db):
    owner = await _make_user(db)
    thread = await _make_thread(db, owner)
    patient = await _make_patient(db, owner)
    turn = uuid4()
    artifact = uuid4()
    await clinical_assistant_repo.claim_turn(owner, thread, turn, "completed turn")
    await clinical_assistant_repo.create_artifact(
        owner, thread, turn, patient, artifact, {"draft": "ready"}
    )
    await clinical_assistant_repo.finish_turn(owner, thread, turn, "completed")

    action = await clinical_assistant_repo.create_pending_action(
        owner,
        thread,
        turn,
        artifact,
        patient,
        "save_evolution",
        {"draft": "ready"},
        "hash-ready",
    )

    assert action["artifact_id"] == artifact
