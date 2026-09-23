## 0. Investigation and Scope Lock

- [x] 0.1 Map the current clinical submit, runtime scope, tool loop, draft generation, SSE, artifact, approval, and persistence path and identify the highest existing implementation and test Seams.
  Traceability: locks `clinical_assistant.service` tool handlers as the routing Seam and existing agent/generation contract tests as the highest observable test Seam.
  Notes: verified on `feat/ai-assisted-evolutions`; owner/patient identity is runtime-bound, writes are approval-gated, and assistant draft generation currently reloads history independently.

- [x] 0.2 Compare the video RAG and clinical data paths and exclude unsafe reuse of global video chunks, English FTS, video citations, and membership filtering for patient evidence.
  Traceability: prevents the proposed feature from widening into generic RAG or applying non-clinical authorization to patient history.
  Notes: only PostgreSQL infrastructure, Alembic patterns, provider boundary, SSE framing, and bounded tool loop are reusable; clinical storage and transport remain separate.

- [x] 0.3 Audit detached turn execution, persisted outcomes, Stop, stream termination, hydration, activity ownership, tool-budget exhaustion, and Drive export boundaries; classify minimal reuse versus lifecycle follow-up.
  Traceability: locks runtime-polish scope to existing turn runner, thread hydration, activity items, approval artifacts, and export state before implementation planning.
  Notes: subscriber loss does not cancel workers; unexpected SSE reader errors skip hydration; activities are ephemeral; cancellation persists after claim; canonical save and Drive export are already separated; durable replay/job infrastructure requires follow-up.

## 1. Contract Coverage (Failing First)

### New Fail-First Contracts

- [ ] 1.1 Add catalog synchronization tests that fail for structural language assignment (`term=es`, `term_en=en`, `aliases[]=und`) with no guessing; exact canonical JSON digest bytes; digest mismatch; source/schema validation; rollback; advisory locking; unchanged version/checksum no-op; changed reviewed checksum sync; within-concept dedupe; cross-concept collision preservation; removed-concept inactivation; reactivation by stable concept ID; and startup failure when any allowlisted alias is missing, inactive, or ambiguous.
  Traceability: first proof for Curated terminology catalog and Conservative batched terminology resolution requirements.

- [ ] 1.2 Add resolver tests that fail until exact preferred/alias lookup handles `dental crown` / `root canal` / `endodoncia` ambiguity and `braquet` / `bráquet` normalization; inputs shorter than five normalized characters or acronym-shaped originals skip fuzzy search (`TMD` not `TAD`, `TMJ` not `TMD`, `PD` not `PS`); ratio below `0.88` returns no candidate; eligible fuzzy results contain at most three concepts ordered by ratio then concept ID and never return `matched`; batches accept one through eight raw terms, count duplicates before dedupe, and reject a ninth without truncation.
  Traceability: first proof for Short-token / acronym fuzzy exclusion, fixed fuzzy candidate policy, fixed batch bound, and non-authoritative resolution.

- [ ] 1.3 Add clinical agent routing tests that fail until `lookup_dental_terms` accepts the fixed eight-term batch, one `TOOL_PRESENTATION_POLICY` maps it to `silent` with no parallel quiet set, redundant `get_patient_context` is absent, conditional history routing works, and normal clarification remains possible for ambiguous, unknown, or runtime-failed terminology.
  Traceability: first proof for Runtime-scoped multi-capability routing and Quiet terminology support requirements using existing `test_clinical_agent.py` prior art.

- [ ] 1.4 Add service and generation tests that fail until self-contained assistant drafts issue no history query; only reviewed `TAD`, `TMJ`, `CBCT`, and `BOP` can pre-resolve at exact token boundaries without a tool call; non-allowlisted uppercase, generic, ambiguous, and substring aliases do not; turn grounding resets/caps/deduplicates evidence; terminology cannot create patient facts; and manual generation retains existing bounded-history behavior.
  Traceability: first proof for Reviewed terminology pre-resolution, Bounded turn grounding, and Epistemically separated grounding while protecting the existing manual `patient-dental-evolutions` contract.

- [ ] 1.5 Add owner/patient isolation tests that fail if another owner's or another patient's evolution can enter turn-local evidence or drafting input.
  Traceability: first security proof for runtime-owned identity and zero cross-patient evidence leakage.

- [ ] 1.6 Add deterministic mocked clinical scenarios that fail for known/unknown terminology, self-contained/history-dependent drafting, quiet terminology, semantic activity classification/labels, short-work chrome suppression, and unexpected reader/network failure hydration, including golden input `TAD en IZC` with matched `TAD`, `not_found` `IZC`, and no invented expansion.
  Traceability: first end-to-end proof that grounding improves the patient workflow without exposing internal tools or changing persistence controls.

### Regression Locks

- [ ] 1.7 Add preservation tests for immediate optimistic local echo, detached worker survival after subscriber/component loss, existing clean EOF/abort/remount/reload hydration, artifact final-prose suppression, approval-gated persistence, and artifact priority over completed activity.
  Traceability: regression locks for current `clinical-agentic-feedback`, turn-runner, and approval behavior; these tests are expected to pass before grounding implementation.

- [ ] 1.8 Add regression tests proving canonical save responds before external Drive I/O, composer unblocks while export remains pending, post-save export failure stays local/retryable, and Drive workspace close/reopen does not cancel the clinical turn.
  Traceability: regression locks for existing canonical persistence and secondary Drive behavior; these tests are expected to pass before grounding implementation and do not modify Drive capability requirements.

### May-Fail Hardening

- [ ] 1.9 Verify current behavior first, then add integration tests for Stop during new history/terminology/draft paths, duplicate UI Stop suppression, completion-versus-Stop hydration, compound four-call budget and exhaustion recovery, component remount/reload during new grounding, stable scrolled-away viewport, and activity transitions around new tools.
  Traceability: hardens new paths against existing runtime contracts without assuming every case fails before implementation or redesigning cancellation lifecycle.

## 2. Implementation

### Terminology Foundation

- [ ] 2.1 Add Alembic migration `0018` for `clinical_terms` and `clinical_term_aliases`: non-unique preferred lookup indexes, `UNIQUE(term_id, normalized_alias, language)`, non-unique `(normalized_alias, language)` lookup index, schema-version/checksum metadata, `status` constrained to `active|inactive`, and `TIMESTAMPTZ` timestamps.
  Traceability: establishes the minimal relational source of truth required by Curated terminology catalog without adding embeddings or another database.

- [ ] 2.2 Commit supplied `dental_ai_glossary_es_cl_v1.json` as versioned backend data and implement transactional synchronization that assigns `term=es`, `term_en=en`, and `aliases[]=und` without inference; normalizes then deduplicates aliases within concept/language; preserves cross-concept collisions; derives descriptive alias types; validates source references and dataset structure; and treats retrieval/embedding recommendations as non-normative metadata.
  Traceability: loads exactly the reviewed global catalog, validates concept/source/alias integrity, and makes catalog availability deterministic on fresh deployments.

- [ ] 2.3 Commit reviewed expected SHA-256 beside dataset; hash validated JSON serialized with sorted object keys, compact separators, Unicode UTF-8, preserved array order, no BOM/newline; compare digest before database work; serialize synchronization with advisory lock; skip matching schema-version/checksum; atomically upsert present concepts active, replace their aliases, mark absent concepts inactive without deleting identity/provenance, reactivate returning IDs; validate every auto-ground alias resolves exactly to one active concept; and fail startup safely on any invariant or sync failure.
  Traceability: satisfies explicit fail-closed deployment catalog availability and prevents partial or silently inconsistent clinical grounding.

- [ ] 2.4 Implement typed terminology resolution in `app/backend/clinical_assistant/terminology.py` with `MAX_TERMINOLOGY_TERMS=8`, `FUZZY_MIN_RATIO=0.88`, and `FUZZY_MAX_CANDIDATES=3`; collect active exact candidates across preferred ES/EN and `und` aliases; reject a ninth raw term; dedupe normalized inputs/results; skip fuzzy below five characters or for acronym-shaped originals; rank fuzzy concepts by ratio descending then concept ID; and return `matched|ambiguous|not_found` outcomes.
  Traceability: implements Conservative batched terminology resolution without dependencies, vector search, or model-generated definitions.

### Clinical Runtime Grounding

- [ ] 2.5 Add `lookup_dental_terms` with schema-enforced `1..8` batch arguments, remove redundant model-facing `get_patient_context`, retain concrete handler patient checks, and keep `MAX_CLINICAL_TOOL_CALLS = 4`.
  Traceability: implements bounded terminology routing and Clinical tool budget at the existing model-tool Adapter without duplicating presentation policy or changing clinical SSE/frontend state types.

- [ ] 2.6 Create fresh typed turn grounding in `clinical_assistant.service`, seed it only from exact token-boundary unique matches in reviewed `AUTO_GROUND_ALIASES = {"TAD", "TMJ", "CBCT", "BOP"}`, cap patient evidence at three and deduplicate by evolution ID, accept matched-only terminology deduplicated by concept ID, and use authenticated owner/active-patient context exclusively.
  Traceability: implements Reviewed terminology pre-resolution, Bounded turn grounding, Runtime-scoped multi-capability routing, and zero cross-patient leakage at the highest existing Seam.

- [ ] 2.7 Expand structured draft generation to accept explicit labeled grounding from Clinical Assistant while preserving omitted-grounding behavior for manual evolution generation.
  Traceability: implements CURRENT_INPUT, PATIENT_EVIDENCE, and TERMINOLOGY_EVIDENCE separation without changing the existing manual generation contract.

- [ ] 2.8 Harden clinical prompt and tool descriptions so history is requested only for explicit longitudinal dependency, unknown terminology is preserved or clarified, historical facts remain historical, and terminology cannot create patient facts; preserve existing runtime suppression of redundant prose after draft/approval effects.
  Traceability: enforces Epistemically separated grounding and Grounding cannot authorize persistence at model-facing routing interfaces.

- [ ] 2.9 Add allowlisted structured logs for capability/presentation class, latency, call count and budget exhaustion, evidence counts, terminology outcome, cancellation/reconciliation outcome, artifact outcome, retry count, and bounded failure class without raw clinical payloads, tool arguments, provider text, or hidden reasoning.
  Traceability: implements Grounding observability protects clinical privacy using existing logging conventions and no hidden reasoning capture.

### Agentic Runtime Polish

- [ ] 2.10 Replace uniform tool activity handling with sole `TOOL_PRESENTATION_POLICY` mapping `lookup_dental_terms=silent`, `get_recent_evolutions=progress`, `create/update_evolution_draft=artifact`, and `prepare_evolution_save=human_gate`; derive quiet behavior only from `silent`, add no parallel quiet set, retain domain-semantic labels, and keep existing Drive state as secondary background domain state.
  Traceability: modifies `clinical-agentic-feedback` Structured activity presentation without a generic framework, new event type, arbitrary UI component, or Drive behavior change.

- [ ] 2.11 Update existing clinical activity rendering/reducer behavior so running work remains truthful and compact, silent/short work adds no chrome, completed activity yields priority to artifact/approval content, and current viewport-follow behavior remains stable.
  Traceability: modifies `clinical-agentic-feedback` Structured activity presentation through existing `ClinicalActivity`, artifact, and transcript seams without a second client runtime.

- [ ] 2.12 Reconcile unexpected SSE/reader failures through existing thread hydration before setting failed/retry UI state, rendering persisted completion/failure or continuing existing active-turn polling while preserving detached-worker behavior with no replay endpoint or run table.
  Traceability: modifies `clinical-agentic-feedback` Live and hydrated artifacts converge at the existing client reconciliation Seam.

## 3. Verification

- [ ] 3.1 Run focused terminology migration, repository, synchronization, and resolver tests against mocked and live PostgreSQL seams where applicable.
  Traceability: proves catalog integrity, deterministic lookup, and transaction behavior directly.

- [ ] 3.2 Run focused clinical agent, generation, assistant contract, turn-runner, repository live, approval, persistence, cancellation, tool-budget, telemetry-field, and reconciliation tests and confirm no direct-write or cross-patient regression.
  Traceability: proves runtime routing, epistemic separation, and clinical safety boundaries directly.

- [ ] 3.3 Run focused frontend unit tests and mocked Playwright W01-W12-equivalent clinical flows for local echo, short/long work, quiet terminology, stable scroll, Stop, stream interruption/hydration, remount/reload, Drive close/reopen, and post-save export independence; inspect snapshots/accessibility output and confirm artifacts remain dominant.
  Traceability: proves user-visible workflow behavior without substituting UI screenshots for backend contract proof.

- [ ] 3.4 Run full backend Ruff, formatting, mypy, and pytest plus frontend TypeScript, Biome, Vitest, and clinical Playwright validation.
  Traceability: closes repository-wide regression risk after focused proofs pass.

## 4. Release Hygiene and Closeout

- [ ] 4.1 Update `app/backend/clinical_assistant/README.md` and operational documentation for shipped catalog synchronization, grounding ownership, presentation taxonomy, reconciliation behavior, safe telemetry, and explicit `improve-clinical-run-lifecycle` follow-up boundaries.
  Traceability: keeps durable architecture and deployment guidance aligned with verified runtime behavior.

- [ ] 4.2 Record dataset schema/version, source provenance, paraphrased-definition policy, and completed licensing/distribution review; do not release catalog data while provenance review remains unresolved.
  Traceability: mitigates terminology source quality and redistribution risk before production release.

- [ ] 4.3 Re-run `openspec validate improve-clinical-grounding` and prepare delta-spec synchronization/archive evidence without archiving before implementation verification is complete.
  Traceability: keeps proposal, design, tasks, and capability contract aligned at closeout.

## Execution Order

### Slice 1 — Terminology foundation
- Tasks: `0.2 -> 1.1 -> 1.2 -> 2.1 -> 2.2 -> 2.3 -> 2.4 -> 3.1`
- Checkpoint: a fresh database receives the validated catalog atomically and deterministic batch lookups return exact, ambiguous, or not-found outcomes.
- Blocks: Slice 2 — Clinical runtime grounding

### Slice 2 — Clinical runtime grounding
- Tasks: `0.1 -> 1.3 -> 1.4 -> 1.5 -> 2.5 -> 2.6 -> 2.7 -> 2.8 -> 2.9 -> 3.2`
- Checkpoint: self-contained assistant drafts do not load history, longitudinal requests can use only active-patient evidence, terminology remains non-patient evidence, and manual generation is unchanged.
- Blocked by: Slice 1 — Terminology foundation
- Blocks: Slice 3 — Workflow closure

### Slice 3 — Agentic runtime polish and workflow closure
- Tasks: `0.3 -> 1.6 -> 1.7 -> 1.8 -> 1.9 -> 2.10 -> 2.11 -> 2.12 -> 3.3`
- Checkpoint: mocked browser flows show quiet terminology, truthful compact activity, artifact dominance, coherent Stop, GET-based recovery after stream loss, stable scrolling, and non-blocking Drive side effects without new runtime infrastructure.
- Blocked by: Slice 2 — Clinical runtime grounding
- Blocks: Slice 4 — Full validation and release hygiene

### Slice 4 — Full validation and release hygiene
- Tasks: `3.4 -> 4.1 -> 4.2 -> 4.3`
- Checkpoint: full validation passes, provenance review is recorded, durable docs match shipped behavior, and OpenSpec remains valid.
- Blocked by: Slice 3 — Workflow closure
- Blocks: None
