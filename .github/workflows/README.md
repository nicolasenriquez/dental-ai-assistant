# GitHub Actions

`ci.yml` runs on pull requests and pushes to `main`. The `validate` job installs
locked backend/frontend dependencies and runs format, lint, type checks, tests
and the frontend build. Any failing command fails the job; checks are not skipped
or marked continue-on-error.

`setup-uv` is pinned to the verified commit for v10.1.0. The major alias `v10`
does not exist, so using it prevents the runner from reaching any validation step.

Claude review, interactive Claude and daily Claude report workflows were removed:
this repository does not have the Claude Code GitHub App/subscription configured.
No Claude credentials are required by CI.

Branch protection must require GitHub Actions' `validate` check on `main`, with
an up-to-date branch. A workflow failure alone does not prevent merging an
unprotected branch.

Local parity, from each package directory:

```powershell
# app/backend, Python 3.11
uv sync --frozen --all-extras --python 3.11
uv run ruff format --check .
uv run ruff check .
uv run mypy .
uv run pytest tests -q

# app/frontend, Bun 1.4.2
bun install --frozen-lockfile
bun run type-check
bun run lint
bun run test
bun run build
```

Some backend integration tests require external services and are skipped by the
unit harness. Passing this workflow does not claim live Drive or real database
integration coverage. App runtime remains Docker-first.
