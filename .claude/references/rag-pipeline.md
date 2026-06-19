# Reference: RAG & ingestion pipeline

On-demand detail for work in `rag/`, `ingest/`, `services/`, `llm/`. Full `file:line` evidence lives in
`docs/codebase-analysis.md` (§ RAG & ingestion pipeline). The CLAUDE.md "RAG pipeline invariants" are the
contract; this is the how.

**Flow.** A source becomes `videos` + `chunks` rows: acquire transcript → `chunk_video_timestamped()` (Docling
HybridChunker, 512-token target, `cl100k_base`) → `embed_batch()` (OpenRouter `text-embedding-3-small`, 1536-d,
batched ≤100) → store via `repository` (embedding written as `json.dumps(float[])` into a `TEXT` column). At
query time there is **no pre-retrieval**: `routes/messages.py` calls `llm/openrouter.py:stream_chat()`, which
runs a multi-round tool loop (`LLM_TOOLS_MAX_PER_TURN=6`). The tools in `rag/tools.py` embed the query, call
`retriever_hybrid` (RRF: tsvector keyword + `pgvector` cosine cast `::vector`, top-5, overfetch ×2, RRF k=60),
apply a per-video cap (3) and ±1 neighbor expansion, and return a canonical chunk dict.

**ACL.** Retrieval filters `source_type = ANY($3::text[])` — members get `['youtube','dynamous']`, others
`['youtube']`. These lists are **hardcoded** in `retriever_hybrid.py` and `tools.py`; a new source type must be
added in both, plus defense-in-depth in `execute_get_video_transcript`.

**Streaming + citations.** SSE framing is exact (see CLAUDE.md invariant 6). The model emits inline
`[c:<chunk_id>]` markers; `rag/citations.py:CitationMarkerStripper` removes them from the stream (128-char
holdback — `feed`/`flush` order matters, and `flush()` at end is required). `messages.py` sets `is_cited`,
dedupes to `source_citations`, and emits `event: sources` before `[DONE]`; refusal detection suppresses that event.

**Tuning knobs** are all constants in `config.py` (`HYBRID_*`, `RETRIEVAL_*`, `CHAT_MODEL`, `EMBEDDING_MODEL`,
`LLM_TOOLS_MAX_PER_TURN`, `CITATIONS_MAX_COUNT`). Swapping the chat model is a one-line change there.

**Gotchas:** embedding column is `TEXT` not native `vector`; `get_video_transcript` takes the internal UUID, not
the YouTube id; Supadata needs `lang="en"`; expanded neighbor chunks borrow `source_type`/`lesson_url` from the
anchor; call `invalidate_cache()` + `invalidate_catalog()` after every ingest.
