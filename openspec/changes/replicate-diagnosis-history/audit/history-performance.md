# History read performance gate (task 3.1)

Evidence for history-read-contract.md §"Examples and performance gate" on the
task 2.1 read API. Local Docker Postgres (`ai_tutor_deletion_live`, migrated to
`0034`), ASGI HTTP through the real app with a stubbed session.

Reproduce:

```bash
cd app/backend
WORKSPACE_LIVE_TEST_DSN="postgresql://dynachat:...@localhost:5433/ai_tutor_deletion_live" \
  uv run pytest tests/test_patient_dental_history_volume_live.py -q -p no:randomly -s
```

## Dataset

| Rows | Count |
|---|---|
| Condition resources / revisions | 2,500 / 5,000 |
| Procedure resources / revisions | 2,500 / 5,000 |
| Total scoped revisions | **10,000** |
| Events on the selected clinical day (2026-08-15) | 600 |
| Tombstoned records (counted, never returned) | 60 |
| Condition states | active / active / resolved cycle |
| Procedure states | existing / planned / performed / cancelled cycle |

Seeded with `COPY`, then `ANALYZE`; the test asserts `total_events = 10,000`,
day `total_events = 600`, `counts.records = 4,940`, `deleted_records = 60`, and
fingerprints of all six scoped tables before/after the measured window.

## Timed gate (warm 5×, then 20 requests per shape, limit=100)

| Shape | p50 | p95 | max |
|---|---:|---:|---:|
| events unfiltered page 1 | 0.042 s | 0.106 s | 0.114 s |
| events unfiltered page 2 (cursor) | 0.043 s | 0.106 s | 0.123 s |
| events day page 1 | 0.037 s | 0.101 s | 0.103 s |
| events day page 2 (cursor) | 0.048 s | 0.105 s | 0.106 s |
| snapshot current | 0.080 s | 0.160 s | 0.161 s |
| snapshot as-of (2026-08-15) | 0.071 s | 0.137 s | 0.139 s |

Acceptance is p95 ≤ 1000 ms; the worst shape is 160 ms. The first measurement
round without a post-`COPY` `ANALYZE` showed a 4.6 s outlier from auto-analyze
contention, which is why the test settles statistics before warming.

## Statement counts (no N+1)

Every measured request executes a constant number of repository statements,
asserted per shape: **5** for events (parent lock, `now()`, page, total,
epoch/coverage) and **4** for snapshots (parent lock, `now()`, latest-per-resource,
epoch/coverage) — independent of page size, dataset size or resource count.

## Query plans (EXPLAIN ANALYZE, all loops = 1)

- `events` unfiltered page 1: `Limit → Sort → Append(Hash Join ×2)` over one
  sequential scan of each revision table (5,000 rows) — 5.2 ms. The contract's
  epoch hashes every scoped revision id, so one full scan per request is the
  designed read, not a per-item rescan.
- `events` day page 1 / page 2: `Limit → Sort → Append` where each arm reaches
  the revisions through `ix_patient_condition_revisions_history` (Bitmap Index
  Scan) and `ix_patient_treatment_revisions_history` (Index Scan) — ~1.0–1.3 ms.
- `events` day total: one indexed arm per revision table (~0.9 ms).
- `snapshot` current / as-of: `Sort → Append(Unique → Sort(Hash Join))` over one
  scan per revision table, 5,000 rows each — 6.4 ms / 8.3 ms.
- `coverage`/epoch: one pass over both revision tables (5,000 + 5,000) — 3.4 ms.

No plan node over a revision table has `Actual Loops > 1`, and the migration
`0034` indexes are the access path for every selected-day read. The unfiltered
and epoch reads deliberately scan the scoped revision set once per request; the
partial `ix_patient_*_revisions_history` indexes are used wherever a day bound
exists.
