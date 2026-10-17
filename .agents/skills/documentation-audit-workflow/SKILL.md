---
name: documentation-audit-workflow
description: Run a staged, evidence-based audit of repository documentation. Use when a task asks to audit documentation drift, compare documentation methods, validate documentation claims, or retire temporary research safely.
---

# Documentation Audit Workflow

Run one narrow documentation audit at a time.

Use this skill without an OpenSpec change unless the user explicitly selects
OpenSpec for the work.

## 1. Inventory

Read root `AGENTS.md`, root `index.md`, and the selected surface contract.
Record each file, its class, its material claims, and its outgoing links.

Use these classes: concept, navigation, control, or excluded. Do not apply
concept-file rules to navigation or control files without a local requirement.

| Contract | Inputs | Process | Outputs | Verify |
| --- | --- | --- | --- | --- |
| Inventory | Selected surface and routing files | List files, claims, and links | Scope ledger | Every file has a class. |
| Verify | Scope ledger and source material | Classify and check claims | Evidence ledger | Every material claim has a source class and limit. |
| Decide | Evidence ledger | Classify findings and owner decision | Durable conclusion | Each retirement has a replacement or explicit void. |
| Close | Durable conclusion | Run scoped checks and retire temporary inputs | Final result | Links, frontmatter, and incoming references pass. |

## 2. Verify

For every material claim, record one source class:

- repository truth;
- official platform source;
- author primary source;
- community source; or
- inference.

Use official sources for platform behavior. Use community sources only as
context. State the limit of an author claim. Do not treat an unverified claim
as a repository rule.

Use this evidence ledger shape:

| Claim | Class | Source | Limit or decision |
| --- | --- | --- | --- |

## 3. Decide

Classify each finding as required, advisory, deferred, or waived. For a
retirement, record the replacement, incoming references, and decision owner.

Write durable conclusions in the applicable `docs/` area. Do not place durable
knowledge in a generic results directory.

## 4. Close

Run the smallest checks that prove the changed contract. Check relative links,
frontmatter, routing targets, and repository-derived claims when applicable.

Store per-run scratch artifacts outside the repository in a system temporary
directory. Remove them after the final result is accepted. Remove temporary
repository research only after its verified conclusions are in a durable
document and no incoming references remain. Do not create a backup, alias, or
generic results directory.

## Output

Report the scope, evidence classes, findings, checks, decision, and remaining
uncertainty. Do not claim an external method improves model quality without
controlled evidence.
