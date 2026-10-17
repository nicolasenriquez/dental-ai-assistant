---
name: api-and-interface-design
description: Design stable GraphQL APIs and module boundaries within licitAI conventions. Use when changing resolvers, mutations, inputs, outputs, or public TypeScript contracts.
---

# API and Interface Design

Use this skill for interfaces that cross a module, package, workspace, or
client boundary.

## licitAI Contract

- GraphQL is the API surface. Follow `docs/standards/graphql-standard.md`.
- Use NestJS resolvers, existing guards, workspace context, generated types,
  and repository DataLoader patterns.
- Define authentication, authorization, workspace isolation, input limits, and
  error behavior before implementation.
- Validate user input and third-party responses at the boundary. Treat external
  data as untrusted.
- Use stable GraphQL error codes and redact internal exceptions, stack traces,
  tokens, and sensitive fields.
- Prefer additive changes. Do not remove or change existing fields without a
  measured migration plan.
- Use `type` aliases and existing repository types. Do not introduce an
  interface with one implementation.

## Design Sequence

1. Identify consumers and observable behavior.
2. Define typed input, output, pagination, and error contracts.
3. Define permission and workspace checks.
4. Define validation, limits, idempotency, and consistency rules.
5. Implement resolver or module boundary.
6. Add contract and permission tests beside the implementation.

## Boundary Checklist

- [ ] Input schema rejects unknown, oversized, or malformed values.
- [ ] External responses are parsed before use.
- [ ] Every read and mutation checks authentication and authorization.
- [ ] Workspace-scoped data cannot cross workspace boundaries.
- [ ] List queries have bounded pagination and fixed-cost filters.
- [ ] Errors expose stable client-safe codes only.
- [ ] New behavior is covered by resolver and integration tests.

## References

- `docs/standards/graphql-standard.md`
- `docs/standards/typescript-standard.md`
- `docs/standards/testing-standard.md`
- `packages/twenty-server/docs/UPGRADE_COMMANDS.md` for schema changes
