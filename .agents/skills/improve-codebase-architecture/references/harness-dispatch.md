# Harness Dispatch Adapter

Use this reference when the architecture workflow needs parallel exploration
or alternative interface proposals.

Codex uses its configured parallel-agent dispatch with an exploration role for
repository walking and one worker per alternative interface. OpenCode uses the
equivalent parallel `@agent` mentions in a single response. In either harness,
collect every result before presenting candidates or comparing interfaces.

The adapter is deliberately procedural rather than tool-specific: preserve the
requested role, parallelism, file scope, and result format while translating
the dispatch call to the active harness.
