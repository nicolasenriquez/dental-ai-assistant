## 1. Baseline and normative contracts

- [x] 1.1 Pin starting SHA, dirty-worktree authority, Docker runtime, and completed local baseline evidence
- [x] 1.2 Add capability deltas that explicitly modify conflicting Drive, clinical artifact, and queue requirements

## 2. Drive workspace shell

- [x] 2.1 Add regression coverage for Drive closed-by-default, header toggle, absent sidebar utility, focus return, and guarded close
- [x] 2.2 Implement the closed-by-default header-launched Drive sidecar and responsive Sheet using the existing transition guard

## 3. Notes, Picker, and composer flow

- [ ] 3.1 Add behavior tests for global Notes without a patient, patient-bound Documents prerequisite/empty states, cross-patient Journals, patient changes, and the two Picker intents
- [ ] 3.2 Refactor Drive into compact keyboard-operable `Notas`, `Documentos`, and `Diarios` sections while preserving existing source and managed-document primitives
- [ ] 3.3 Add tested `Insertar selección` and `Insertar nota completa` actions with contextual success feedback, provenance, blank-line separation, focus, patient prerequisite, and no automatic send
- [x] 3.4 Preserve composer text and block submit/queue during approval and canonical saving while allowing turns during Drive-only work

## 4. Clinical artifact shell

- [ ] 4.1 Add transcript tests proving one stable-key artifact across draft, review, saving, saved, refresh, navigation, and back-to-edit, with no simultaneous draft/approval/result cards and no speculative Drive fields
- [ ] 4.2 Replace separate visible draft, approval, and result representations with one spatially stable ClinicalEvolutionArtifact while preserving reducer identity and the native confirmation dialog
- [ ] 4.3 Implement the three-stage `Borrador`/`Revisión`/`Guardada` lifecycle, transient inline saving state, exact action hierarchy, secondary Drive copy/status, responsive layout, and reduced-motion treatment
- [ ] 4.4 Elevate the existing active-patient selector into workspace context composition without duplicating state, changing ownership, adding a store, or bypassing transition guards
- [ ] 4.5 Evaluate existing versus focused primitives for transcript scrolling, patient selection, tabs, empty states, overflow, tooltips, sheet, and resizing; retain existing components unless inspected files/packages and focused tests prove a smaller or more accessible implementation
- [ ] 4.6 Add focused visual/interaction tests proving one clinical job renders one high-emphasis structured artifact and assistant prose, processing, provenance, Drive state, saving feedback, and terminal success introduce no peer or nested cards
- [ ] 4.7 Refine ClinicalEvolutionArtifact to the compact content-first grammar: quiet two-line header, low-chrome document container, dominant clinical body, compact lifecycle/status, provenance row, Drive row, one visible primary action, quieter secondary/overflow actions, and no nested metadata/status cards
- [ ] 4.8 Normalize transcript/artifact spacing and alignment with existing tokens so prose and artifacts share the reading column, avoid duplicate wrapper padding, preserve stable scroll geometry, and keep desktop/mobile density consistent
- [ ] 4.9 Validate draft, review, saving, saved, Drive syncing/synced/failed/reconnect/unknown states for stable layout, no flash or celebratory receipt, restrained semantic color, mobile action stacking, keyboard/focus parity, no horizontal overflow, and reduced motion
- [ ] 4.10 Optional P2 after the primary density pass: evaluate manual collapse for historical saved artifacts only; never auto-collapse current/newly saved artifacts, never persist collapse state, never turn internal sections into accordions, and defer it when complexity outweighs value

## 5. Journal persistence and durable intent

- [ ] 5.1 Complete migration tests and migration for UUID `evolutions.id` lineage, persisted `journal_block`, nullable positive `journal_part`, remaining exact constraints, owner scope, and non-destructive production rollback policy
- [ ] 5.2 Add `CLINICAL_TIMEZONE` backend configuration with startup validation and tests proving approval-local journal grouping is independent from canonical `evolution_at` shown in the V1 header
- [ ] 5.3 Implement the approval transaction so users with an existing Drive connection row atomically persist every eligible evolution and its frozen Journal V1 block plus pending or connection-failed export row

## 6. Export service and reconciliation

- [ ] 6.1 Add repository/service tests for persisted Journal V1 normalization/hash integrity, deferred part selection, known-conflict rollover reselection, ambiguous-outcome part immutability, identity/appProperties, duplicate resistance, status-specific recovery, process loss, concurrency, and rollover
- [ ] 6.2 Add atomic claim tests for duplicate scheduling and five-minute stale takeover, plus session-level period-lock tests proving concurrent first exports cannot create duplicate journals or hold a SQL transaction during Google I/O; exercise more than half the configured pool size and verify no deadlock, every connection/lock releases under exceptions, and unrelated queries complete
- [ ] 6.3 Implement the export repository, atomic claim/stale semantics, session-level period locking with `finally` unlock, deferred part selection, focused orchestration service, and minimum reusable Google Drive primitives
- [ ] 6.4 Schedule only FastAPI BackgroundTasks with stable user/evolution IDs after canonical success or guarded POST retry; reacquire all DB/provider state inside the task and keep GET hydration side-effect free
- [ ] 6.5 Implement the state-aware recovery POST and UI copy: automatic pending recovery, safe failed `Reintentar`, backend-only stale eligibility with no frontend clock/timeout calculation, and write-terminal unknown `Verificar` with no append
- [ ] 6.6 Implement deterministic disconnected/revoked rows and reconnect retry without changing frozen export identity or canonical approval success
- [ ] 6.7 Make atomic claim return `previous_status` and test pending, failed, stale-syncing, and unknown provenance; prove unknown can never call append/update
- [ ] 6.8 Enforce `failed` as confirmed-no-write only and test that ambiguous provider outcomes reconcile to `synced` or `unknown`, never `failed`
- [ ] 6.9 Persist `(journal_part, drive_file_id, drive_version)` through one repository operation; test known-safe rollover clears stale file/version identity before resolving the replacement target and freezes the whole tuple after ambiguity
- [ ] 6.10 Check current Drive usability before claiming failed recovery; test disconnected/revoked returns 409 with an unchanged row, no claim, and no provider I/O, plus the post-scheduling revocation race ending in confirmed-no-write `failed`
- [ ] 6.11 Test ambiguous journal creation where Drive succeeds but the response is lost: with selected part, null file ID, and unknown status, exact app-property lookup must reconcile one match without a second create, preserve unknown on zero matches, and return `JOURNAL_IDENTITY_CONFLICT` on multiple matches

## 7. Typed export hydration and artifact Drive state

- [ ] 7.1 Add owner-scoped API tests and typed backend/frontend contracts for weekly/daily preference load and round trips, failed-update rollback, unchanged existing export identity, guarded recovery/retry, backend-only stale decisions independent of client clock, side-effect-free hydration, and hydrated `drive_export`
- [ ] 7.2 Hydrate the same optional `DriveExportState` after live approval and thread refresh
- [ ] 7.3 Integrate the exact Spanish Drive copy and actions into the artifact; derive reconnect only from `failed + DRIVE_CONNECTION_REQUIRED` without extending `DriveExportState.status`, distinguish other safe failed recovery as `Reintentar` and unknown as `Verificar`, and preserve independent announcements, navigable `Abrir`, and non-blocking composer behavior

## 8. Remote journal list, read, and navigation

- [ ] 8.1 Add owner-scoped API/UI tests for exact journal list/read shapes, no entry counts, one-part label suppression, grouped rollover parts, part-2 deep links, local-current-detail search and clearing, Drive `modifiedTime`, key validation, provider-ID omission, remote TXT authority, malformed V1 handling, duplicate candidates returning `JOURNAL_IDENTITY_CONFLICT`, and adversarial bodies containing delimiters, header-like lines, and pasted older evolutions
- [ ] 8.2 Implement server-side remote Journal V1 parsing with complete-header framing and owner-period lineage validation, then expose typed list/read routes
- [ ] 8.3 Build human-readable journal period groups, expose journal parts only when rollover creates more than one part, and implement the structured reader with local search over the currently loaded backend-parsed JournalDetail; do not expose provider IDs, parse raw TXT, calculate counts, or add cross-period search. Artifact `Abrir` must select Diarios, the exact period and part, scroll/focus the target evolution, apply a temporary subtle highlight, and keep the journal open with contextual error when the remote entry is absent
- [ ] 8.4 Add the Diarios journal-frequency preference control backed by the existing typed GET/PUT API. Offer `Semanal` and `Diario`, state that changes affect only future evolutions, disable with inline progress while saving, restore the previous canonical value with contextual retry on failure, and never regroup or mutate existing exports

## 9. End-to-end verification

- [ ] 9.1 Extend e2e:clinical with success, failure/retry, disconnected/revoked, process-loss recovery, refresh parity, one mounted artifact through draft/review/saving/saved, no saving/result/Drive peer cards, correct primary/secondary actions, Drive updates without transcript displacement, deep-link focus/scroll/highlight, manual remote edit, stable streaming/history scroll, jump-to-latest with large artifacts, mobile action stacking/no overflow, and reduced-motion desktop/tablet/mobile scenarios using mocked Google boundaries
- [ ] 9.2 Run Docker-backed backend lint, format, typecheck, tests, and migrations plus frontend lint, typecheck, tests, build, and e2e:clinical; fix only in-scope regressions
- [ ] 9.3 Run one bounded Impeccable desktop/mobile visual pass, the design detector, and final Docker runtime verification; document concrete evidence and remaining risks
