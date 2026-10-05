"""Optional scratch-Postgres proof that history reads cannot cross patient scope."""

from __future__ import annotations

import os
from uuid import uuid4

import asyncpg
import pytest

from backend.db import patients_repo

DSN = os.environ.get("CLINICAL_LIVE_TEST_DSN", "")
if not DSN:
    pytestmark = pytest.mark.skip(reason="CLINICAL_LIVE_TEST_DSN not set")


async def test_approved_history_query_filters_both_owner_and_patient(monkeypatch) -> None:
    pool = await asyncpg.create_pool(DSN, min_size=1, max_size=2)
    assert pool is not None
    monkeypatch.setattr(patients_repo, "get_pg_pool", lambda: pool)
    owners = [uuid4(), uuid4()]
    patients = [uuid4(), uuid4(), uuid4()]
    try:
        async with pool.acquire() as conn:
            for owner in owners:
                await conn.execute(
                    "INSERT INTO users (id, email) VALUES ($1, $2)",
                    owner,
                    f"grounding-{owner.hex}@example.com",
                )
            for index, patient in enumerate(patients):
                await conn.execute(
                    """
                    INSERT INTO patients (
                        id, owner_user_id, first_name, last_name, rut_number, rut_dv
                    ) VALUES ($1, $2, 'Live', 'Grounding', $3, '1')
                    """,
                    patient,
                    owners[0] if index < 2 else owners[1],
                    int(patient.int % 2_000_000_000),
                )
                await conn.execute(
                    """
                    INSERT INTO evolutions (
                        id, owner_user_id, patient_id, evolution_at,
                        raw_note, generated_text, final_text
                    ) VALUES ($1, $2, $3, now(), 'note', 'draft', $4)
                    """,
                    uuid4(),
                    owners[0] if index < 2 else owners[1],
                    patient,
                    f"patient-{index}",
                )
        own = await patients_repo.get_recent_approved_evolutions(owners[0], patients[0], limit=3)
        wrong_patient = await patients_repo.get_recent_approved_evolutions(
            owners[0], patients[2], limit=3
        )
        wrong_owner = await patients_repo.get_recent_approved_evolutions(
            owners[1], patients[0], limit=3
        )
        assert [row["final_text"] for row in own] == ["patient-0"]
        assert wrong_patient == []
        assert wrong_owner == []
    finally:
        async with pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM evolutions WHERE patient_id = ANY($1::uuid[])", patients
            )
            await conn.execute("DELETE FROM patients WHERE id = ANY($1::uuid[])", patients)
            await conn.execute("DELETE FROM users WHERE id = ANY($1::uuid[])", owners)
        await pool.close()
