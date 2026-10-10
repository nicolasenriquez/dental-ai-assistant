## 0. Matching-checkout evidence

- [x] 0.1 Reproduce Assistant F02/F03/F06 using matching-checkout assets and synthetic intercepted APIs; record asset provenance, expected versus observed behavior and block all unhandled clinical/provider requests. Preserve the audit's different evidence levels and stop if the diagnosis contradicts the planned contract.
  Traceability: Assistant G0; F02/F03/F06; A04/A14/A15/A18; design evidence risk.
  Notes: Reproduced against checkout assets via `evidence/matching-checkout/reproduce-f02-f03-f06.cjs` (headless Chromium, all `/api/**` intercepted, unconfigured endpoints HTTP 501, unknown assets aborted). Served `index-hMjYLKeb.js` (sha256 07c571f3…) remapped to sanitized checkout `index-CNNUBSZj.js` (e38fa80b…) over identical `index-BzakEpcP.css` (2d88096…). Observed: F03 patient header (`Ana Prueba sintética`) present before and absent after removing the active patient; F02 note `Nota clínica sintética…` and Drive attachment chip retained after removal with zero confirmation dialogs; F06 `EVOLUTION_SAVE_FAILED` renders `No disponible / Esta confirmación expiró…` with only `Ver evidencia`/`Copiar` and no retry/recovery. `blocked_unhandled_requests: []`. Evidence: `evidence/matching-checkout/f02-f03-f06-result.json`, `f02-unsent-context.png`, `f03-artifact-identity.png`, `f06-save-error.png`. Diagnosis matches the planned contract (decisions 3/4/5); backend/DB atomics, real providers, assistive tech and devices remain open gates.

## 1. Assistant Stop isolation

- [x] 1.1 Add fail-first hook tests for deferred Stop success/error/cleanup from A after B starts, a new subscription of the same thread, double Stop and unmount; assert B controller/transcript/runtime/queue remain intact.
  Traceability: Assistant S1; F01; conversational-runtime / Queue and stale-operation safety.
  Notes: Added `describe('clinical stop subscription isolation')` in `app/frontend/src/hooks/useClinicalAssistant.test.ts` (5 tests; existing 36 untouched). Fail-first red: (1) deferred Stop resolve for A after B starts aborts B's controller; (2) deferred Stop reject for A writes `No pudimos detener la respuesta…` into B's error; (3) A1→B→A2 late Stop resets A2's transcript (`Nota A2` lost) — the F01 symptom; (4) A's Stop cleanup aborts B's in-flight controller while B stays `stopping`. Green guard: `detach()`/unmount abort only the client subscriber and never call `cancelClinicalTurn`. Double Stop runs inside every A-after-B case (exactly one cancel, no cross-generation abort). Run: `bun x vitest run src/hooks/useClinicalAssistant.test.ts` → 37 passed, 4 failed (only the fail-first cases above); `biome check` and `tsc --noEmit` clean. Hook-level proof covers controller/transcript/runtime/error/activeTurnId; queue state is owned by `ClinicalAssistantArea`, proven at area/browser level in 1.2. Red is expected until 1.2 scopes Stop to the captured thread/turn/generation/controller.
- [x] 1.2 Scope Stop/reconciliation/cleanup to captured thread, turn, generation and controller, then run hook and checkout browser race tests without changing queue dispatch or SSE transport.
  Traceability: Assistant S1; F01; A07/A09; conversational-runtime / Queue and stale-operation safety.
  Notes: `stop` in `app/frontend/src/hooks/useClinicalAssistant.ts` now captures `threadEpochRef` and the originating `AbortController`, reuses the existing `isCurrent()` thread+epoch guard (same pattern as `prepareDraft`) plus the captured turn, and aborts only the captured controller. Every post-await branch (success, 409 retry, terminal, transport error) returns before touching state when identity changed; telemetry keeps the captured ids. Queue dispatch and SSE transport untouched. Hook suite: `bun x vitest run src/hooks/useClinicalAssistant.test.ts` → 41/41 passed (all 1.1 fail-first cases green). Browser race `evidence/stop-race/stop-race.cjs` (Vite dev server on fixed source, all `/api/**` intercepted, 1800 ms cancel delay): post-fix `secondAborted:false`, `stopVisible:1`, B transcript retained, `passed:true`; same harness with the fix stashed → `secondAborted:true`, `stopVisible:0`, transcript reset, so the check catches F01. Evidence: `stop-race-result.json`, `stop-race-prefix.json`, `stop-race-fixed.png`. `biome check` and `tsc --noEmit` clean.

## 2. Assistant unapplied edit buffers

- [ ] 2.1 Add failing field/source editor tests for internal navigation/remount, Apply/Cancel, pending or failed sync, newer hydration, unload warning and logout cleanup; cover shared manual review behavior without changing its workflow.
  Traceability: Assistant S2; F04; A16; clinical-agentic-feedback / Unapplied artifact edits survive internal navigation.
- [ ] 2.2 Extend existing authenticated clinical memory and dirty guards with artifact/target-keyed buffers, baseline checks and success-aware Apply cleanup; prove return restores text/focus, canceled navigation preserves it and no browser storage or approval write occurs.
  Traceability: Assistant S2; F04; clinical-agentic-feedback / Unapplied artifact edits survive internal navigation.

## 3. Assistant historical patient identity

- [ ] 3.1 Add failing live/hydrated artifact tests with workspace A/B/null, multiple attempts, missing patient metadata and a foreign-owner read; assert no active-patient substitution or raw identifier disclosure.
  Traceability: Assistant S3; F03; A04/A15; clinical-agentic-feedback / Historical patient identity belongs to the artifact.
- [ ] 3.2 Pass existing historical patient metadata through the runtime/transcript/artifact seam, resolve missing incremental metadata via existing typed reads, block preparation when unavailable and prove draft/review/saved retain the correct destination.
  Traceability: Assistant S3; F03; clinical-agentic-feedback / Historical patient identity belongs to the artifact.

## 4. Assistant permanent review controls

- [ ] 4.1 Add failing approval tests for auto-open followed by Escape/close, repeated reopening, hydration, return-to-edit, focus return and protected committing state.
  Traceability: Assistant S4; F05; A16/A24; clinical-agentic-feedback / Approval status hierarchy with preserved modal.
- [ ] 4.2 Separate initial auto-open policy from permanent triggers; verify visible Confirmar/Seguir editando after dismissal, no reopen loop or duplicate modal, and no approve/decline/discard on close.
  Traceability: Assistant S4; F05; clinical-agentic-feedback / Approval status hierarchy with preserved modal.

## 5. Canonical backend recovery contract

- [ ] 5.1 Add failing service/HTTP tests for the design's strict recover-draft DTO/results/errors, owner/parent checks, failed/expired eligibility, approved saved outcome, declined/pending rejection, superseded action, stale hash/timestamp, malformed retained content and conflicting work; retain generic frozen-artifact rejection tests.
  Traceability: Assistant S5; F06; clinical-agentic-feedback / Explicit canonical approval recovery; Scoped dependency-free presentation.
- [ ] 5.2 Implement only the approved recover-draft route, service validation and transactional repository operation using existing records and nonblocking lifecycle locks; preserve terminal actions, change only eligible artifact lifecycle, perform no preparation/save/export and document the endpoint in the existing API reference.
  Traceability: Assistant S5; F06; clinical-agentic-feedback / Explicit canonical approval recovery; design decision 5.
- [ ] 5.3 Add and run isolated live PostgreSQL tests for simultaneous recoveries, lost response and repeated recovery after edits, newer prepare/resolve/expiry races, active-work conflicts, all rollback points, two owners and fresh approval→one canonical save. Verify old attempts remain terminal, no duplicate evolution/export intent exists and no skipped/mock test is reported as live proof.
  Traceability: Assistant S5; F06; clinical-agentic-feedback / Explicit canonical approval recovery; design recovery concurrency risks.

## 6. Assistant recovery presentation and transport reconciliation

- [ ] 6.1 Add failing hook/artifact tests for save error before commit, response lost after commit, failed/expired versus declined/pending, unavailable verification, recovered draft with preserved old actions, a new approval attempt and saved-with-failed/unknown Drive state.
  Traceability: Assistant S5; F06; A18; clinical-agentic-feedback / Approval status hierarchy with preserved modal; Explicit canonical approval recovery.
- [ ] 6.2 Add the typed recovery client and controller/UI path; reconcile before retry, show verification or explicit draft recovery according to canonical state, select the effective action rather than the first historic attempt, hydrate after recovery and require fresh human approval. Test missing-endpoint compatibility, reload and two-tab recovery without direct-save fallback.
  Traceability: Assistant S5; F06; clinical-agentic-feedback / Explicit canonical approval recovery; design decisions 4/5.

## 7. Assistant patient-context and queue transitions

- [ ] 7.1 Add failing area/provider tests for A→B/null and null→A with text, general/patient sources, queue and buffers; cover remain/preserve/discard, failed patient update, null queue restore, voice and approval/save restrictions, thread switches and no accidental dispatch.
  Traceability: Assistant S6; F02/F08; A04/A10/A14; conversational-runtime / Explicit original-context unsent work.
- [ ] 7.2 Implement context-keyed unsent slots and staged transitions through the existing guard; preserve original association, block mismatched sends/claims, expose guarded restoration including null and commit destructive local discard only after confirmed patient change. Prove logout/unload and historical artifact identity remain correct.
  Traceability: Assistant S6; F02/F08; conversational-runtime / Explicit original-context unsent work; Assistant S2/S3 compatibility.

## 8. Patient treatment-state truthfulness

- [ ] 8.1 Add failing render tests for all five existing states across chart/list/popover/editor/whole-arch strip, including performed labels and accessible text independent of allowed commands.
  Traceability: Patients S1; F01; T01; odontogram-human-workflow / Truthful observed-treatment state presentation.
- [ ] 8.2 Apply an exhaustive existing-treatment presentation mapping without changing command permissions or filters; verify the same performed UUID reads Realizado everywhere after reload and that inspection emits zero writes, including an isolated stored performed fixture.
  Traceability: Patients S1; F01; T01; odontogram-human-workflow / Truthful observed-treatment state presentation.

## 9. Patient inspection, modal exits and member reset

- [ ] 9.1 Add failing dental workspace/modal tests for Activity reference versus operative pressed state, ordinary inspection, outside→BODY→Escape, Tab/Shift+Tab/focus return, dirty/busy/uncertain guards, range reset and free selection.
  Traceability: Patients S2; F02/F03/F04; T02/T03/T04; odontogram-human-workflow / Historical reference is not operative tooth selection; Guarded dental dialog lifecycle; Clear multi-piece members without disarming the tool.
- [ ] 9.2 Separate historical reference/inspection/operative intent, fix existing modal lifecycle ownership and expose Clear members preserving tool/mode; verify every exit/reset is zero-write, history remains accessible and frozen command identities survive uncertainty.
  Traceability: Patients S2; F02/F03/F04; T02/T03/T04; odontogram-human-workflow added interaction requirements.

## 10. Patient canonical navigation and historical access

- [ ] 10.1 Add failing route/Activity/HTTP tests for condition/treatment/evolution/note/legacy-plan deep links, safe query cleanup, back/reload, targets beyond page one, one-time destination focus and owner/not-found/read-failure behavior.
  Traceability: Patients S3; F07/F09/F12; T07/T09/T12; clinical-workspace-discovery / Canonical exact-resource patient navigation.
- [ ] 10.2 Canonicalize existing route transitions and owned Activity href generation, qualify legacy plan history as read-only secondary access, retain every Todos event and focus note/plan targets once. Verify existing plan creation remains HTTP410 and other stored-plan commands are not broadly frozen. Preserve dirty guards and stored plan commands/data; update applicable API/navigation documentation beside this slice.
  Traceability: Patients S3; F07/F09/F12; T07/T09/T12; clinical-workspace-discovery / Canonical exact-resource patient navigation; dental-diagnosis-workspace / W6 retirement; patient-clinical-treatment-plans / P1/P6 (existing creation HTTP410 and stored-command compatibility).

## 11. Patient compact catalog and concept legend

- [ ] 11.1 Add failing inventory/search/label tests for twelve findings, 63 variants and eight categories, deterministic order, normalized diacritics, empty/clear/count feedback, category-versus-tool behavior, current applicability and generic crown versus saved variant descriptions.
  Traceability: Patients S4; F05/F06/F08; T05/T06/T08; clinical-workspace-discovery / Complete compact clinical catalog; Professional chart-first clinical composition.
- [ ] 11.2 Implement the labelled category selector, contextual search and compact operation list using existing catalog/primitives/tokens; correct legend concept descriptions, retain anatomy/notes rail/Sheet and measure same-data scan/scroll before versus after. Review scoped responsive snapshots and update the patient surface brief without new catalog endpoints or clinical semantics.
  Traceability: Patients S4; F05/F06/F08; T05/T06/T08; clinical-workspace-discovery / Complete compact clinical catalog; Professional chart-first clinical composition; dental-diagnosis-workspace / W2/W5.

## 12. Patient note attribution and continuity

- [ ] 12.1 Add failing typed-client/detail tests for already supplied actor display name, null/UUID fallback, multiple authors, exact note focus and shared rail/Sheet draft/history/association behavior.
  Traceability: Patients S5; F10/F12; T10/T12; clinical-workspace-discovery / Available dental-note actor attribution.
- [ ] 12.2 Retain actor metadata through the existing client/detail/actor seam and prove Activity/history agree, general-note origins remain separate, body-only edits preserve association and logical deletion preserves revisions. Verify the current free-text composer, pre-typing hover guard, explicit candidate activation while writing and saved-association protections remain unchanged. Do not infer an evolution author or add a backfill.
  Traceability: Patients S5; F10/F12; T10/T12; clinical-workspace-discovery / Available dental-note actor attribution; patient-dental-clinical-notes / N2/N5 current-composer compatibility.

## 13. Assistant copy, density and touch targets

- [ ] 13.1 Add failing checks for explicit current-response Stop/pending-count copy, three-item queue cap with fourth text retained, starter non-overwrite, keyboard help, accessible Pending routes and measured coarse-pointer targets.
  Traceability: Assistant S7; F07/F09/F10; A02/A09/A24; clinical-workspace-discovery / Bounded Assistant clarity and touch access.
- [ ] 13.2 Apply bounded copy/header/starter density and existing token/variant target fixes; verify five audit sizes plus narrow artifact/Drive panes, long names/text, voice, keyboard and reduced motion, and update the Assistant surface brief. Do not add pause-all behavior or remove required recovery/patient information.
  Traceability: Assistant S7; F07/F09/F10; clinical-workspace-discovery / Bounded Assistant clarity and touch access.

## 14. Integrated acceptance

- [ ] 14.1 Run combined synthetic browser scenarios for included Assistant A01–A24 and Patients T01–T12 excluding deferred T11, including cancellation/dirty/context/save races, all event kinds and later-page reads. Record viewport/asset provenance, zero-write inspection assertions and reviewed intentional visual differences; map each included finding to direct evidence.
  Traceability: Assistant G1/S7; Patients S7; all included F01–F10 Assistant and F01–F10/F12 Patients; all delta capabilities; design integrated proof.
- [ ] 14.2 Execute authorized isolated PostgreSQL ownership/atomicity/idempotency/correction/replacement/response-loss gates and keyboard/focus/zoom/reflow/coarse-pointer checks. Record actual screen-reader and real-device keyboard evidence, or leave those release gates explicitly unclosed. Obtain separate consent before any real provider/Drive write; fixture passes do not close provider gates.
  Traceability: Assistant G2; Patients S7/H02; clinical-agentic-feedback / Explicit canonical approval recovery; odontogram-human-workflow preserved invariants; design verification prerequisites.
- [ ] 14.3 Run full backend ruff check/format-check/mypy/pytest and frontend tsc/Biome/Vitest from AGENTS.md directories; review security-sensitive changes and scoped snapshots, record reproducible baseline failures without unrelated fixes, and verify the rollback path. Do not sync specs, archive, deploy or start implementation from planning validation.
  Traceability: Both audit validation plans; all included capabilities; design migration/rollback and verification.

## Execution Order

These are dependency paths, not permission to implement. IDs within a row run left-to-right. Rows not connected by a gate are independent in behavior; serialize edits to shared files.

| Slice | Tasks | Required predecessor |
|---|---|---|
| Matching-checkout evidence | 0.1 | None |
| Assistant Stop | 1.1 → 1.2 | None |
| Assistant buffers | 2.1 → 2.2 | None |
| Assistant identity | 3.1 → 3.2 | Matching-checkout evidence |
| Assistant review | 4.1 → 4.2 | None |
| Backend recovery | 5.1 → 5.2 → 5.3 | Matching-checkout evidence; authorized isolated DB for live proof |
| Recovery UI | 6.1 → 6.2 | Backend recovery contract implemented; identity and review for integrated artifact behavior |
| Patient context/queue | 7.1 → 7.2 | Matching-checkout evidence; buffers and identity |
| Patient state | 8.1 → 8.2 | None |
| Patient exits/reset | 9.1 → 9.2 | Patient state for integrated presentation |
| Patient navigation | 10.1 → 10.2 | Patient exit/dirty guards |
| Patient catalog | 11.1 → 11.2 | Patient exits/reset |
| Patient note metadata | 12.1 → 12.2 | Patient navigation for exact-target focus |
| Assistant density | 13.1 → 13.2 | Assistant functional corrections before adopting density changes |
| Integration | 14.1 → 14.2 → 14.3 | All included functional/presentation slices; required environment consent |

Do not assign concurrent writers to `useClinicalAssistant`, provider memory, transcript/artifact files or `PatientDiagnosis`. Backend live proof may run independently of recovery UI once the endpoint contract is implemented. No invented dependency joins the two workstreams before integrated verification. Source-audit S6 for evolution authorship and T11 remain deferred, not silently covered by these tasks.
