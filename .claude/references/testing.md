# Reference: backend testing harness

On-demand detail for writing backend tests under `app/backend/tests/`. Run from `app/backend/` with
`uv run pytest tests -xvs`. Full evidence in `docs/codebase-analysis.md` (§ Tooling, tests, commands & deploy).

**Shape.** Flat `tests/` directory (no unit/integration split). `asyncio_mode="auto"`, so a plain
`async def test_*` works with no decorator. Integration tests drive the FastAPI app through `httpx.AsyncClient`.

**The DB is stubbed by default.** `conftest.py` has an autouse fixture that patches `get_pg_pool` with a fake
pool/connection across **every module that imports it** (`db.postgres`, `db.repository`, `db.users_repo`,
`routes.auth`, `rate_limit`). If you add a module that imports `get_pg_pool`, add a matching patch site or its
calls won't be stubbed. A second autouse fixture replaces `rate_limit.check_and_record`/`get_status` with an
in-memory implementation. Env vars (including a fake `DATABASE_URL`) are set at the top of `conftest.py` before
any backend import, so `config.py` doesn't fail at collection. A test needing **real** Postgres must explicitly
opt out of the pool stub.

**External APIs are mocked at the boundary — never hit live.** Record real responses once into
`tests/fixtures/<service>/<scenario>.json` and commit them (see `tests/fixtures/supadata/`:
`happy.json`, `missing_lang.json`, `rate_limit.json`). Mock with `respx` (httpx-level) or `monkeypatch`/
`MagicMock` over the SDK client. Cover happy path, 429, a transient 5xx, and service quirks (Supadata's
`lang` requirement). If a test needs a secret in `os.environ`, set a fake value in `conftest.py`.

**Always add a test** with every bug fix (a regression test) and every feature.
