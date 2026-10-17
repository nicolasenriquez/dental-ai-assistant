"""Real Postgres deletion contracts on an explicitly selected database (task 1.5).

Runs against ``WORKSPACE_LIVE_TEST_DSN`` (an isolated migrated database; the
suite never truncates and removes only the synthetic rows it creates). Pins the
write protocol in
``openspec/changes/replicate-diagnosis-history/deletion-design.md``:

- one transaction commits tombstone, deleted revision and receipt with a single
  timestamp and no ``entered_in_error`` transition;
- operation replay returns the stored receipt, while mismatched operations,
  stale revisions and already-deleted records return typed 409 conflicts;
- bridges delete as one procedure, protected/plan-linked procedures reject
  without plan locks, and contextual notes keep their lock order;
- revision snapshots stay append-only so as-of reads can trust them;
- both correction POST endpoints answer owned 410 without replay or writes.

The schema/read guards (2.7) and retirement stubs (2.8) are implemented.
Delete writers (2.5) are exercised through the registered HTTP routes.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

import asyncpg
import pytest
from httpx import ASGITransport, AsyncClient

from backend.auth.dependencies import get_current_user
from backend.db import (
    patient_activity_repo,
    patient_clinical_notes_repo,
    patient_clinical_plans_repo,
    patient_conditions_repo,
    patient_treatments_repo,
)
from backend.main import app
from backend.patients.treatments import TreatmentConflict

DSN = os.environ.get("WORKSPACE_LIVE_TEST_DSN", "")
pytestmark = pytest.mark.skipif(not DSN, reason="WORKSPACE_LIVE_TEST_DSN not set")


def _auth(user_id: UUID):
    async def user(session=None):
        return {"id": str(user_id)}

    return user


def _client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="https://testserver")


def _aware(value: str | datetime) -> datetime:
    parsed = datetime.fromisoformat(value) if isinstance(value, str) else value
    assert parsed.tzinfo is not None
    return parsed


def _delete_hash(kind: str, patient: UUID, resource: UUID, expected: int) -> str:
    value = {
        "version": 1,
        "kind": kind,
        "action": "deleted",
        "patient_id": str(patient),
        "resource_id": str(resource),
        "expected_revision": expected,
    }
    canonical = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode()).hexdigest()


def _condition_body(**changes: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "id": str(uuid4()),
        "dentition": "permanent",
        "tooth_fdi": 16,
        "condition_code": "caries",
        "surfaces": ["M", "O"],
    }
    body.update(changes)
    return body


async def _create_condition(
    client: AsyncClient, patient: UUID, *, body: dict[str, Any] | None = None
) -> tuple[UUID, dict[str, Any]]:
    payload = body or _condition_body()
    response = await client.post(f"/api/patients/{patient}/conditions", json=payload)
    assert response.status_code == 201, response.text
    return UUID(payload["id"]), payload


async def _create_treatment(
    client: AsyncClient,
    patient: UUID,
    *,
    variant: str = "ORTO-BRACK",
    teeth: tuple[tuple[int, str], ...] = ((16, "tooth"),),
) -> UUID:
    identifier = uuid4()
    response = await client.post(
        f"/api/patients/{patient}/dental-treatments",
        json={
            "id": str(identifier),
            "operation_id": str(uuid4()),
            "expected_revision": 0,
            "variant_id": variant,
            "dentition": "permanent",
            "teeth": [{"tooth_fdi": tooth, "role": role, "surfaces": []} for tooth, role in teeth],
        },
    )
    assert response.status_code == 201, response.text
    return identifier


async def _delete(
    client: AsyncClient,
    kind: str,
    patient: UUID,
    resource: UUID,
    *,
    operation: UUID | None = None,
    expected: int = 1,
):
    collection = "conditions" if kind == "condition" else "dental-treatments"
    return await client.post(
        f"/api/patients/{patient}/{collection}/{resource}/delete",
        json={"operation_id": str(operation or uuid4()), "expected_revision": expected},
    )


def _note_body(treatment: UUID, *, operation: UUID | None = None) -> dict[str, Any]:
    return {
        "operation_id": str(operation or uuid4()),
        "entity_id": str(treatment),
        "entity_kind": "treatment",
        "note_type": "treatment",
        "body": "Nota contextual sintética",
    }


async def _add_plan_item(
    owner: UUID, patient: UUID, *, plan: UUID | None = None, treatment: UUID | None = None
) -> tuple[UUID, UUID]:
    plan_id = plan or uuid4()
    if plan is None:
        await patient_clinical_plans_repo.command(
            owner,
            patient,
            plan_id,
            "create",
            {"operation_id": str(uuid4()), "title": "Plan sintético"},
        )
    treatment_id = treatment or uuid4()
    await patient_clinical_plans_repo.command(
        owner,
        patient,
        plan_id,
        "add_item",
        {
            "operation_id": str(uuid4()),
            "expected_revision": 1,
            "id": str(uuid4()),
            "treatment": {
                "id": str(treatment_id),
                "variant_id": "PREV-SEAL",
                "dentition": "permanent",
                "teeth": [{"tooth_fdi": 16, "role": "tooth", "surfaces": []}],
                "arch": None,
                "note": None,
            },
            "stages": [{"label": "Sesión 1", "note": None}],
        },
    )
    return plan_id, treatment_id


async def _tombstone_condition(
    pool: asyncpg.Pool, owner: UUID, patient: UUID, identifier: UUID
) -> None:
    """Append the paired deletion metadata and one deleted revision without a writer."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE patient_tooth_conditions SET deleted_at=clock_timestamp(),"
            " deleted_by_user_id=$2, revision=revision+1, updated_by_user_id=$2,"
            " updated_at=clock_timestamp() WHERE id=$1 RETURNING *",
            identifier,
            owner,
        )
        before = {
            "dentition": row["dentition"],
            "tooth_fdi": row["tooth_fdi"],
            "condition_code": row["condition_code"],
            "surfaces": list(row["surfaces"]),
            "note": row["note"],
            "status": row["status"],
            "deleted_at": None,
            "deleted_by_user_id": None,
        }
        after = {
            **before,
            "deleted_at": row["deleted_at"].isoformat(),
            "deleted_by_user_id": str(owner),
        }
        await conn.execute(
            """INSERT INTO patient_tooth_condition_revisions
            (id,condition_id,owner_user_id,patient_id,revision,before_snapshot,after_snapshot,actor_user_id,changed_at,action)
            VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$3,$8,'deleted')""",
            uuid4(),
            identifier,
            owner,
            patient,
            row["revision"],
            json.dumps(before),
            json.dumps(after),
            row["updated_at"],
        )


async def _tombstone_treatment(
    pool: asyncpg.Pool, owner: UUID, patient: UUID, identifier: UUID
) -> None:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE patient_dental_treatments SET deleted_at=clock_timestamp(),"
            " deleted_by_user_id=$2, revision=revision+1, updated_by_user_id=$2,"
            " updated_at=clock_timestamp() WHERE id=$1 RETURNING *",
            identifier,
            owner,
        )
        await conn.execute(
            """INSERT INTO patient_dental_treatment_revisions
            (id,treatment_id,patient_id,owner_user_id,revision,action,before_snapshot,after_snapshot,actor_user_id,changed_at)
            VALUES($1,$2,$3,$4,$5,'deleted','{}'::jsonb,$6::jsonb,$4,$7)""",
            uuid4(),
            identifier,
            patient,
            owner,
            row["revision"],
            json.dumps({"deleted_at": row["deleted_at"].isoformat()}),
            row["updated_at"],
        )


async def _condition_row(pool: asyncpg.Pool, identifier: UUID):
    async with pool.acquire() as conn:
        return await conn.fetchrow("SELECT * FROM patient_tooth_conditions WHERE id=$1", identifier)


async def _treatment_row(pool: asyncpg.Pool, identifier: UUID):
    async with pool.acquire() as conn:
        return await conn.fetchrow(
            "SELECT * FROM patient_dental_treatments WHERE id=$1", identifier
        )


async def _condition_revisions(pool: asyncpg.Pool, identifier: UUID) -> list[Any]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM patient_tooth_condition_revisions WHERE condition_id=$1"
            " ORDER BY revision",
            identifier,
        )
    return list(rows)


async def _command(pool: asyncpg.Pool, owner: UUID, operation: UUID):
    async with pool.acquire() as conn:
        return await conn.fetchrow(
            "SELECT * FROM patient_clinical_commands WHERE owner_user_id=$1 AND operation_id=$2",
            owner,
            operation,
        )


async def _command_count(pool: asyncpg.Pool, owner: UUID) -> int:
    async with pool.acquire() as conn:
        total = await conn.fetchval(
            "SELECT count(*) FROM patient_clinical_commands WHERE owner_user_id=$1", owner
        )
    return int(total)


@pytest.fixture
async def dental_db(monkeypatch):
    try:
        pool = await asyncpg.create_pool(DSN, min_size=1, max_size=4)
    except OSError as exc:
        pytest.skip(f"live Postgres unreachable: {exc}")
    for module in (
        patient_conditions_repo,
        patient_treatments_repo,
        patient_clinical_notes_repo,
        patient_clinical_plans_repo,
        patient_activity_repo,
    ):
        monkeypatch.setattr(module, "get_pg_pool", lambda: pool)
    owner, other = uuid4(), uuid4()
    patient, foreign = uuid4(), uuid4()
    async with pool.acquire() as conn:
        for user in (owner, other):
            await conn.execute(
                "INSERT INTO users (id, email) VALUES ($1, $2)",
                user,
                f"deletion-{user.hex[:12]}@example.com",
            )
        for index, (identifier, user) in enumerate(((patient, owner), (foreign, other))):
            await conn.execute(
                """INSERT INTO patients (id, owner_user_id, first_name, last_name, rut_number, rut_dv)
                   VALUES ($1, $2, 'Sintético', 'Eliminación', $3, '5')""",
                identifier,
                user,
                13000000 + index,
            )
    app.dependency_overrides[get_current_user] = _auth(owner)
    try:
        yield pool, owner, other, patient, foreign
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        async with pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM patients WHERE owner_user_id = ANY($1::uuid[])", [owner, other]
            )
            await conn.execute("DELETE FROM users WHERE id = ANY($1::uuid[])", [owner, other])
        await pool.close()


async def test_deletion_hides_foreign_patients_and_resources(dental_db):
    pool, owner, other, patient, foreign = dental_db
    async with _client() as client:
        mine, _ = await _create_condition(client, patient)
        absent = uuid4()

        foreign_parent = await _delete(client, "condition", foreign, absent)
        assert foreign_parent.status_code == 404
        assert foreign_parent.json()["detail"]["code"] == "not_found"
        missing_resource = await _delete(client, "condition", patient, absent)
        assert missing_resource.status_code == 404
        assert missing_resource.json()["detail"]["code"] == "not_found"

        app.dependency_overrides[get_current_user] = _auth(other)
        try:
            crossed = await _delete(client, "condition", patient, mine)
        finally:
            app.dependency_overrides[get_current_user] = _auth(owner)
        assert crossed.status_code == 404
        assert crossed.json()["detail"]["code"] == "not_found"

    row = await _condition_row(pool, mine)
    assert row["deleted_at"] is None
    assert row["revision"] == 1


async def test_condition_deletion_is_atomic_and_leaves_no_entered_in_error(dental_db):
    pool, owner, _, patient, _ = dental_db
    async with _client() as client:
        condition, _ = await _create_condition(client, patient)
        operation = uuid4()
        response = await _delete(client, "condition", patient, condition, operation=operation)
        assert response.status_code == 200, response.text
        receipt = response.json()
        assert receipt["operation_id"] == str(operation)
        assert receipt["resource_kind"] == "condition"
        assert receipt["resource_id"] == str(condition)
        assert receipt["action"] == "deleted"
        assert receipt["revision"] == 2
        assert UUID(receipt["revision_id"])
        assert receipt["actor"]["user_id"] == str(owner)
        deleted_at = _aware(receipt["deleted_at"])

        tombstone = await client.get(f"/api/patients/{patient}/conditions/{condition}")
        assert tombstone.status_code == 200, tombstone.text
        assert _aware(tombstone.json()["deleted_at"]) == deleted_at
        assert tombstone.json()["status"] == "active"

        page = await client.get(f"/api/patients/{patient}/conditions", params={"status": "all"})
        assert page.json() == {"items": [], "next_cursor": None, "total": 0}

        revisions = await client.get(f"/api/patients/{patient}/conditions/{condition}/revisions")
        assert revisions.status_code == 200, revisions.text
        actions = [item["action"] for item in revisions.json()["items"]]
        assert actions[::-1] == ["created", "deleted"]

    row = await _condition_row(pool, condition)
    assert _aware(row["deleted_at"]) == deleted_at
    assert row["deleted_by_user_id"] == owner
    assert _aware(row["updated_at"]) == deleted_at
    assert row["status"] == "active"
    assert row["revision"] == 2

    revisions = await _condition_revisions(pool, condition)
    assert [(item["revision"], item["action"]) for item in revisions] == [
        (1, "created"),
        (2, "deleted"),
    ]
    assert _aware(revisions[1]["changed_at"]) == deleted_at
    prior = json.loads(revisions[0]["after_snapshot"])
    before = json.loads(revisions[1]["before_snapshot"])
    assert {key: before[key] for key in prior} == prior
    assert before.get("deleted_at") is None
    assert revisions[1]["operation_id"] is None
    assert revisions[1]["correction_reason"] is None
    assert revisions[1]["command_snapshot"] is None
    assert revisions[1]["replacement_condition_id"] is None
    after = json.loads(revisions[1]["after_snapshot"])
    assert _aware(after["deleted_at"]) == deleted_at
    assert after["deleted_by_user_id"] == str(owner)

    command = await _command(pool, owner, operation)
    assert command["payload_hash"] == _delete_hash("condition", patient, condition, 1)
    assert json.loads(command["receipt"]) == receipt
    assert _aware(command["committed_at"]) == deleted_at


async def test_condition_deletion_replay_is_idempotent_and_conflicts_are_typed(dental_db):
    pool, owner, _, patient, _ = dental_db
    async with _client() as client:
        condition, _ = await _create_condition(client, patient)
        operation = uuid4()
        first = await _delete(client, "condition", patient, condition, operation=operation)
        assert first.status_code == 200, first.text

        replay = await _delete(client, "condition", patient, condition, operation=operation)
        assert replay.status_code == 200, replay.text
        assert replay.json() == first.json()
        assert await _command_count(pool, owner) == 1
        assert len(await _condition_revisions(pool, condition)) == 2

        mismatched = await _delete(
            client, "condition", patient, condition, operation=operation, expected=2
        )
        assert mismatched.status_code == 409
        assert mismatched.json()["detail"]["code"] == "idempotency_conflict"

        terminal = await _delete(client, "condition", patient, condition, expected=2)
        assert terminal.status_code == 409
        assert terminal.json()["detail"]["code"] == "record_deleted"

        live, _ = await _create_condition(client, patient)
        edited = await client.patch(
            f"/api/patients/{patient}/conditions/{live}",
            json={"expected_revision": 1, "status": "resolved"},
        )
        assert edited.status_code == 200, edited.text
        stale = await _delete(client, "condition", patient, live, expected=1)
        assert stale.status_code == 409
        assert stale.json()["detail"]["code"] == "revision_conflict"
        assert stale.json()["detail"]["latest"]["revision"] == 2

    row = await _condition_row(pool, live)
    assert row["deleted_at"] is None
    assert row["status"] == "resolved"
    assert row["revision"] == 2


async def test_deletion_scope_and_active_uniqueness_allow_a_new_record_only(dental_db):
    pool, owner, _, patient, _ = dental_db
    async with _client() as client:
        first_body = _condition_body(surfaces=["M"])
        first, _ = await _create_condition(client, patient, body=first_body)
        second, _ = await _create_condition(client, patient, body=_condition_body(surfaces=["O"]))

        response = await _delete(client, "condition", patient, first)
        assert response.status_code == 200, response.text

        page = await client.get(f"/api/patients/{patient}/conditions", params={"status": "all"})
        assert page.json()["total"] == 1
        assert [item["id"] for item in page.json()["items"]] == [str(second)]

        replacement, _ = await _create_condition(
            client, patient, body={**_condition_body(surfaces=["M"])}
        )
        assert replacement != first

        replay = await client.post(f"/api/patients/{patient}/conditions", json=first_body)
        assert replay.status_code in (200, 404, 409), replay.text
        page = await client.get(f"/api/patients/{patient}/conditions", params={"status": "all"})
        assert page.json()["total"] == 2

    tombstone = await _condition_row(pool, first)
    assert tombstone["deleted_at"] is not None
    assert len(await _condition_revisions(pool, first)) == 2
    assert await _command_count(pool, owner) == 1


async def test_bridge_deletion_removes_one_procedure_and_keeps_unrelated_records(dental_db):
    pool, _, _, patient, _ = dental_db
    async with _client() as client:
        bridge = await _create_treatment(
            client,
            patient,
            variant="REST-BRIDGE-MC",
            teeth=((14, "pillar"), (15, "pontic"), (16, "pillar")),
        )
        other = await _create_treatment(client, patient)

        response = await _delete(client, "procedure", patient, bridge)
        assert response.status_code == 200, response.text
        assert response.json()["resource_kind"] == "procedure"
        assert UUID(response.json()["revision_id"])

        page = await client.get(f"/api/patients/{patient}/dental-treatments")
        assert [item["id"] for item in page.json()["items"]] == [str(other)]

        tombstone = await client.get(f"/api/patients/{patient}/dental-treatments/{bridge}")
        assert tombstone.status_code == 200
        assert tombstone.json()["deleted_at"] == response.json()["deleted_at"]

    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM patient_dental_treatments WHERE id=$1", bridge)
        assert row["deleted_at"] is not None
        members = await conn.fetchval(
            "SELECT count(*) FROM patient_dental_treatment_teeth WHERE treatment_id=$1",
            bridge,
        )
        assert members == 3
        revisions = await conn.fetch(
            "SELECT action FROM patient_dental_treatment_revisions WHERE treatment_id=$1"
            " ORDER BY revision",
            bridge,
        )
        assert [item["action"] for item in revisions] == ["created", "deleted"]


async def test_protected_procedures_and_plan_links_reject_deletion_without_mutation(dental_db):
    pool, owner, _, patient, _ = dental_db
    async with _client() as client:
        observed = await _create_treatment(client, patient)
        for state in ("planned", "performed", "cancelled", "entered_in_error"):
            async with pool.acquire() as conn:
                await conn.execute(
                    "UPDATE patient_dental_treatments SET state=$2 WHERE id=$1", observed, state
                )
            response = await _delete(client, "procedure", patient, observed)
            assert response.status_code == 409, f"{state}: {response.text}"
            assert response.json()["detail"]["code"] == "resource_read_only"
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE patient_dental_treatments SET state='existing' WHERE id=$1", observed
            )

        plan, planned = await _add_plan_item(owner, patient)
        async with pool.acquire() as conn:
            plan_revision = await conn.fetchval(
                "SELECT revision FROM patient_clinical_plans WHERE id=$1", plan
            )
        response = await _delete(client, "procedure", patient, planned)
        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "resource_read_only"

        linked = await _create_treatment(client, patient)
        linked_plan = uuid4()
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO patient_clinical_plans
                   (id, patient_id, owner_user_id, title, created_by, updated_by)
                   VALUES ($1, $2, $3, 'Plan enlazado', $3, $3)""",
                linked_plan,
                patient,
                owner,
            )
            await conn.execute(
                """INSERT INTO patient_clinical_plan_items
                   (id, plan_id, patient_id, owner_user_id, treatment_id, sequence)
                   VALUES ($1, $2, $3, $4, $5, 1)""",
                uuid4(),
                linked_plan,
                patient,
                owner,
                linked,
            )
        response = await _delete(client, "procedure", patient, linked)
        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "resource_read_only"

        finding, _ = await _create_condition(client, patient)
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE patient_tooth_conditions SET status='entered_in_error' WHERE id=$1",
                finding,
            )
        response = await _delete(client, "condition", patient, finding)
        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "resource_read_only"

    async with pool.acquire() as conn:
        plan_row = await conn.fetchrow(
            "SELECT revision FROM patient_clinical_plans WHERE id=$1", plan
        )
        assert plan_row["revision"] == plan_revision
        untouched = await conn.fetchval(
            "SELECT count(*) FROM patient_dental_treatments"
            " WHERE id = ANY($1::uuid[]) AND deleted_at IS NOT NULL",
            [observed, planned, linked],
        )
        assert untouched == 0


async def test_plan_add_item_allocates_a_new_planned_uuid(dental_db):
    pool, owner, _, patient, _ = dental_db
    async with _client() as client:
        observed = await _create_treatment(client, patient)

    _, planned = await _add_plan_item(owner, patient)
    row = await _treatment_row(pool, planned)
    assert row["provenance"] == "planned_in_clinic"
    assert row["state"] == "planned"

    with pytest.raises(TreatmentConflict) as error:
        await _add_plan_item(owner, patient, treatment=observed)
    assert error.value.detail["code"] == "idempotency_conflict"

    async with pool.acquire() as conn:
        linked = await conn.fetchval(
            "SELECT count(*) FROM patient_clinical_plan_items WHERE treatment_id=$1", observed
        )
    assert linked == 0
    assert (await _treatment_row(pool, observed))["state"] == "existing"


async def test_delete_does_not_acquire_plan_locks(dental_db):
    pool, owner, _, patient, _ = dental_db
    plan, _ = await _add_plan_item(owner, patient)
    async with _client() as client:
        target = await _create_treatment(client, patient)
        async with pool.acquire() as holder, holder.transaction():
            await holder.execute(
                "SELECT id FROM patient_clinical_plans WHERE id=$1 FOR UPDATE", plan
            )
            response = await asyncio.wait_for(
                _delete(client, "procedure", patient, target), timeout=5
            )
        assert response.status_code == 200, response.text


async def test_contextual_notes_respect_the_deletion_lock_order(dental_db):
    pool, owner, _, patient, _ = dental_db
    async with _client() as client:
        treatment = await _create_treatment(client, patient)
        note = uuid4()
        await patient_clinical_notes_repo.command(
            owner, patient, note, "create", _note_body(treatment)
        )
        response = await _delete(client, "procedure", patient, treatment)
        assert response.status_code == 200, response.text
        stored = await patient_clinical_notes_repo.get_note(owner, patient, note)
        assert stored["body"] == "Nota contextual sintética"
        assert stored["deleted_at"] is None

        second = await _create_treatment(client, patient)
        response = await _delete(client, "procedure", patient, second)
        assert response.status_code == 200, response.text
        with pytest.raises(TreatmentConflict) as error:
            await patient_clinical_notes_repo.command(
                owner, patient, uuid4(), "create", _note_body(second)
            )
        assert error.value.detail["code"] == "resource_read_only"

        third = await _create_treatment(client, patient)
        async with pool.acquire() as holder, holder.transaction():
            await holder.execute(
                "SELECT id FROM patient_dental_treatments WHERE id=$1 FOR KEY SHARE", third
            )
            task = asyncio.create_task(_delete(client, "procedure", patient, third))
            await asyncio.sleep(0.3)
            assert not task.done()
        response = await asyncio.wait_for(task, timeout=5)
        assert response.status_code == 200, response.text


async def test_concurrent_edit_and_delete_serialize_on_the_source_row(dental_db):
    pool, _, _, patient, _ = dental_db
    async with _client() as client:
        condition, _ = await _create_condition(client, patient)
        edit, delete = await asyncio.gather(
            client.patch(
                f"/api/patients/{patient}/conditions/{condition}",
                json={"expected_revision": 1, "status": "resolved"},
            ),
            _delete(client, "condition", patient, condition, expected=1),
        )
        assert sorted((edit.status_code, delete.status_code)) == [200, 409]
        loser = edit if edit.status_code == 409 else delete
        assert loser.json()["detail"]["code"] == (
            "record_deleted" if loser is edit else "revision_conflict"
        )

    row = await _condition_row(pool, condition)
    assert row["revision"] == 2
    if row["deleted_at"] is None:
        assert row["status"] == "resolved"
    else:
        assert row["status"] == "active"


async def test_deletion_schema_pairs_tombstone_metadata(dental_db):
    pool, owner, _, patient, _ = dental_db
    async with _client() as client:
        condition, _ = await _create_condition(client, patient)
    async with pool.acquire() as conn:
        with pytest.raises(asyncpg.IntegrityConstraintViolationError):
            await conn.execute(
                "UPDATE patient_tooth_conditions SET deleted_at=clock_timestamp() WHERE id=$1",
                condition,
            )
        with pytest.raises(asyncpg.IntegrityConstraintViolationError):
            await conn.execute(
                "UPDATE patient_tooth_conditions SET deleted_by_user_id=$2 WHERE id=$1",
                condition,
                owner,
            )
        await conn.execute(
            "UPDATE patient_tooth_conditions SET deleted_at=NULL, deleted_by_user_id=NULL"
            " WHERE id=$1",
            condition,
        )


async def test_correction_stubs_return_410_without_replay_or_writes(dental_db):
    pool, owner, _, patient, _ = dental_db
    async with _client() as client:
        condition, _ = await _create_condition(client, patient)
        treatment = await _create_treatment(client, patient)

        legacy_operation = uuid4()
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO patient_tooth_condition_revisions
                   (id, condition_id, owner_user_id, patient_id, revision, action,
                    before_snapshot, after_snapshot, actor_user_id, operation_id,
                    correction_reason, command_snapshot)
                   VALUES ($1, $2, $3, $4, 2, 'corrected', '{}'::jsonb, '{}'::jsonb,
                           $3, $5, 'Registro por error', '{}'::jsonb)""",
                uuid4(),
                condition,
                owner,
                patient,
                legacy_operation,
            )
            await conn.execute(
                "UPDATE patient_tooth_conditions SET revision=2 WHERE id=$1", condition
            )

        # A pre-retirement active-table receipt must not replay either.
        legacy_body = {
            "operation_id": str(legacy_operation),
            "expected_revision": 1,
            "reason": "Registro por error",
            "replacement": None,
        }
        canonical = patient_treatments_repo._json(
            {
                "patient_id": str(patient),
                "resource_id": str(treatment),
                "action": "correct",
                "body": legacy_body,
            }
        )
        before = await patient_treatments_repo.get_treatment(owner, patient, treatment)
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE patient_dental_treatments SET state='entered_in_error', revision=2 WHERE id=$1",
                treatment,
            )
        after = await patient_treatments_repo.get_treatment(owner, patient, treatment)
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO patient_dental_treatment_revisions
                (id,treatment_id,patient_id,owner_user_id,revision,action,before_snapshot,after_snapshot,reason,actor_user_id)
                VALUES($1,$2,$3,$4,2,'corrected',$5::jsonb,$6::jsonb,'Registro por error',$4)""",
                uuid4(),
                treatment,
                patient,
                owner,
                json.dumps(before),
                json.dumps(after),
            )
            await conn.execute(
                """INSERT INTO patient_clinical_commands(owner_user_id,operation_id,patient_id,payload_hash,receipt)
                VALUES($1,$2,$3,$4,$5::jsonb)""",
                owner,
                legacy_operation,
                patient,
                hashlib.sha256(canonical.encode()).hexdigest(),
                json.dumps({"operation_id": str(legacy_operation), "committed": after}),
            )
        stored_receipt = dict(await _command(pool, owner, legacy_operation))
        commands_before = await _command_count(pool, owner)
        for kind, resource in (("condition", condition), ("procedure", treatment)):
            url = (
                f"/api/patients/{patient}/conditions/{resource}/corrections"
                if kind == "condition"
                else f"/api/patients/{patient}/dental-treatments/{resource}/corrections"
            )
            legacy = {
                "operation_id": str(legacy_operation),
                "expected_revision": 2 if kind == "condition" else 1,
                "reason": "Registro por error",
                "replacement": None,
            }
            unknown = {
                "operation_id": str(uuid4()),
                "expected_revision": legacy["expected_revision"],
                "reason": "Otro intento",
                "replacement": None,
            }
            for body in (
                legacy,
                {**legacy, "reason": "Mismatched retry"},
                unknown,
                {"operation_id": "not-a-uuid"},
            ):
                response = await client.post(url, json=body)
                assert response.status_code == 410, f"{kind}: {response.text}"
                assert response.json()["detail"]["code"] == "correction_workflow_retired"
                assert "correction_revision_id" not in response.text
            unparsable = await client.post(
                url, content=b"{", headers={"content-type": "application/json"}
            )
            assert unparsable.status_code == 410, f"{kind}: {unparsable.text}"

        assert await _command_count(pool, owner) == commands_before
        assert dict(await _command(pool, owner, legacy_operation)) == stored_receipt
        assert await patient_treatments_repo.get_treatment(owner, patient, treatment) == after
        history, total = await patient_treatments_repo.list_revisions(
            owner, patient, treatment, 20, None
        )
        assert total == 2 and history[0]["action"] == "corrected"
        assert history[0]["before"] == before and history[0]["after"] == after
        assert len(await _condition_revisions(pool, condition)) == 2
        async with pool.acquire() as conn:
            replacements = await conn.fetchval(
                "SELECT count(*) FROM patient_dental_treatments WHERE supersedes_id IS NOT NULL"
                " AND owner_user_id=$1",
                owner,
            )
        assert replacements == 0

    async with pool.acquire() as conn:
        legacy_rows = await conn.fetch(
            "SELECT operation_id FROM patient_tooth_condition_revisions"
            " WHERE condition_id=$1 AND action='corrected'",
            condition,
        )
    assert [row["operation_id"] for row in legacy_rows] == [legacy_operation]


async def test_deletion_schema_extensions_keep_legacy_metadata_null(dental_db):
    pool, owner, _, patient, _ = dental_db
    async with _client() as client:
        condition, _ = await _create_condition(client, patient)
        treatment = await _create_treatment(client, patient)
    async with pool.acquire() as conn:
        for revision in (1, 2):
            with pytest.raises(asyncpg.CheckViolationError):
                await conn.execute(
                    """INSERT INTO patient_tooth_condition_revisions
                    (id,condition_id,owner_user_id,patient_id,revision,before_snapshot,after_snapshot,actor_user_id,action)
                    VALUES($1,$2,$3,$4,$5,NULL,'{}'::jsonb,$3,'deleted')""",
                    uuid4(),
                    condition,
                    owner,
                    patient,
                    revision,
                )
        with pytest.raises(asyncpg.CheckViolationError):
            await conn.execute(
                """INSERT INTO patient_tooth_condition_revisions
                (id,condition_id,owner_user_id,patient_id,revision,before_snapshot,after_snapshot,actor_user_id,action,
                 operation_id,correction_reason,command_snapshot)
                VALUES($1,$2,$3,$4,3,'{}'::jsonb,'{}'::jsonb,$3,'deleted',$5,'Error','{}'::jsonb)""",
                uuid4(),
                condition,
                owner,
                patient,
                uuid4(),
            )
        with pytest.raises(asyncpg.IntegrityConstraintViolationError):
            await conn.execute(
                "UPDATE patient_dental_treatments SET deleted_at=clock_timestamp() WHERE id=$1",
                treatment,
            )
        with pytest.raises(asyncpg.IntegrityConstraintViolationError):
            await conn.execute(
                "UPDATE patient_tooth_conditions SET deleted_by_user_id=$2 WHERE id=$1",
                condition,
                owner,
            )


async def test_deletion_schema_reuses_the_active_key_only_after_a_tombstone(dental_db):
    pool, owner, _, patient, _ = dental_db
    body = _condition_body(surfaces=["M"])
    async with _client() as client:
        first, _ = await _create_condition(client, patient, body=body)
    await _tombstone_condition(pool, owner, patient, first)
    insert = """INSERT INTO patient_tooth_conditions
        (id,owner_user_id,patient_id,dentition,tooth_fdi,condition_code,surfaces,created_by_user_id,updated_by_user_id)
        VALUES($1,$2,$3,'permanent',16,'caries',ARRAY['M'],$2,$2)"""
    async with pool.acquire() as conn:
        await conn.execute(insert, uuid4(), owner, patient)
        with pytest.raises(asyncpg.UniqueViolationError):
            await conn.execute(insert, uuid4(), owner, patient)


async def test_deletion_aware_reads_and_write_guards(dental_db):
    pool, owner, _, patient, _ = dental_db
    body = _condition_body(surfaces=["M"])
    async with _client() as client:
        condition, _ = await _create_condition(client, patient, body=body)
        treatment = await _create_treatment(client, patient)
        await _tombstone_condition(pool, owner, patient, condition)
        await _tombstone_treatment(pool, owner, patient, treatment)

        page = await client.get(f"/api/patients/{patient}/conditions", params={"status": "all"})
        assert page.json() == {"items": [], "next_cursor": None, "total": 0}
        tombstone = await client.get(f"/api/patients/{patient}/conditions/{condition}")
        assert tombstone.status_code == 200, tombstone.text
        assert tombstone.json()["deleted_at"] is not None
        assert tombstone.json()["deleted_by_user_id"] == str(owner)
        revisions = await client.get(f"/api/patients/{patient}/conditions/{condition}/revisions")
        assert [item["action"] for item in revisions.json()["items"]] == ["deleted", "created"]
        assert revisions.json()["items"][0]["after"]["deleted_by_user_id"] == str(owner)
        assert revisions.json()["items"][1]["after"].get("deleted_at") is None

        blocked = await client.patch(
            f"/api/patients/{patient}/conditions/{condition}",
            json={"expected_revision": 2, "note": "Tarde"},
        )
        assert blocked.status_code == 409
        assert blocked.json()["detail"]["code"] == "record_deleted"
        replay = await client.post(f"/api/patients/{patient}/conditions", json=body)
        assert replay.status_code == 409
        assert replay.json()["detail"]["code"] == "record_deleted"
        fresh = await client.post(
            f"/api/patients/{patient}/conditions", json={**body, "id": str(uuid4())}
        )
        assert fresh.status_code == 201, fresh.text

        page = await client.get(f"/api/patients/{patient}/dental-treatments")
        assert page.json()["items"] == []
        assert page.json()["total"] == 0
        found = await client.get(f"/api/patients/{patient}/dental-treatments/{treatment}")
        assert found.status_code == 200
        assert found.json()["deleted_at"] is not None
        revisions = await client.get(
            f"/api/patients/{patient}/dental-treatments/{treatment}/revisions"
        )
        assert revisions.json()["items"][0]["action"] == "deleted"
        edit = await client.patch(
            f"/api/patients/{patient}/dental-treatments/{treatment}",
            json={"operation_id": str(uuid4()), "expected_revision": 2, "note": "Tarde"},
        )
        assert edit.status_code == 409
        assert edit.json()["detail"]["code"] == "resource_read_only"

    assert (await _condition_row(pool, condition))["revision"] == 2
    assert len(await _condition_revisions(pool, condition)) == 2


async def test_deleted_context_notes_and_activity_stay_readable(dental_db):
    pool, owner, _, patient, _ = dental_db
    async with _client() as client:
        treatment = await _create_treatment(client, patient)
        note = uuid4()
        await patient_clinical_notes_repo.command(
            owner, patient, note, "create", _note_body(treatment)
        )
        condition, _ = await _create_condition(client, patient)
        await _tombstone_treatment(pool, owner, patient, treatment)
        await _tombstone_condition(pool, owner, patient, condition)

        with pytest.raises(TreatmentConflict) as error:
            await patient_clinical_notes_repo.command(
                owner, patient, uuid4(), "create", _note_body(treatment)
            )
        assert error.value.detail["code"] == "resource_read_only"
        with pytest.raises(TreatmentConflict) as error:
            await patient_clinical_notes_repo.command(
                owner,
                patient,
                note,
                "edit",
                {"operation_id": str(uuid4()), "expected_revision": 1, "body": "Tarde"},
            )
        assert error.value.detail["code"] == "resource_read_only"
        stored = await patient_clinical_notes_repo.get_note(owner, patient, note)
        assert stored["body"] == "Nota contextual sintética"
        assert stored["entity_deleted"] is True

        activity = await client.get(f"/api/patients/{patient}/activity")
        assert activity.status_code == 200, activity.text
        deleted = [item for item in activity.json()["items"] if item["action"] == "deleted"]
        titles = {(item["kind"], item["resource_id"]): item["title"] for item in deleted}
        assert titles[("diagnoses", str(condition))] == "Condición eliminada"
        assert titles[("treatments", str(treatment))] == "Procedimiento eliminado"
        assert len(deleted) == 2


@pytest.mark.parametrize("action", ["create", "edit", "delete"])
async def test_note_context_waits_for_parent_and_rechecks_tombstone(dental_db, action):
    pool, owner, _, patient, _ = dental_db
    async with _client() as client:
        treatment = await _create_treatment(client, patient)
    note = uuid4()
    original_body = _note_body(treatment)
    receipt, _ = await patient_clinical_notes_repo.command(
        owner, patient, note, "create", original_body
    )
    target = uuid4() if action == "create" else note
    body = (
        _note_body(treatment)
        if action == "create"
        else {"operation_id": str(uuid4()), "expected_revision": 1, "body": "New text"}
    )
    before_count = await _command_count(pool, owner)
    task = None
    try:
        async with pool.acquire() as holder, holder.transaction():
            holder_pid = await holder.fetchval("SELECT pg_backend_pid()")
            await holder.execute(
                "SELECT id FROM patient_dental_treatments WHERE id=$1 FOR UPDATE", treatment
            )
            task = asyncio.create_task(
                patient_clinical_notes_repo.command(owner, patient, target, action, body)
            )
            # Observe a real blocked parent lock, not merely a task that has not run yet.
            for _ in range(100):
                async with pool.acquire() as observer:
                    blocked = await observer.fetchval(
                        "SELECT EXISTS(SELECT 1 FROM pg_stat_activity"
                        " WHERE $1=ANY(pg_blocking_pids(pid)))",
                        holder_pid,
                    )
                if blocked:
                    break
                await asyncio.sleep(0.02)
            assert blocked and not task.done()
            await holder.execute(
                "UPDATE patient_dental_treatments SET deleted_at=clock_timestamp(),"
                " deleted_by_user_id=$2 WHERE id=$1",
                treatment,
                owner,
            )
        with pytest.raises(TreatmentConflict) as error:
            await asyncio.wait_for(task, 5)
        assert error.value.detail["code"] == "resource_read_only"
    finally:
        if task is not None and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
    assert await _command_count(pool, owner) == before_count
    assert (await patient_clinical_notes_repo.get_note(owner, patient, note))["revision"] == 1
    replay, created = await patient_clinical_notes_repo.command(
        owner, patient, note, "create", original_body
    )
    assert not created and replay == receipt


@pytest.mark.parametrize("kind", ["condition", "procedure"])
async def test_delete_concurrent_replay_and_active_namespace(dental_db, kind):
    pool, owner, _, patient, _ = dental_db
    async with _client() as client:
        target = (
            (await _create_condition(client, patient))[0]
            if kind == "condition"
            else await _create_treatment(client, patient)
        )
        operation = uuid4()
        left, right = await asyncio.gather(
            _delete(client, kind, patient, target, operation=operation),
            _delete(client, kind, patient, target, operation=operation),
        )
        assert left.status_code == right.status_code == 200
        assert left.json() == right.json()
        command = await _command(pool, owner, operation)
        assert command["payload_hash"] == _delete_hash(kind, patient, target, 1)
        assert json.loads(command["receipt"]) == left.json()
        changed = await _delete(client, kind, patient, target, operation=operation, expected=2)
        assert changed.status_code == 409 and changed.json()["detail"] == {
            "code": "idempotency_conflict"
        }
        again = await _delete(client, kind, patient, target)
        assert again.status_code == 409 and again.json()["detail"]["code"] == "record_deleted"
        other = (
            (await _create_condition(client, patient))[0]
            if kind == "condition"
            else await _create_treatment(client, patient)
        )
        collision = await _delete(client, kind, patient, other, operation=operation)
        assert collision.status_code == 409 and collision.json()["detail"] == {
            "code": "idempotency_conflict"
        }
        path = f"/api/patients/{patient}/" + (
            f"conditions/{other}" if kind == "condition" else f"dental-treatments/{other}"
        )
        assert (await client.get(path)).json()["deleted_at"] is None


async def test_delete_command_identity_conflicts_across_active_kinds(dental_db):
    pool, owner, _, patient, _ = dental_db
    async with _client() as client:
        condition, _ = await _create_condition(client, patient)
        operation = uuid4()
        deleted = await _delete(client, "condition", patient, condition, operation=operation)
        assert deleted.status_code == 200, deleted.text
        procedure = await _create_treatment(client, patient)
        commands_before = await _command_count(pool, owner)
        crossed = await _delete(client, "procedure", patient, procedure, operation=operation)
        assert crossed.status_code == 409
        assert crossed.json()["detail"] == {"code": "idempotency_conflict"}

    assert (await _treatment_row(pool, procedure))["deleted_at"] is None
    assert await _command_count(pool, owner) == commands_before
    stored = await _command(pool, owner, operation)
    assert stored["payload_hash"] == _delete_hash("condition", patient, condition, 1)


@pytest.mark.parametrize("kind", ["condition", "procedure"])
async def test_delete_receipt_failure_rolls_back_tombstone_and_revision(
    dental_db, monkeypatch, kind
):
    from backend.db import patient_dental_deletion_repo

    pool, owner, _, patient, _ = dental_db
    async with _client() as client:
        target = (
            (await _create_condition(client, patient))[0]
            if kind == "condition"
            else await _create_treatment(client, patient)
        )
    operation = uuid4()
    original = patient_dental_deletion_repo.commit_receipt

    async def fail(*args, **kwargs):
        raise RuntimeError("Synthetic receipt insert failure")

    monkeypatch.setattr(patient_dental_deletion_repo, "commit_receipt", fail)
    remove = (
        patient_conditions_repo.delete_condition
        if kind == "condition"
        else patient_treatments_repo.delete_treatment
    )
    with pytest.raises(RuntimeError, match="Synthetic receipt"):
        await remove(owner, patient, target, operation, 1)
    row = await (
        _condition_row(pool, target) if kind == "condition" else _treatment_row(pool, target)
    )
    assert row["deleted_at"] is None and row["revision"] == 1
    assert await _command(pool, owner, operation) is None
    monkeypatch.setattr(patient_dental_deletion_repo, "commit_receipt", original)
    async with _client() as client:
        response = await _delete(client, kind, patient, target, operation=operation)
        assert response.status_code == 200 and response.json()["revision"] == 2


async def test_delete_uses_active_store_not_retired_revision_namespace(dental_db):
    from tests.legacy_dental_fixtures import seed_condition_correction

    pool, owner, _, patient, _ = dental_db
    async with _client() as client:
        old, _ = await _create_condition(client, patient)
        operation = uuid4()
        legacy = await seed_condition_correction(
            pool,
            owner,
            patient,
            old,
            {
                "operation_id": str(operation),
                "expected_revision": 1,
                "reason": "Legacy fixture",
                "replacement": None,
            },
        )
        target, _ = await _create_condition(client, patient)
        response = await _delete(client, "condition", patient, target, operation=operation)
        assert response.status_code == 200, response.text
        assert (await _condition_row(pool, old))["status"] == "entered_in_error"
        assert (
            str((await _condition_revisions(pool, old))[-1]["id"])
            == legacy["correction_revision_id"]
        )

        procedure = await _create_treatment(client, patient)
        async with pool.acquire() as conn:
            prior = await conn.fetchrow(
                "SELECT * FROM patient_clinical_commands WHERE owner_user_id=$1 AND receipt->>'resource_id'=$2",
                owner,
                str(procedure),
            )
        conflict = await _delete(
            client, "procedure", patient, procedure, operation=prior["operation_id"]
        )
        assert conflict.status_code == 409
        assert conflict.json()["detail"] == {"code": "idempotency_conflict"}
        assert (await _treatment_row(pool, procedure))["deleted_at"] is None
        assert dict(await _command(pool, owner, prior["operation_id"])) == dict(prior)
