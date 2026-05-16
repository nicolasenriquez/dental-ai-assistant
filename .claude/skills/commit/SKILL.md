---
name: commit
description: Creates a new git commit for all uncommitted changes with an atomic, conventionally-tagged message. Use when work is complete and ready to be committed.
---

# Commit: Create a New Commit

Create a new commit for all of our uncommitted changes.

## Process

1. Run `git status && git diff HEAD && git status --porcelain` to see what files are uncommitted.
2. Add the untracked and changed files.
3. Write an atomic commit message with an appropriate, descriptive summary.
4. Add a tag such as `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, etc. that reflects our work.

## Output

A single commit containing all uncommitted changes, with a conventional-commit-style message
(`<tag>: <atomic description>`) that accurately reflects the work done.
