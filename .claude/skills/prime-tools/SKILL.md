---
name: prime-tools
description: Primes the agent with the patterns and best practices for building tools, MCP-server integrations, or new capabilities. Use before adding a new tool, wiring up an MCP server, or extending the system with a new capability so the work follows agent-optimized conventions.
---

# Prime for Tool Development

Load tool-development patterns and best practices to prepare for building new tools, MCP-server integrations, or capabilities.

## Context

You are about to work on building or modifying tools — functions an agent calls, MCP-server integrations, or other new capabilities. Before writing any code, internalize the patterns and best practices for writing agent-optimized tool docstrings and interfaces. Well-documented tools are the difference between an agent that picks the right tool every time and one that flounders.

## Read

If the project has a dedicated tool-development reference (e.g. under `.claude/references/`, `docs/`, or `ai_docs/`), read it now. Otherwise, internalize the principles below directly.

## Process

Understand and internalize:

1. **Core Philosophy** - How agent tool docstrings differ from standard docstrings. They are written for an LLM deciding *whether* and *how* to call the tool, not for a developer reading source.
2. **7 Required Elements** - One-line summary, "Use this when", "Do NOT use", Args with guidance, Returns, Performance Notes, Examples.
3. **Agent Perspective** - Writing for LLM comprehension and tool selection.
4. **Token Efficiency** - Documenting token costs and optimization strategies.
5. **Anti-patterns** - Common mistakes that confuse agents (vague names, missing negative guidance, unrealistic examples).
6. **Template Structure** - The exact format to follow for every tool.

Pay special attention to:

- "Use this when" (affirmative guidance for tool selection)
- "Do NOT use" (negative guidance to prevent tool confusion)
- Performance Notes (token costs, execution time, limits)
- Realistic examples (not "foo", "bar", "test.md")

For **MCP-server integrations** specifically, also internalize:

- How the server is registered and discovered (config file, transport type)
- How each MCP tool's input schema maps to the docstring guidance above
- Auth and credential handling, and where secrets live
- Error and rate-limit behavior the agent must reason about

## Report Back

Provide a concise summary with:

### Key Principles (5 bullets max)

- [What are the core principles you understood?]

### Critical Distinctions

- [What makes agent tool docstrings different from standard docstrings?]
- [Why does "Do NOT use" matter?]

### Template Internalized

- [Confirm you understand the structure you'll follow]

### Ready to Apply

- [One sentence confirming you're ready to build agent-optimized tools, MCP integrations, or capabilities]

Keep it scannable - I want to verify understanding in 30 seconds.
