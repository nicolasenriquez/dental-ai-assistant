"""Owner-scoped PostgreSQL access for Clinical Assistant state."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from backend.config import CLINICAL_TURN_LIMIT_PER_24H
from backend.db import evolutions_repo
from backend.db.postgres import get_pg_pool


def _uuid(value: UUID | str) -> UUID:
    return value if isinstance(value, UUID) else UUID(str(value))


def _action_dict(row: Any) -> dict[str, Any]:
    result = dict(row)
    payload = result.get("proposal_payload")
    if isinstance(payload, str):
        result["proposal_payload"] = json.loads(payload)
    return result


def _artifact_dict(row: Any) -> dict[str, Any]:
    result = dict(row)
    payload = result.pop("payload", {})
    if isinstance(payload, str):
        payload = json.loads(payload)
    if not isinstance(payload, dict):
        payload = {}
    result.update(payload)
    return result


class TurnAlreadyRunningError(Exception):
    """The thread already has another turn in progress."""


class TurnIdempotencyConflictError(Exception):
    """A turn UUID was reused with different content."""


class ProposalStaleError(Exception):
    """The approval no longer represents the displayed proposal."""


class ActionExpiredError(Exception):
    """The approval window has elapsed."""


class ClinicalRateLimitError(Exception):
    """The independent clinical turn limit has been reached."""


class PendingActionExistsError(Exception):
    """The thread already has a pending approval."""


ACTIVE_TURN_STALE_SECONDS = 10 * 60


def _turn_is_stale(updated_at: datetime) -> bool:
    """True when the thread's lock timestamp is old enough that the owner
    worker is considered dead and the lock may be reclaimed."""
    return updated_at < datetime.now(UTC) - timedelta(seconds=ACTIVE_TURN_STALE_SECONDS)


async def create_thread(owner_user_id: UUID | str, title: str) -> dict[str, Any]:
    thread_id = uuid4()
    now = datetime.now(UTC)
    async with get_pg_pool().acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO clinical_threads (id, owner_user_id, title, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $4)
            RETURNING id, owner_user_id, title, active_patient_id, active_turn_id,
                      created_at, updated_at
            """,
            thread_id,
            _uuid(owner_user_id),
            title,
            now,
        )
    return {**dict(row), "messages": [], "artifacts": [], "pending_action": None}


async def list_threads(owner_user_id: UUID | str) -> list[dict[str, Any]]:
    async with get_pg_pool().acquire() as conn:
        await conn.execute(
            """
            UPDATE clinical_turn_artifacts a
            SET status = 'failed', resolved_at = now(), updated_at = now()
            WHERE a.owner_user_id = $1 AND a.status = 'pending'
              AND EXISTS (
                SELECT 1 FROM clinical_pending_actions p
                WHERE p.artifact_id = a.id AND p.status = 'pending' AND p.expires_at <= now()
              )
            """,
            _uuid(owner_user_id),
        )
        await conn.execute(
            """
            UPDATE clinical_pending_actions
            SET status = 'expired', proposal_payload = NULL, resolved_at = now()
            WHERE owner_user_id = $1 AND status = 'pending' AND expires_at <= now()
            """,
            _uuid(owner_user_id),
        )
        rows = await conn.fetch(
            """
            SELECT t.id, t.owner_user_id, t.title, t.active_patient_id, t.active_turn_id,
                   t.created_at, t.updated_at,
                   (SELECT turn_id FROM clinical_messages m2 WHERE m2.thread_id = t.id
                    ORDER BY m2.created_at DESC LIMIT 1) AS latest_turn_id,
                   (SELECT content FROM clinical_messages m WHERE m.thread_id = t.id
                    ORDER BY m.created_at DESC LIMIT 1) AS preview,
                   EXISTS (
                     SELECT 1 FROM clinical_pending_actions a
                     WHERE a.thread_id = t.id AND a.status = 'pending'
                       AND a.expires_at > now()
                   ) AS approval_pending
            FROM clinical_threads t
            WHERE t.owner_user_id = $1
            ORDER BY t.updated_at DESC
            """,
            _uuid(owner_user_id),
        )
    return [dict(row) for row in rows]


async def get_thread(owner_user_id: UUID | str, thread_id: UUID | str) -> dict[str, Any] | None:
    thread_uuid = _uuid(thread_id)
    async with get_pg_pool().acquire() as conn:
        thread = await conn.fetchrow(
            """
            SELECT id, owner_user_id, title, active_patient_id, active_turn_id,
                   created_at, updated_at,
                   (SELECT turn_id FROM clinical_messages m2 WHERE m2.thread_id = clinical_threads.id
                    ORDER BY m2.created_at DESC LIMIT 1) AS latest_turn_id
            FROM clinical_threads
            WHERE id = $1 AND owner_user_id = $2
            """,
            thread_uuid,
            _uuid(owner_user_id),
        )
        if not thread:
            return None
        messages = await conn.fetch(
            """
            SELECT id, thread_id, turn_id, role, content, created_at
            FROM clinical_messages WHERE thread_id = $1
            ORDER BY created_at ASC
            """,
            thread_uuid,
        )
        await conn.execute(
            """
            UPDATE clinical_turn_artifacts a
            SET status = 'failed', resolved_at = now(), updated_at = now()
            WHERE a.thread_id = $1 AND a.status = 'pending'
              AND EXISTS (
                SELECT 1 FROM clinical_pending_actions p
                WHERE p.artifact_id = a.id AND p.status = 'pending' AND p.expires_at <= now()
              )
            """,
            thread_uuid,
        )
        await conn.execute(
            """
            UPDATE clinical_pending_actions
            SET status = 'expired', proposal_payload = NULL, resolved_at = now()
            WHERE thread_id = $1 AND status = 'pending' AND expires_at <= now()
            """,
            thread_uuid,
        )
        artifacts = await conn.fetch(
            """
            SELECT id, owner_user_id, thread_id, turn_id, patient_id, artifact_type,
                   status, payload, created_at, updated_at, resolved_at
            FROM clinical_turn_artifacts
            WHERE thread_id = $1 AND owner_user_id = $2
            ORDER BY created_at ASC
            """,
            thread_uuid,
            _uuid(owner_user_id),
        )
        pending = await conn.fetchrow(
            """
            SELECT id, thread_id, turn_id, artifact_id, patient_id, action_type, proposal_payload,
                   proposal_hash, status, expires_at, created_at, resolved_at, result_resource_id
            FROM clinical_pending_actions
            WHERE thread_id = $1 AND status = 'pending'
            ORDER BY created_at DESC LIMIT 1
            """,
            thread_uuid,
        )
        actions = await conn.fetch(
            """
            SELECT id, thread_id, turn_id, artifact_id, patient_id, action_type, proposal_payload,
                   proposal_hash, status, expires_at, created_at, resolved_at, result_resource_id
            FROM clinical_pending_actions
            WHERE thread_id = $1
            ORDER BY created_at ASC
            """,
            thread_uuid,
        )
    return {
        **dict(thread),
        "messages": [dict(row) for row in messages],
        "artifacts": [_artifact_dict(row) for row in artifacts],
        "pending_action": _action_dict(pending) if pending else None,
        "actions": [_action_dict(row) for row in actions],
    }


async def create_artifact(
    owner_user_id: UUID | str,
    thread_id: UUID | str,
    turn_id: UUID | str,
    patient_id: UUID | str,
    artifact_id: UUID | str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    async with get_pg_pool().acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO clinical_turn_artifacts (
                id, owner_user_id, thread_id, turn_id, patient_id,
                artifact_type, status, payload
            ) VALUES ($1, $2, $3, $4, $5, 'clinical_draft', 'draft', $6::jsonb)
            ON CONFLICT (thread_id, turn_id, artifact_type) DO UPDATE
            SET payload = EXCLUDED.payload, updated_at = now(), status = 'draft', resolved_at = NULL
            RETURNING id, owner_user_id, thread_id, turn_id, patient_id, artifact_type,
                      status, payload, created_at, updated_at, resolved_at
            """,
            _uuid(artifact_id),
            _uuid(owner_user_id),
            _uuid(thread_id),
            _uuid(turn_id),
            _uuid(patient_id),
            json.dumps(payload, ensure_ascii=False, default=str),
        )
    return _artifact_dict(row)


async def get_artifact(
    owner_user_id: UUID | str, thread_id: UUID | str, artifact_id: UUID | str
) -> dict[str, Any] | None:
    async with get_pg_pool().acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, owner_user_id, thread_id, turn_id, patient_id, artifact_type,
                   status, payload, created_at, updated_at, resolved_at
            FROM clinical_turn_artifacts
            WHERE id = $1 AND thread_id = $2 AND owner_user_id = $3
            """,
            _uuid(artifact_id),
            _uuid(thread_id),
            _uuid(owner_user_id),
        )
    return _artifact_dict(row) if row else None


async def update_artifact(
    owner_user_id: UUID | str,
    thread_id: UUID | str,
    artifact_id: UUID | str,
    *,
    payload: dict[str, Any],
    status: str,
) -> dict[str, Any] | None:
    async with get_pg_pool().acquire() as conn:
        row = await conn.fetchrow(
            """
            UPDATE clinical_turn_artifacts
            SET payload = $4::jsonb, status = $5, updated_at = now()
            WHERE id = $1 AND thread_id = $2 AND owner_user_id = $3
              AND status IN ('draft', 'stale')
            RETURNING id, owner_user_id, thread_id, turn_id, patient_id, artifact_type,
                      status, payload, created_at, updated_at, resolved_at
            """,
            _uuid(artifact_id),
            _uuid(thread_id),
            _uuid(owner_user_id),
            json.dumps(payload, ensure_ascii=False, default=str),
            status,
        )
    return _artifact_dict(row) if row else None


async def set_artifact_status(
    owner_user_id: UUID | str,
    thread_id: UUID | str,
    artifact_id: UUID | str,
    status: str,
) -> None:
    async with get_pg_pool().acquire() as conn:
        await conn.execute(
            """
            UPDATE clinical_turn_artifacts
            SET status = $4,
                updated_at = now(),
                resolved_at = CASE WHEN $4 IN ('approved', 'declined', 'failed') THEN now() ELSE resolved_at END
            WHERE id = $1 AND thread_id = $2 AND owner_user_id = $3
            """,
            _uuid(artifact_id),
            _uuid(thread_id),
            _uuid(owner_user_id),
            status,
        )


async def set_active_patient(
    owner_user_id: UUID | str, thread_id: UUID | str, patient_id: UUID | str | None
) -> dict[str, Any] | None:
    owner = _uuid(owner_user_id)
    async with get_pg_pool().acquire() as conn:
        if patient_id is not None:
            patient_exists = await conn.fetchval(
                "SELECT 1 FROM patients WHERE id = $1 AND owner_user_id = $2",
                _uuid(patient_id),
                owner,
            )
            if not patient_exists:
                return None
        row = await conn.fetchrow(
            """
            UPDATE clinical_threads
            SET active_patient_id = $1, updated_at = now()
            WHERE id = $2 AND owner_user_id = $3
            RETURNING id, owner_user_id, title, active_patient_id, active_turn_id,
                      created_at, updated_at
            """,
            _uuid(patient_id) if patient_id is not None else None,
            _uuid(thread_id),
            owner,
        )
    return dict(row) if row else None


async def turn_exists(
    owner_user_id: UUID | str, thread_id: UUID | str, turn_id: UUID | str
) -> bool:
    async with get_pg_pool().acquire() as conn:
        return bool(
            await conn.fetchval(
                """
                SELECT 1
                FROM clinical_messages m
                JOIN clinical_threads t ON t.id = m.thread_id
                WHERE m.thread_id = $1 AND m.turn_id = $2 AND t.owner_user_id = $3
                LIMIT 1
                """,
                _uuid(thread_id),
                _uuid(turn_id),
                _uuid(owner_user_id),
            )
        )


async def update_title_if_default(
    owner_user_id: UUID | str, thread_id: UUID | str, title: str
) -> None:
    """Give the first clinical turn a useful title without replacing custom titles."""
    async with get_pg_pool().acquire() as conn:
        await conn.execute(
            """
            UPDATE clinical_threads
            SET title = $1, updated_at = now()
            WHERE id = $2 AND owner_user_id = $3 AND title = 'Asistente clínico'
            """,
            title,
            _uuid(thread_id),
            _uuid(owner_user_id),
        )


async def claim_turn(
    owner_user_id: UUID | str, thread_id: UUID | str, turn_id: UUID | str, content: str
) -> dict[str, Any]:
    owner = _uuid(owner_user_id)
    thread = _uuid(thread_id)
    turn = _uuid(turn_id)
    async with get_pg_pool().acquire() as conn, conn.transaction():
        row = await conn.fetchrow(
            """
            SELECT active_patient_id, active_turn_id, updated_at
            FROM clinical_threads
            WHERE id = $1 AND owner_user_id = $2
            FOR UPDATE
            """,
            thread,
            owner,
        )
        if not row:
            raise LookupError("Thread not found")
        existing = await conn.fetch(
            """
            SELECT m.role, m.content
            FROM clinical_messages m
            JOIN clinical_threads t ON t.id = m.thread_id
            WHERE m.turn_id = $1 AND m.thread_id = $2 AND t.owner_user_id = $3
            """,
            turn,
            thread,
            owner,
        )
        if existing:
            if any(msg["role"] == "user" and msg["content"] != content for msg in existing):
                raise TurnIdempotencyConflictError
            return {"replay": True, "messages": [dict(msg) for msg in existing]}
        if (
            row["active_turn_id"] is not None
            and row["active_turn_id"] != turn
            and not _turn_is_stale(row["updated_at"])
        ):
            raise TurnAlreadyRunningError
        turn_count = await conn.fetchval(
            """
            SELECT count(*)
            FROM clinical_messages m
            JOIN clinical_threads t ON t.id = m.thread_id
            WHERE t.owner_user_id = $1 AND m.role = 'user'
              AND m.created_at > now() - interval '24 hours'
            """,
            owner,
        )
        if int(turn_count or 0) >= CLINICAL_TURN_LIMIT_PER_24H:
            raise ClinicalRateLimitError
        await conn.execute(
            """
            UPDATE clinical_threads SET active_turn_id = $1, updated_at = now()
            WHERE id = $2 AND owner_user_id = $3
            """,
            turn,
            thread,
            owner,
        )
        message = await conn.fetchrow(
            """
            INSERT INTO clinical_messages (id, thread_id, turn_id, role, content, created_at)
            VALUES ($1, $2, $3, 'user', $4, now())
            RETURNING id, thread_id, turn_id, role, content, created_at
            """,
            uuid4(),
            thread,
            turn,
            content,
        )
    return {
        "replay": False,
        "active_patient_id": row["active_patient_id"],
        "message": dict(message),
    }


async def append_message(
    owner_user_id: UUID | str, thread_id: UUID | str, turn_id: UUID | str, role: str, content: str
) -> dict[str, Any]:
    async with get_pg_pool().acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO clinical_messages (id, thread_id, turn_id, role, content, created_at)
            SELECT $1, $2, $3, $4, $5, now()
            WHERE EXISTS (SELECT 1 FROM clinical_threads WHERE id = $2 AND owner_user_id = $6)
            RETURNING id, thread_id, turn_id, role, content, created_at
            """,
            uuid4(),
            _uuid(thread_id),
            _uuid(turn_id),
            role,
            content,
            _uuid(owner_user_id),
        )
        if row is None:
            raise LookupError("Thread not found")
        await conn.execute(
            "UPDATE clinical_threads SET updated_at = now() WHERE id = $1 AND owner_user_id = $2",
            _uuid(thread_id),
            _uuid(owner_user_id),
        )
    return dict(row)


async def finish_turn(
    owner_user_id: UUID | str, thread_id: UUID | str, turn_id: UUID | str
) -> None:
    async with get_pg_pool().acquire() as conn:
        await conn.execute(
            """
            UPDATE clinical_threads SET active_turn_id = NULL, updated_at = now()
            WHERE id = $1 AND owner_user_id = $2 AND active_turn_id = $3
            """,
            _uuid(thread_id),
            _uuid(owner_user_id),
            _uuid(turn_id),
        )


async def create_pending_action(
    owner_user_id: UUID | str,
    thread_id: UUID | str,
    turn_id: UUID | str,
    artifact_id: UUID | str,
    patient_id: UUID | str,
    action_type: str,
    payload: dict[str, Any],
    proposal_hash: str,
) -> dict[str, Any]:
    expires_at = datetime.now(UTC) + timedelta(minutes=30)
    owner = _uuid(owner_user_id)
    thread = _uuid(thread_id)
    async with get_pg_pool().acquire() as conn, conn.transaction():
        await conn.execute(
            """
            UPDATE clinical_turn_artifacts a
            SET status = 'failed', resolved_at = now(), updated_at = now()
            WHERE a.thread_id = $1 AND a.owner_user_id = $2 AND a.status = 'pending'
              AND EXISTS (
                SELECT 1 FROM clinical_pending_actions p
                WHERE p.artifact_id = a.id AND p.status = 'pending' AND p.expires_at <= now()
              )
            """,
            thread,
            owner,
        )
        await conn.execute(
            """
            UPDATE clinical_pending_actions
            SET status = 'expired', proposal_payload = NULL, resolved_at = now()
            WHERE thread_id = $1 AND owner_user_id = $2 AND status = 'pending'
              AND expires_at <= now()
            """,
            thread,
            owner,
        )
        row = await conn.fetchrow(
            """
            INSERT INTO clinical_pending_actions (
                id, owner_user_id, thread_id, turn_id, artifact_id, patient_id, action_type,
                proposal_payload, proposal_hash, status, expires_at, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, 'pending', $10, now())
            ON CONFLICT (thread_id) WHERE status = 'pending' DO NOTHING
            RETURNING id, thread_id, turn_id, artifact_id, patient_id, action_type, proposal_payload,
                      proposal_hash, status, expires_at, created_at, resolved_at, result_resource_id
            """,
            uuid4(),
            owner,
            thread,
            _uuid(turn_id),
            _uuid(artifact_id),
            _uuid(patient_id),
            action_type,
            json.dumps(payload, ensure_ascii=False),
            proposal_hash,
            expires_at,
        )
        if row is None:
            raise PendingActionExistsError
        await conn.execute(
            """
            UPDATE clinical_turn_artifacts
            SET status = 'pending', updated_at = now()
            WHERE id = $1 AND thread_id = $2 AND owner_user_id = $3
            """,
            _uuid(artifact_id),
            thread,
            owner,
        )
    return _action_dict(row)


async def resolve_action(
    owner_user_id: UUID | str,
    action_id: UUID | str,
    decision: str,
    proposal_hash: str,
) -> dict[str, Any]:
    owner = _uuid(owner_user_id)
    async with get_pg_pool().acquire() as conn, conn.transaction():
        action = await conn.fetchrow(
            "SELECT * FROM clinical_pending_actions WHERE id = $1 AND owner_user_id = $2 FOR UPDATE",
            _uuid(action_id),
            owner,
        )
        if action is None:
            raise LookupError("Action not found")
        if action["status"] == "pending" and action["expires_at"] <= datetime.now(UTC):
            await conn.execute(
                """
                UPDATE clinical_pending_actions
                SET status = 'expired', proposal_payload = NULL, resolved_at = now()
                WHERE id = $1
                """,
                _uuid(action_id),
            )
            if action["artifact_id"] is not None:
                await conn.execute(
                    """
                    UPDATE clinical_turn_artifacts
                    SET status = 'failed', resolved_at = now(), updated_at = now()
                    WHERE id = $1 AND owner_user_id = $2
                    """,
                    action["artifact_id"],
                    owner,
                )
            return {
                "id": action["id"],
                "status": "expired",
                "proposal_hash": action["proposal_hash"],
                "thread_id": action["thread_id"],
            }
        if action["status"] in {"approved", "declined"}:
            if action["proposal_hash"] == proposal_hash and (
                (action["status"] == "approved" and decision == "approve")
                or (action["status"] == "declined" and decision == "decline")
            ):
                return dict(action)
            raise ProposalStaleError
        if action["status"] != "pending" or action["proposal_hash"] != proposal_hash:
            raise ProposalStaleError
        if decision == "decline":
            row = await conn.fetchrow(
                """
                UPDATE clinical_pending_actions
                SET status = 'declined', resolved_at = now(), resolved_by = $2
                WHERE id = $1
                RETURNING *
                """,
                _uuid(action_id),
                owner,
            )
            if action["artifact_id"] is not None:
                await conn.execute(
                    """
                    UPDATE clinical_turn_artifacts
                    SET status = 'declined', resolved_at = now(), updated_at = now()
                    WHERE id = $1 AND owner_user_id = $2
                    """,
                    action["artifact_id"],
                    owner,
                )
            return dict(row)

        payload = action["proposal_payload"]
        if isinstance(payload, str):
            payload = json.loads(payload)
        required = {
            "evolution_id",
            "patient_id",
            "evolution_at",
            "raw_note",
            "generated_text",
            "final_text",
        }
        if not isinstance(payload, dict) or set(payload) != required:
            raise ProposalStaleError
        try:
            payload_patient_id = _uuid(payload["patient_id"])
            evolution_id = _uuid(payload["evolution_id"])
            evolution_at = payload["evolution_at"]
            if isinstance(evolution_at, str):
                evolution_at = datetime.fromisoformat(evolution_at)
        except (TypeError, ValueError, KeyError):
            raise ProposalStaleError from None
        if not isinstance(evolution_at, datetime) or payload_patient_id != _uuid(
            action["patient_id"]
        ):
            raise ProposalStaleError
        thread_exists = await conn.fetchval(
            "SELECT 1 FROM clinical_threads WHERE id = $1 AND owner_user_id = $2",
            _uuid(action["thread_id"]),
            owner,
        )
        patient_exists = await conn.fetchval(
            "SELECT 1 FROM patients WHERE id = $1 AND owner_user_id = $2",
            _uuid(action["patient_id"]),
            owner,
        )
        if not thread_exists or not patient_exists:
            raise LookupError("Action not found")
        try:
            async with conn.transaction():
                result = await evolutions_repo.create_evolution_with_connection(
                    conn,
                    owner,
                    _uuid(action["patient_id"]),
                    evolution_id=evolution_id,
                    evolution_at=evolution_at,
                    raw_note=str(payload["raw_note"]),
                    generated_text=str(payload["generated_text"]),
                    final_text=str(payload["final_text"]),
                )
        except Exception:
            row = await conn.fetchrow(
                """
                UPDATE clinical_pending_actions
                SET status = 'failed', proposal_payload = NULL, resolved_at = now(), resolved_by = $2
                WHERE id = $1
                RETURNING *
                """,
                _uuid(action_id),
                owner,
            )
            if action["artifact_id"] is not None:
                await conn.execute(
                    """
                    UPDATE clinical_turn_artifacts
                    SET status = 'failed', resolved_at = now(), updated_at = now()
                    WHERE id = $1 AND owner_user_id = $2
                    """,
                    action["artifact_id"],
                    owner,
                )
            return dict(row)
        row = await conn.fetchrow(
            """
            UPDATE clinical_pending_actions
            SET status = 'approved', resolved_at = now(),
                resolved_by = $2, result_resource_id = $3
            WHERE id = $1
            RETURNING *
            """,
            _uuid(action_id),
            owner,
            UUID(str(result["id"])),
        )
        if action["artifact_id"] is not None:
            await conn.execute(
                """
                UPDATE clinical_turn_artifacts
                SET status = 'approved', resolved_at = now(), updated_at = now()
                WHERE id = $1 AND owner_user_id = $2
                """,
                action["artifact_id"],
                owner,
            )
        return {**dict(row), "result": result}
