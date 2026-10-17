# Project-local skills

This directory contains 73 skills: eight original project skills, 59 restored from the local Twenty snapshot, and six pinned Ponytail skills.

## Sources

- Original eight: preserved byte-for-byte from the repository before recovery.
- Twenty: local `pry-omnibid/twenty/.agents/skills` snapshot. This restores the available local versions, not a claim that every author's upstream is current. Existing `prototype` was preserved; legacy Twenty Ponytail copies were excluded.
- Ponytail: https://github.com/dietrichgebert/ponytail at `16352ac229eb08a9598dcae48fe9f2b342567d86`. Installed `ponytail`, `ponytail-audit`, `ponytail-debt`, `ponytail-gain`, `ponytail-help`, and `ponytail-review`. Their skill files match this pinned checkout; each includes its upstream MIT license. The remote was not rechecked during this recovery.

`imports-lock.json` records SHA-256 hashes of all 299 restored/preserved source files, including supporting files and licenses. Hashes describe exact working-tree bytes at recovery time; Git line-ending conversion may produce different bytes in a fresh checkout. This document and the manifest are not included in those hashes.

## Compatibility and safety

Root `AGENTS.md` and this repository's conventions take precedence over imported project-specific instructions. In particular, Twenty/licitAI paths, Yarn/Nx, TypeORM, GraphQL, NestJS and Linaria assumptions must not replace this project's Bun, uv, FastAPI, asyncpg, Alembic and Tailwind contracts. Keep source-specific skills for relevant tasks only.

Recovery copies instructions and supporting files only. It does not install plugins, enable hooks, configure integrations, run imported scripts or change global settings. Check scripts, commands, relative references, required dependencies and licenses before executing or redistributing them. The path/secret-pattern scan used for recovery is a basic safeguard, not a full security audit or runtime test.

`.claude/skills` was not changed. Some names overlap with that library; avoid configuring both directories as independent sources without checking name collisions.

## Discovery and durability

Pi discovers project-local `.agents/skills` entries. Run `/reload` after recovery. Skills with `disable-model-invocation: true` remain explicit-command-only; their absence from automatic routing is intentional.

The recovery is committed separately from application/OpenSpec changes. A commit records these files in local history but does not prevent external deletion or a reset. Keep the external backup and push the recovery commit when authorized.
