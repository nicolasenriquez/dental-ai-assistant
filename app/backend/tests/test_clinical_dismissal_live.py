"""Live-Postgres proof for PENDING-001 patient-scoped dismissal (task 4.5).

Run against an isolated scratch database (``CLINICAL_LIVE_TEST_DSN``) after the
Alembic head is applied. These tests pin the real discard/decline transactions,
receipt persistence, ``NOWAIT`` lock policy, read-only reconciliation and the
terminal-resurrection fences; mocked repository tests cannot certify locking,
audit persistence or the migration.

Red until task 4.6 implements the discarded status/receipt migration, the
``discard_artifact`` transaction, the decline identity guards and the explicit
read-only thread mode. Each rejection path asserts rollback (rows unchanged).
"""

from __future__ import annotations

import asyncio
import json
import os
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any
from uuid import UUID, uuid4

import asyncpg
import pytest

from backend.clinical_assistant import pending_work as pending_work_module
from backend.db import clinical_assistant_repo, clinical_pending_work_repo
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
    monkeypatch.setattr(clinical_pending_work_repo, "get_pg_pool", lambda: pool)
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
            f"dismissal-{user_id.hex[:12]}@example.com",
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
            "Dismissal live test",
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


def _proposal(patient: UUID) -> dict[str, Any]:
    return {
        "evolution_id": str(uuid4()),
        "patient_id": str(patient),
        "evolution_at": "2026-01-01T00:00:00+00:00",
        "raw_note": "raw",
        "generated_text": "generated",
        "final_text": "final",
    }


async def _make_artifact(
    db,
    owner: UUID,
    thread: UUID,
    patient: UUID,
    *,
    status: str = "draft",
    turn_id: UUID | None = None,
    payload: dict[str, Any] | None = None,
    receipt_operation: UUID | None = None,
    receipt_by: UUID | None = None,
    receipt_expected: datetime | None = None,
) -> dict[str, Any]:
    artifact_id = uuid4()
    turn_id = turn_id or uuid4()
    stored = payload if payload is not None else _payload()
    if status == "discarded" or receipt_operation is not None:
        async with db.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO clinical_turn_artifacts (
                    id, owner_user_id, thread_id, turn_id, patient_id, artifact_type, status,
                    payload, discard_operation_id, discarded_by, discard_expected_updated_at,
                    resolved_at
                ) VALUES ($1, $2, $3, $4, $5, 'clinical_draft', $6, $7::jsonb, $8, $9, $10,
                          CASE WHEN $6 = 'discarded' THEN now() ELSE NULL END)
                """,
                artifact_id,
                owner,
                thread,
                turn_id,
                patient,
                status,
                json.dumps(stored, ensure_ascii=False),
                receipt_operation,
                receipt_by,
                receipt_expected,
            )
    else:
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
    async with db.acquire() as conn:
        updated_at = await conn.fetchval(
            "SELECT updated_at FROM clinical_turn_artifacts WHERE id = $1", artifact_id
        )
    return {
        "id": artifact_id,
        "turn_id": turn_id,
        "updated_at": updated_at,
        "payload": stored,
        "receipt_expected": receipt_expected,
    }


async def _make_action(
    db,
    owner: UUID,
    thread: UUID,
    patient: UUID,
    artifact_id: UUID | None,
    *,
    status: str = "pending",
    turn_id: UUID | None = None,
    proposal_hash: str = HASH,
    proposal_payload: dict[str, Any] | None = None,
    expires_in: timedelta = timedelta(minutes=30),
    result_resource_id: UUID | None = None,
) -> dict[str, Any]:
    action_id = uuid4()
    resolved_at = None if status == "pending" else datetime.now(UTC)
    async with db.acquire() as conn:
        if turn_id is None and artifact_id is not None:
            turn_id = await conn.fetchval(
                "SELECT turn_id FROM clinical_turn_artifacts WHERE id = $1", artifact_id
            )
        row = await conn.fetchrow(
            """
            INSERT INTO clinical_pending_actions (
                id, owner_user_id, thread_id, turn_id, artifact_id, patient_id, action_type,
                proposal_payload, proposal_hash, status, expires_at, created_at, resolved_at,
                result_resource_id
            ) VALUES ($1, $2, $3, $4, $5, $6, 'save_evolution', $7::jsonb, $8, $9,
                      now() + $10::interval, now(), $11, $12)
            RETURNING created_at, resolved_at
            """,
            action_id,
            owner,
            thread,
            turn_id or uuid4(),
            artifact_id,
            patient,
            json.dumps(proposal_payload, ensure_ascii=False)
            if proposal_payload is not None
            else None,
            proposal_hash,
            status,
            expires_in,
            resolved_at,
            result_resource_id,
        )
    return {"id": action_id, "created_at": row["created_at"], "resolved_at": row["resolved_at"]}


async def _set_artifact(db, artifact_id: UUID, status: str) -> None:
    async with db.acquire() as conn:
        await conn.execute(
            "UPDATE clinical_turn_artifacts SET status = $2, updated_at = now() WHERE id = $1",
            artifact_id,
            status,
        )


async def _set_active_turn(db, thread: UUID, turn: UUID, *, stale: bool = False) -> None:
    async with db.acquire() as conn:
        await conn.execute(
            """
            UPDATE clinical_threads
            SET active_turn_id = $2,
                updated_at = CASE WHEN $3 THEN now() - interval '11 minutes' ELSE now() END
            WHERE id = $1
            """,
            thread,
            turn,
            stale,
        )


async def _set_active_patient(db, thread: UUID, patient: UUID) -> None:
    async with db.acquire() as conn:
        await conn.execute(
            "UPDATE clinical_threads SET active_patient_id = $2 WHERE id = $1",
            thread,
            patient,
        )


async def _insert_message(db, thread: UUID, turn: UUID) -> None:
    async with db.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO clinical_messages (id, thread_id, turn_id, role, content, turn_status)
            VALUES ($1, $2, $3, 'user', 'nota', 'running')
            """,
            uuid4(),
            thread,
            turn,
        )


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
            """
            SELECT status, payload, resolved_at, updated_at
            FROM clinical_turn_artifacts WHERE id = $1
            """,
            artifact_id,
        )
    assert row is not None
    result = dict(row)
    if isinstance(result.get("payload"), str):
        result["payload"] = json.loads(result["payload"])
    return result


async def _receipt_row(db, artifact_id: UUID) -> dict[str, Any]:
    async with db.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT discard_operation_id, discarded_by, discard_expected_updated_at
            FROM clinical_turn_artifacts WHERE id = $1
            """,
            artifact_id,
        )
    assert row is not None
    return dict(row)


async def _action_row(db, action_id: UUID) -> dict[str, Any]:
    async with db.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT status, proposal_hash, created_at, resolved_at, resolved_by, result_resource_id
            FROM clinical_pending_actions WHERE id = $1
            """,
            action_id,
        )
    assert row is not None
    return dict(row)


async def _thread_row(db, thread_id: UUID) -> dict[str, Any]:
    async with db.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT active_turn_id, active_patient_id, updated_at FROM clinical_threads WHERE id = $1",
            thread_id,
        )
    assert row is not None
    return dict(row)


async def _count(db, query: str, *args: Any) -> int:
    async with db.acquire() as conn:
        return int(await conn.fetchval(query, *args))


async def _discard(owner, thread, artifact, *, operation, patient, expected, **overrides):
    return await clinical_assistant_repo.discard_artifact(
        owner,
        thread,
        artifact,
        operation_id=operation,
        expected_patient_id=overrides.get("expected_patient_id", patient),
        expected_artifact_updated_at=overrides.get("expected_artifact_updated_at", expected),
    )


async def _decline(owner, action, *, patient, thread, artifact, expected, **overrides):
    return await clinical_assistant_repo.resolve_action(
        owner,
        action,
        "decline",
        HASH,
        expected_patient_id=overrides.get("expected_patient_id", patient),
        expected_thread_id=overrides.get("expected_thread_id", thread),
        expected_artifact_id=overrides.get("expected_artifact_id", artifact),
        expected_artifact_updated_at=overrides.get("expected_artifact_updated_at", expected),
    )


# --------------------------------------------------------------------------- #
# Discard: receipt, idempotency, authorization and state guards
# --------------------------------------------------------------------------- #


async def test_live_discard_marks_terminal_with_receipt_and_no_clinical_writes(db) -> None:
    owner = await _make_user(db)
    patient = await _make_patient(db, owner)
    thread = await _make_thread(db, owner)
    artifact = await _make_artifact(db, owner, thread, patient, status="draft")
    operation = uuid4()

    result = await _discard(
        owner,
        thread,
        artifact["id"],
        operation=operation,
        patient=patient,
        expected=artifact["updated_at"],
    )

    assert result["outcome"] == "discarded"
    assert result["artifact_status"] == "discarded"
    assert result["thread_id"] == thread
    assert result["patient_id"] == patient
    assert result["artifact_id"] == artifact["id"]
    assert result["operation_id"] == operation
    assert result["discarded_by"] == owner
    assert result["expected_artifact_updated_at"] == artifact["updated_at"]

    row = await _artifact_row(db, artifact["id"])
    assert row["status"] == "discarded"
    assert row["payload"] == artifact["payload"]
    assert row["resolved_at"] is not None
    receipt = await _receipt_row(db, artifact["id"])
    assert receipt["discard_operation_id"] == operation
    assert receipt["discarded_by"] == owner
    assert receipt["discard_expected_updated_at"] == artifact["updated_at"]
    assert result["resolved_at"] == row["resolved_at"]
    assert result["updated_at"] == row["updated_at"]
    assert (
        await _count(
            db,
            "SELECT count(*) FROM clinical_pending_actions WHERE artifact_id = $1",
            artifact["id"],
        )
        == 0
    )
    assert await _count(db, "SELECT count(*) FROM evolutions WHERE patient_id = $1", patient) == 0
    assert (
        await _count(
            db, "SELECT count(*) FROM google_drive_evolution_exports WHERE user_id = $1", owner
        )
        == 0
    )
    pending = await pending_work_module.list_pending_work(owner, None, 20, None, kind=None)
    assert all(item.id != f"draft:{artifact['id']}" for item in pending.items)


async def test_live_discard_same_operation_replay_returns_stored_receipt(db) -> None:
    owner = await _make_user(db)
    patient = await _make_patient(db, owner)
    thread = await _make_thread(db, owner)
    artifact = await _make_artifact(db, owner, thread, patient, status="draft")
    operation = uuid4()

    first = await _discard(
        owner,
        thread,
        artifact["id"],
        operation=operation,
        patient=patient,
        expected=artifact["updated_at"],
    )
    # A late worker may activate the thread after the commit; the stored
    # receipt still wins over active-turn eligibility on replay.
    await _set_active_turn(db, thread, uuid4())
    second = await _discard(
        owner,
        thread,
        artifact["id"],
        operation=operation,
        patient=patient,
        expected=artifact["updated_at"],
    )

    assert second["outcome"] == "discarded"
    assert second["resolved_at"] == first["resolved_at"]
    assert second["updated_at"] == first["updated_at"]
    assert second["operation_id"] == operation
    row = await _artifact_row(db, artifact["id"])
    assert row["updated_at"] == first["updated_at"]
    assert row["resolved_at"] == first["resolved_at"]
    assert (
        await _count(
            db,
            "SELECT count(*) FROM clinical_turn_artifacts WHERE discard_operation_id = $1",
            operation,
        )
        == 1
    )


async def test_live_discard_reused_or_new_operation_conflicts(db) -> None:
    owner = await _make_user(db)
    patient = await _make_patient(db, owner)
    thread = await _make_thread(db, owner)
    artifact = await _make_artifact(db, owner, thread, patient, status="draft")
    other = await _make_artifact(db, owner, thread, patient, status="draft")
    operation = uuid4()

    await _discard(
        owner,
        thread,
        artifact["id"],
        operation=operation,
        patient=patient,
        expected=artifact["updated_at"],
    )

    with pytest.raises(clinical_assistant_repo.DiscardIdempotencyConflictError):
        await _discard(
            owner,
            thread,
            artifact["id"],
            operation=operation,
            patient=patient,
            expected=artifact["updated_at"] - timedelta(microseconds=1),
        )
    with pytest.raises(clinical_assistant_repo.DiscardIdempotencyConflictError):
        await _discard(
            owner,
            thread,
            artifact["id"],
            operation=uuid4(),
            patient=patient,
            expected=artifact["updated_at"],
        )
    with pytest.raises(clinical_assistant_repo.DiscardIdempotencyConflictError):
        await _discard(
            owner,
            thread,
            other["id"],
            operation=operation,
            patient=patient,
            expected=other["updated_at"],
        )

    assert (await _artifact_row(db, artifact["id"]))["status"] == "discarded"
    assert (await _artifact_row(db, other["id"]))["status"] == "draft"
    assert (
        await _count(
            db,
            "SELECT count(*) FROM clinical_turn_artifacts WHERE discard_operation_id = $1",
            operation,
        )
        == 1
    )


@pytest.mark.parametrize(
    ("state", "error_name"),
    [
        ("pending_action", "DiscardIneligibleError"),
        ("expired_pending_action", "DiscardIneligibleError"),
        ("approved_action", "DiscardIneligibleError"),
        ("active_turn", "DiscardIneligibleError"),
        ("pending_status", "DiscardIneligibleError"),
        ("declined_status", "DiscardIneligibleError"),
        ("stale_version", "DiscardStaleError"),
        ("wrong_patient", "LookupError"),
        ("wrong_thread", "LookupError"),
        ("foreign_owner", "LookupError"),
    ],
)
async def test_live_discard_rejects_ineligible_or_inaccessible_resources(
    db, state: str, error_name: str
) -> None:
    owner = await _make_user(db)
    patient = await _make_patient(db, owner)
    other_patient = await _make_patient(db, owner)
    thread = await _make_thread(db, owner)
    turn = uuid4()
    artifact = await _make_artifact(db, owner, thread, patient, status="draft", turn_id=turn)
    expected_patient = patient
    expected_updated = artifact["updated_at"]
    call_thread, call_artifact = thread, artifact["id"]

    if state in {"pending_action", "expired_pending_action", "approved_action"}:
        await _set_artifact(db, artifact["id"], "pending")
        if state == "pending_action":
            await _make_action(db, owner, thread, patient, artifact["id"], status="pending")
        elif state == "expired_pending_action":
            await _make_action(
                db,
                owner,
                thread,
                patient,
                artifact["id"],
                status="pending",
                expires_in=timedelta(minutes=-5),
            )
        else:
            await _make_action(
                db,
                owner,
                thread,
                patient,
                artifact["id"],
                status="approved",
                result_resource_id=uuid4(),
            )
    elif state == "active_turn":
        await _set_active_turn(db, thread, turn)
    elif state == "pending_status":
        await _set_artifact(db, artifact["id"], "pending")
    elif state == "declined_status":
        await _set_artifact(db, artifact["id"], "declined")
    elif state == "stale_version":
        expected_updated = artifact["updated_at"] - timedelta(microseconds=1)
    elif state == "wrong_patient":
        expected_patient = other_patient
    elif state == "wrong_thread":
        call_thread = await _make_thread(db, owner)
    elif state == "foreign_owner":
        stranger = await _make_user(db)
        stranger_patient = await _make_patient(db, stranger)
        stranger_thread = await _make_thread(db, stranger)
        stranger_artifact = await _make_artifact(
            db, stranger, stranger_thread, stranger_patient, status="draft"
        )
        call_thread, call_artifact = stranger_thread, stranger_artifact["id"]
        expected_patient = stranger_patient

    before = await _artifact_row(db, artifact["id"])
    error_cls = getattr(clinical_assistant_repo, error_name, None) or LookupError
    with pytest.raises(error_cls):
        await _discard(
            owner,
            call_thread,
            call_artifact,
            operation=uuid4(),
            patient=patient,
            expected=artifact["updated_at"],
            expected_patient_id=expected_patient,
            expected_artifact_updated_at=expected_updated,
        )
    assert await _artifact_row(db, artifact["id"]) == before
    assert await _count(db, "SELECT count(*) FROM evolutions WHERE patient_id = $1", patient) == 0


async def test_live_discard_accepts_stale_and_retained_original_patient(db) -> None:
    owner = await _make_user(db)
    patient = await _make_patient(db, owner)
    other_patient = await _make_patient(db, owner)
    thread = await _make_thread(db, owner)
    stale = await _make_artifact(db, owner, thread, patient, status="stale")
    retained = await _make_artifact(db, owner, thread, patient, status="draft")
    await _set_active_patient(db, thread, other_patient)

    first = await _discard(
        owner,
        thread,
        stale["id"],
        operation=uuid4(),
        patient=patient,
        expected=stale["updated_at"],
    )
    second = await _discard(
        owner,
        thread,
        retained["id"],
        operation=uuid4(),
        patient=patient,
        expected=retained["updated_at"],
    )

    assert first["artifact_status"] == "discarded"
    assert second["artifact_status"] == "discarded"
    assert (await _artifact_row(db, retained["id"]))["status"] == "discarded"


# --------------------------------------------------------------------------- #
# Decline: identity bundle, legacy compatibility, crossed resources
# --------------------------------------------------------------------------- #


async def test_live_decline_with_bundle_is_terminal_and_audited(db) -> None:
    owner = await _make_user(db)
    patient = await _make_patient(db, owner)
    thread = await _make_thread(db, owner)
    artifact = await _make_artifact(db, owner, thread, patient, status="pending")
    action = await _make_action(
        db,
        owner,
        thread,
        patient,
        artifact["id"],
        status="pending",
        proposal_payload=_proposal(patient),
    )

    result = await _decline(
        owner,
        action["id"],
        patient=patient,
        thread=thread,
        artifact=artifact["id"],
        expected=artifact["updated_at"],
    )

    assert result["status"] == "declined"
    assert result["resolved_by"] == owner
    action_row = await _action_row(db, action["id"])
    assert action_row["status"] == "declined"
    assert action_row["resolved_by"] == owner
    assert action_row["resolved_at"] is not None
    assert result["resolved_at"] == action_row["resolved_at"]
    artifact_row = await _artifact_row(db, artifact["id"])
    assert artifact_row["status"] == "declined"
    assert artifact_row["resolved_at"] is not None
    assert artifact_row["payload"] == artifact["payload"]
    assert await _count(db, "SELECT count(*) FROM evolutions WHERE patient_id = $1", patient) == 0
    assert (
        await _count(
            db, "SELECT count(*) FROM google_drive_evolution_exports WHERE user_id = $1", owner
        )
        == 0
    )
    pending = await pending_work_module.list_pending_work(owner, None, 20, None, kind=None)
    assert all(item.id != f"approval:{action['id']}" for item in pending.items)


async def test_live_decline_legacy_and_artifactless_contract_is_retained(db) -> None:
    owner = await _make_user(db)
    patient = await _make_patient(db, owner)
    thread = await _make_thread(db, owner)
    artifact = await _make_artifact(db, owner, thread, patient, status="pending")
    action = await _make_action(db, owner, thread, patient, artifact["id"], status="pending")
    other_thread = await _make_thread(db, owner)
    artifactless = await _make_action(db, owner, other_thread, patient, None, status="pending")

    legacy = await clinical_assistant_repo.resolve_action(owner, action["id"], "decline", HASH)
    without_artifact = await clinical_assistant_repo.resolve_action(
        owner, artifactless["id"], "decline", HASH
    )

    assert legacy["status"] == "declined"
    assert legacy["resolved_by"] == owner
    assert without_artifact["status"] == "declined"
    assert (await _artifact_row(db, artifact["id"]))["status"] == "declined"
    with pytest.raises(clinical_assistant_repo.ProposalStaleError):
        await clinical_assistant_repo.resolve_action(owner, action["id"], "decline", "b" * 64)


@pytest.mark.parametrize(
    ("state", "error_name"),
    [
        ("crossed_patient", "LookupError"),
        ("crossed_thread", "LookupError"),
        ("crossed_artifact", "LookupError"),
        ("stale_version", "ProposalStaleError"),
        ("approved_result", "ProposalStaleError"),
        ("active_turn", "ProposalStaleError"),
    ],
)
async def test_live_decline_rejects_crossed_or_conflicting_state(
    db, state: str, error_name: str
) -> None:
    owner = await _make_user(db)
    patient = await _make_patient(db, owner)
    other_patient = await _make_patient(db, owner)
    thread = await _make_thread(db, owner)
    artifact = await _make_artifact(db, owner, thread, patient, status="pending")
    action = await _make_action(db, owner, thread, patient, artifact["id"], status="pending")
    expected_patient, expected_thread, expected_artifact = patient, thread, artifact["id"]
    expected_updated = artifact["updated_at"]

    if state == "crossed_patient":
        expected_patient = other_patient
    elif state == "crossed_thread":
        expected_thread = await _make_thread(db, owner)
    elif state == "crossed_artifact":
        expected_artifact = (await _make_artifact(db, owner, thread, patient, status="draft"))["id"]
    elif state == "stale_version":
        expected_updated = artifact["updated_at"] - timedelta(microseconds=1)
    elif state == "approved_result":
        await _make_action(
            db,
            owner,
            thread,
            patient,
            artifact["id"],
            status="approved",
            result_resource_id=await _make_evolution(db, owner, patient),
        )
    elif state == "active_turn":
        await _set_active_turn(db, thread, artifact["turn_id"])

    before_action = await _action_row(db, action["id"])
    before_artifact = await _artifact_row(db, artifact["id"])
    before_evolutions = await _count(
        db, "SELECT count(*) FROM evolutions WHERE patient_id = $1", patient
    )
    error_cls = getattr(clinical_assistant_repo, error_name, None) or LookupError
    with pytest.raises(error_cls):
        await _decline(
            owner,
            action["id"],
            patient=expected_patient,
            thread=expected_thread,
            artifact=expected_artifact,
            expected=expected_updated,
        )
    assert await _action_row(db, action["id"]) == before_action
    assert await _artifact_row(db, artifact["id"]) == before_artifact
    assert (
        await _count(db, "SELECT count(*) FROM evolutions WHERE patient_id = $1", patient)
        == before_evolutions
    )


# --------------------------------------------------------------------------- #
# Read-only reconciliation and terminal resurrection fences
# --------------------------------------------------------------------------- #


async def test_live_read_only_thread_get_skips_maintenance_and_projects_receipts(db) -> None:
    owner = await _make_user(db)
    patient = await _make_patient(db, owner)
    thread = await _make_thread(db, owner)
    turn = uuid4()
    await _set_active_turn(db, thread, turn, stale=True)
    await _insert_message(db, thread, turn)
    pending_artifact = await _make_artifact(db, owner, thread, patient, status="pending")
    expired_action = await _make_action(
        db,
        owner,
        thread,
        patient,
        pending_artifact["id"],
        status="pending",
        expires_in=timedelta(minutes=-5),
    )
    operation = uuid4()
    discarded = await _make_artifact(
        db,
        owner,
        thread,
        patient,
        status="discarded",
        receipt_operation=operation,
        receipt_by=owner,
        receipt_expected=datetime.now(UTC),
    )

    stored = await clinical_assistant_repo.get_thread(owner, thread, read_only=True)

    assert stored is not None
    assert stored["active_turn_id"] == turn
    running = [m for m in stored["messages"] if m["turn_id"] == turn]
    assert running and running[0]["turn_status"] == "running"
    actions = {a["id"]: a for a in stored["actions"]}
    assert actions[expired_action["id"]]["status"] == "pending"
    artifacts = {a["id"]: a for a in stored["artifacts"]}
    assert artifacts[pending_artifact["id"]]["status"] == "pending"
    discarded_row = artifacts[discarded["id"]]
    assert discarded_row["status"] == "discarded"
    assert discarded_row["discard_operation_id"] == operation
    assert discarded_row["discarded_by"] == owner
    assert discarded_row["discard_expected_updated_at"] == discarded["receipt_expected"]
    assert discarded_row["resolved_at"] is not None

    # The incumbent default GET still performs maintenance for C3 callers.
    default = await clinical_assistant_repo.get_thread(owner, thread)
    assert default is not None
    assert default["active_turn_id"] is None
    actions = {a["id"]: a for a in default["actions"]}
    assert actions[expired_action["id"]]["status"] == "expired"
    artifacts = {a["id"]: a for a in default["artifacts"]}
    assert artifacts[pending_artifact["id"]]["status"] == "failed"
    assert artifacts[discarded["id"]]["status"] == "discarded"


async def test_live_foreign_default_thread_read_cannot_run_maintenance(db) -> None:
    owner = await _make_user(db)
    stranger = await _make_user(db)
    patient = await _make_patient(db, owner)
    thread = await _make_thread(db, owner)
    artifact = await _make_artifact(db, owner, thread, patient, status="pending")
    action = await _make_action(
        db, owner, thread, patient, artifact["id"], expires_in=timedelta(minutes=-5)
    )
    assert await clinical_assistant_repo.get_thread(stranger, thread) is None
    assert await clinical_assistant_repo.get_thread(stranger, thread, read_only=True) is None
    assert (await _action_row(db, action["id"]))["status"] == "pending"
    assert (await _artifact_row(db, artifact["id"]))["status"] == "pending"


async def test_live_read_only_thread_uses_repeatable_read_and_readonly_transaction(
    db, monkeypatch
) -> None:
    owner = await _make_user(db)
    thread = await _make_thread(db, owner)
    original = clinical_assistant_repo._read_thread

    async def inspect(conn, user, resource):
        assert await conn.fetchval("SHOW transaction_isolation") == "repeatable read"
        assert await conn.fetchval("SHOW transaction_read_only") == "on"
        return await original(conn, user, resource)

    monkeypatch.setattr(clinical_assistant_repo, "_read_thread", inspect)
    assert await clinical_assistant_repo.get_thread(owner, thread, read_only=True) is not None


async def test_live_discarded_artifact_cannot_be_resurrected_by_competing_writers(db) -> None:
    owner = await _make_user(db)
    patient = await _make_patient(db, owner)
    thread = await _make_thread(db, owner)
    turn = uuid4()
    artifact = await _make_artifact(db, owner, thread, patient, status="draft", turn_id=turn)
    failed_action = await _make_action(
        db, owner, thread, patient, artifact["id"], status="failed", turn_id=turn
    )

    await _discard(
        owner,
        thread,
        artifact["id"],
        operation=uuid4(),
        patient=patient,
        expected=artifact["updated_at"],
    )
    await _set_active_turn(db, thread, turn)
    before = await _artifact_row(db, artifact["id"])

    try:
        resurrected = await clinical_assistant_repo.create_artifact(
            owner, thread, turn, patient, artifact["id"], _payload(context="resucitado")
        )
    except Exception:
        resurrected = None
    if resurrected is not None:
        assert resurrected["status"] == "discarded"

    await clinical_assistant_repo.set_artifact_status(owner, thread, artifact["id"], "draft")
    updated = await clinical_assistant_repo.update_artifact(
        owner, thread, artifact["id"], payload=_payload(context="editado"), status="draft"
    )
    assert updated is None
    with pytest.raises(clinical_assistant_repo.StaleClinicalTurnError):
        await clinical_assistant_repo.create_pending_action(
            owner,
            thread,
            turn,
            artifact["id"],
            patient,
            "save_evolution",
            _proposal(patient),
            HASH,
        )
    with pytest.raises(clinical_assistant_repo.RecoveryIneligibleError):
        await clinical_assistant_repo.recover_draft(
            owner, failed_action["id"], HASH, artifact["updated_at"]
        )
    with pytest.raises(LookupError):
        await clinical_assistant_repo.return_to_editing(owner, failed_action["id"])
    with pytest.raises(clinical_assistant_repo.ProposalStaleError):
        await clinical_assistant_repo.resolve_action(owner, failed_action["id"], "decline", HASH)

    assert await _artifact_row(db, artifact["id"]) == before
    assert (
        await _count(
            db,
            "SELECT count(*) FROM clinical_turn_artifacts WHERE discard_operation_id IS NOT NULL",
        )
        == 1
    )


# --------------------------------------------------------------------------- #
# Two-connection barriers: duplicate keys, inverted lock orders, one winner
# --------------------------------------------------------------------------- #


async def test_live_concurrent_duplicate_discard_binds_one_receipt(db) -> None:
    owner = await _make_user(db)
    patient = await _make_patient(db, owner)
    thread = await _make_thread(db, owner)
    artifact = await _make_artifact(db, owner, thread, patient, status="draft")
    operation = uuid4()

    results = await asyncio.gather(
        _discard(
            owner,
            thread,
            artifact["id"],
            operation=operation,
            patient=patient,
            expected=artifact["updated_at"],
        ),
        _discard(
            owner,
            thread,
            artifact["id"],
            operation=operation,
            patient=patient,
            expected=artifact["updated_at"],
        ),
        return_exceptions=True,
    )

    successes = [r for r in results if isinstance(r, dict)]
    busy = [r for r in results if isinstance(r, clinical_assistant_repo.DismissalBusyError)]
    unexpected = [
        r for r in results if not isinstance(r, dict | clinical_assistant_repo.DismissalBusyError)
    ]
    assert not unexpected
    assert len(successes) >= 1
    assert len(successes) + len(busy) == 2
    if len(successes) == 2:
        assert successes[0]["resolved_at"] == successes[1]["resolved_at"]
        assert successes[0]["updated_at"] == successes[1]["updated_at"]
    row = await _artifact_row(db, artifact["id"])
    assert row["status"] == "discarded"
    assert (
        await _count(
            db,
            "SELECT count(*) FROM clinical_turn_artifacts WHERE discard_operation_id = $1",
            operation,
        )
        == 1
    )


async def test_live_discard_does_not_change_another_artifacts_pending_approval(db) -> None:
    owner = await _make_user(db)
    patient = await _make_patient(db, owner)
    thread = await _make_thread(db, owner)
    selected = await _make_artifact(db, owner, thread, patient)
    other = await _make_artifact(db, owner, thread, patient, status="pending")
    action = await _make_action(db, owner, thread, patient, other["id"])
    before = await _action_row(db, action["id"])
    await _discard(
        owner,
        thread,
        selected["id"],
        operation=uuid4(),
        patient=patient,
        expected=selected["updated_at"],
    )
    assert await _action_row(db, action["id"]) == before
    assert (await _artifact_row(db, other["id"]))["status"] == "pending"
    assert (
        await _count(db, "SELECT count(*) FROM clinical_messages WHERE thread_id = $1", thread) == 0
    )


async def test_live_cross_thread_receipt_collision_has_bounded_wait(db, monkeypatch) -> None:
    owner = await _make_user(db)
    patient = await _make_patient(db, owner)
    first_thread = await _make_thread(db, owner)
    second_thread = await _make_thread(db, owner)
    first = await _make_artifact(db, owner, first_thread, patient)
    second = await _make_artifact(db, owner, second_thread, patient)
    operation = uuid4()
    async with db.acquire() as holder, holder.transaction():

        @asynccontextmanager
        async def acquire():
            yield holder

        monkeypatch.setattr(
            clinical_assistant_repo, "get_pg_pool", lambda: SimpleNamespace(acquire=acquire)
        )
        try:
            await _discard(
                owner,
                first_thread,
                first["id"],
                operation=operation,
                patient=patient,
                expected=first["updated_at"],
            )
        finally:
            monkeypatch.setattr(clinical_assistant_repo, "get_pg_pool", lambda: db)
        with pytest.raises(clinical_assistant_repo.DismissalBusyError):
            await asyncio.wait_for(
                _discard(
                    owner,
                    second_thread,
                    second["id"],
                    operation=operation,
                    patient=patient,
                    expected=second["updated_at"],
                ),
                timeout=3,
            )
    with pytest.raises(clinical_assistant_repo.DiscardIdempotencyConflictError):
        await _discard(
            owner,
            second_thread,
            second["id"],
            operation=operation,
            patient=patient,
            expected=second["updated_at"],
        )
    assert (await _artifact_row(db, second["id"]))["status"] == "draft"


@pytest.mark.parametrize("held", ["thread", "artifact", "action"])
async def test_live_held_locks_return_busy_without_deadlock(db, held: str) -> None:
    owner = await _make_user(db)
    patient = await _make_patient(db, owner)
    thread = await _make_thread(db, owner)
    artifact = await _make_artifact(db, owner, thread, patient, status="draft")
    action = await _make_action(db, owner, thread, patient, artifact["id"], status="failed")

    async with db.acquire() as holder, holder.transaction():
        if held == "thread":
            await holder.execute("SELECT 1 FROM clinical_threads WHERE id = $1 FOR UPDATE", thread)
        elif held == "artifact":
            await holder.execute(
                "SELECT 1 FROM clinical_turn_artifacts WHERE id = $1 FOR UPDATE", artifact["id"]
            )
        else:
            await holder.execute(
                "SELECT 1 FROM clinical_pending_actions WHERE id = $1 FOR UPDATE", action["id"]
            )
        with pytest.raises(clinical_assistant_repo.DismissalBusyError):
            await _discard(
                owner,
                thread,
                artifact["id"],
                operation=uuid4(),
                patient=patient,
                expected=artifact["updated_at"],
            )

    result = await _discard(
        owner,
        thread,
        artifact["id"],
        operation=uuid4(),
        patient=patient,
        expected=artifact["updated_at"],
    )
    assert result["artifact_status"] == "discarded"


async def test_live_concurrent_approve_and_decline_declare_one_winner(db) -> None:
    owner = await _make_user(db)
    patient = await _make_patient(db, owner)
    thread = await _make_thread(db, owner)
    artifact = await _make_artifact(db, owner, thread, patient, status="pending")
    action = await _make_action(
        db,
        owner,
        thread,
        patient,
        artifact["id"],
        status="pending",
        proposal_payload=_proposal(patient),
    )

    results = await asyncio.gather(
        clinical_assistant_repo.resolve_action(owner, action["id"], "approve", HASH),
        _decline(
            owner,
            action["id"],
            patient=patient,
            thread=thread,
            artifact=artifact["id"],
            expected=artifact["updated_at"],
        ),
        return_exceptions=True,
    )

    action_row = await _action_row(db, action["id"])
    assert action_row["status"] in {"approved", "declined"}
    evolutions = await _count(db, "SELECT count(*) FROM evolutions WHERE patient_id = $1", patient)
    artifact_row = await _artifact_row(db, artifact["id"])
    if action_row["status"] == "approved":
        assert evolutions == 1
        assert artifact_row["status"] == "approved"
    else:
        assert evolutions == 0
        assert artifact_row["status"] == "declined"
    assert (
        await _count(
            db, "SELECT count(*) FROM google_drive_evolution_exports WHERE user_id = $1", owner
        )
        == 0
    )
    for result in results:
        if isinstance(result, Exception):
            assert isinstance(
                result,
                clinical_assistant_repo.ProposalStaleError
                | clinical_assistant_repo.DismissalBusyError,
            )


async def test_live_approve_then_decline_never_overwrites_saved_state(db) -> None:
    owner = await _make_user(db)
    patient = await _make_patient(db, owner)
    thread = await _make_thread(db, owner)
    artifact = await _make_artifact(db, owner, thread, patient, status="pending")
    action = await _make_action(
        db,
        owner,
        thread,
        patient,
        artifact["id"],
        status="pending",
        proposal_payload=_proposal(patient),
    )

    approved = await clinical_assistant_repo.resolve_action(owner, action["id"], "approve", HASH)
    assert approved["status"] == "approved"
    with pytest.raises(clinical_assistant_repo.ProposalStaleError):
        await _decline(
            owner,
            action["id"],
            patient=patient,
            thread=thread,
            artifact=artifact["id"],
            expected=artifact["updated_at"],
        )

    assert (await _action_row(db, action["id"]))["status"] == "approved"
    assert (await _artifact_row(db, artifact["id"]))["status"] == "approved"
    assert await _count(db, "SELECT count(*) FROM evolutions WHERE patient_id = $1", patient) == 1


async def test_live_decline_then_approve_keeps_decline_without_export(db) -> None:
    owner = await _make_user(db)
    patient = await _make_patient(db, owner)
    thread = await _make_thread(db, owner)
    artifact = await _make_artifact(db, owner, thread, patient, status="pending")
    action = await _make_action(
        db,
        owner,
        thread,
        patient,
        artifact["id"],
        status="pending",
        proposal_payload=_proposal(patient),
    )

    await _decline(
        owner,
        action["id"],
        patient=patient,
        thread=thread,
        artifact=artifact["id"],
        expected=artifact["updated_at"],
    )
    with pytest.raises(clinical_assistant_repo.ProposalStaleError):
        await clinical_assistant_repo.resolve_action(owner, action["id"], "approve", HASH)

    assert (await _action_row(db, action["id"]))["status"] == "declined"
    assert (await _artifact_row(db, artifact["id"]))["status"] == "declined"
    assert await _count(db, "SELECT count(*) FROM evolutions WHERE patient_id = $1", patient) == 0
    assert (
        await _count(
            db, "SELECT count(*) FROM google_drive_evolution_exports WHERE user_id = $1", owner
        )
        == 0
    )


# --------------------------------------------------------------------------- #
# Migration: discarded status requires a complete owner-bound receipt
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "writer", ["prepare", "edit", "approve", "recover", "expiry", "worker", "return"]
)
async def test_live_real_writer_lock_barrier_fences_discard(db, monkeypatch, writer: str) -> None:
    owner = await _make_user(db)
    patient = await _make_patient(db, owner)
    thread = await _make_thread(db, owner)
    status = "pending" if writer in {"approve", "expiry", "return"} else "draft"
    if writer == "recover":
        status = "failed"
    artifact = await _make_artifact(db, owner, thread, patient, status=status)
    action = None
    if writer in {"approve", "expiry", "return", "recover"}:
        action = await _make_action(
            db,
            owner,
            thread,
            patient,
            artifact["id"],
            status="failed" if writer == "recover" else "pending",
            proposal_payload=_proposal(patient),
            expires_in=timedelta(minutes=-5 if writer == "expiry" else 30),
        )
    if writer == "worker":
        await _set_active_turn(db, thread, artifact["turn_id"])
    async with db.acquire() as holder, holder.transaction():

        @asynccontextmanager
        async def acquire():
            yield holder

        monkeypatch.setattr(
            clinical_assistant_repo, "get_pg_pool", lambda: SimpleNamespace(acquire=acquire)
        )
        try:
            if writer == "prepare":
                await clinical_assistant_repo.create_pending_action(
                    owner,
                    thread,
                    artifact["turn_id"],
                    artifact["id"],
                    patient,
                    "save_evolution",
                    _proposal(patient),
                    HASH,
                )
            elif writer == "edit":
                await clinical_assistant_repo.update_artifact(
                    owner, thread, artifact["id"], payload=_payload("Cambio"), status="draft"
                )
            elif writer == "approve":
                assert action is not None
                await clinical_assistant_repo.resolve_action(owner, action["id"], "approve", HASH)
            elif writer == "recover":
                assert action is not None
                await clinical_assistant_repo.recover_draft(
                    owner, action["id"], HASH, artifact["updated_at"]
                )
            elif writer == "expiry":
                await clinical_assistant_repo.get_thread(owner, thread)
            elif writer == "return":
                assert action is not None
                await clinical_assistant_repo.return_to_editing(owner, action["id"])
            else:
                await clinical_assistant_repo.create_artifact(
                    owner, thread, artifact["turn_id"], patient, artifact["id"], _payload("Worker")
                )
                await holder.execute(
                    "UPDATE clinical_threads SET active_turn_id = NULL WHERE id = $1", thread
                )
        finally:
            monkeypatch.setattr(clinical_assistant_repo, "get_pg_pool", lambda: db)
        with pytest.raises(clinical_assistant_repo.DismissalBusyError):
            await asyncio.wait_for(
                _discard(
                    owner,
                    thread,
                    artifact["id"],
                    operation=uuid4(),
                    patient=patient,
                    expected=artifact["updated_at"],
                ),
                timeout=2,
            )
    error = (
        clinical_assistant_repo.DiscardIneligibleError
        if writer in {"prepare", "approve", "expiry"}
        else clinical_assistant_repo.DiscardStaleError
    )
    with pytest.raises(error):
        await _discard(
            owner,
            thread,
            artifact["id"],
            operation=uuid4(),
            patient=patient,
            expected=artifact["updated_at"],
        )
    assert (await _receipt_row(db, artifact["id"]))["discard_operation_id"] is None


async def test_live_decline_replay_keeps_receipt_despite_late_active_turn(db) -> None:
    owner = await _make_user(db)
    patient = await _make_patient(db, owner)
    thread = await _make_thread(db, owner)
    artifact = await _make_artifact(db, owner, thread, patient, status="pending")
    action = await _make_action(db, owner, thread, patient, artifact["id"])
    first = await _decline(
        owner,
        action["id"],
        patient=patient,
        thread=thread,
        artifact=artifact["id"],
        expected=artifact["updated_at"],
    )
    await _set_active_turn(db, thread, uuid4())
    replay = await _decline(
        owner,
        action["id"],
        patient=patient,
        thread=thread,
        artifact=artifact["id"],
        expected=artifact["updated_at"],
    )
    assert replay["resolved_at"] == first["resolved_at"]
    assert replay["resolved_by"] == owner


@pytest.mark.parametrize("crossed", ["turn", "type"])
async def test_live_decline_rejects_crossed_turn_or_non_save_action(db, crossed: str) -> None:
    owner = await _make_user(db)
    patient = await _make_patient(db, owner)
    thread = await _make_thread(db, owner)
    artifact = await _make_artifact(db, owner, thread, patient, status="pending")
    action = await _make_action(
        db,
        owner,
        thread,
        patient,
        artifact["id"],
        turn_id=uuid4() if crossed == "turn" else artifact["turn_id"],
    )
    if crossed == "type":
        async with db.acquire() as conn:
            await conn.execute(
                "UPDATE clinical_pending_actions SET action_type = 'other' WHERE id = $1",
                action["id"],
            )
    error = LookupError if crossed == "turn" else clinical_assistant_repo.ProposalStaleError
    with pytest.raises(error):
        await _decline(
            owner,
            action["id"],
            patient=patient,
            thread=thread,
            artifact=artifact["id"],
            expected=artifact["updated_at"],
        )
    assert (await _action_row(db, action["id"]))["status"] == "pending"
    assert (await _artifact_row(db, artifact["id"]))["status"] == "pending"


async def _raw_discard_insert(
    db,
    owner: UUID,
    thread: UUID,
    patient: UUID,
    *,
    status: str,
    operation: UUID | None,
    by: UUID | None,
    expected: datetime | None,
    resolved: bool = True,
) -> None:
    async with db.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO clinical_turn_artifacts (
                id, owner_user_id, thread_id, turn_id, patient_id, artifact_type, status,
                payload, discard_operation_id, discarded_by, discard_expected_updated_at,
                resolved_at
            ) VALUES ($1, $2, $3, $4, $5, 'clinical_draft', $6, $7::jsonb, $8, $9, $10,
                      CASE WHEN $11 THEN now() ELSE NULL END)
            """,
            uuid4(),
            owner,
            thread,
            uuid4(),
            patient,
            status,
            json.dumps(_payload(), ensure_ascii=False),
            operation,
            by,
            expected,
            resolved,
        )


async def test_live_discard_receipt_constraints_are_enforced(db) -> None:
    owner = await _make_user(db)
    patient = await _make_patient(db, owner)
    thread = await _make_thread(db, owner)
    operation = uuid4()
    expected = datetime.now(UTC)

    await _raw_discard_insert(
        db,
        owner,
        thread,
        patient,
        status="discarded",
        operation=operation,
        by=owner,
        expected=expected,
    )

    with pytest.raises(asyncpg.CheckViolationError):
        await _raw_discard_insert(
            db,
            owner,
            thread,
            patient,
            status="discarded",
            operation=None,
            by=owner,
            expected=expected,
        )
    with pytest.raises(asyncpg.CheckViolationError):
        await _raw_discard_insert(
            db,
            owner,
            thread,
            patient,
            status="discarded",
            operation=uuid4(),
            by=owner,
            expected=None,
        )
    with pytest.raises(asyncpg.CheckViolationError):
        await _raw_discard_insert(
            db,
            owner,
            thread,
            patient,
            status="discarded",
            operation=uuid4(),
            by=await _make_user(db),
            expected=expected,
        )
    with pytest.raises(asyncpg.CheckViolationError):
        await _raw_discard_insert(
            db,
            owner,
            thread,
            patient,
            status="draft",
            operation=uuid4(),
            by=owner,
            expected=expected,
        )
    with pytest.raises(asyncpg.UniqueViolationError):
        await _raw_discard_insert(
            db,
            owner,
            thread,
            patient,
            status="discarded",
            operation=operation,
            by=owner,
            expected=expected,
        )
