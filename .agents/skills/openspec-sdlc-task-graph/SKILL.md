---
name: openspec-sdlc-task-graph
description: Analyze OpenSpec changes and produce a defensive SDLC task graph with dependency order, ASCII diagrams, standalone versus parallel classification, validation gates, and safe multi-agent handoff guidance before implementation.
---

# OpenSpec SDLC Task Graph

## Purpose

Turn an active OpenSpec change into an implementation-ready execution map. Use
repository artifacts and the current worktree as evidence; do not implement the
change or silently edit its planning artifacts.

## Workflow

### 1. Establish context

- Read the root `AGENTS.md` and `index.md`.
- Select the `openspec/` surface and read `openspec/AGENTS.md`,
  `openspec/CONTEXT.md`, and `openspec/index.md`.
- Read the selected change's `proposal.md`, `specs/**/spec.md`, `design.md`,
  and `tasks.md` in that order.
- If package implementation is in scope, read `packages/AGENTS.md`,
  `packages/CONTEXT.md`, `packages/index.md`, and the relevant leaf contracts.
- If `graphify-out/graph.json` exists and the question requires codebase
  relationships, query Graphify first; do not run a graph update automatically.

Use `openspec list --json` or `openspec status --change <name> --json` when the
CLI is available. If it is unavailable, inspect the change artifacts directly
and say so briefly.

### 2. Reconcile current state

- Inventory task checkboxes, CLI progress, modified files, and existing test
  evidence.
- Distinguish `planned`, `implemented`, `validated`, `blocked`, and `ready for
  closeout`; a checked task is not proof of release readiness.
- Inspect `git status --short` and relevant diffs before recommending agents.
- Preserve existing user changes. Never use reset, checkout, clean, or broad
  stash operations as part of this planning flow.

### 3. Build the dependency graph

Derive dependency edges from explicit contracts, data flow, generated artifacts,
shared files, migration boundaries, test seams, and destructive operations. Do
not infer dependencies merely from task numbering.

Use a compact graph such as:

```text
scope lock
    |
    v
contract tests
    |
    v
persistence -> read/API contract -> generated consumers -> productive UI
                                                        |
                                                        v
                                             regression -> closeout
```

Mark every edge with the reason it exists when the dependency is not obvious.

### 4. Classify execution safety

Classify each task as one or more of:

- `serial`: a downstream contract consumes its result;
- `standalone`: it changes a shared boundary, migration, generated contract,
  productive route, or destructive surface;
- `parallel-safe`: independent files and contracts, with no shared mutable
  state;
- `validation-gate`: read-only proof that must pass before the next slice;
- `destructive`: removes evidence, prototypes, data, or recovery options.

Treat parallelism as safe only when all of the following hold:

- agents have isolated worktrees when they can mutate files;
- no agent owns the same file or generated output;
- no agent depends on an unfinished schema, API, or code-generation contract;
- the task does not require ordered migration or cleanup behavior.

Separate logical parallelism from operational parallelism: tasks may be
independent on paper but unsafe in one dirty checkout.

### 5. Map the SDLC slices

Use this default lifecycle, adapting it to the change:

```text
requirements and scope
        -> contract coverage
        -> persistence and domain canon
        -> application/read/API contract
        -> generated consumers
        -> productive integration
        -> focused verification
        -> adjacent regression
        -> documentation and release closeout
```

Keep focused verification close to the slice it proves, then run the complete
validation set only after implementation is frozen.

### 6. Produce the handoff

Respond in the user's language and lead with the recommended outcome. Include:

- current progress and discrepancies;
- a dependency graph using plain ASCII characters;
- the exact defensive order by task ID;
- a matrix of standalone, serial, and parallel-safe tasks;
- validation gates and their blocking conditions;
- dirty-worktree or multi-agent hazards;
- the next safe action and the files consulted.

Use local Markdown links with absolute paths when citing repository files.

## Dependency Rules

Apply these rules unless the change artifacts explicitly override them:

- establish source and scope before implementation;
- write contract or fail-first coverage before changing behavior;
- complete persistence/schema work before consumers query new fields;
- complete server/API contracts before frontend code generation and UI wiring;
- build the productive story or acceptance seam before replacing production
  composition;
- remove prototype or duplicate authority only after parity passes;
- run adjacent-surface regression after the route is stable;
- document only shipped public or operational contract changes;
- sync or archive only after implementation and verification are complete.

Preserve the spec's truthfulness rules. Never recommend current-page arithmetic,
invented metrics, inferred values, or fallback behavior when the contract says
unknown or unavailable values must remain explicit.

## Output Template

```text
## Resultado

<recommended order and why>

## Estado actual

<completed, implemented-but-unverified, pending, blocked>

## Grafo de dependencias

<ASCII graph>

## Orden defensivo

<task-by-task sequence with gates>

## Paralelización segura

<safe lanes and required isolation>

## Riesgos

<shared files, generated contracts, destructive cleanup, dirty tree>

## Próximo paso

<one safe action>
```

## Boundaries

This skill plans; it does not implement code, modify application files, change
task checkboxes, archive changes, or create a parallel worktree. Hand off to
`openspec-apply-change` or `execute` when the user authorizes implementation.

Use `openspec-explore` when requirements or design decisions are materially
ambiguous. Use `wayfinder` when the effort spans multiple sessions and still
has unresolved decisions. Use `openspec-sdlc-task-graph` when the main question
is execution order, dependency safety, validation staging, or agent parallelism.

## Trigger Examples

- "Ordena defensivamente las tareas de esta spec."
- "¿Qué tareas de este `tasks.md` pueden correr en paralelo?"
- "Dame el SDLC correcto antes de implementar este OpenSpec change."
- "Construye un task graph seguro para varios agentes."
