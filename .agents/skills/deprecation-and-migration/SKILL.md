---
name: deprecation-and-migration
description: Safely remove old APIs, features, and data shapes. Use when replacing consumers, planning deprecation, or changing persistent schema.
---

# Deprecation and Migration

Remove code only after proving its consumers can use replacement behavior.

## licitAI Repository Contract

- Read `packages/twenty-server/docs/UPGRADE_COMMANDS.md` before schema work.
- Generate database commands with the repository Nx targets. Do not hand-write
  migration DDL or use Prisma, Drizzle, or generic migration CLIs.
- Preserve committed `up` and `down` logic. Append changes; do not rewrite it.
- Every migration keeps tested `up` and `down` logic. Production recovery is
  forward-only; never use `down` as deployment rollback.
- Use Yarn 4.13.0. Do not add `npm`, `npx` installation, or lockfile commands
  to migration instructions.

## Removal Sequence

1. Identify all consumers, owners, configuration, tests, and documentation.
2. Confirm replacement covers critical behavior.
3. Mark old behavior deprecated with owner, reason, and removal condition.
4. Migrate consumers incrementally and verify each one.
5. Measure zero active usage through source search and runtime evidence.
6. Remove old code, tests, configuration, and notices in one focused change.

## Schema Changes

Use expand, migrate, contract:

1. Add new nullable or additive shape.
2. Deploy code that writes both shapes when required.
3. Backfill in throttled batches away from the hot path.
4. Switch reads and observe.
5. Stop old writes.
6. Drop old shape in a later deploy after zero references are proven.

Do not rename or drop a column in the same deploy that first requires the new
shape. Large indexes must avoid blocking writes where the database contract
supports it.

## Verification

- [ ] Replacement is available and tested.
- [ ] Active consumers and owners are known.
- [ ] Deprecation path has explicit exit criteria.
- [ ] Old and new code can coexist during rollout.
- [ ] Backfill is bounded, observable, and restartable.
- [ ] `up` and `down` paths were tested.
- [ ] Production rollback does not depend on destructive `down` execution.
- [ ] Zero references were verified before removal.
