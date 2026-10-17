---
name: commit-local
description: Create one local commit from the working tree and stop before push.
argument-hint: "[intent-hint]"
disable-model-invocation: true
---
Create one single local commit from the current working tree and stop before any push.

Optional input: `$ARGUMENTS`

Use this command as the local packaging step after implementation and validation when the user wants to push manually later.

## Goal

Inspect staged, unstaged, and untracked changes, stage the full current working tree as one commit, generate a descriptive commit message from the real diff plus optional user intent, create the local commit, and stop before any push action.

## Input Rule

- Treat `$ARGUMENTS` as extra naming intent, not as the source of truth.
- The real source of truth for the commit message is:
  - `git status --short --branch`
  - `git status --porcelain`
  - `git diff HEAD`
  - `git diff --cached`
- If the input and the diff disagree, trust the diff and report the mismatch.

## Workflow

### 1. Inspect repo state first

Run:

```bash
git status --short --branch
git status --porcelain
git diff HEAD
git diff --cached
```

If there are no changes, stop and report that there is nothing to commit.

### 2. Inspect recent history for style continuity

Run:

```bash
git log -10 --oneline
```

Use this only to keep commit style consistent. Do not copy old messages blindly.

### 3. Review the full working tree for commit context

Review all current change types together:

- staged changes
- unstaged tracked changes
- untracked files

Use this review to improve message quality and to report scope honestly. Do not split in this command.

### 4. Stage the full local change

Stage the full working tree for this command.

Run:

```bash
git add -A
```

Then verify the staged result:

```bash
git status --short
git diff --cached --stat
git diff --cached
```

Do not silently exclude files.

### 5. Generate commit and PR texts

Generate two separate artifacts grounded in the actual staged diff:

- `Commit message` (used for `git commit`)
- `PR extended description` (copy-paste ready for GitHub PR body)

Do not merge these artifacts into one block.

### 5A. Commit message

Use a prefix such as:

- `feat`
- `fix`
- `docs`
- `chore`
- `refactor`
- `test`

Rules:

- subject line must be concise, specific, and at most 72 characters
- add a body when it materially improves clarity
- describe the behavioral or repository outcome, not just filenames
- use plain reviewer-facing language; avoid vague phrasing like `rebalanced posture`, `aligned artifacts`, or similar abstraction-heavy wording without concrete action/effect
- use `$ARGUMENTS` only to improve specificity
- prefer a professional Markdown body because this text is often reused in GitHub PR and squash flows
- do not append PR-number suffixes in the subject (for example `(#123)`); keep subject timeless and branch-agnostic
- each body bullet should describe one concrete change and one impact only
- keep body bullets short (target <= 22 words) and split overloaded bullets instead of chaining many clauses
- if generated subject exceeds 72 characters, shorten in this order until compliant:
  - remove filler words first (for example: `the`, `and`, `that`, `with` when non-essential)
  - collapse phrase length while preserving scope + outcome
  - keep conventional prefix and scope intact (`feat(...)`, `fix(...)`, etc.)
  - prefer concise domain nouns over long file/path wording
- never leave unresolved placeholder text (for example `for  and archive .`, `<...>`, `TBD`, or empty scoped phrases)

Body format standard (when body is present):

```text
## Summary
- <what changed and why>
- <primary behavior/contract impact>

## Validation
- <check name>: pass | fail | blocked
```bash
<exact command run>
```
- <optional evidence: key output/counts only>

## Notes
- <scope caveat, follow-up, or migration note if any>
```

### 5B. PR extended description

When `.github/pull_request_template.md` exists, produce a fully populated body that matches its sections exactly:

```text
## Summary
- ...
- ...

## Scope
- Backend: ...
- Frontend: ...
- Docs/Runbooks: ...
- OpenSpec: ...

## Validation
- [x] `ruff` / formatting checks
- [x] type checks
- [x] unit tests
- [ ] integration tests (or explain why skipped)
- [x] frontend lint/type/test/build
- [x] OpenSpec validation (if applicable)

Commands run:
```bash
...
```

## Risks / Notes
- ...
```

PR extended description rules (required):

- never leave template placeholders (for example `What changed?`, `Why was this needed?`, `Any migration...`)
- never leave scope keys empty (`Backend:`, `Frontend:`, `Docs/Runbooks:`, `OpenSpec:` must all have content)
- if a validation checkbox remains unchecked, include explicit reason on the same line
- include at least one real command in `Commands run`
- do not duplicate section headers (for example two `## Summary` blocks)
- do not paste raw stack traces; summarize failures as `pass | fail | blocked` with short reason

Formatting constraints:

- use single-level bullets only
- keep bullets short and factual
- avoid free-form paragraph-only bodies unless the change is trivial
- Validation may include fenced `bash` blocks for exact commands; command lines are exempt from bullet length guidance
- do not paste raw terminal output into commit/PR body sections; summarize results in one line per check
- if a command failed at any point, do not mark that check as `pass` unless a later rerun succeeded

PR vs squash guidance:

- if `.github/pull_request_template.md` exists, mirror that template's intent in the commit body content so the text maps cleanly into PR sections (`what changed`, `why needed`, `scope`, `risks/follow-ups`)
- do not copy-paste full PR text into commit bodies
- commit body should be concise because GitHub squash merge often uses it as the default merge description
- PR body can add extra reviewer context (for example `What Changed`) beyond the commit body

### 6. Create the local commit

Before running `git commit`, show:

- the files that will be included
- the final commit message
- the final PR extended description
- a short summary of the change

Then create the commit.

Run:

```bash
git commit -m "<subject>" -m "<body-if-needed>"
```

If a body is not needed, use a single `-m`.

Commit safety rule (required):

- If the commit includes a body, write the full message to a temporary file and use `git commit -F <message-file>`.
- Do not pass Markdown bodies with backticks, `$`, command substitutions, or fenced blocks via `-m`.
- Use `-m` only for simple single-line subject-only commits.
- If the branch already has a published remote tip, do not rewrite published history to fix message text; create a small follow-up docs commit instead.
- Before commit, run a final content sanity scan over the prepared message:
  - reject if it includes `Traceback`, `ERROR collecting`, `sqlalchemy.exc`, or similar raw failure logs
  - reject if it includes unresolved placeholders or empty scoped phrases
  - reject PR text if it contains:
    - `- What changed?`
    - `- Why was this needed?`
    - `- Backend:`
    - `- Frontend:`
    - `- Docs/Runbooks:`
    - `- OpenSpec:`
    - `Any migration, environment, or operational caveats`
  - reject PR text if `## Summary` appears more than once

### 7. Stop before push

Do not run any push command.

Do not ask for push approval.

Do not suggest that push already happened.

The command must end after reporting:

- branch
- commit hash
- final commit message
- push status: not run

## Safeguards

- Refuse to continue if there are no changes.
- Do not invent a commit message without reading the diff.
- Do not claim validation passed unless it was actually run.
- Do not run `git push`.
- Do not ask for push approval because push is outside the scope of this command.
- If the staged scope is mixed, explicitly say so in the commit summary/body instead of blocking.
- Do not paste raw command output, stack traces, or shell-expanded content into the commit body.
- Do not recommend `--force` or `--force-with-lease`; prefer linear follow-up commits on protected branches.

## Output Format

Use this structure:

```text
Commit readiness:
- ready / blocked (no changes)

Commit summary:
- <high-level summary>

Commit message:
- <final subject>
- <final body if any>

PR extended description:
- <final copy-paste PR body>

Local commit result:
- branch: <branch>
- status: created / blocked / failed
- commit: <hash or none>

Push status:
- not run

Next action:
- <exact manual next step, usually `git push origin <branch>` if the user wants to publish it later>
```

## Guardrails

- Do not invent a commit message without reading the diff.
- Do not claim validation passed unless it was actually run.
- Do not create multiple commits in this command.
- Do not run `git push`.
- Do not hide mixed scope; call it out clearly in the summary/message.
