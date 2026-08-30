# Open the Pull Request

Open a **draft** pull request for the committed work on this branch. The PR is the artifact — write no separate report. You never modify source files; your only writes are `git push` and the PR itself. Nobody reads your streamed output, so every fact belongs in the PR title and body.

Context from the run, which may be empty:

$ARGUMENTS

## 1. Check the work is ready

- Confirm the branch is not the base branch and has commits ahead of it. This repository's base is `main`.
- If intended work is still uncommitted, commit it following this repo's conventions — staged by name, one coherent outcome per commit, a human-sounding message, no AI attribution. Never sweep unrelated changes; if intended and unrelated changes cannot be separated safely, stop and say so.
- Read the complete merge-base diff and confirm it matches what `$ARTIFACTS_DIR/implementation.md` says was done.

## 2. Write it

- Take the content from `$ARTIFACTS_DIR/implementation.md` and anything else relevant under `$ARTIFACTS_DIR/`.
- Use the repository's PR template if one exists (`.github/pull_request_template.md`); fill every applicable section with concrete information and delete the instructional comments. With no template: the problem first, then the change described by behavior, then the validation that actually ran.
- Title: concise and human — the outcome, never an inventory of files touched.
- Link the issue with `Closes #N` only when this PR fully resolves it, `Relates to #N` otherwise. Never infer a link from a bare number.
- No AI attribution, no generated-by footers, no robot emoji.
- If you write the body to a file, put it under `$ARTIFACTS_DIR/`, never inside the repository.

## 3. Push and create

Push with upstream tracking (`git push -u origin HEAD`). If the push is rejected or the remote has diverged, stop and report — never rebase or force-push here. Create the PR **as a draft**, against `main`, pinning the origin remote (`--repo <owner>/<repo>`, derived from `git remote get-url origin`).

## 4. Read it back

Read the created PR back from GitHub and confirm its number, URL, base, head, and draft state are what you intended. You are not done until the read-back agrees. Reply with the PR URL on the first line, then base ← head and the draft state on the second. Nothing after the URL line's content.
