"""Live-Postgres proof for the canonical approval recovery contract (task 5.3).

Run against an isolated scratch database (``CLINICAL_LIVE_TEST_DSN``) after the
Alembic head is applied. These tests exercise the real ``recover_draft``
transaction, ``FOR UPDATE NOWAIT`` locks, rollback paths and the fresh
approval -> single evolution save; mocked repository tests cannot prove the
locking or the absence of duplicate clinical/export writes.
"""

from __future__ import annotations

import asyncio
import json
import os
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import asyncpg
import pytest

from backend.db import clinical_assistant_repo
from backend.evolution_exports import service as evolution_exports_service

DSN = os.environ.get("CLINICAL_LIVE_TEST_DSN", "")
if not DSN:
    pytestmark = pytest.mark.skip(reason="CLINICAL_LIVE_TEST_DSN not set")

HASH = "a" * 64


@pytest.fixture
async def db(monkeypatch):
    try:
        pool = await asyncpg.create_pool(DSN, min_size=1, max_size=4)
    except OSError as exc:
        pytest.skip(f"live Postgres unreachable: {exc}")
    monkeypatch.setattr(clinical_assistant_repo, "get_pg_pool", lambda: pool)
    monkeypatch.setattr(evolution_exports_service, "get_pg_pool", lambda: pool)
    async with pool.acquire() as conn:
        await conn.execute("TRUNCATE users CASCADE")
    yield pool
    await pool.close()


async def _make_user(db) -> UUID:
    user_id = uuid4()
    async with db.acquire() as conn:
        await conn.execute(
            "INSERT INTO users (id, email, password_hash) VALUES ($1, $2, NULL)",
            user_id,
            f"recovery-{user_id.hex[:12]}@example.com",
        )
    return user_id


async def _make_patient(db, owner: UUID) -> UUID:
    patient_id = uuid4()
    async with db.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO patients (id, owner_user_id, first_name, last_name, rut_number, rut_dv)
            VALUES ($1, $2, 'Ana', 'Pérez', $3, '5')
            """,
            patient_id,
            owner,
            int(patient_id.int % 2_000_000_000),
        )
    return patient_id


async def _make_thread(db, owner: UUID) -> UUID:
    thread_id = uuid4()
    async with db.acquire() as conn:
        await conn.execute(
            "INSERT INTO clinical_threads (id, owner_user_id, title) VALUES ($1, $2, $3)",
            thread_id,
            owner,
            "Recovery live test",
        )
    return thread_id


def _payload(context: str = "Control") -> dict[str, Any]:
    draft = {
        "context": context,
        "findings": "Hallazgo sintético",
        "assessment": "",
        "treatment": "",
        "follow_up": "",
        "review_flags": [],
    }
    return {
        "source_note": "Nota sintética",
        "generated_draft": dict(draft),
        "draft": dict(draft),
        "evolution_at": "2026-01-01T00:00:00+00:00",
    }


async def _make_artifact(
    db,
    owner: UUID,
    thread: UUID,
    patient: UUID,
    *,
    status: str = "failed",
    turn_id: UUID | None = None,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    artifact_id = uuid4()
    turn_id = turn_id or uuid4()
    stored = payload if payload is not None else _payload()
    async with db.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO clinical_turn_artifacts (
                id, owner_user_id, thread_id, turn_id, patient_id, artifact_type, status, payload
            ) VALUES ($1, $2, $3, $4, $5, 'clinical_draft', $6, $7::jsonb)
            """,
            artifact_id,
            owner,
            thread,
            turn_id,
            patient,
            status,
            json.dumps(stored, ensure_ascii=False),
        )
        updated_at = await conn.fetchval(
            "SELECT updated_at FROM clinical_turn_artifacts WHERE id = $1", artifact_id
        )
    return {
        "id": artifact_id,
        "turn_id": turn_id,
        "updated_at": updated_at,
        "payload": stored,
    }


async def _make_action(
    db,
    owner: UUID,
    thread: UUID,
    patient: UUID,
    artifact_id: UUID,
    *,
    status: str = "failed",
    turn_id: UUID | None = None,
    proposal_hash: str = HASH,
    created_at: datetime | None = None,
    result_resource_id: UUID | None = None,
) -> dict[str, Any]:
    action_id = uuid4()
    resolved_at = None if status == "pending" else datetime.now(UTC)
    async with db.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO clinical_pending_actions (
                id, owner_user_id, thread_id, turn_id, artifact_id, patient_id, action_type,
                proposal_payload, proposal_hash, status, expires_at, created_at, resolved_at,
                result_resource_id
            ) VALUES ($1, $2, $3, $4, $5, $6, 'save_evolution', NULL, $7, $8,
                      now() + interval '30 minutes', $9, $10, $11)
            RETURNING created_at, resolved_at
            """,
            action_id,
            owner,
            thread,
            turn_id or uuid4(),
            artifact_id,
            patient,
            proposal_hash,
            status,
            created_at or datetime.now(UTC),
            resolved_at,
            result_resource_id,
        )
    return {
        "id": action_id,
        "created_at": row["created_at"],
        "resolved_at": row["resolved_at"],
    }


async def _make_evolution(db, owner: UUID, patient: UUID) -> UUID:
    evolution_id = uuid4()
    async with db.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO evolutions (
                id, patient_id, owner_user_id, evolution_at, raw_note, generated_text, final_text
            ) VALUES ($1, $2, $3, now(), 'raw', 'generated', 'final')
            """,
            evolution_id,
            patient,
            owner,
        )
    return evolution_id


async def _artifact_row(db, artifact_id: UUID) -> dict[str, Any]:
    async with db.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT status, payload, resolved_at, updated_at FROM clinical_turn_artifacts WHERE id = $1",
            artifact_id,
        )
    assert row is not None
    result = dict(row)
    if isinstance(result.get("payload"), str):
        result["payload"] = json.loads(result["payload"])
    return result


async def _action_row(db, action_id: UUID) -> dict[str, Any]:
    async with db.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT status, proposal_hash, created_at, resolved_at, result_resource_id
            FROM clinical_pending_actions WHERE id = $1
            """,
            action_id,
        )
    assert row is not None
    return dict(row)


async def _count(db, sql: str, *args: object) -> int:
    async with db.acquire() as conn:
        return int(await conn.fetchval(sql, *args) or 0)


async def test_live_recovery_restores_failed_draft_and_preserves_terminal_action(db) -> None:
    owner = await _make_user(db)
    patient = await _make_patient(db, owner)
    thread = await _make_thread(db, owner)
    artifact = await _make_artifact(db, owner, thread, patient, status="failed")
    action = await _make_action(
        db, owner, thread, patient, artifact["id"], status="failed", turn_id=artifact["turn_id"]
    )

    result = await clinical_assistant_repo.recover_draft(
        owner, action["id"], HASH, artifact["updated_at"]
    )

    assert result == {"outcome": "recovered", "thread_id": thread, "artifact_id": artifact["id"]}
    row = await _artifact_row(db, artifact["id"])
    assert row["status"] == "draft"
    assert row["resolved_at"] is None
    assert row["updated_at"] > artifact["updated_at"]
    assert row["payload"] == artifact["payload"]
    action_row = await _action_row(db, action["id"])
    assert action_row["status"] == "failed"
    assert action_row["proposal_hash"] == HASH
    assert action_row["created_at"] == action["created_at"]
    assert action_row["result_resource_id"] is None
    assert await _count(db, "SELECT count(*) FROM evolutions WHERE patient_id = $1", patient) == 0
    assert (
        await _count(
            db, "SELECT count(*) FROM google_drive_evolution_exports WHERE user_id = $1", owner
        )
        == 0
    )


async def test_live_expired_action_is_recoverable(db) -> None:
    owner = await _make_user(db)
    patient = await _make_patient(db, owner)
    thread = await _make_thread(db, owner)
    artifact = await _make_artifact(db, owner, thread, patient, status="failed")
    action = await _make_action(
        db, owner, thread, patient, artifact["id"], status="expired", turn_id=artifact["turn_id"]
    )

    result = await clinical_assistant_repo.recover_draft(
        owner, action["id"], HASH, artifact["updated_at"]
    )

    assert result["outcome"] == "recovered"
    assert (await _artifact_row(db, artifact["id"]))["status"] == "draft"
    assert (await _action_row(db, action["id"]))["status"] == "expired"


async def test_live_repeated_recovery_after_edit_does_not_rewind(db) -> None:
    owner = await _make_user(db)
    patient = await _make_patient(db, owner)
    thread = await _make_thread(db, owner)
    artifact = await _make_artifact(db, owner, thread, patient, status="failed")
    action = await _make_action(
        db, owner, thread, patient, artifact["id"], status="failed", turn_id=artifact["turn_id"]
    )
    await clinical_assistant_repo.recover_draft(owner, action["id"], HASH, artifact["updated_at"])

    edited = _payload(context="Editado después de la recuperación")
    await clinical_assistant_repo.update_artifact(
        owner, thread, artifact["id"], payload=edited, status="draft"
    )

    # The lost first response replays with the stale timestamp; the artifact is
    # already draft, so it must report identity without overwriting later edits.
    replay = await clinical_assistant_repo.recover_draft(
        owner, action["id"], HASH, artifact["updated_at"]
    )
    assert replay["outcome"] == "already_recovered"
    assert (await _artifact_row(db, artifact["id"]))["payload"]["draft"]["context"] == (
        "Editado después de la recuperación"
    )


async def test_live_simultaneous_recoveries_restore_at_most_one_draft(db) -> None:
    owner = await _make_user(db)
    patient = await _make_patient(db, owner)
    thread = await _make_thread(db, owner)
    artifact = await _make_artifact(db, owner, thread, patient, status="failed")
    action = await _make_action(
        db, owner, thread, patient, artifact["id"], status="failed", turn_id=artifact["turn_id"]
    )

    results = await asyncio.gather(
        clinical_assistant_repo.recover_draft(owner, action["id"], HASH, artifact["updated_at"]),
        clinical_assistant_repo.recover_draft(owner, action["id"], HASH, artifact["updated_at"]),
        return_exceptions=True,
    )

    recovered = [r for r in results if isinstance(r, dict) and r.get("outcome") == "recovered"]
    already = [
        r for r in results if isinstance(r, dict) and r.get("outcome") == "already_recovered"
    ]
    busy = [r for r in results if isinstance(r, clinical_assistant_repo.RecoveryBusyError)]
    assert len(recovered) == 1
    assert len(recovered) + len(already) + len(busy) == 2
    assert (await _artifact_row(db, artifact["id"]))["status"] == "draft"
    assert (await _action_row(db, action["id"]))["status"] == "failed"
    assert await _count(db, "SELECT count(*) FROM evolutions WHERE patient_id = $1", patient) == 0


async def test_live_lock_contention_returns_busy_without_mutation(db) -> None:
    owner = await _make_user(db)
    patient = await _make_patient(db, owner)
    thread = await _make_thread(db, owner)
    artifact = await _make_artifact(db, owner, thread, patient, status="failed")
    action = await _make_action(
        db, owner, thread, patient, artifact["id"], status="failed", turn_id=artifact["turn_id"]
    )

    async with db.acquire() as holder, holder.transaction():
        await holder.execute(
            "SELECT 1 FROM clinical_pending_actions WHERE id = $1 FOR UPDATE", action["id"]
        )
        with pytest.raises(clinical_assistant_repo.RecoveryBusyError):
            await clinical_assistant_repo.recover_draft(
                owner, action["id"], HASH, artifact["updated_at"]
            )

    assert (await _artifact_row(db, artifact["id"]))["status"] == "failed"
    result = await clinical_assistant_repo.recover_draft(
        owner, action["id"], HASH, artifact["updated_at"]
    )
    assert result["outcome"] == "recovered"


async def test_live_superseded_action_rejects_without_mutation(db) -> None:
    owner = await _make_user(db)
    patient = await _make_patient(db, owner)
    thread = await _make_thread(db, owner)
    artifact = await _make_artifact(db, owner, thread, patient, status="failed")
    old = await _make_action(
        db,
        owner,
        thread,
        patient,
        artifact["id"],
        status="failed",
        turn_id=artifact["turn_id"],
        created_at=datetime.now(UTC) - timedelta(minutes=5),
    )
    await _make_action(
        db,
        owner,
        thread,
        patient,
        artifact["id"],
        status="failed",
        turn_id=artifact["turn_id"],
        created_at=datetime.now(UTC),
    )

    with pytest.raises(clinical_assistant_repo.RecoveryStaleError):
        await clinical_assistant_repo.recover_draft(owner, old["id"], HASH, artifact["updated_at"])

    assert (await _artifact_row(db, artifact["id"]))["status"] == "failed"
    assert (await _action_row(db, old["id"]))["status"] == "failed"


async def test_live_pending_or_declined_action_is_ineligible(db) -> None:
    owner = await _make_user(db)
    patient = await _make_patient(db, owner)
    thread = await _make_thread(db, owner)

    pending_artifact = await _make_artifact(db, owner, thread, patient, status="pending")
    pending = await _make_action(
        db, owner, thread, patient, pending_artifact["id"], status="pending"
    )
    with pytest.raises(clinical_assistant_repo.RecoveryIneligibleError):
        await clinical_assistant_repo.recover_draft(
            owner, pending["id"], HASH, pending_artifact["updated_at"]
        )
    assert (await _artifact_row(db, pending_artifact["id"]))["status"] == "pending"

    declined_artifact = await _make_artifact(db, owner, thread, patient, status="declined")
    declined = await _make_action(
        db, owner, thread, patient, declined_artifact["id"], status="declined"
    )
    with pytest.raises(clinical_assistant_repo.RecoveryIneligibleError):
        await clinical_assistant_repo.recover_draft(
            owner, declined["id"], HASH, declined_artifact["updated_at"]
        )
    assert (await _artifact_row(db, declined_artifact["id"]))["status"] == "declined"


async def test_live_active_turn_or_other_pending_conflicts(db) -> None:
    owner = await _make_user(db)
    patient = await _make_patient(db, owner)
    thread = await _make_thread(db, owner)
    artifact = await _make_artifact(db, owner, thread, patient, status="failed")
    action = await _make_action(
        db, owner, thread, patient, artifact["id"], status="failed", turn_id=artifact["turn_id"]
    )

    async with db.acquire() as conn:
        await conn.execute(
            "UPDATE clinical_threads SET active_turn_id = $2, updated_at = now() WHERE id = $1",
            thread,
            uuid4(),
        )
    with pytest.raises(clinical_assistant_repo.RecoveryConflictError):
        await clinical_assistant_repo.recover_draft(
            owner, action["id"], HASH, artifact["updated_at"]
        )
    assert (await _artifact_row(db, artifact["id"]))["status"] == "failed"

    async with db.acquire() as conn:
        await conn.execute(
            "UPDATE clinical_threads SET active_turn_id = NULL, updated_at = now() WHERE id = $1",
            thread,
        )
    other_artifact = await _make_artifact(db, owner, thread, patient, status="pending")
    await _make_action(db, owner, thread, patient, other_artifact["id"], status="pending")

    with pytest.raises(clinical_assistant_repo.RecoveryConflictError):
        await clinical_assistant_repo.recover_draft(
            owner, action["id"], HASH, artifact["updated_at"]
        )
    assert (await _artifact_row(db, artifact["id"]))["status"] == "failed"


async def test_live_timestamp_and_payload_mismatch_reject_without_mutation(db) -> None:
    owner = await _make_user(db)
    patient = await _make_patient(db, owner)
    thread = await _make_thread(db, owner)
    artifact = await _make_artifact(db, owner, thread, patient, status="failed")
    action = await _make_action(
        db, owner, thread, patient, artifact["id"], status="failed", turn_id=artifact["turn_id"]
    )

    with pytest.raises(clinical_assistant_repo.RecoveryStaleError):
        await clinical_assistant_repo.recover_draft(
            owner, action["id"], HASH, artifact["updated_at"] - timedelta(seconds=1)
        )
    assert (await _artifact_row(db, artifact["id"]))["status"] == "failed"

    malformed = {key: value for key, value in artifact["payload"].items() if key != "draft"}
    async with db.acquire() as conn:
        await conn.execute(
            "UPDATE clinical_turn_artifacts SET payload = $2::jsonb WHERE id = $1",
            artifact["id"],
            json.dumps(malformed, ensure_ascii=False),
        )
    with pytest.raises(clinical_assistant_repo.RecoveryStaleError):
        await clinical_assistant_repo.recover_draft(
            owner, action["id"], HASH, artifact["updated_at"]
        )
    assert (await _artifact_row(db, artifact["id"]))["status"] == "failed"


async def test_live_approved_history_returns_saved_identity_without_mutation(db) -> None:
    owner = await _make_user(db)
    patient = await _make_patient(db, owner)
    thread = await _make_thread(db, owner)
    evolution_id = await _make_evolution(db, owner, patient)
    artifact = await _make_artifact(db, owner, thread, patient, status="failed")
    approved = await _make_action(
        db,
        owner,
        thread,
        patient,
        artifact["id"],
        status="approved",
        turn_id=artifact["turn_id"],
        result_resource_id=evolution_id,
    )

    result = await clinical_assistant_repo.recover_draft(
        owner, approved["id"], HASH, artifact["updated_at"]
    )

    assert result == {
        "outcome": "saved",
        "thread_id": thread,
        "artifact_id": artifact["id"],
        "evolution_id": evolution_id,
    }
    assert (await _artifact_row(db, artifact["id"]))["status"] == "failed"
    assert (await _action_row(db, approved["id"]))["status"] == "approved"
    assert await _count(db, "SELECT count(*) FROM evolutions WHERE patient_id = $1", patient) == 1


async def test_live_contradictory_approved_history_rejects(db) -> None:
    owner = await _make_user(db)
    patient = await _make_patient(db, owner)
    thread = await _make_thread(db, owner)
    artifact = await _make_artifact(db, owner, thread, patient, status="failed")
    approved = await _make_action(
        db, owner, thread, patient, artifact["id"], status="approved", result_resource_id=None
    )

    with pytest.raises(clinical_assistant_repo.RecoveryStaleError):
        await clinical_assistant_repo.recover_draft(
            owner, approved["id"], HASH, artifact["updated_at"]
        )
    assert (await _artifact_row(db, artifact["id"]))["status"] == "failed"


async def test_live_recovery_is_owner_scoped(db) -> None:
    owner_a, owner_b = await _make_user(db), await _make_user(db)
    patient_a = await _make_patient(db, owner_a)
    thread_a = await _make_thread(db, owner_a)
    artifact = await _make_artifact(db, owner_a, thread_a, patient_a, status="failed")
    action = await _make_action(
        db,
        owner_a,
        thread_a,
        patient_a,
        artifact["id"],
        status="failed",
        turn_id=artifact["turn_id"],
    )

    with pytest.raises(LookupError):
        await clinical_assistant_repo.recover_draft(
            owner_b, action["id"], HASH, artifact["updated_at"]
        )
    assert (await _artifact_row(db, artifact["id"]))["status"] == "failed"

    patient_b = await _make_patient(db, owner_b)
    thread_b = await _make_thread(db, owner_b)
    artifact_b = await _make_artifact(db, owner_b, thread_b, patient_b, status="failed")
    action_b = await _make_action(
        db,
        owner_b,
        thread_b,
        patient_b,
        artifact_b["id"],
        status="failed",
        turn_id=artifact_b["turn_id"],
    )
    result = await clinical_assistant_repo.recover_draft(
        owner_b, action_b["id"], HASH, artifact_b["updated_at"]
    )
    assert result["outcome"] == "recovered"
    assert (await _artifact_row(db, artifact_b["id"]))["status"] == "draft"


async def test_live_recovery_then_fresh_approval_saves_once(db) -> None:
    owner = await _make_user(db)
    patient = await _make_patient(db, owner)
    thread = await _make_thread(db, owner)
    artifact = await _make_artifact(db, owner, thread, patient, status="failed")
    old = await _make_action(
        db, owner, thread, patient, artifact["id"], status="failed", turn_id=artifact["turn_id"]
    )

    await clinical_assistant_repo.recover_draft(owner, old["id"], HASH, artifact["updated_at"])

    evolution_id = uuid4()
    fresh_hash = "b" * 64
    proposal = {
        "evolution_id": str(evolution_id),
        "patient_id": str(patient),
        "evolution_at": datetime.now(UTC).isoformat(),
        "raw_note": "Control",
        "generated_text": "Hallazgos",
        "final_text": "Texto aprobado",
    }
    fresh = await clinical_assistant_repo.create_pending_action(
        owner,
        thread,
        artifact["turn_id"],
        artifact["id"],
        patient,
        "save_evolution",
        proposal,
        fresh_hash,
    )
    resolved = await clinical_assistant_repo.resolve_action(
        owner, fresh["id"], "approve", fresh_hash
    )

    assert resolved["status"] == "approved"
    assert await _count(db, "SELECT count(*) FROM evolutions WHERE patient_id = $1", patient) == 1
    assert (
        await _count(
            db, "SELECT count(*) FROM google_drive_evolution_exports WHERE user_id = $1", owner
        )
        == 0
    )
    assert (await _action_row(db, old["id"]))["status"] == "failed"
    assert (await _artifact_row(db, artifact["id"]))["status"] == "approved"
