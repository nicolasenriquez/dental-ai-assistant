"""Live-Postgres proof for approval-time export intent atomicity."""

from __future__ import annotations

import hashlib
import json
import os
from datetime import UTC, datetime
from uuid import UUID, uuid4

import asyncpg
import pytest

from backend.db import clinical_assistant_repo, evolution_exports_repo
from backend.evolution_exports import service as evolution_exports_service

DSN = os.environ.get("CLINICAL_EXPORT_LIVE_TEST_DSN", "")
if not DSN:
    pytestmark = pytest.mark.skip(reason="CLINICAL_EXPORT_LIVE_TEST_DSN not set")

PROPOSAL_HASH = "a" * 64


@pytest.fixture
async def db(monkeypatch: pytest.MonkeyPatch):
    try:
        pool = await asyncpg.create_pool(DSN, min_size=1, max_size=1)
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
            f"export-{user_id.hex[:12]}@example.com",
        )
    return user_id


async def _make_patient(db, owner: UUID) -> UUID:
    patient_id = uuid4()
    async with db.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO patients (id, owner_user_id, first_name, last_name, rut_number, rut_dv)
            VALUES ($1, $2, 'Ana', 'Pérez', 12345678, '5')
            """,
            patient_id,
            owner,
        )
    return patient_id


async def _make_thread(db, owner: UUID) -> UUID:
    thread_id = uuid4()
    async with db.acquire() as conn:
        await conn.execute(
            "INSERT INTO clinical_threads (id, owner_user_id, title) VALUES ($1, $2, $3)",
            thread_id,
            owner,
            "Export approval test",
        )
    return thread_id


async def _make_action(
    db,
    owner: UUID,
    thread_id: UUID,
    patient_id: UUID,
    *,
    evolution_id: UUID,
    evolution_at: datetime,
) -> UUID:
    action_id = uuid4()
    payload = {
        "evolution_id": str(evolution_id),
        "patient_id": str(patient_id),
        "evolution_at": evolution_at.isoformat(),
        "raw_note": "Control",
        "generated_text": "Hallazgos",
        "final_text": "Texto aprobado",
    }
    async with db.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO clinical_pending_actions (
                id, owner_user_id, thread_id, turn_id, patient_id, action_type,
                proposal_payload, proposal_hash, status, expires_at, created_at
            ) VALUES ($1, $2, $3, $4, $5, 'save_evolution', $6::jsonb, $7, 'pending',
                      now() + interval '30 minutes', now())
            """,
            action_id,
            owner,
            thread_id,
            uuid4(),
            patient_id,
            json.dumps(payload, ensure_ascii=False),
            PROPOSAL_HASH,
        )
    return action_id


async def _make_connection(db, owner: UUID, *, status: str, frequency: str = "weekly") -> None:
    async with db.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO google_drive_connections (
                user_id, binding_secret_ciphertext, binding_secret_nonce, binding_key_version,
                status, status_changed_at, connected_at, created_at, updated_at,
                evolution_export_frequency
            ) VALUES ($1, $2, $3, 'test', $4, now(), now(), now(), now(), $5)
            """,
            owner,
            b"binding",
            b"nonce",
            status,
            frequency,
        )


async def test_live_approval_persists_frozen_pending_export(db) -> None:
    owner = await _make_user(db)
    patient_id = await _make_patient(db, owner)
    thread_id = await _make_thread(db, owner)
    evolution_id = uuid4()
    evolution_at = datetime(2026, 1, 5, 3, 30, tzinfo=UTC)
    action_id = await _make_action(
        db,
        owner,
        thread_id,
        patient_id,
        evolution_id=evolution_id,
        evolution_at=evolution_at,
    )
    await _make_connection(db, owner, status="active", frequency="daily")

    result = await clinical_assistant_repo.resolve_action(
        owner, action_id, "approve", PROPOSAL_HASH
    )

    assert result["status"] == "approved"
    async with db.acquire() as conn:
        evolution = await conn.fetchrow(
            "SELECT id, final_text FROM evolutions WHERE id = $1 AND owner_user_id = $2",
            evolution_id,
            owner,
        )
        export = await conn.fetchrow(
            """
            SELECT operation_id, period_type, period_key, journal_part, drive_file_id,
                   drive_version, status, journal_block, content_hash, last_error_code
            FROM google_drive_evolution_exports
            WHERE user_id = $1 AND evolution_id = $2
            """,
            owner,
            evolution_id,
        )

    assert evolution is not None
    assert export is not None
    assert export["operation_id"] is not None
    assert export["period_type"] == "daily"
    assert export["period_key"]
    assert export["journal_part"] is None
    assert export["drive_file_id"] is None
    assert export["drive_version"] is None
    assert export["status"] == "pending"
    assert export["last_error_code"] is None
    expected_block, expected_hash = evolution_exports_service.serialize_journal_v1(
        evolution_id=evolution_id,
        evolution_at=evolution_at,
        patient_display_name="Ana Pérez",
        patient_rut_masked="••.•••.678-5",
        approved_body="Texto aprobado",
    )
    assert export["journal_block"] == expected_block
    assert export["content_hash"] == expected_hash
    assert export["content_hash"] == hashlib.sha256(expected_block.encode("utf-8")).hexdigest()
    assert str(patient_id) not in export["journal_block"]
    assert str(thread_id) not in export["journal_block"]
    assert str(export["operation_id"]) not in export["journal_block"]


@pytest.mark.parametrize("connection_status", ["disconnected", "revoked"])
async def test_live_disconnected_approval_persists_failed_export_without_drive_write(
    db, connection_status: str
) -> None:
    owner = await _make_user(db)
    patient_id = await _make_patient(db, owner)
    thread_id = await _make_thread(db, owner)
    evolution_id = uuid4()
    action_id = await _make_action(
        db,
        owner,
        thread_id,
        patient_id,
        evolution_id=evolution_id,
        evolution_at=datetime(2026, 1, 5, 3, 30, tzinfo=UTC),
    )
    await _make_connection(db, owner, status=connection_status)

    result = await clinical_assistant_repo.resolve_action(
        owner, action_id, "approve", PROPOSAL_HASH
    )

    assert result["status"] == "approved"
    async with db.acquire() as conn:
        export = await conn.fetchrow(
            """
            SELECT status, last_error_code, journal_block
            FROM google_drive_evolution_exports
            WHERE user_id = $1 AND evolution_id = $2
            """,
            owner,
            evolution_id,
        )
    assert export is not None
    assert export["status"] == "failed"
    assert export["last_error_code"] == "DRIVE_CONNECTION_REQUIRED"
    assert export["journal_block"]


async def test_live_approval_without_connection_has_no_export_row(db) -> None:
    owner = await _make_user(db)
    patient_id = await _make_patient(db, owner)
    thread_id = await _make_thread(db, owner)
    evolution_id = uuid4()
    action_id = await _make_action(
        db,
        owner,
        thread_id,
        patient_id,
        evolution_id=evolution_id,
        evolution_at=datetime(2026, 1, 5, 3, 30, tzinfo=UTC),
    )

    result = await clinical_assistant_repo.resolve_action(
        owner, action_id, "approve", PROPOSAL_HASH
    )

    assert result["status"] == "approved"
    async with db.acquire() as conn:
        count = await conn.fetchval(
            "SELECT count(*) FROM google_drive_evolution_exports WHERE evolution_id = $1",
            evolution_id,
        )
    assert count == 0


async def test_live_export_insert_failure_rolls_back_evolution_and_intent(
    db, monkeypatch: pytest.MonkeyPatch
) -> None:
    owner = await _make_user(db)
    patient_id = await _make_patient(db, owner)
    thread_id = await _make_thread(db, owner)
    evolution_id = uuid4()
    action_id = await _make_action(
        db,
        owner,
        thread_id,
        patient_id,
        evolution_id=evolution_id,
        evolution_at=datetime(2026, 1, 5, 3, 30, tzinfo=UTC),
    )
    await _make_connection(db, owner, status="active")

    async def fail_insert(*_args, **_kwargs):
        raise RuntimeError("intent insert failed")

    monkeypatch.setattr(
        evolution_exports_repo,
        "create_export_intent_with_connection",
        fail_insert,
    )

    result = await clinical_assistant_repo.resolve_action(
        owner, action_id, "approve", PROPOSAL_HASH
    )

    assert result["status"] == "failed"
    async with db.acquire() as conn:
        evolution_count = await conn.fetchval(
            "SELECT count(*) FROM evolutions WHERE id = $1", evolution_id
        )
        export_count = await conn.fetchval(
            "SELECT count(*) FROM google_drive_evolution_exports WHERE evolution_id = $1",
            evolution_id,
        )
        action_status = await conn.fetchval(
            "SELECT status FROM clinical_pending_actions WHERE id = $1", action_id
        )
    assert evolution_count == 0
    assert export_count == 0
    assert action_status == "failed"
