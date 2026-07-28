---
name: piv-validate
description: Runs the full validation suite for this project — backend tests, type check, lint, and the frontend tests, type check, lint — then reports overall health. Use before committing, before opening a PR, or after finishing a chunk of work to confirm zero regressions.
---

# Validate

Run every check this project has and report a single PASS/FAIL verdict.

**This is a custom checker: it runs *this project's* commands.** If you are adapting it to
another codebase, the command list below is the only part you change.

> **Working directory matters.** All backend tooling must run from `app/backend/` — `pyproject.toml`
> there holds the ruff / mypy / pytest config, and those tools do **not** auto-discover config from a
> non-cwd project. All frontend tooling runs from `app/frontend/`.

Run these in order. Keep going after a failure so the report covers everything, and capture the
output of any command that fails.

## 1. Backend — tests

```bash
cd app/backend && uv run pytest tests -q
```

**Expected:** `360 passed, 67 skipped` (or more), in roughly 15 seconds.

## 2. Backend — type check

```bash
cd app/backend && uv run mypy .
```

**Expected:** `Success: no issues found in N source files`
(`note: By default the bodies of untyped functions are not checked` lines are informational, not failures.)

## 3. Backend — lint

```bash
cd app/backend && uv run ruff check .
```

**Expected:** `All checks passed!`

## 4. Frontend — tests

```bash
cd app/frontend && bun run test
```

**Expected:** all Vitest files pass, roughly 10 seconds.

## 5. Frontend — type check

```bash
cd app/frontend && bun run type-check
```

**Expected:** no output (a clean `tsc --noEmit`).

## 6. Frontend — lint

```bash
cd app/frontend && bun run lint
```

**Expected:** `Checked N files` with no `×` errors.

> If this reports formatting diffs on files you never touched, check your line endings before you
> "fix" anything: this repo's index is entirely LF, so a Windows checkout with
> `core.autocrlf=true` injects CRLF that biome rejects. Fix it locally with
> `git config core.autocrlf false` and re-checkout — do not reformat the files.

## 7. Optional — live server smoke test

Only when the change touches routing, middleware, or startup. Skip it otherwise; the backend suite
already exercises the ASGI app through `httpx.AsyncClient`.

```bash
uv --project app/backend run uvicorn backend.main:app --reload --port 8000
```

Then in a second shell:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/api/version
```

**Expected:** `200`. Stop the server with Ctrl-C in the first shell.
(Do not background-and-kill it from inside this skill — the POSIX idiom `lsof -ti:PORT | xargs kill`
does not exist on Windows, and this project is developed on both.)

## 8. Summary report

Report each check with a ✅ or ❌, then an overall verdict:

- Backend: tests / mypy / ruff
- Frontend: tests / type-check / lint
- Server smoke (or "skipped — not a routing change")
- **Overall: PASS or FAIL**

For every ❌, include the failing command and the relevant output. Do not fix anything here —
this skill reports; fixing is a separate step.

## Notes

- The commands above are specific to this repo. On another project, replace them with that
  project's equivalents and keep the structure: run everything, report once, fix nothing.
- Keep this skill fast. It runs before every commit; if a step gets slow, that is a signal to fix
  the slow step, not to drop it from the checker.
