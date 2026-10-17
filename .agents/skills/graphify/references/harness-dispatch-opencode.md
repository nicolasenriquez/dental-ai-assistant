# OpenCode Dispatch Adapter

Use this reference only when the active harness is OpenCode.

Dispatch one `@agent` mention per chunk, with every mention in the same
response so the chunks run in parallel:

```
@agent Chunk CHUNK_NUM of TOTAL_CHUNKS: [extraction prompt with FILE_LIST, CHUNK_NUM, TOTAL_CHUNKS, DEEP_MODE substituted]
```

Load `extraction-spec-opencode.md` for the prompt. Wait for all responses,
parse them as JSON, and merge the nodes, edges, and hyperedges into
`graphify-out/.graphify_semantic_new.json`. If the mention path cannot write
chunk files, use the serial path that writes each
`graphify-out/.graphify_chunk_NN.json` before the merge.
