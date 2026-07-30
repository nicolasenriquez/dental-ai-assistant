# Conventions — how this project ships work

> **These are the AI Tutor's conventions**, lifted out of `CLAUDE.md`'s prose ("Commit and PR Conventions",
> "Dos and Don'ts", "Security-Sensitive Paths") and written here in the form the tooling can actually use.
>
> **Three layers enforce this from one source:**
> 1. **The skills read it at run time** — `piv-commit` and `piv-create-pr` follow the rules below, so the agent
>    writes this project's way instead of a generic default.
> 2. **The regex asserts** in an eval pack are derived from the **mechanical** rules — the cheap, deterministic
>    guard on form.
> 3. **The judge rubrics** quote the **judgment** rules — the substance grade.
>
> Change a convention here and all three move together. The skills stay general and portable; everything
> specific to this project lives in this file, travels with the repo, and is inherited by anyone who clones it.

## commit

**Mechanical (regex-checkable):**
- Subject uses a conventional tag from this project's set: `feat|fix|chore|refactor|docs|test`, with an
  optional scope — `fix(rag): …`, `chore(.claude): …`.
- Subject line under 72 characters.
- No AI attribution anywhere in the message: no "Generated with", no "Co-Authored-By".

**Judgment (rubric for the judge):** <!-- #commit-quality -->
- The body explains **why** the change was needed — not a restatement of what changed. A diff already says what.
- One concern per commit. A bug noticed while doing something else becomes its own ticket, not extra scope here.
- A reader who sees only the message should predict roughly which files changed and not be surprised by the diff.

## pr

**Mechanical (regex-checkable):**
- PR title carries the same conventional-commits prefix as the first commit, under 72 characters.
- The body links the issue/ticket it resolves.
- The body includes a test plan stating what was actually run (the full validation suite — tests, lint,
  typecheck — before a PR is declared done).

**Judgment (rubric for the judge):** <!-- #pr-quality -->
- **One issue per PR.** Unrelated fixes are not bundled in; if the work grew, say so explicitly.
- The summary explains WHY this change exists (the intent), not just which files it touches.
- Validation states what was genuinely run and its result — never aspirational.
- Any **new dependency** is justified in the body: what it does, why the existing dependencies don't cover it,
  and evidence it's actively maintained.

## review

**Mechanical (regex-checkable):**
- The report routes every item into one of: AGENT FIXES / HUMAN DECIDES / HUMAN READS / HUMAN TESTS / FYI.
- Every item carries a `file:line` reference. Human buckets hold 3–5 items max.

**Judgment (rubric for the judge):** <!-- #review-routing -->
- Any diff touching this project's **security-sensitive paths** lands in **HUMAN READS** and never in
  AGENT FIXES — `app/backend/auth/`, `routes/auth.py`, `routes/admin.py`, `routes/conversations.py`,
  `routes/messages.py`, `db/users_repo.py`, `db/repository.py` (user_id scoping), `main.py` (auth wiring),
  `config.py` (`JWT_SECRET`/`DATABASE_URL`), CORS config, `rate_limit.py`, `db/user_messages_repo.py`,
  `signup_rate_limit.py`, `db/signup_attempts_repo.py`, `deploy/Dockerfile` (proxy-header trust boundary).
- HUMAN READS points at genuinely load-bearing code for THIS diff — auth, money, data integrity, public
  contracts — not a random sample of touched files.
- Architectural invariants are flagged, not silently fixed: SQL outside `db/`, fetch calls outside
  `src/lib/api.ts`, a new ORM, a frontend state-management library, or a new LLM/embedding/vector-DB provider
  without an authorizing ticket.
