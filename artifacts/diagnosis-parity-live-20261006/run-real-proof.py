"""Owned disposable PostgreSQL proof; never targets the running patient database."""
import json
import os
from pathlib import Path
import secrets
import subprocess
import time
from uuid import uuid4

root = Path(__file__).resolve().parents[2]
evidence = Path(__file__).resolve().parent
name = "dental-mirror-proof-" + uuid4().hex[:12]
password = secrets.token_hex(16)
port = 5439
owned = False
report = {"boundary": "current backend HTTP/domain/real PostgreSQL; future mirror resources not implemented", "port": port, "migration": "pending", "tests": "pending", "cleanup": "pending"}

def run(args, *, env=None, cwd=None, log=None):
    result = subprocess.run(args, env=env, cwd=cwd, capture_output=True, text=True)
    if log:
        (evidence / log).write_text((result.stdout + result.stderr).replace(password, "[redacted]"), encoding="utf-8")
    return result

try:
    inventory = run(["docker", "ps", "-a", "--format", "{{.Names}}"])
    if inventory.returncode or name in inventory.stdout.splitlines():
        raise RuntimeError("Docker inventory unavailable or ownership collision")
    env = os.environ.copy()
    env["POSTGRES_PASSWORD"] = password
    start = run(["docker", "run", "--rm", "--detach", "--name", name, "--publish", f"127.0.0.1:{port}:5432", "--env", "POSTGRES_PASSWORD", "--env", "POSTGRES_USER=mirrorproof", "--env", "POSTGRES_DB=mirrorproof", "pgvector/pgvector:pg16"], env=env)
    if start.returncode:
        raise RuntimeError("Disposable database could not start; no existing resources removed")
    owned = True
    for _ in range(30):
        if run(["docker", "exec", name, "pg_isready", "-U", "mirrorproof", "-d", "mirrorproof"]).returncode == 0:
            break
        time.sleep(1)
    else:
        raise RuntimeError("Disposable PostgreSQL readiness timeout")
    env["DATABASE_URL"] = f"postgresql://mirrorproof:{password}@localhost:{port}/mirrorproof"
    env["WORKSPACE_LIVE_TEST_DSN"] = env["DATABASE_URL"]
    backend = root / "app" / "backend"
    migrated = run(["uv", "--project", "backend", "run", "alembic", "-c", "backend/alembic.ini", "upgrade", "head"], env=env, cwd=root / "app", log="real-migration.log")
    report["migration"] = "pass" if migrated.returncode == 0 else "fail"
    if migrated.returncode:
        raise RuntimeError("Migration failed; see sanitized log")
    tested = run(["uv", "run", "pytest", "tests/test_clinical_workspace_live.py", "tests/test_patient_conditions_contract.py", "-k", "condition or correction or catalog or note or activity", "-q", "-r", "a"], env=env, cwd=backend, log="real-tests.log")
    report["tests"] = "pass" if tested.returncode == 0 else "fail"
    report["test_exit_code"] = tested.returncode
    print("Real proof:", report["tests"])
except Exception as error:
    report["error"] = type(error).__name__
    print("Real proof failed; inspect sanitized evidence")
finally:
    if owned:
        stopped = run(["docker", "stop", name])
        report["cleanup"] = "owned container removed; no named volume created" if stopped.returncode == 0 else "failed"
    else:
        report["cleanup"] = "no owned resource created"
    (evidence / "real-proof.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("Cleanup:", report["cleanup"])
raise SystemExit(0 if report["tests"] == "pass" and report["cleanup"].startswith("owned") else 1)
