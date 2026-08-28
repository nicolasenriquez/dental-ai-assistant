# Fix Implementation Summary

**GitHub Issue #8**: `chunk_video_fallback` treats minutes as seconds, so every fallback timestamp is 60x too small

**Issue URL**: https://github.com/dynamous-community/ai-tutor/issues/8

**Root Cause** (from RCA): `chunker.py:214` computed `total_words / 150.0` — a per-**minute** rate, yielding **minutes** — and wrote it into `start_seconds` / `end_seconds`, whose contract is **seconds**. The `* 60` was missing.

**Drift check**: Clean. `chunker.py:211-220` and `test_chunker_timestamps.py:59-101` matched the RCA's snippets and line refs exactly. Implemented as specified.

## Changes Made

**Files Modified:**

1. **`app/backend/rag/chunker.py`** (+14 / -8)
   - Added module-level `_ESTIMATED_WORDS_PER_SECOND = 150.0 / 60.0` (lines 28-32), with a comment stating that seconds is the downstream contract.
   - `chunk_video_fallback` (lines 217-226): `estimated_duration` → `estimated_duration_seconds`, `step` → `step_seconds`, now dividing by the new per-second constant. The unit is carried by the identifier, not just a comment.
   - Kept the `max(..., 1.0)` floor on the **seconds** value (per the RCA's risk note), so a near-empty transcript still yields a positive, monotonic span.
   - Docstring now states timestamps are estimated from a 150 WPM rate and emitted in **seconds**.

2. **`app/backend/tests/test_chunker_timestamps.py`** (+44 / -1)
   - Added `pytest` import for `pytest.approx`.
   - Fixed the stale `# ~2 min at 150 WPM` comment at `:64` → `# 300 words = ~2 min = ~120 s at 150 WPM`.

**No call sites changed.** `channels.py:255`, `ingest.py:143`/`:257`, `admin.py:109`, `db/`, retrieval, `rag/tools.py`, and the frontend all already treat these fields as seconds.

## Tests Added

**`app/backend/tests/test_chunker_timestamps.py`** — 3 new cases in `TestChunkVideoFallback`:

1. `test_issue_8_total_span_is_seconds_not_minutes` — 3000 words → final `end_seconds` ≈ 1200 s (was 20 s)
2. `test_issue_8_span_scales_with_word_count` — 750 words → ≈ 300 s (second magnitude pins the *rate*, not one constant)
3. `test_very_short_transcript_floors_span_at_one_second` — 2-word transcript → span is exactly 1.0 s, proving the floor is one second rather than one minute

Both magnitude tests assert the **total span** (`result[-1]["end_seconds"]`) rather than a per-chunk value, so they survive changes to the chunk-count heuristic. Each fails against the pre-fix code by exactly 60x.

**Test Coverage:**
- ✅ Fix verification test (two independent magnitudes)
- ✅ Edge case test (floor behavior)
- ✅ Regression prevention (existing monotonicity / `end >= start` / snippet / empty-transcript tests unchanged and passing)

## Validation Results

```bash
$ uv run pytest tests/test_chunker_timestamps.py -q
11 passed in 2.39s

$ uv run pytest tests -q
364 passed, 67 skipped in 14.20s

$ uv run ruff check .
All checks passed!

$ uv run mypy .
Success: no issues found in 91 source files

$ uv run ruff format --check .
Would reformat: integrations\circle.py
1 file would be reformatted, 90 files already formatted
```

**Note on `ruff format --check`:** the single failure is `integrations/circle.py`, which this fix never touched — it is pre-existing on the branch. Left alone deliberately (out of scope for this issue); worth its own cleanup commit.

## Verification

Re-ran the RCA's exact reproduction against the fixed function:

```
words=  750 chunks=  4 first=0.0->75.0    last_end=  300.0 expected=  300.0s ratio=1.00
words= 3000 chunks= 16 first=0.0->75.0    last_end= 1200.0 expected= 1200.0s ratio=1.00
words= 9000 chunks= 52 first=0.0->69.23   last_end= 3600.0 expected= 3600.0s ratio=1.00
```

The ratio was **exactly 60.00** at every magnitude before the fix; it is now **exactly 1.00**.

- ✅ Followed reproduction steps — issue resolved
- ✅ Tested edge cases (floor, empty transcript) — all pass
- ✅ No new issues introduced — full suite green
- ✅ Original functionality preserved — monotonicity and `end >= start` still hold

## Deviations from the RCA

One, minor and test-only:

- The RCA's testing requirement #4 called for "a very short transcript still yields `end_seconds > start_seconds`." My first attempt used a one-word transcript, which returns `([], True)` — `chunk_video` produces **zero** chunks for it, because `_build_docling_document` labels a single line ≤80 chars as a `SECTION_HEADER`, which HybridChunker drops. The function bails at the `if not chunk_texts` guard before the floor is ever reached. Changed the fixture to `"word\nword"` (a newline makes it a `PARAGRAPH`), which is the smallest input that both chunks and binds the floor (2 words / 2.5 wps = 0.8 s → floored to 1.0 s). The assertion was strengthened to pin the exact floor value.

Implementation otherwise matches the RCA exactly.

## Out of Scope (per RCA)

Existing `chunks` rows are **not** retroactively corrected. A blanket `UPDATE chunks SET start_seconds = start_seconds * 60` would be wrong — rows carry no provenance marker distinguishing fallback-estimated from segment-derived timestamps, so it would corrupt everything `chunk_video_timestamped` produced correctly. The correct lever is `POST /api/channels/sync?force=true`, which re-fetches and atomically replaces chunks. **Deserves its own ticket.**

## Files Summary

- 2 files modified (1 source, 1 test)
- 0 files created
- 58 lines added, 9 lines removed

## Ready for Commit

All changes complete and validated. Ready for the `piv-commit` skill.

**Suggested commit message:**

```
fix(rag): convert fallback chunk timestamps from minutes to seconds

chunk_video_fallback derived its span from a per-minute word rate but
wrote the result into start_seconds/end_seconds, so every timestamp on
the no-segments ingest path was 60x too small — citation deep-links and
the embedded player landed at ~0:00 regardless of the real position.

Encode the unit in the constant and the identifiers rather than a
comment, and pin the magnitude in tests at two word counts so the tests
prove the rate rather than one constant. Backfill of already-ingested
rows is deliberately out of scope (no provenance marker distinguishes
estimated from segment-derived timestamps).

Fixes #8
```
