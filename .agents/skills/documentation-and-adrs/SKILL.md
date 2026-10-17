---
name: documentation-and-adrs
description: Record architectural decisions and durable implementation context. Use when changing public behavior, architecture, data shape, or operational contracts.
---

# Documentation and ADRs

Document decisions and constraints, not code that is already obvious.

## licitAI Repository Contract

- ADRs live in `docs/decisions/`.
- Read `docs/decisions/README.md` before creating an ADR.
- Continue existing numbering and naming. Do not create `docs/adr/` or a
  second numbering scheme.
- Use `docs/operations/command-surface.md` and package routing docs for command
  names. Do not copy generic npm commands into repository documentation.
- Update existing documentation when behavior changes. Do not create duplicate
  guides for an existing contract.

## ADR Minimum

Use an ADR when a decision is costly to reverse, affects multiple packages, or
changes security, tenancy, persistence, API shape, or operations.

Include:

- Status and date.
- Context and constraints.
- Decision.
- Alternatives considered and rejection reasons.
- Consequences and follow-up risks.
- Links to implementation, tests, and superseded ADRs when applicable.

Do not delete historical ADRs. Write a new ADR when a decision changes.

## API and Inline Documentation

- Prefer GraphQL schema and TypeScript types as API documentation.
- Document non-obvious reasons, security assumptions, and operational gotchas.
- Do not leave commented-out code or speculative TODOs.
- Redact secrets, tokens, credentials, and sensitive production data from
  examples and logs.

## Verification

- [ ] Existing routing and numbering were checked.
- [ ] Documentation matches current commands and paths.
- [ ] Decision explains why and rejected alternatives.
- [ ] Links resolve inside the repository.
- [ ] No npm install, package-lock, or invented command appears.
