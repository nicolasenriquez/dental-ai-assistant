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


async def test_live_retry_retains_history_and_rejects_changed_or_duplicate_attempts(db):
    owner = await _make_user(db)
    thread = await _make_thread(db, owner)
    failed, retry = uuid4(), uuid4()
    context = [{"id": "synthetic", "content": "Synthetic attachment"}]
    await clinical_assistant_repo.claim_turn(owner, thread, failed, "Synthetic note", context)
    await clinical_assistant_repo.finish_turn(
        owner, thread, failed, "failed", "CLINICAL_TURN_CANCELLED"
    )
    with pytest.raises(clinical_assistant_repo.InvalidClinicalRetryError):
        await clinical_assistant_repo.claim_turn(
            owner, thread, retry, "Changed note", context, retry_of_turn_id=failed
        )
    with pytest.raises(clinical_assistant_repo.InvalidClinicalRetryError):
        await clinical_assistant_repo.claim_turn(
            owner, thread, retry, "Synthetic note", retry_of_turn_id=failed
        )
    claimed = await clinical_assistant_repo.claim_turn(
        owner, thread, retry, "Synthetic note", context, retry_of_turn_id=failed
    )
    assert claimed["message"]["retry_of_turn_id"] == failed
    replay = await clinical_assistant_repo.claim_turn(
        owner, thread, retry, "Synthetic note", context, retry_of_turn_id=failed
    )
    assert replay["replay"]
    with pytest.raises(clinical_assistant_repo.TurnIdempotencyConflictError):
        await clinical_assistant_repo.claim_turn(owner, thread, retry, "Synthetic note")
    await clinical_assistant_repo.finish_turn(owner, thread, retry, "completed")
    with pytest.raises(clinical_assistant_repo.InvalidClinicalRetryError):
        await clinical_assistant_repo.claim_turn(
            owner, thread, uuid4(), "Synthetic note", retry_of_turn_id=failed
        )
    hydrated = await clinical_assistant_repo.get_thread(owner, thread)
    assert hydrated is not None
    assert len(hydrated["messages"]) == 2
    assert hydrated["messages"][0]["turn_status"] == "failed"
    assert hydrated["messages"][1]["retry_of_turn_id"] == failed
    assert hydrated["messages"][1]["context_items"] == context


async def test_live_retry_cannot_target_another_thread_owner_or_completed_turn(db):
    owner, other = await _make_user(db), await _make_user(db)
    thread = await _make_thread(db, owner)
    other_thread = await _make_thread(db, other)
    completed = uuid4()
    await clinical_assistant_repo.claim_turn(owner, thread, completed, "Synthetic note")
    await clinical_assistant_repo.finish_turn(owner, thread, completed, "completed")
    with pytest.raises(clinical_assistant_repo.InvalidClinicalRetryError):
        await clinical_assistant_repo.claim_turn(
            owner, thread, uuid4(), "Synthetic note", retry_of_turn_id=completed
        )
    failed = uuid4()
    await clinical_assistant_repo.claim_turn(other, other_thread, failed, "Synthetic note")
    await clinical_assistant_repo.finish_turn(
        other, other_thread, failed, "failed", "CLINICAL_TURN_CANCELLED"
    )
    with pytest.raises(clinical_assistant_repo.InvalidClinicalRetryError):
        await clinical_assistant_repo.claim_turn(
            owner, thread, uuid4(), "Synthetic note", retry_of_turn_id=failed
        )
    with pytest.raises(LookupError):
        await clinical_assistant_repo.claim_turn(
            owner, other_thread, uuid4(), "Synthetic note", retry_of_turn_id=failed
        )


async def test_live_advisory_lock_serializes_quota_count_and_insert(db):
    owner = await _make_user(db)
    async with db.acquire() as conn:
        for _ in range(clinical_assistant_repo.CLINICAL_TURN_LIMIT_PER_24H - 1):
            await conn.execute(
                "INSERT INTO clinical_turn_usage (owner_user_id, created_at) VALUES ($1, now())",
                owner,
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


async def test_live_deleting_threads_does_not_refill_quota(db):
    owner = await _make_user(db)
    for _ in range(clinical_assistant_repo.CLINICAL_TURN_LIMIT_PER_24H):
        thread = await _make_thread(db, owner)
        turn = uuid4()
        await clinical_assistant_repo.claim_turn(owner, thread, turn, "Synthetic note")
        await clinical_assistant_repo.finish_turn(owner, thread, turn, "completed")
        await clinical_assistant_repo.delete_thread(owner, thread)
    fresh = await _make_thread(db, owner)
    with pytest.raises(clinical_assistant_repo.ClinicalRateLimitError):
        await clinical_assistant_repo.claim_turn(owner, fresh, uuid4(), "Synthetic note")


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


async def test_live_update_artifact_payload_and_turn_guards(db):
    """Regression for BUG-001/002: guarded writes must be conditional in SQL."""
    owner = await _make_user(db)
    thread = await _make_thread(db, owner)
    patient = await _make_patient(db, owner)
    turn = uuid4()
    artifact_id = uuid4()
    draft = {
        "context": "Control",
        "findings": "",
        "assessment": "",
        "treatment": "",
        "follow_up": "",
        "review_flags": [],
    }
    payload = {
        "source_note": "Nota",
        "generated_draft": draft,
        "draft": draft,
        "evolution_at": "2026-01-01T00:00:00+00:00",
    }
    await clinical_assistant_repo.claim_turn(owner, thread, turn, "Nota")
    await clinical_assistant_repo.create_artifact(
        owner, thread, turn, patient, artifact_id, payload
    )

    # Payload guard: matching snapshot updates; diverging snapshot is rejected.
    updated = await clinical_assistant_repo.update_artifact(
        owner,
        thread,
        artifact_id,
        payload={**payload, "draft": {**draft, "context": "Cambio humano"}},
        status="draft",
        expected_payload=payload,
    )
    assert updated is not None

    stale_snapshot = {**payload, "draft": {**draft, "context": "Edición concurrente"}}
    rejected = await clinical_assistant_repo.update_artifact(
        owner,
        thread,
        artifact_id,
        payload={**payload, "draft": {**draft, "context": "Regeneración tarde"}},
        status="draft",
        expected_payload=stale_snapshot,
    )
    assert rejected is None

    # Turn guard: once the active turn moves on, the old turn's write fails;
    # an unguarded (human) write still succeeds.
    new_turn = uuid4()
    async with db.acquire() as conn:
        await conn.execute(
            "UPDATE clinical_threads SET active_turn_id = $2, updated_at = now() WHERE id = $1",
            thread,
            new_turn,
        )
    guarded = await clinical_assistant_repo.update_artifact(
        owner,
        thread,
        artifact_id,
        payload=payload,
        status="draft",
        expected_turn_id=turn,
    )
    assert guarded is None
    unguarded = await clinical_assistant_repo.update_artifact(
        owner, thread, artifact_id, payload=payload, status="draft"
    )
    assert unguarded is not None


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
