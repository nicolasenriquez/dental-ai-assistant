# AI Tutor — Knowledge Base & Ingestion (Background)

> Background context for planning the **Pluggable ingestion** epic (Jira **ACC-27**). Not a spec.
> Pair with the current usage snapshot (`usage-snapshot.md`) before committing scope.
>
> _Demo note: stand-in for the Confluence background page until Confluence is provisioned on the
> Atlassian site. Canonical copy: `agentic-coding-course/tools/atlassian-seed/confluence-background.md`._

## What the AI Tutor is

A learner-facing chat tutor for Dynamous course content. Answers are meant to be **grounded in
source material and cite it inline** — an uncited answer is a trust risk, because the learner
can't see where it came from and we can't be sure it didn't drift.

## How the knowledge base works today

Pipeline: **ingest → chunk → embed → store → retrieve → cite.**

- **Chunking:** Docling `HybridChunker` (~512 tokens).
- **Embeddings:** OpenRouter `text-embedding-3-small` (1536-dim).
- **Storage / retrieval:** Postgres with hybrid search — `pgvector` (semantic) + `tsvector`
  (keyword), merged via Reciprocal Rank Fusion.
- **Citations:** the LLM emits inline `[c:<chunk_id>]` markers; the backend parses them and
  renders a **two-tier** source list — **cited** (the model marked it) vs **consulted but
  uncited**. A response that marks **zero** chunks is the "uncited answer" we're worried about.

The KB ingests a **fixed set of sources, each wired in directly — there is no shared adapter:**

- **YouTube** — transcripts of Dynamous course videos, fetched via the **Supadata API**
  (`POST /api/ingest`). `source_type = 'youtube'`.
- **Dynamous** — gated/paid course transcripts as markdown + YAML frontmatter, ingested at app
  startup. `source_type = 'dynamous'`.

`source_type` is stored on both `videos` and `chunks` (denormalized for access-control
filtering at query time). Adding any new source type today means a **bespoke integration**
against the pipeline.

## The pain

- Learners increasingly ask about things the (YouTube + Dynamous) KB doesn't cover —
  **deployment & hosting, API reference, course exercises** — and those answers come back with
  **no cited sources**.
- We can't onboard new content (docs sites, internal wikis, partner material) without
  engineering a one-off integration each time.

## Relevant product surfaces

- **Chat** + **citations modal** — where sources render and get clicked.
- **Sidebar** — conversation history.
- **Admin → ingestion** — YouTube ingest endpoint; Dynamous startup ingest.

## Signals to check before scoping (see the usage snapshot)

- Weekly **zero-citation rate** is climbing, concentrated in the docs-shaped "gap" query
  categories (`deployment-and-hosting`, `api-reference`, `course-exercises`).
- **Citation click-through** on `source_type = 'dynamous'` is low and falling.
- A majority of traffic is **mobile**, where citation click-through is far lower than desktop.

_Analytics events/properties the snapshot uses: `chat_response_completed` (`num_citations`,
`query_category`), `citation_clicked` (`source_type`), `chat_message_sent`, `user_signup`._

## Related

- Epic: **ACC-27** — Pluggable ingestion: generic data-source adapter.
- Usage snapshot: `usage-snapshot.md` (V6 output).

---
_Implementation anchors (for verification): `backend/ingest/youtube_url.py`,
`backend/ingest/dynamous.py` (`source_type='dynamous'`), `backend/alembic/versions/0005_*`
(`source_type` column), `backend/rag/retriever_hybrid.py` (RRF + `source_type`),
`backend/rag/citations.py` (`[c:<chunk_id>]` parsing), `backend/routes/messages.py` (two-tier
cited/uncited)._
