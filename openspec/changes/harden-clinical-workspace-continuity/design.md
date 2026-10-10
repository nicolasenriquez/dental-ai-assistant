## Context

This change prepares two audit workstreams at checkout `7345f7a`. The user approved the proposed original-context policy and then explicitly approved a narrow backend recovery contract after repository investigation showed that failed artifacts cannot currently return to editing. These decisions authorize specification, not implementation or clinical writes.

Confirmed facts:

- `ClinicalRuntimeProvider` owns authenticated in-memory composer/queue/attachment state; hard reload restores server work only.
- `useClinicalAssistant.stop` captures thread/turn but later dereferences the current abort controller and calls an insufficiently generation-scoped loader.
- `EvolutionReviewArtifact` owns unapplied field/source buffers locally; unmounting can lose them.
- `ApprovalRequestItem` hides permanent triggers when `autoOpen` is true.
- `get_thread_response` already hydrates each artifact's historical patient through an owner-scoped read. The renderer and action fallback must consume that identity rather than the active patient.
- `resolve_action` commits failed action/artifact status after rolling back the nested evolution-save transaction, clearing the action payload. Expiry also freezes the artifact. Generic update, regeneration and preparation intentionally reject failed artifacts.
- Existing action history, retained artifact payloads, result-resource links, transaction locks and the unique pending-action-per-thread index support explicit recovery without a new persisted status or table.

Concurrent work archived `mirror-dental-diagnosis-workspace` as `2026-10-09-mirror-dental-diagnosis-workspace` during planning and synchronized its capability specs. Its treatment/catalog definitions and current Product/surface contracts are inputs; this change did not perform that archive or alter its files/main specs. Relevant newly present requirements still describe older templates, source-card composition and plan authoring. Dedicated deltas align those requirements with the approved composition and already shipped free-text/read-only plan policy, not with restored authoring.

## Goals / Non-Goals

Goals are caller-visible continuity, accurate clinical labels, explicit patient association, recoverable review/save outcomes and bounded catalog/Assistant composition. Every included audit finding has a requirement and a verification task.

Non-goals are those in `proposal.md`: evolution-author provenance, plan mutation freeze, new taxonomy, plan authoring, global runtime rewrite, durable browser buffers, new providers/libraries, Drive architecture changes and unmeasured performance optimization. No migration is planned. If implementation demonstrates that the approved recovery guarantees cannot use existing records, stop for a separate persistence decision rather than adding a migration silently.

## Decisions

### 1. Existing owners and observation seams

| Module owner | Interface/seam | Direct proof |
|---|---|---|
| Clinical runtime hook | `ClinicalAssistantController`, Stop/load/resolve callbacks | Hook tests with deferred A/B requests, same-thread generations and unmount |
| Authenticated clinical memory | Provider memory consumed by area and artifact editor | Component navigation/remount tests, logout/unload tests |
| Clinical transcript/artifact | Typed artifact/action hydration and review callbacks | Component tests and browser draft→review→saved/recovered transitions |
| Approval recovery application boundary | New route → clinical service → clinical repository | HTTP contract tests plus isolated live PostgreSQL concurrency/rollback tests |
| Dental workspace | `useDentalWorkspace`, diagnosis and modal props | Existing diagnosis/treatment tests and zero-write browser assertions |
| Patient navigation/catalog/notes | Ficha routing, typed clients, existing presentation/actor helper | Activity/detail tests, HTTP links and responsive catalog inventory checks |

Prefer these existing seams over a new store or feature framework. Database-level tests are needed below HTTP because mocked routes cannot prove row locking, rollback or duplicate prevention. No SQL belongs in UI, routes or services.

### 2. Stop captures subscription identity

Capture thread, turn, thread epoch/subscription generation and originating controller before asynchronous cancellation. Every callback, reconciliation and cleanup validates that identity before affecting attached state. Aborting uses only the captured controller. An A callback must not reset B, including a new subscription for the same thread. Detached server cancellation remains targeted to A. Keep existing queue dispatch and JSON-token SSE contracts; do not implement a pause-all control.

Rejected alternative: checking thread ID alone. It does not distinguish a later attachment of the same thread.

### 3. One memory owner for unsent work and edit buffers

Extend existing authenticated clinical memory, not browser storage. Composer slots retain an explicit context key `(threadId, patientId|null)`; queue entries retain their captured context. Attachments retain their message-recipient context even when the source itself is general. Artifact buffers use `(threadId, artifactId, field|source)` with baseline identity and edit state. Manual review consumers retain their existing behavior unless regression tests demonstrate shared buffer loss.

Patient transition uses the existing guard with three outcomes: remain, preserve original work and change workspace, or discard affected unsent work and change. Stage destructive discard until the patient update succeeds; failure/cancel restores the previous context without losing work. Preserved mismatched work is labelled and cannot send/dispatch. An explicit guarded restore handles both a patient ID and null, with no truthiness test hiding the null action. There is no "move to new patient" primary shortcut. Artifact buffers never follow the workspace patient.

Apply uses existing draft sync and clears the buffer only on confirmed success; explicit Cancel abandons only that local edit. A changed hydrated baseline keeps local text and blocks blind overwrite until reviewed. Dirty navigation and native unload protection include buffers. Logout clears them; hard reload survival is not promised.

Rejected alternatives: localStorage persistence violates the existing privacy contract; auto-applying buffers on navigation would change reviewed content without the Apply decision.

### 4. Historical identity and operable review

Use artifact/action patient metadata keyed by historical `patient_id`, both live and hydrated. Remove active-patient substitution when IDs differ. Missing metadata renders "Información del paciente no disponible", preserves content and blocks new preparation/confirmation until resolved. Use existing owner-scoped reads if an incremental SSE item lacks metadata.

Separate initial `autoOpen` from permanent `canOpen`/review triggers. Escape/close returns to review and focus to a connected confirmation trigger; hydration must not reopen the dialog repeatedly. Saving keeps its existing protected close policy. The single artifact retains its key and transcript position.

When multiple actions reference one artifact, select the current effective action by canonical artifact state and deterministic action order, not the first `.find`. A draft restored by recovery must not remain locked by its preserved old failed action. Old terminal attempts can remain secondary history inside the same artifact; never duplicate the draft/approval/result cards. Pending selects the current pending action, approved selects its saved result, and failed selects the current eligible terminal attempt.

### 5. Separate verification from recovery and approval

Resolve transport errors first hydrate authoritative state. Approved means saved; pending permits existing review/resolve behavior under the same hash; failed/expired permits explicit recovery; declined remains closed. An unavailable read leaves verification available and all further clinical writes blocked. Drive failed/unknown does not alter clinical stage.

Add `POST /api/clinical-actions/{action_id}/recover-draft`. It is separate from pending-only `return-to-editing` and accepts a strict body containing `proposal_hash` and `expected_artifact_updated_at` (timezone-aware timestamp from current hydration). No patient, owner, content, evolution ID or status authority comes from the client. Authentication and the existing same-origin policy apply. The service validates and delegates; the repository owns transactional checks and mutation.

Success is HTTP 200 with a discriminated result:

- `outcome: recovered|already_recovered`, `thread_id`, `artifact_id`;
- `outcome: saved`, `thread_id`, `artifact_id`, `evolution_id`.

The client then hydrates the exact thread; recovery success is not displayed as a clinical save. Missing/foreign action, thread, artifact or patient returns 404. Invalid body/hash format returns 422. Ineligible/superseded state, hash/version mismatch, invalid retained payload or conflicting active work returns 409 with a stable recovery code. Lock contention returns 409 `CLINICAL_RECOVERY_BUSY`. No error includes patient text or internal SQL.

Transactional recovery procedure:

1. Resolve the authenticated action's parent identities without mutation, then acquire the owned source action, artifact and thread row locks using `NOWAIT`. Recheck their relationships and ownership under lock. No provider/model calls occur in the transaction.
2. Inspect all action history for that artifact. If an approved action points to a valid owned evolution for the same patient, return `saved` without mutation. Contradictory/incomplete result metadata rejects recovery rather than guessing.
3. Otherwise require the requested action to be the latest action for this artifact, ordered by `created_at` and ID, with matching hash and status failed/expired. Declined and pending are ineligible. Reject active turns or any other pending thread approval. Existing pending expiry can reconcile through the usual thread read before retry.
4. If the artifact is already draft, return `already_recovered` without overwriting content, timestamps or later edits. If failed, require the exact expected artifact timestamp and validate retained source/generated/draft/date payload plus historical patient. The canonical failed-save transaction rollback or expired action proves no save through that action; check approved/result history as well. Unexpected lifecycle combinations fail closed.
5. Change only artifact status to draft, clear its resolved timestamp and advance updated timestamp. Retain payload, IDs and patient, and leave the failed/expired action row, hash, status and timestamps untouched. Commit once. Preparation still requires draft and creates a fresh action/hash/evolution identity for renewed review; recovery never calls preparation, resolve, evolution persistence or export.

`NOWAIT` avoids waiting in a lock cycle with existing artifact-first preparation or thread-first expiry code. Narrow repository handling translates contention/deadlock/serialization failures into a safe conflict after rollback. Two recoveries cannot mutate the artifact concurrently. Preparation cannot pass its artifact lock until recovery commits; a late old request is rejected after a newer action exists. A lost recovery response is reconciled through GET; idempotent `already_recovered` never rewinds local or server edits. There is no new recovery ledger or remote exactly-once claim.

Rejected alternatives: broaden `return-to-editing` and delete terminal actions, retry a nulled payload, relax generic frozen-artifact checks, or bypass approval through the ordinary evolution save endpoint. Each loses history or weakens the human boundary.

### 6. Dental intent and status stay separate

Use an exhaustive treatment presentation mapping, with Spanish existing/planned/performed/cancelled/error labels independent of allowed commands. Keep current read-only policy and diagnosis filters. Share the mapping only where repeated presentation intent exists.

Separate historical resource reference, tooth inspection and operative selection. A close gesture cannot become a tooth-activation write. Multi-piece clear resets members/roles/range anchor, preserving tool and selection mode. Do not clear a busy/uncertain frozen command.

The existing domain dental modal owns its whole lifetime's Escape/focus handling and dirty/busy guard; avoid adding global shortcuts or a second focus trap. The nonmodal desktop inspector retains its semantics. Tests cover outside→BODY→Escape, connected/fallback focus return and zero mutation requests.

### 7. Canonical links, catalog and bounded density

Canonical patient routing retains safe parameters only in their owning section; legacy planning/plans links continue to stored read-only history. Todos preserves every event source. A secondary "Histórico de planes" access/filter is qualified as historical, not a daily authoring mode. New plan creation remains the already implemented HTTP410; existing stored-plan lifecycle/item/stage APIs keep their current behavior. The plan deltas retire outdated authoring UI requirements, not those APIs. Clinical note and plan targets focus once per exact target after a successful read, not on every pagination refresh. Keep available revision actor names in typed clients and the existing actor label; do not add evolution-author attribution. Preserve the existing free-text note composer and `candidateFromChart` pre-typing hover guard plus explicit activation while writing. The notes delta documents this current behavior; it does not add templates or change saved associations.

Replace the category/tool equal-weight card hierarchy with a labelled native category selector, contextual search for high-volume categories and compact icon/text operation rows. Preserve catalog order and every stable ID, full labels, applicability and eight categories; no duplicated inventory or endpoint. Legend descriptions belong to concepts; saved records show their own variant snapshot. Keep FDI anatomy and shared notes composer unchanged.

Assistant copy explains current-response Stop, pending count, queue limit and existing keyboard semantics. Starters do not overwrite work; reduce them when text exists. Keep one route-backed Pending entry plus contextual links where needed. Retain patient/source/recovery information. Changes use existing semantic tokens and primitives, with 44px coarse targets and immediate reduced-motion state. Update the two affected surface briefs with adopted local decisions; do not migrate legacy CSS families or redesign shared tokens.

## Risks / Trade-offs

- Cross-thread and same-thread-generation races → deferred callback tests plus checkout browser cancellation race.
- Retained old actions shadow a recovered draft → canonical grouping tests for multiple attempts, fresh pending action and saved history.
- Recovery weakens frozen-artifact protection → keep existing rejection tests; only explicit recovery changes failed→draft; test forbidden statuses and fresh human approval.
- Contention or concurrent expiry/save → nonblocking locks, rollback-safe conflicts, two-tab live Postgres tests and verification-first UI. Brief transient busy responses are preferable to an unverified retry.
- Losing edits or leaking sensitive memory → one authenticated owner, context-keyed slots, unload/logout tests and no browser storage.
- Compact options hide a variant or change recording intent → exhaustive inventory, applicability and zero-write navigation tests.
- Served bundle differs from audit checkout → reproduce F02/F03/F06 against matching assets before accepting the diagnosis; preserve evidence levels.
- Mock success mistaken for persistence/accessibility proof → keep mocked browser, isolated DB, provider UAT, screen-reader and real-device evidence separate.

## Migration Plan

No schema/data migration, backfill, state-library migration or spec sync is part of this change. Add the recovery endpoint and contract tests before connecting recovery UI; deploy backend first or in the same application release. An older frontend safely ignores the additive endpoint; a newer frontend treats a missing endpoint as unavailable, preserves content and never falls back to a direct save.

Deliver focused PRs per finding/slice. Roll back UI/backend changes without changing stored evolutions or terminal action history. An artifact already restored to draft remains a valid existing state for old code; rollback does not undo a saved evolution or queued export. Stop release if canonical ownership/atomicity or patient-context proof fails.

## Verification and open questions

No material planning question remains after the user's scope approvals. Environment availability, provider consent and hardware/screen-reader access are execution prerequisites, not assertions that tests have passed. Reproduce audit diagnoses and validate concurrency in implementation; if evidence contradicts this approved contract or requires persistence expansion, stop and report rather than broaden scope.

Per-slice fail-first tests precede fixes. Integrated proof uses Assistant A01–A24 where relevant and Patients T01–T12 excluding deferred T11. Existing spec viewport gates remain; the combined matrix adds 360×800, 390×844, 768×1024, 1024×768 and 1440×900, narrow available panes, coarse pointer, long names/text, keyboard, zoom/reflow and reduced motion. Real-device keyboard and screen-reader checks require actual evidence or an explicit unclosed release gate.

Live suites use migrated disposable PostgreSQL and the existing clinical/workspace/export harness opt-ins; skipped or mocked pools do not prove atomicity. Real Drive/model/OAuth writes remain outside this planning authorization and require separate consent. Run the full AGENTS.md lint/type/test suite before implementation completion and review only intentional visual-baseline changes.

Planning validation passed `openspec validate harden-clinical-workspace-continuity --strict --json`; status reports proposal/specs/design/tasks done. Local checks confirmed seven capability files, matching modified/removed baseline names, preservation of prior scenario coverage, adjacent traceability for all 31 unchecked tasks, an acyclic dependency graph and eight resolvable audit links. This proves artifact structure and planning consistency, not runtime, database, device or provider behavior. All implementation tasks remain unchecked.
