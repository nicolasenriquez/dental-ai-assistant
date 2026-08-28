# Root Cause Analysis: GitHub Issue #8

## Issue Summary

- **GitHub Issue ID**: #8
- **Issue URL**: https://github.com/dynamous-community/ai-tutor/issues/8
- **Title**: `chunk_video_fallback` treats minutes as seconds, so every fallback timestamp is 60x too small
- **Reporter**: coleam00
- **Status**: OPEN

## Assessment

| Metric | Value | Reasoning |
|--------|-------|-----------|
| Severity | **High** | Breaks RAG invariant #6 (exact-timestamp deep-link) for every video ingested through the fallback path — 4 call sites, 4 consumer surfaces. No workaround; wrong values are persisted to `chunks`. Not Critical: nothing crashes, retrieval ranking is unaffected, no security surface. |
| Complexity | **Low** | One arithmetic expression in one pure function. No schema change, no migration, no call-site change, no contract change. |
| Confidence | **High** | Reproduced locally against the real function at three magnitudes (ratio exactly 60.00 each time); traced `start_seconds` end-to-end (chunker → repository → RRF → tools → frontend) and confirmed no layer rescales. |

> **Confidence is HIGH** — the fix is mechanical and safe to run without a human gate.

## Problem Description

`chunk_video_fallback()` estimates chunk timestamps from a words-per-minute heuristic but writes the
result into fields whose contract is **seconds**. The unit conversion from minutes to seconds is
missing entirely, so every emitted timestamp is 60x too small.

**Expected Behavior:**
Chunks produced by the no-segments fallback path carry `start_seconds` / `end_seconds` spanning the
real video duration (a 3000-word transcript at 150 WPM should span ~1200 s).

**Actual Behavior:**
The chunks span 20 s. All chunks for the video land inside the first few seconds.

**Symptoms:**
- Citation chips render `0:00`–`0:20` regardless of where in the video the content lives
- The citation modal opens the embedded player at ~0:00 for every citation
- Markdown export `?t=` deep-links (`exportMarkdown.ts:41`) are equally wrong
- The LLM is shown wrong `[mm:ss]` markers in tool results (`rag/tools.py:237-238`, `:360-361`) and can narrate a bad timestamp in prose

## Reproduction

**Steps to Reproduce:**
1. `cd app`
2. Call `chunk_video_fallback` with a 3000-word transcript
3. Observe the final chunk's `end_seconds`

**Reproduction Verified:** **Yes** — run 2026-08-24 against the real function:

```
words=  750 chunks=  4 first=0.0->1.25 last_end=5.0   expected=300.0s  ratio=60.00
words= 3000 chunks= 16 first=0.0->1.25 last_end=20.0  expected=1200.0s ratio=60.00
words= 9000 chunks= 52 first=0.0->1.15 last_end=60.0  expected=3600.0s ratio=60.00
```

The ratio is **exactly 60.0 at every size** — a pure unit-conversion bug, not accumulating drift.

## Root Cause

### Affected Components

- **Files**: `app/backend/rag/chunker.py`
- **Functions/Classes**: `chunk_video_fallback()` (lines 189-230)
- **Dependencies**: none external — pure arithmetic

### Analysis

`150.0` is a per-**minute** rate. `total_words / 150.0` therefore yields **minutes**. That value flows
unconverted through `step` into `start_seconds` / `end_seconds`, whose contract everywhere else in the
system is seconds.

**Evidence Chain (5 Whys):**

```
WHY do citation deep-links land at ~0:00?
  → because chunks carry start_seconds values 60x smaller than reality
    (evidence: reproduction above — 3000 words yields last_end=20.0, not 1200.0)

WHY are they 60x too small?
  → because the value written is a count of minutes, not seconds
    (evidence: chunker.py:219-220 — `start_s = round(i * step, 2)` into key "start_seconds")

WHY is `step` in minutes?
  → because it derives from `estimated_duration`, which is words / words-per-MINUTE
    (evidence: chunker.py:215 — `step = estimated_duration / len(chunk_texts)`)

WHY was the minutes-to-seconds conversion never applied?
  → because the unit lives only in a comment, never in an identifier or an assertion,
    so nothing in the code or the tests carries the contract
    (evidence: chunker.py:212 — `# Heuristic: estimate 150 WPM`; the name is the
     unitless `estimated_duration`)

ROOT CAUSE: chunker.py:214 — `estimated_duration = max(total_words / 150.0, 1.0)`
  produces MINUTES and is consumed as SECONDS. The `* 60` is missing.
```

**Why This Occurs:**

The sibling path makes the seconds contract explicit — `services/video_ingest.py:86-87` divides
milliseconds by 1000 to reach seconds. The fallback path never states its unit anywhere a type
checker or a test can see it. `estimated_duration` is a unitless name; the only place "minutes"
appears is a comment two lines above.

**Code Location:**

```python
# app/backend/rag/chunker.py:211-220
transcript: str = video.get("transcript", "")
# Heuristic: estimate 150 WPM for YouTube transcripts
total_words = len(transcript.split())
estimated_duration = max(total_words / 150.0, 1.0)   # <-- MINUTES
step = estimated_duration / len(chunk_texts) if chunk_texts else 0.0

results: list[dict] = []
for i, content in enumerate(chunk_texts):
    start_s = round(i * step, 2)                     # <-- consumed as SECONDS
    end_s = round((i + 1) * step, 2)
```

**When introduced:** `git blame` puts lines 209-222 in `317280a` (Cole Medin, 2026-05-16) — the
initial commit. This is **original behavior, not a regression**. Risk of the fix breaking a downstream
expectation is correspondingly low: nothing was ever built against correct values.

**Why it survived:**

`tests/test_chunker_timestamps.py:59-101` is the only test in the backend that calls the real
function. It asserts monotonicity (`:69-70`) and `end >= start` (`:81`) — both hold perfectly under a
uniform 60x scale. The correct answer is sitting in the test's own comment: `:64` reads
`# ~2 min at 150 WPM` for a 300-word transcript, while the code returns a **2.0-second** span.

Every other reference mocks the function at the route boundary with hand-built dicts
(`test_chunk_timestamps.py:172`, `test_admin.py`, `test_channel_sync.py`, `test_video_ingest.py`,
`test_ingest_cache_invalidation.py`). **No test anywhere asserts an absolute magnitude in seconds.**

### Related Issues

- Issue #112 / PR #100 — the timestamped-chunk pipeline whose `force=true` re-ingest lever is the
  correct backfill mechanism (see Risks below)

## Impact Assessment

**Scope:**

Every video whose transcript source returns plain text rather than timed segments. The fallback fires
at four call sites:

- `routes/channels.py:255` (channel sync)
- `routes/ingest.py:143` and `:257` (manual ingest)
- `routes/admin.py:109` (admin library add)

**Affected Features:**

- Citation chips (`Message.tsx:45`, `:63`)
- Citation modal embedded player (`CitationModal.tsx:32-41`)
- Markdown export deep-links (`exportMarkdown.ts:41`)
- LLM-facing `[mm:ss]` markers in tool results (`rag/tools.py:237-238`, `:360-361`)

Verified that **no layer rescales** the value between the chunker and these surfaces:
`db/repository.py` stores and returns it verbatim, hybrid retrieval passes it through, `rag/tools.py`
and the frontend consume it directly as seconds.

**Severity Justification:**

High. RAG Pipeline Invariant #6 ("Citations must include ... exact-timestamp deep-link") is broken for
an entire ingestion path, with no user-side workaround, and the bad values are persisted. Held below
Critical because nothing crashes, retrieval quality and ranking are untouched (timestamps are not part
of the RRF scoring), and there is no security or data-loss dimension.

**Data/Security Concerns:**

No security implications. The data concern is limited: already-ingested rows carry wrong values and
are not self-correcting — see the backfill note under Risks.

## Proposed Fix

### Fix Strategy

Convert the rate to a per-**second** constant and name the unit into the identifiers, so the contract
is visible in the code rather than in a comment. Then pin the magnitude in tests at two different word
counts so the test proves the *rate*, not one constant.

This is a **unit fix, not a redesign.** The estimate cannot be replaced with a real duration: the
fallback fires precisely when the source carries no timing data (`video_ingest.py:78-80` — `segments`
is initialised `[]` and never populated on the plain-string branch). There is no ground-truth duration
in the system: no `duration` column exists in any migration, and `youtube_meta.py:95` requests
`part=snippet`, not `contentDetails`. Fetching a real duration is a separate ticket.

### Files to Modify

1. **`app/backend/rag/chunker.py`**
   - Changes: introduce a module-level `_ESTIMATED_WORDS_PER_SECOND = 150.0 / 60.0`; rename
     `estimated_duration` → `estimated_duration_seconds` and `step` → `step_seconds`; divide by the
     new constant; correct the `# 150 WPM` comment and the docstring to state the unit.
   - Reason: produces seconds, and encodes the unit in the identifier so the next reader — and the
     next test — cannot lose it the same way.

2. **`app/backend/tests/test_chunker_timestamps.py`**
   - Changes: add absolute-magnitude assertions at **two** word counts (3000 words ≈ 1200 s, 750 ≈
     300 s). Assert the **total span** (`result[-1]["end_seconds"]`), not a per-chunk value. Fix the
     stale `# ~2 min at 150 WPM` comment at `:64`.
   - Reason: two magnitudes pin the rate rather than one constant; asserting the total span keeps the
     test alive across changes to the chunk-count heuristic.

**No call site needs changing.** `channels.py:255`, `ingest.py:143`/`:257`, and `admin.py:109` all
already treat these fields as seconds, as do `db/`, retrieval, `rag/tools.py`, and the frontend.

### Alternative Approaches

- **Multiply by 60 inline** (`max(total_words / 150.0, 1.0) * 60`) — smallest possible diff, but
  leaves the unit invisible in the identifier, which is exactly what caused the bug. Rejected.
- **Fetch the real video duration and distribute against it** — correct in principle, but impossible
  here: the fallback is defined by the absence of timing data, and no duration source exists in the
  system. Belongs in its own ticket.

### Risks and Considerations

- The `max(..., 1.0)` floor is currently 1.0 **minute**; after the fix the natural floor is 1.0
  **second**. Keep the floor on the seconds value so a near-empty transcript still yields a positive
  span and monotonicity holds.
- Existing rows are **not** retroactively corrected. A blanket
  `UPDATE chunks SET start_seconds = start_seconds * 60` would be **wrong** — rows carry no provenance
  marker distinguishing fallback-estimated from segment-derived timestamps, so it would corrupt
  everything `chunk_video_timestamped` produced correctly. The right lever already exists:
  `POST /api/channels/sync?force=true` re-fetches and atomically replaces chunks via
  `replace_chunks_for_video`, and its docstring (`channels.py:70-77`) records it was built for exactly
  this class of situation once before (issue #112). **Out of scope for this fix — worth its own ticket.**
- No breaking changes. No API contract, schema, or SSE-format change.

### Testing Requirements

**Test Cases Needed:**
1. 3000-word transcript → final `end_seconds` ≈ 1200 s (verifies the fix; tolerance for rounding)
2. 750-word transcript → final `end_seconds` ≈ 300 s (second magnitude — pins the rate, not a constant)
3. Existing monotonicity / `end >= start` / snippet / empty-transcript tests still pass (no regression)
4. Edge case: a very short transcript still yields `end_seconds > start_seconds` (floor behavior)

**Validation Commands:**

```bash
cd app/backend
uv run pytest tests/test_chunker_timestamps.py -xvs
uv run pytest tests -x -q
uv run ruff check .
uv run ruff format --check .
uv run mypy .
```

## Implementation Plan

1. Add `_ESTIMATED_WORDS_PER_SECOND = 150.0 / 60.0` near the top of `rag/chunker.py`
2. Rewrite `chunk_video_fallback` lines 212-215 to compute in seconds with unit-bearing names; update
   the comment and the docstring
3. Add the two magnitude assertions to `TestChunkVideoFallback` and fix the stale `:64` comment
4. Run the full backend validation suite
5. Commit on a fix branch, open a PR noting that backfill is deliberately out of scope

This RCA document should be used by the `piv-implement-issue` skill.

## Next Steps

1. Review this RCA document
2. Run the `piv-implement-issue` skill with issue #8 to implement the fix
3. Run the `piv-commit` skill after implementation is complete
