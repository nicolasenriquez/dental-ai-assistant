---
name: implementation-summary
description: Audit an OpenSpec-backed change against shipped code, tests, and migrations.
argument-hint: <spec-path|change-path|change-name> [audience=exec|product|engineering] [depth=short|standard|deep] [audit=balanced|strict]
disable-model-invocation: true
---

# Implementation Summary

## Objective

Produce a grounded implementation review for an OpenSpec-backed change:
- what was actually implemented
- how it was implemented
- whether the implementation shape is the right one for this repo and scope
- what remains specified but not implemented

This command is read-only.

## Teaching Mode

This command should teach while it audits:
- explain the mental model behind the implementation, not only the result
- use a `why -> how -> tradeoff -> evidence` progression
- do not create separate lessons, docs, reference files, or any other persistent artifact
- if a flow, boundary, or transformation is easier to understand visually, include a compact ASCII diagram inline
- keep the explanation short enough to minimize token use without losing correctness

## Why This Command Exists

Use this command when a simple prompt like:

`Armame un resume sobre que implementaste, como lo implementaste y porque esto es la mejor forma de hacerlo.`

is too weak because it:
- assumes implementation exists without checking
- assumes the current shape is the best one without auditing it
- risks summarizing the spec instead of the shipped code
- does not require evidence from code, tests, migrations, or docs

This command fixes that by forcing evidence-based review.

## Input

Supported call shapes:
- `/implementation-summary openspec/changes/<change>/specs/<capability>/spec.md`
- `/implementation-summary openspec/changes/<change>/proposal.md`
- `/implementation-summary openspec/changes/<change>`
- `/implementation-summary <change-name>`
- `/implementation-summary <target> audience=exec|product|engineering`
- `/implementation-summary <target> depth=short|standard|deep`
- `/implementation-summary <target> audit=balanced|strict`

Defaults:
- `audience=engineering`
- `depth=standard`
- `audit=balanced`

Resolution rules:
- if the input is a spec file under `openspec/changes/<change>/specs/**`, resolve the change root and read sibling artifacts too
- if the input is a change directory, read `proposal.md`, `design.md`, `tasks.md`, and relevant spec deltas
- if the input is a change name, resolve `openspec/changes/<change-name>/`
- if the target cannot be resolved, stop and ask for an explicit path or change name

## Guardrails

- Do not treat planned work as implemented behavior.
- Read implementation evidence before making claims.
- Always distinguish:
  - `Implemented`
  - `Specified but not implemented`
  - `Unclear / insufficient evidence`
- Audit honestly:
  - if the implementation is the best fit, say why
  - if it is only reasonable, say what is weak
  - if a better repo-native approach exists, say so directly
- Prefer repo evidence over proposal language.
- Use repository-relative paths for all user-visible file references in the response.
- If clickable markdown file links require an absolute target, keep the visible link label repository-relative and use the absolute path only in the target.
- Do not print raw absolute filesystem paths in prose unless the user explicitly asks for them.
- Prefer short bullets over paragraphs when the meaning is unchanged.
- Avoid repeating a path once it has been introduced; refer back to it by short name or context.
- When a flow helps interpretation, use a compact ASCII diagram in a fenced `text` block.
- Keep diagrams small and local; do not generate Mermaid, images, or other artifacts.
- Cite concrete files and line references for important claims.

## Evidence To Gather

Read the change artifacts first:
- `proposal.md`
- `design.md`
- `tasks.md`
- relevant `specs/**/spec.md`

Then inspect implementation evidence, prioritizing:
- application code
- migrations
- tests
- README or operator docs
- contracts or schemas if touched

If the spec references capabilities that are intentionally deferred, call that out explicitly instead of implying they shipped.

## Process

### 1) Resolve the Target

Normalize the input to a single OpenSpec change root.

### 2) Read the Change

Read the spec path the user provided, then read the surrounding change artifacts needed to understand:
- scope
- explicit non-goals
- claimed phases
- intended acceptance criteria

### 3) Find the Implementation

Map the change to real evidence in the repo:
- touched runtime files
- database or migration files
- tests
- docs

If no implementation is found, return `spec-only` and stop short of implementation claims.

### 4) Audit the Shape

Judge whether the implementation shape is sound by checking:
- boundary choice: was the work placed in the right module or layer
- traceability: can outputs be tied back to inputs and runs
- safety: does it prevent false authority, hidden assumptions, or silent data invention
- determinism: are parsing, IDs, hashes, and ordering stable where needed
- idempotency: can repeated execution avoid noisy duplication where required
- test coverage: do tests prove the risky parts
- docs and operator fit: can another engineer run or understand it reliably
- repo fit: does it follow the stack and patterns already used here

When `audit=strict`, actively look for a better alternative and explain why it was rejected or why it would be stronger.

### 5) Produce the Summary

Answer in the user's language. If the request is in Spanish, answer in Spanish.

- explain the reasoning behind the shape, not just the output
- keep the explanation compact and concrete
- prefer a mentor tone: what it is, why it works, and what to watch for
- avoid repetition and long prose when bullets will do

Tailor by audience:
- `exec`: concise, outcome and risk first
- `product`: scope, impact, gaps, and user-facing consequences
- `engineering`: implementation shape, boundaries, and evidence

Tailor by depth:
- `short`: one compact summary plus key evidence
- `standard`: default structured review
- `deep`: fuller reasoning, tradeoffs, and file-by-file evidence

## Output Format

### 1) Verdict

- `Implementation status:` `implemented` | `partial` | `spec-only`
- `Assessment:` `best-fit` | `reasonable-with-gaps` | `not-the-right-shape`

### 2) What Was Implemented

- summarize only what is supported by code, tests, migrations, or docs
- separate shipped behavior from planned future phases

### 3) How It Was Implemented

- explain the concrete design shape in a teach-first order: problem, mental model, implementation, tradeoff
- name the main tables, modules, flows, tests, and docs involved
- when a flow is easier to understand visually, include one compact ASCII diagram
- cite repository-relative file references in user-visible text, and keep line references minimal
- call out important constraints such as auditability, source-of-truth decisions, or safety guards

### 4) Why This Is The Right Shape

- give 3-5 concrete reasons
- compare briefly against the most plausible naive alternative
- if it is not the best shape, say what would be better and why

### 5) Gaps, Risks, Or Deferred Work

- list what is only specified
- list missing validation or unresolved tradeoffs
- do not bury material caveats

### 6) Evidence

- include a short bullet list of the key files with repository-relative labels and tight line references
- keep line references tight
- avoid repeating full paths in the body if the file was already named above

## Example Invocation

- `/implementation-summary openspec/changes/add-regulatory-intelligence-catalog/specs/regulatory-seed-import/spec.md`
- `/implementation-summary add-regulatory-intelligence-catalog depth=deep audit=strict`
