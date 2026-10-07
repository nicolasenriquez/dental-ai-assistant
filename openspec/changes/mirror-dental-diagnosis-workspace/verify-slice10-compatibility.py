"""Run with either pre-mirror or current backend source against an owned fixture DB.

Seed using pre-mirror routes, then compare the same HTTP snapshots after upgrade
and application rollback. This script never runs a migration or drops storage.
"""

import argparse
import asyncio
import json
import sys
from pathlib import Path
from uuid import uuid4

import httpx

sys.path.insert(0, str(Path.cwd()))

from backend.config import DATABASE_URL
from backend.db.postgres import close_pg_pool, init_pg_pool
from backend.main import app


def synthetic_rut() -> str:
    body = str(20000000 + uuid4().int % 60000000)
    total = sum(int(digit) * (2 + i % 6) for i, digit in enumerate(reversed(body)))
    check = 11 - total % 11
    return f"{body}-{'0' if check == 11 else 'K' if check == 10 else check}"


async def verify(mode: str, evidence: Path) -> None:
    if DATABASE_URL != "postgresql://fixture:synthetic-only@dental-slice10-db:5432/fixture":
        raise RuntimeError("This proof requires the owned dental-slice10-db fixture database")
    await init_pg_pool()
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(
                app=app, client=("198.51.100.10" if mode == "foreign" else "127.0.0.1", 5010)
            ),
            base_url="https://localhost:8018",
            headers={"Origin": "http://localhost:8018"},
        ) as client:
            credentials = {"email": "slice10-owner@example.com", "password": "Synthetic-proof-10!"}
            if mode == "foreign":
                foreign_credentials = {
                    "email": "slice10-foreign@example.com",
                    "password": "Synthetic-foreign-10!",
                }
                response = await client.post("/api/auth/login", json=foreign_credentials)
                if response.status_code == 401:
                    response = await client.post("/api/auth/signup", json=foreign_credentials)
                    assert response.status_code == 201, response.text
                else:
                    assert response.status_code == 200, response.text
                print("Separate synthetic owner available through ordinary auth routes")
                return
            if mode == "seed":
                response = await client.post("/api/auth/login", json=credentials)
                if response.status_code == 401:
                    response = await client.post("/api/auth/signup", json=credentials)
                    assert response.status_code == 201, response.text
                else:
                    assert response.status_code == 200, response.text
                patient = await client.post(
                    "/api/patients",
                    json={"first_name": "Sintética", "last_name": "Legacy", "rut": synthetic_rut()},
                )
                assert patient.status_code == 201, patient.text
                patient_id = patient.json()["id"]
                base = f"/api/patients/{patient_id}"
                finding_id = str(uuid4())
                finding = await client.post(
                    f"{base}/conditions",
                    json={
                        "id": finding_id,
                        "dentition": "permanent",
                        "tooth_fdi": 16,
                        "condition_code": "fracture",
                        "surfaces": ["M"],
                        "note": "Antes del mirror",
                    },
                )
                assert finding.status_code == 201, finding.text
                edited = await client.patch(
                    f"{base}/conditions/{finding_id}",
                    json={
                        "expected_revision": 1,
                        "note": "Evidencia previa",
                        "surfaces": ["M", "O"],
                    },
                )
                assert edited.status_code == 200, edited.text
                original_id, replacement_id = str(uuid4()), str(uuid4())
                original = await client.post(
                    f"{base}/conditions",
                    json={
                        "id": original_id,
                        "dentition": "primary",
                        "tooth_fdi": 51,
                        "condition_code": "caries",
                        "surfaces": ["M"],
                    },
                )
                assert original.status_code == 201, original.text
                corrected = await client.post(
                    f"{base}/conditions/{original_id}/corrections",
                    json={
                        "operation_id": str(uuid4()),
                        "expected_revision": 1,
                        "reason": "Corrección anterior al mirror",
                        "replacement": {
                            "id": replacement_id,
                            "dentition": "primary",
                            "tooth_fdi": 52,
                            "condition_code": "caries",
                            "surfaces": ["M"],
                        },
                    },
                )
                assert corrected.status_code == 201, corrected.text
                note_id = str(uuid4())
                note = await client.post(
                    f"{base}/notes", json={"id": note_id, "body": "Nota general previa"}
                )
                assert note.status_code == 201, note.text
                note_edit = await client.patch(
                    f"{base}/notes/{note_id}",
                    json={"expected_revision": 1, "body": "Nota general conservada"},
                )
                assert note_edit.status_code == 200, note_edit.text
                paths = [
                    f"{base}/conditions/{identifier}{suffix}"
                    for identifier in [finding_id, original_id, replacement_id]
                    for suffix in ["", "/revisions"]
                ]
                paths += [f"{base}/notes/{note_id}", f"{base}/notes/{note_id}/revisions"]
                snapshots = {}
                for endpoint in paths:
                    result = await client.get(endpoint)
                    assert result.status_code == 200, result.text
                    snapshots[endpoint] = result.json()
                evidence.write_text(
                    json.dumps(
                        {
                            "patientId": patient_id,
                            "findingId": finding_id,
                            "originalId": original_id,
                            "replacementId": replacement_id,
                            "generalNoteId": note_id,
                            "snapshots": snapshots,
                        },
                        indent=2,
                    ),
                    encoding="utf-8",
                )
                print(f"Seeded pre-mirror patient {patient_id}; 8 legacy HTTP snapshots retained")
            else:
                response = await client.post("/api/auth/login", json=credentials)
                assert response.status_code == 200, response.text
                fixture = json.loads(evidence.read_text(encoding="utf-8"))
                for endpoint, expected in fixture["snapshots"].items():
                    actual = await client.get(endpoint)
                    assert actual.status_code == 200, actual.text
                    assert actual.json() == expected, endpoint
                print(
                    "8 legacy HTTP snapshots unchanged: UUIDs, revisions, correction links, general notes"
                )
    finally:
        await close_pg_pool()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["seed", "read", "foreign"])
    parser.add_argument("evidence", type=Path)
    arguments = parser.parse_args()
    asyncio.run(verify(arguments.mode, arguments.evidence))
