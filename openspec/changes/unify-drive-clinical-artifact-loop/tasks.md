## 1. Baseline and normative contracts

- [x] 1.1 Pin starting SHA, dirty-worktree authority, Docker runtime, and completed local baseline evidence
- [x] 1.2 Add capability deltas that explicitly modify conflicting Drive, clinical artifact, and queue requirements

## 2. Drive workspace shell

- [x] 2.1 Add regression coverage for Drive closed-by-default, header toggle, absent sidebar utility, focus return, and guarded close
- [x] 2.2 Implement the closed-by-default header-launched Drive sidecar and responsive Sheet using the existing transition guard

## 3. Notes, Picker, and composer flow

- [ ] 3.1 Add behavior tests for global Notes without a patient, patient-bound managed documents, patient changes, and the two Picker intents
- [ ] 3.2 Refactor the Drive information architecture into Notes and Evolutions while preserving existing source and managed-document primitives
- [ ] 3.3 Add tested full-note and selection insertion with provenance, blank-line separation, focus, patient prerequisite, and no automatic send
- [x] 3.4 Preserve composer text and block submit/queue during approval and canonical saving while allowing turns during Drive-only work

## 4. Clinical artifact shell

- [ ] 4.1 Add transcript tests for one artifact across draft, review, saving, saved, refresh, and back-to-edit without consuming speculative Drive fields
- [ ] 4.2 Compose draft, native confirmation boundary, and canonical result into one stable ClinicalEvolutionArtifact without changing persisted reducer identity
- [ ] 4.3 Implement the compact accessible clinical lifecycle, contextual footer/overflow actions, responsive behavior, and reduced-motion treatment

## 5. Journal persistence and durable intent

- [ ] 5.1 Complete migration tests and migration for the exact frequency/export schema, constraints, owner scope, and non-destructive production rollback policy
- [ ] 5.2 Add `CLINICAL_TIMEZONE` backend configuration with startup validation and deterministic daily/ISO-week tests
- [ ] 5.3 Implement the approval transaction so every eligible evolution and its frozen pending or connection-failed export row commit atomically

## 6. Export service and reconciliation

- [ ] 6.1 Add repository/service tests for Journal V1 normalization and bytes, identity/appProperties, duplicate resistance, optimistic conflict retry, ambiguous reconciliation, process-loss recovery, concurrency, and rollover
- [ ] 6.2 Add atomic claim tests for duplicate scheduling and five-minute stale takeover, plus advisory-lock tests proving concurrent first exports cannot create duplicate journal files
- [ ] 6.3 Implement the export repository, atomic claim/stale semantics, period-part advisory locking, focused orchestration service, and minimum reusable Google Drive primitives
- [ ] 6.4 Schedule only FastAPI BackgroundTasks after canonical success or guarded POST retry; keep GET hydration side-effect free
- [ ] 6.5 Recover pending/stale/unknown state through one automatic same-origin POST after hydration and explicit retry
- [ ] 6.6 Implement deterministic disconnected/revoked rows and reconnect retry without changing frozen export identity or canonical approval success

## 7. Typed export hydration and artifact Drive state

- [ ] 7.1 Add owner-scoped API tests and typed backend/frontend contracts for preferences, guarded recovery/retry, side-effect-free hydration, and hydrated `drive_export`
- [ ] 7.2 Hydrate the same optional `DriveExportState` after live approval and thread refresh
- [ ] 7.3 Integrate pending/syncing/synced/failed/unknown into the existing artifact, with independent announcements, retry/reconnect, and non-blocking composer behavior

## 8. Remote journal list, read, and navigation

- [ ] 8.1 Add owner-scoped API tests for exact journal list/read shapes, Drive `modifiedTime`, key validation, provider-ID omission, remote TXT authority, malformed V1 handling, and duplicate candidates returning `JOURNAL_IDENTITY_CONFLICT`
- [ ] 8.2 Implement server-side remote Journal V1 parsing and typed list/read routes
- [ ] 8.3 Build the compact period list, structured journal reader/search, retry/verify, and artifact-to-entry navigation without frontend text parsing

## 9. End-to-end verification

- [ ] 9.1 Extend e2e:clinical with success, failure/retry, disconnected/revoked, process-loss recovery, refresh parity, no-duplicate, navigation, manual remote edit, and responsive scenarios using mocked Google boundaries
- [ ] 9.2 Run Docker-backed backend lint, format, typecheck, tests, and migrations plus frontend lint, typecheck, tests, build, and e2e:clinical; fix only in-scope regressions
- [ ] 9.3 Run one bounded Impeccable desktop/mobile visual pass, the design detector, and final Docker runtime verification; document concrete evidence and remaining risks
