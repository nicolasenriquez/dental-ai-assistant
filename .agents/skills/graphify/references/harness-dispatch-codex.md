# Codex Dispatch Adapter

Use this reference only when the active harness is Codex.

Codex dispatch uses `spawn_agent`, `wait_agent`, and `close_agent`. It requires
`multi_agent = true` under `[features]` in `~/.codex/config.toml`. If
`spawn_agent` is unavailable, tell the user to enable that feature and restart
Codex.

Call `spawn_agent` once per chunk, with every call in the same response so the
chunks run in parallel. Wrap the extraction prompt like this:

```
spawn_agent(agent_type="worker", message="Your task is to perform the following. Follow the instructions below exactly.\n\n<agent-instructions>\n[extraction prompt, with FILE_LIST, CHUNK_NUM, TOTAL_CHUNKS, DEEP_MODE substituted]\n</agent-instructions>\n\nExecute this now. Output ONLY the structured JSON response.")
```

Load `extraction-spec-codex.md` for the prompt. Collect results sequentially
with `wait_agent(handle)` followed by `close_agent(handle)` for each handle.
Parse each result as JSON and merge the nodes, edges, and hyperedges in memory.
