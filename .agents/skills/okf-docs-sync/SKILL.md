---
name: okf-docs-sync
description: Audit and safely synchronize repository documentation with the local OKF profile, preserving operational contracts and prose meaning. Use for OKF audits, documentation topology, routing links, frontmatter, indexes, or evidence-based retirement of obsolete documentation.
---

# OKF Docs Sync

Audit and synchronize repository documentation safely.

The repository's own OKF standard and authoring guide are the operational
authority. The official OKF specification is the interoperability baseline.
Local conventions must not be presented as official OKF requirements.

## Scope

In scope:

- docs/
- root AGENTS.md
- root index.md
- routing files explicitly referenced by those documents

Out of scope:

- openspec/ change artifacts
- package documentation under packages/
- generated files
- log.md, unless the local authoring guide explicitly requires it
- prose rewrites that change technical or policy meaning

Before acting, read:

1. AGENTS.md
2. index.md
3. .agents/skills/prime/SKILL.md
4. docs/standards/okf-standard.md
5. docs/operations/okf-authoring-guide.md
6. the applicable docs/ context and index files

Declare the selected route:

AGENTS.md → index.md → docs/

## File classes

Classify each audited file before applying rules:

- concept — durable OKF knowledge document
- navigation — index.md or directory map
- control — AGENTS.md, README.md, CONTEXT.md, or operational contract
- excluded — generated, vendored, binary, or explicitly out of scope

Do not apply concept frontmatter rules to navigation or control files unless
the repository standard explicitly requires it.

## Phase 1: Prime

Capture:

- current branch
- git status
- last 10 commits
- repository structure
- relevant root and docs/ context
- selected documentation surface
- risks or pre-existing changes

Do not modify files during this phase.

## Phase 2: Audit

Create an audit ledger with:

file | class | check | severity | evidence | status

Use these checks:

### Concept files

- parseable YAML frontmatter
- non-empty type
- required local-profile fields
- valid local type values, if the repository profile defines them
- safe internal links
- acceptable headings and spacing

### Navigation files

- valid routing targets
- accurate directory listings
- no stale anchors
- correct reserved-file treatment

### Control files

- routing consistency
- preserved operational instructions
- valid links
- no accidental frontmatter or contract changes

Classify findings as:

- required — blocks completion
- advisory — quality improvement
- deferred — intentionally not addressed
- waived — accepted exception with evidence

Do not call a file non-conformant only because it lacks optional OKF fields,
uses an unknown type, lacks an index, or contains a tolerated broken link.
Those may still be local-profile findings.

## Phase 3: Additive synchronization

Apply only changes authorized by the local authoring guide:

- add or correct frontmatter where permitted
- fix internal routing links
- add an index only when the local guide requires one
- normalize safe heading and spacing conventions
- preserve existing anchors whenever possible

For every additive change:

- preserve the document body meaning
- avoid deleting paragraphs
- avoid moving sections
- verify that the body hash is unchanged when only metadata or formatting changes
- run the repository's standard diff and formatting checks

If a proposed change alters meaning, stop and classify it as deferred or
require an explicit documentation change.

## Phase 4: Retirement

Retire content only with concrete evidence:

- removed feature or policy
- superseded decision
- exact duplicate with an identified canonical source
- confirmed nonexistent target
- section owned by another authoritative document

For every retirement record:

file | section | criterion | evidence | replacement | status

Rules:

1. Identify the replacement or declare void.
2. Search incoming references before deletion.
3. Update references before removing the target.
4. Remove only the approved section.
5. Re-scan links, indexes, anchors, and titles.
6. Confirm zero unintended debris.

Aesthetic preference alone is never sufficient evidence.

## Phase 5: Verification

Before reporting completion, verify:

- no out-of-scope files changed
- git diff --check passes
- additive changes preserve body meaning
- all required findings are resolved
- deferred and waived findings are recorded
- internal links and routing targets are consistent
- retired content has no stale incoming references
- no operational contract was weakened

Use repository-native tools and conventions. Prefer rg or the repository's
document validator over ad-hoc recursive grep.

## Final report

Produce one concise report containing:

- routing declaration
- prime snapshot
- audited file count by class
- required findings
- advisory findings
- resolved deltas
- retirement ledger
- deferred and waived items
- remaining recommendations
- final status: resolved, deferred, or blocked

Do not claim official OKF conformance when only the repository-local profile was
validated.
