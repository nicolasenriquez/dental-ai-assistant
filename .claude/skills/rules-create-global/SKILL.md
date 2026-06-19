---
name: rules-create-global
description: Set up your project's global rules — a lean, well-structured root CLAUDE.md (plus a starter .claude/) following the course methodology. Works for a greenfield project (derive from your architecture decisions) or a brownfield codebase (derive from a codebase analysis). Use when initializing or re-deriving the AI Layer's rules, onboarding a codebase, or replacing a generic /init output. The customizable replacement for /init.
argument-hint: [prd-path | analysis-path]
---

# Create Rules: Set Up Your Project's Global Rules

## What global rules are (30-second intro)

Your global rules (`CLAUDE.md` / `AGENTS.md`) are the **always-on steering document** — read on every
task. Two things earn that always-on slot:
1. **A map of the codebase** — the dirs/files that matter, each with a one-line *what it is + why it lives there*.
2. **Ground rules** — the *specific conventions* this project follows (how you do type safety, your error
   philosophy, your git workflow). State the choice, not a slogan.

Everything else loads **on demand** (references/skills) or belongs in a per-task **plan** — not here.

## Two situations, one motion

Global rules encode **technical** truth — so you derive them from technical decisions, never from a product spec:

| You have… | Derive rules from… | "Truth" is… |
|-----------|--------------------|-------------|
| **Greenfield** — a new project, mostly a scaffold | your **architecture decisions** (the technical "how" you settled with the AI) | *what should be* |
| **Brownfield** — an existing codebase with no AI Layer | a **codebase analysis** of what's actually there | *what is* |

> **Greenfield note:** your rules come from your **architecture decisions**, not a PRD. The flow: discuss
> *what* you're building with the AI (research the web for stack + best practices if it's not all in your
> head), then settle the **architecture** — stack, patterns, directory structure, conventions. *Those*
> decisions are what this skill derives rules from. A PRD captures the *product* (what/why) — useful context,
> but technical rules don't live there.

> **Brownfield note:** this skill does **not** explore the codebase for you. First run the exploration
> (fan out `research-agent` explorers → aggregate into `codebase-analysis.md` — see **V5 / exercise 1**),
> then point this skill at that analysis. The skill packages the *derive → extract → seams → prune* steps
> you saw in V5, not the exploration.

> **Before you run this — protect any existing rules.** If the project already has a `CLAUDE.md` /
> `AGENTS.md`, **copy or rename it first** (e.g. `CLAUDE.md.bak`) so this skill doesn't overwrite something
> you want to keep. Even better, **feed it in as input** — point the skill at it ("read my existing
> `CLAUDE.md` first") so the derivation *builds on* what's already there instead of starting from scratch.

## Required reading (do this first)

Read the current Anthropic guidance so best practices stay fresh — don't rely on a snapshot:
- **Memory / CLAUDE.md:** https://code.claude.com/docs/en/memory
- **Best practices:** https://code.claude.com/docs/en/best-practices

Then use the course's **`.claude/CLAUDE.md.template`** as the output structure.

## The methodology (bake this in)

- **What goes always-on:** only the **map** + **ground rules** (specific conventions). Everything true
  *project-wide, every task*.
- **The four destinations** — sort every candidate line:
  - **Keep always-on** → map / ground rules.
  - **Push to on-demand** → a recurring but task-*type*-specific pattern → `.claude/references/<topic>.md` (or a skill).
  - **Move to a plan** → task-specific "what to build next" content → it was never a rule.
  - **Delete** → redundant, or a slogan the model already follows ("write clean code", "KISS/DRY").
- **State the choice, not the slogan:** "derive types with `z.infer`", not "type safety is critical".
- **Brownfield = "what is", not "what should be":** every rule must point to the file that proves it; if you
  can't, leave it out. Aspirational rules make the agent fight the codebase.
- **Lean:** don't bloat it to the point it eats context or the agent starts ignoring its own rules. No magic
  line number — cut anything that wouldn't cause a mistake if removed.

## Workflow

### 1. Read the inputs
- **Greenfield:** your **architecture decisions** — from the design discussion with the AI (stack, patterns,
  directory structure, conventions, security choices), captured in the session or a short design note + any
  scaffold files. *(A PRD, if you have one, is product context — read it for **what** you're building, not for
  the technical rules.)*
- **Brownfield:** the aggregated `codebase-analysis.md` (with its file:line citations) + spot-check the code.
- **If a rules file already exists:** read it first and treat it as a starting point — and make sure it's
  backed up (see "protect any existing rules" above) so nothing you wrote by hand is lost.
- Read the best-practices docs above. Load `.claude/CLAUDE.md.template` as the structure.

### 2. Derive the root `CLAUDE.md`
Fill the template's sections, sourced from the input:
- **What this is** — one paragraph + the stack in one line.
- **Architecture map** — the tree of dirs/files that matter, one-line what/why each.
- **Ground rules** — the specific conventions (greenfield: chosen in the PRD; brownfield: *observed in the
  code*, each traceable to a file).
- **Commands** — the few you actually run (install / test / type-check / lint / run).
- **On-demand pointers** — where detail loads when needed.
Don't dump the PRD or the analysis in. Link to them.

### 3. Extract on-demand context
Pull recurring, task-type-specific patterns out into `.claude/references/<topic>.md` **stubs** (a paragraph
each, not full docs). Test: *does it recur every time you touch that area?* → guide. One-off → leave in the
source doc.

### 4. Find the seams
Add a short **"where new code goes"** section — the interfaces/folders where new work plugs in. This is what
makes the agent *extend* the codebase instead of bolting on. (Greenfield: the seams are *designed* from the
architecture, not discovered.)

### 5. Prune to lean
First draft is always too big. Delete generic advice, restated defaults, and anything that can't point to its
evidence. Apply the per-line test: *would removing this cause a mistake? If not, cut it.*

### 6. Report
- Files created/changed.
- A 3–5 line summary of what went into `CLAUDE.md` and why.
- What was pushed to on-demand context (and where).
- Next step: the rules are ready — start the first PIV loop.

## Quality checks

- ✅ Root `CLAUDE.md` is a **map + ground rules**, not documentation or a PRD/analysis copy.
- ✅ Every ground rule is a **specific choice** (brownfield: traceable to a file) — no slogans.
- ✅ Recurring task-type detail lives in `.claude/references/`, not always-on.
- ✅ Lean enough that nothing earns its slot without paying rent.

## Notes

- Rules **evolve** — revisit `CLAUDE.md` as the project grows and after major model releases, and run
  `/rules-check-drift` before merges so the map never drifts.
- Greenfield: run after you've settled the architecture with the AI (and after `plan-create-prd`, if you wrote one
  for the product). Brownfield: run after the V5 exploration produces `codebase-analysis.md`.
