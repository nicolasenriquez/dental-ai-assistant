# Slices 5–6 execution, 2026-10-03

Implemented the manual tooth-condition lifecycle and anatomical odontogram in the existing patient Clínica section. Selection changes a draft; only explicit Guardar writes. Activity is still pending in slice7.

## Context and scope

- Primed root rules, README, entry points, typed clients, existing notes and patient seams, design/product/UX contracts, surface briefs and OpenSpec context/contracts/reference.
- Initial branch `feat/ai-assisted-evolutions`, HEAD `c9a6c58`, clean worktree. Slices1–4 checkpoints were complete. Alembic had a single head0021.
- Serial execution:1.6 →2.10 →2.11 →3.5 →1.7 →2.12 →2.13 →3.6. Traceability is the manual-condition/API/chart requirements; this plan has no linked issue IDs or SDLC group map. No issue synchronization requested.
- Static condition catalog is mounted before the patient UUID catch-all. Existing auth, evolution approval, Drive and Assistant runtime remain the owning boundaries.

## Slice5

Changed backend `patients/conditions.py`, `db/patient_conditions_repo.py`, `routes/patient_conditions.py`, `main.py`, migration `0022_patient_conditions.py`, frontend `lib/api.ts`, `PatientDiagnosis.tsx`, `PatientConditionHistory.tsx`, `PatientDetail.tsx` and scoped tests.

Migration0022 adds owner/parent constrained conditions and JSONB revisions, canonical surface/FDI/catalog checks, active partial uniqueness and revision/index constraints. Downgrade preserves expanded clinical records. Applied only to the isolated E2E database; the ordinary local app/database was not migrated. Resource and revision commit together. Actor display names are null because the current authorized user schema has no display-name field; there is no email fallback.

Fail-first evidence: missing catalog422, two real-Postgres condition HTTP tests405, editor import absent. Subsequent proof covers create/edit/resolve, recurrence with a fresh UUID, owner/parent/foreign-UUID404, strict422, creation-snapshot retry after later edits, no-op/PATCH retry and revision conflicts, concurrent same/different UUIDs, partial-unique update conflicts without partial writes, overlapping surface sets, exact/bounded reads, cursor filtering and exhausted-page totals. Injected history failure rolls back both create and PATCH. PostgreSQL rejects noncanonical arrays independently of HTTP validation.

The list/editor was verified in the production browser before chart implementation: no selection writes, committed POST with aborted response and identical retry/one revision, remote conflict plus explicit rebase, resolution draft, tab guard with remain, explicit save/history and exact deep focus. `slice5-list-1440.png` was inspected at this checkpoint.

## Slice6

Added patient-domain `toothGeometry.ts`, `ToothDrawing.tsx`, `ConditionSymbol.tsx`, `PatientOdontogram.tsx` and its tests. Extended the same condition editor, not a separate draft store. Both exact FDI orders, four anatomical families, primary molars, mesial orientation and multiple active/resolved marks have component proof. Palette, diagram and list share symbols; resolved surfaces and symbols have dashed outlines and textual status.

Reads follow all bounded pages and deduplicate IDs. Failure preserves known records with an incomplete-read message and retry, never a false empty state. Exact deep links read the resource independently. The chart labels unconfirmed reads accordingly. All chart clicks and highlights remain local; hover/focus never picks a draft tooth.

At960px available diagnostic width, the300px inspector sits beside the chart; below that it stacks before the condition list. Narrow screens have a scaled arch overview, native44px FDI selector, enlarged selected tooth and named surface controls. Existing contextual Assistant reflow preserves the draft. New diagnostic controls do not float over the workflow.

Production review found and corrected41px selectors caused by rem scaling, oversized nested SVG marks and inverted surface placement. These are implementation corrections, not changes to the approved contract.

## Validation

| Check | Result |
| --- | --- |
| Backend Ruff lint and format | pass,201 files |
| Backend mypy | pass,201 source files |
| Host condition validation/cursor/auth contracts |3 passed |
| Isolated Python3.11/Postgres workspace suite |14 passed, includes4 condition live proofs |
| Full backend pytest |894 passed,112 skipped,1 pre-existing failure before supplemental auth test; auth test separately passes |
| Frontend TypeScript/Biome | pass |
| Focused diagnosis/odontogram tests |7 passed |
| Full frontend Vitest |623 passed,75 test files |
| Production frontend build | pass |
| Scoped Playwright |4 passed, including login setup |
| Diff whitespace check | pass |

The existing full-backend failure is `test_generation_constants_and_fail_closed_gate`: expected `anthropic/claude-sonnet-4.6`, configured `dots-studio/dots-3-note-preview:free`. The same setting is present at initial HEAD. It was already recorded by slices1–4; these slices do not change config or provider selection. Full release gate3.9 remains pending.

Inspected screenshots under `.playwright-cli`: slice6-chart-1440/1024/375/320, slice6-selected-375, slice6-context-1440, slice6-primary-1440, slice6-loading-1440, slice6-empty-1440, slice6-error-1440 and slice6-conflict-1440. They use synthetic test patients and actual rendered assets. Browser proof covers settled1440×900,1024×768,375×667 and320px viewports, no document overflow,44px selector, preserved draft with Assistant, guarded dentition change and direct record focus.

## Security review

All new endpoints use the existing session dependency; unauthenticated catalog/list/exact/revision/create/PATCH requests return401. Real two-owner/parent/foreign-UUID tests verify404 without disclosure. Actor IDs come from the session, mutable DTOs reject immutable/unknown fields, SQL values are parameterized and snapshots commit atomically. React renders notes as escaped text; drafts stay in React memory and typed POST/PATCH clients. No new provider, credentials or dependency was introduced. Existing CORS/cookie/security-header configuration remains unchanged.

## Remaining work and environment

Slice7 Activity is unlocked. Integrated gates3.8–3.9 and release tasks4.1–4.3 remain unchecked. PRODUCT/DESIGN/README/API release updates stay at their explicit4.1 gate. No new dependencies, generic event bus, chart inference or source patient import was added.

Existing local services and data are preserved. Isolated E2E services are stopped after verification; the synthetic database volume and screenshots remain for reproducibility. No commit or push requested.
