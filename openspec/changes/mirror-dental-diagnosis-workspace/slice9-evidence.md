# Slice9 evidence

Date: 2026-10-07. Tasks: 1.9, 2.9, 3.10. Requirements: N1–N5, W5, W6, W8.

## Implementation

- Migration0028 expands the0027 execution-note table to diagnosis and treatment-plan contexts. Existing treatment-note IDs, execution links, revisions and receipts remain intact. New composite patient/plan foreign keys and anatomical checks enforce context ownership. The execution-note foreign key is deferred so complete patient fixture cleanup can cascade both notes and stages.
- `patients/clinical_notes.py` owns strict commands, blank Spanish templates and an injectable command adapter. `db/patient_clinical_notes_repo.py` commits note, revision and operation receipt together. Body edits preserve entity/tooth links; deletion is logical. Repeated operation IDs replay their original snapshot before revision checks; changed payloads fail409.
- `routes/patient_clinical_notes.py` provides authenticated templates, combined20-item feeds, note reads, body-only edits, deletion and bounded history. General notes remain their original resource and appear as administrative entries. Validation responses omit private note input.
- `useDentalClinicalNotes` owns one draft/feed, candidate, binding, edit/deletion targets, revision comparison and frozen retry. Chart leave preserves the candidate; same-tooth reentry preserves unchecked binding; a different tooth re-enables binding. Card/record highlighting does not change the candidate.
- Diagnosis, procedure and plan contexts use the same editable composer and typed cards. Rail/Sheet changes preserve state without a second composer or fetch. Actual patient/mode/entity changes guard work; read-only inspection and tool intent preserve an unsaved note without forcing a save.
- Deletion review and recovery remain in the hook across layout changes. A stale deletion requires review of the current version before a new confirmation. Failed validation permits text correction; uncertain responses retain exact command identity.

## Verification

| Command / proof | Result |
|---|---|
| First `uv run pytest tests/test_patient_dental_notes.py -x` | Expected failure: absent route returned404 instead of401 |
| Fresh isolated `alembic upgrade head` |0001–0028 passed |
| `uv run pytest tests/test_patient_dental_notes.py tests/test_patient_clinical_plans.py tests/test_patient_treatments.py -xq --disable-warnings` with isolated `TREATMENT_TEST_DATABASE_URL` |38 passed |
| New note hook/card/composer tests |7 passed within full Vitest |
| `bun run tsc --noEmit` / `bun x biome check src` | Passed |
| `bun run test` |789 passed,91 files |
| `uv run ruff check .` / `uv run ruff format --check .` / `uv run mypy .` | Passed |
| Docker build and startup | Passed on Python3.11 runtime |
| `bun x playwright test tests/patient-dental-notes.spec.ts --project=workspace --no-deps` |2 passed, including Slice9 and Slice7 |

Real PostgreSQL proofs cover bound/unbound creation, body-only editing, stale snapshots, exact replay after later changes/deletion, owner denial, authorized typed entity links, logical deletion/history,21-note paging and injected snapshot failure with zero row/revision/receipt residue. A general note created through its incumbent API still reads unchanged and appears administratively in the combined feed.

The browser proof uses an owned disposable app on `http://localhost:8009` and a separate pgvector16 database on port5549. It saves only synthetic patients. It appends a blank Caries template to existing text, inspects without saving a dirty note, retains an unchecked16 association across rail/Sheet, blocks a mode change, aborts a committed create response and retries the exact payload, reviews a two-client edit conflict, deletes and reloads, and verifies four retained revisions. Rendered tests separately prove body-only16 linkage while17 is entered, multi-member highlighting,280-character expansion, incomplete-page handling, stale deletion review and exact deletion replay.

## Evidence and reproduction

- Browser source: `app/frontend/tests/patient-dental-notes.spec.ts`.
- Capture: [narrow editable notes](evidence/slice9-narrow-notes.png).
- Persisted synthetic IDs and receipt checks are attached to the Playwright run as `slice9-identities`.
- Set `E2E_BASE_URL=http://localhost:8009`, `E2E_PROOF_USER` and `E2E_PROOF_PASSWORD` for the owned fixture. Reuse fixture credentials between reruns; the test creates fresh valid synthetic RUTs. Verify the existing `evidence/` directory before running capture commands.
- Real-DB tests opt out of the default pool stub with their own asyncpg pool. No shared runtime database or reference patient is modified.
- After verification, owned `dental-slice-app`, `dental-slice9-proof` (including its anonymous fixture volume) and `dental-slice-proof` network were removed. Captures remain in this change; the local build image remains cached.

## Remaining gates

The unrestricted backend run still fails `test_bundled_workspace_reproduces_reviewed_catalog` on LF-generated versus CRLF-checked-out catalog bytes. A separate run with only that known test deselected passed962, skipped166 and deselected1. This is not an unrestricted full-suite pass.

All-resource activity/deep-link integration, legacy retirement, final documentation and application rollback release proof retain their later tasks. Gate3.9 remains unchecked. This slice performs no spec sync or archive.
