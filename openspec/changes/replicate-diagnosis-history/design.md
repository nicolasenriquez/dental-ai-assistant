## Context

The reference is DentalPin at localhost:3000. The target is this repository's React/FastAPI Dental AI Assistant. The reference audit is observational evidence; current code and specs govern local data and write behavior. Technical artifacts use English and user-facing copy uses Chilean Spanish.

The source's History editor leak, one-day date mismatch, ambiguous counters and Notas/IA collision are defects to prevent. Independent anatomy, the richer catalog and notes ownership are reused. The final user decision replaces new recording-error mutations with explicit deletion; legacy correction evidence remains readable. deletion-design.md defines that write contract and audit/README.md records fresh visual proof and limits.

## Goals / Non-Goals

Goals: reproduce the useful chart-first workflow, add a temporal chart, retain every authorized record/revision, provide clear clinical context and make every modal and animation testable.

Non-goals are the exclusions in proposal.md. In particular, procedure categories inside Diagnosis are not a Treatment Plans module; existing performed/planned/cancelled evidence may still be read truthfully in History without enabling those commands.

## Boundary and Ownership

| Owner | Existing or proposed interface | Responsibility |
|---|---|---|
| PatientDetail | existing route/query and transition guard | Clinical navigation, patient identity and existing deep links. |
| PatientDiagnosis / useDentalWorkspace | existing intent/command interface | Current reads, tools, frozen create/edit/delete operations and conflicts; legacy correction receipts remain recoverable. |
| PatientOdontogram + presentation registry | existing anatomy/record renderer | Shared FDI, symbols, semantics, previews and read-only inspection. |
| PatientDentalHistory (new) | patientId, parsed date/dentition, inspection target | Historical composition; no mutable workspace hook. |
| usePatientDentalHistory (new) | typed read methods and selection state | Read lifecycle, cancellation, pagination, coverage and stale-response rejection. |
| patient_dental_history route → dental_history domain → patient_dental_history_repo (new) | history and snapshot GETs | Ownership, date contract, snapshot projection and bounded read transactions. |
| useDentalClinicalNotes | incumbent notes interface | One current notes composer and existing receipt/revision lifecycle. |

Module Depth comes from keeping temporal projection and current commands separate. The shared Interface is a dental display model with resource ID, revision and capabilities; callers never infer permission from status color. The API and asyncpg Adapters contain transport/storage details. This gives Leverage to both chart callers and keeps Locality within the patient feature.

Do not move existing command SQL out of `db/`, create a general event bus, duplicate a clinical registry or refactor all 2,000+ lines of PatientDiagnosis. Extract only a render-only grouped summary/inspection body if both callers need the same intent.

## Decisions

### 1. Integrate with the existing patient workspace

Add Historial beside Diagnóstico and Evoluciones. The replicated pair is Diagnóstico/Historial; Evoluciones remains an incumbent function. Do not create Treatment Plans or Appointments tabs, CTA placeholders, recall buttons or upload affordances.

Canonical links:

```text
/patients/:id?tab=clinical&clinical=diagnosis
/patients/:id?tab=clinical&clinical=history
/patients/:id?tab=clinical&clinical=history&at=YYYY-MM-DD&dentition=permanent
```

An absent `at` means current historical read, labelled "Estado actual". A supplied local date means end-of-day knowledge in America/Santiago, even when it is today. Keep the distinction visible. Unknown dates/future dates/invalid dentition produce a recoverable validation state rather than silently showing current records. Do not interpret incumbent `history=1` plan-evidence links as this new mode.

Retain existing `condition`, `treatment`, `dental_note`, evolution paths and legacy plans links. Switching modes uses the incumbent guard before unmounting dirty editors/composers. A frozen uncertain write is reconciled before the mutable feature is left. Ephemeral armed tools are cleared only after an allowed transition. Browser back/forward, refresh and new-tab arrival must agree with visible mode.

### 2. Preserve existing diagnosis semantics

No-tool tooth activation inspects only. Tool/card/category navigation and hover never write. Preserve direct whole-tooth and direct occlusal application; lateral surface selection uses the existing Confirmar path. Do not add a second Guardar after a successful create. Preserve stable operation IDs, duplicate protection and conflicts. Replace error-based Deshacer with explicitly confirmed Eliminar registro; no new entered_in_error transition.

The source audit did not test direct writes. Incumbent direct-application behavior resolves that gap. Deletion is a deliberate new write contract with its own failing-first proof.

Use the existing 32/20 FDI sets, eight anatomical profiles, dual views, layers, palette/search, multi-piece roles and whole-arch selection. Keep all existing catalog variants. Retain current filters and render historical aliases truthfully. No First Visit chip is synthesized; an unsupported whole-mouth encounter is not a procedure or a new consultation record.

### 3. Define History as recorded knowledge, not clinical onset

Reconstruct snapshots from append-only condition/procedure revisions. `changed_at` defines when the application recorded evidence, not when a disease began or a treatment medically occurred. Copy: "Registros guardados hasta el …" and "Según el historial disponible".

For a selected clinical day D, include committed revisions where `changed_at` is strictly before the start of D+1 in America/Santiago. Latest revision per resource is chosen by revision number among eligible revisions. Corrections and replacements from one committed transaction appear together. A resource created later is absent. A later edit/deletion must not rewrite earlier rendering. Select deletion markers from the eligible revision snapshot, never today's row. After deletion exclude the record from the as-of current list/marks while retaining its deleted event. Keep evidence marked entered-in-error/cancelled in the audit list with its own label; chart eligibility follows shared state/provenance rules, never a generic Completed category.

For "Estado actual", reconstruct from all committed revisions visible to the read transaction. This History view remains read-only. It is not the mutable Diagnosis component with its buttons hidden.

Reject alternatives:

- Derive from current rows: loses before/after truth.
- Derive from Activity titles: lacks surfaces, anatomy and full snapshots.
- Fetch every record's revision endpoint in the browser: N+1, incomplete cursors and mixed-time reads.
- Persist a second snapshot store: unnecessary duplication; revisions already contain the evidence.

### 4. Add two owned read APIs

Paths below are relative to the existing `/api` mount. New route file `routes/patient_dental_history.py` owns both endpoints. Schemas belong there unless shared with the domain module.

| Method/path | Query | Result |
|---|---|---|
| GET `/patients/{patient_id}/dental-history` | dentition (required), epoch?, cursor?, limit=50 (1..100) | Owned condition/procedure audit events, descending `(changed_at, kind, event_id)`, grouped by clinical date in the client. |
| GET `/patients/{patient_id}/dental-history/snapshot` | dentition (required), at? (YYYY-MM-DD), epoch?, cursor?, limit=100 (1..100) | Paginated full record snapshots as of date/current state, counts, coverage and the matching dataset epoch. |

History response:

```text
items[]: event_id, resource_kind(condition|procedure), resource_id,
         revision, action, changed_at(UTC), clinical_date(YYYY-MM-DD),
         actor(user_id, display_name|null), before|null, after
next_cursor|null, total_events, epoch, timezone, read_at
```

Snapshot response:

```text
selection: at|null, timezone, cutoff_exclusive|null
items[]: resource_kind, resource_id, revision, changed_at, snapshot, chart_eligible
next_cursor|null, epoch, read_at
counts: records, findings, procedures, charted_records, affected_teeth, affected_arches, deleted_records
coverage: complete|partial, earliest_recorded_at|null, warnings[]
```

Record/finding/procedure counts include non-deleted reconstructed snapshots in the complete selected dentition/date, not just the first page. Deleted snapshots are audit-only, counted separately in deleted_records and never chart eligible. `charted_records` and affected-tooth/arch counts include only chart-eligible snapshots. Active findings and existing/performed procedures are chart eligible; historical planned evidence is additionally rendered in History with its existing planned mark. Resolved findings and cancelled/entered-in-error procedures remain in the record/audit list, not as active anatomical marks. This History adapter does not change the incumbent daily-Diagnosis filter. Event total counts revisions; record total counts distinct kind/resource identities. A bridge contributes one procedure and each of its unique affected teeth to the eligible tooth total. Whole-arch procedures count in affected_arches, not as tooth zero. Audit-list, record and chart counts have different labels.

Use `Date` validation for day syntax and PostgreSQL timezone-aware cutoffs in parameterized repository queries. The domain owns `HISTORY_TIMEZONE = "America/Santiago"`; no new environment variable is needed. Retain TIMESTAMPTZ and UTC transport. Format all new History labels from the server's clinical date using explicit zone-aware parts; never pass a bare ISO date into `new Date()` for local display. Extend `clinicalDate.ts` with scoped helpers, preserving existing callers' behavior.

#### Read consistency and pagination

Each request executes in a read-only repeatable-read transaction, including parent ownership check, coverage, epoch, data and totals. Build a deterministic epoch from ordered revision IDs plus coverage-relevant missing-initial-revision markers for this owner/patient/dentition; do not use wall-clock max timestamp as the only identity. Pagination binds owner, patient, dentition, date/current selection, ordering and epoch in a validated versioned cursor. The epoch is consistency metadata, not authorization.

Later pages and timeline/snapshot cross-reads include the epoch. If the visible revision set changed, return `409 history_changed`, retain the prior display with an explicit stale notice, and offer "Actualizar historial". Restart from the same selected day on explicit refresh. Never append a page from a different epoch or replace a past selection with current records to recover. This also catches an older-timestamp transaction that committed after a previous read. New-date selection can adopt a new epoch only as one complete read cycle.

Use keyset pagination. Do not truncate a chart silently. Assemble chart pages only after all have matching epoch and counts. If a later page fails, retain the previous complete chart labelled with its original date, show the failure and retry that read; do not render it as the requested new date. The loaded event window may be partial, but dates and event counts must say so.

No fabricated baseline before the earliest recorded evidence. An empty patient is an honest empty history. A known pre-revision/missing-initial-snapshot record marks coverage partial; return proven revisions, warn and suppress a completeness claim. Do not reconstruct missing past fields from today's row or run a history backfill.

#### Storage/query approach

Read `patient_tooth_condition_revisions` and `patient_dental_treatment_revisions`; procedure snapshots already include members/roles/arch. Condition snapshots carry dentition/FDI/surfaces/status/note. Reuse author-name resolution without claiming historical credential certification. Validate every ownership predicate, including joined current metadata. Do not read plan tables to create new state.

For the historical-read slice, add the two temporal access indexes on source revision tables:

```text
(owner_user_id, patient_id, changed_at DESC, id DESC)
```

Use a new Alembic revision after the actual head found during implementation. Do not reserve a stale numeric revision now, alter historical snapshots, drop tables or delete records. Verify `EXPLAIN` on a seeded scratch DB and preserve evidence on application rollback. No claim of zero-lock production migration is made; deployment is outside this change.

#### Errors/privacy

401 for missing session; 404 for unknown/foreign patient or exact inaccessible resource; 422 for invalid dates/cursors/filter binding; 409 for stale epochs. Foreign data must not affect events, counts or coverage. GET has no side effects, provider work, cleanup or command receipts. No clinical text in URLs, logs, metric labels or exception details. Cross-patient late responses are ignored by request-generation checks/abort signals.

### 5. Compose the two modes

```text
Clinical
  Diagnóstico: chart -> whole-arch context -> palette -> legend -> grouped records
               notes rail / existing narrow Sheet
  Historial: date timeline -> as-of chart -> selected-day changes -> audit list
             inspection-only details and record revision links
  Evoluciones: incumbent route/component
```

Diagnosis grouped summary: an accessible button with expanded state and truthful record total. Inside, group by FDI or existing whole-arch group; retain each record's symbol, full name, surfaces, state, note entry and revision identity. Repeated bridge members link to one procedure. Preserve status/dentition filters and complete-versus-incomplete read messages. Opening a row is inspection, not tool selection. Closing the accordion does not discard editors or note drafts.

History timeline: group loaded events by `clinical_date` newest first. Each date is a named button; an accessible discrete range control can traverse the loaded chronological date set plus "Actual". Home/End/Arrow keys operate that set; the visible loaded range and "Cargar fechas anteriores" stay explicit. If no historical dates exist, render the empty message and current/earliest known state without a fake slider. A deep-linked date absent from loaded pages is fetched directly, not silently replaced. Highlight only the selected date; retain the date label during loading.

"Volver al estado actual" removes `at`, stays in Historial and refetches current committed evidence. A separate "Ir a Diagnóstico" action explicitly leaves the historical view through the guard and without carrying historical edit intent.

History inspection: reuse tooth anatomy and render-only popover content. Number, anatomy, historical state, surfaces, note from that revision, author/date and link to exact revision remain available. Omit Registrar, Editar, Guardar, Corregir, Deshacer, note composers and write callbacks. Tool intent is always null and preview pulses cannot imply application. The chart remains keyboard-inspectable; `disabled` must not disable read inspection. Use a capability prop/read-model adapter when needed rather than mounting `useDentalWorkspace`.

Changes for day D show the actual created/edited/resolved/corrected actions on that date and affected resources. Do not label every recorded finding as a completed treatment. Audit list paginates independently of chart completeness and supports exact resource/revision inspection without changing as-of state.

### 6. Modal and notes contract

| Interaction | Reuse | Required result |
|---|---|---|
| Tooth with no tool | ToothInspectionPopover | Named nonmodal inspection, no write/scroll jump, Escape returns focus. |
| Surface application | existing surface selection in PatientDiagnosis + DentalConditionModal | Occlusal/lateral views, M/D/O/V/L, selected chips/count, Confirmar unavailable at zero; preserve empty-surface legacy interpretation. |
| Saved finding edit | existing condition editor | Explicit Guardar, revision conflict choices, note/surfaces/status permitted by current domain only. |
| Observed procedure edit | TreatmentRecordModal | Existing state/provenance permissions, scope/role validation and correction history. |
| Multi-piece/arch | TreatmentScopeModal | Existing range/free selection and clear-members behavior; no new planning. |
| Delete saved record | new command through existing owners / AlertDialog | Visible Eliminar in the editor; exact saved-ID scope, deletion audit, no mandatory reason; see deletion-design.md. |
| Dirty close/mode change | existing PatientNoteNavigationGuard / transition guard | Save/discard/stay with frozen-operation handling and focus restoration. |
| Contextual note action | DentalClinicalNotes / DentalNoteComposer / useDentalClinicalNotes | Opens the existing composer/feed with correct context and keeps one draft. |

Finding notes are patient/optional-tooth notes, not a new per-condition collection. Label the access "Notas de la pieza" and show only a truthful count of that scope; condition's embedded Notes field remains separate. Procedure notes use `note_type=treatment`, `entity_kind=treatment`, existing ID. Do not attribute all notes on a tooth to each condition. No backend note-schema expansion is needed.

Expose contextual note entry in the grouped records using the existing rail/Sheet. Keep the established available-width threshold of 1160px and one shared hook/composer. Do not introduce a competing editable popover just to match the reference. A compact read-only note summary may reuse current note cards; full edit remains in the one owner. General templates use the existing API/category behavior and Spanish text; never insert fabricated clinical content or auto-save a template. Missing template support in a context is handled by its existing catalog, not another hardcoded registry.

In History, show only the condition/procedure snapshot's embedded note. Current contextual note collections are not historical note evidence. Offer a clearly labelled departure to current Diagnosis for note editing, never render today's feed under a past date.

Nested delete/dirty confirmations suspend the parent focus trap and tooth popover. Only the active modal traps focus. Escape, backdrop and close use the same guard policy; do not discard when busy/uncertain. Preserve the leaving record's title/piece until its exit completes, avoiding a tooth-zero flash. Restore focus to the initiating control or a stable chart heading if it no longer exists.

### 7. Scope motion to dental controls

| Part | Contract | Source/local basis |
|---|---|---|
| Palette card | background, border, shadow and transform, 150ms; existing hover -2px | source-measured 150ms; current dental-tool-card. |
| Tooth response | transform/filter or current translate, fill/stroke, 150ms | source measurement/current anatomy. |
| Pulp fill | 200ms | source and existing dental-pulp-fill. |
| Category | color/background, 150ms cubic-bezier(0.2,0,0.2,1) | source measurement; scope locally. |
| Modal backdrop | opacity, 200ms ease-out in/ease-in out | measured source target. |
| Modal panel | opacity plus small scale 0.98→1, 200ms ease-out in/ease-in out | duration measured; 0.98 amplitude is a new target decision, not measured source geometry. |
| Accordion | chevron 150ms, content opacity 150ms; immediate height/layout | target decision; reference accordion timing was unmeasured. |
| Timeline date | immediate selection and pending label; color 150ms | target decision; never animate through invented intermediate chart states. |
| Existing live previews/highlights | retain only incumbent, scoped behavior | source audit did not certify pulses; do not extend them to History. |

Use Tailwind/motion-safe and existing dental CSS tokens. Reuse the installed motion library only if the current modal owner already needs presence; no new dependency or global primitive retiming. Shared UI primitives must not import dental/domain code. Reduced motion removes scale, translation and decorative pulses, makes entrances/exits immediate, and retains text/selection/focus feedback.

Do not keep focusable leaving layers active, reset clinical identity during exit, animate layout height across asynchronous data or defer command feedback until an animation finishes. Pending controls have stable labels/width. Verify style values and actual browser focus/click behavior, not screenshot appearance alone.

### 8. Accessibility and responsive acceptance

- Visible Spanish names, `aria-pressed` for tools, expanded state for accordions and selected state for dates; focus styling distinct from selection.
- Retain keyboard FDI navigation, both arches, 44px controls, direct surface controls and tool cancellation. No tooltip-only instruction; surface indicator says "Admite superficies".
- Test 390px, 768px and 1440px viewports, expanded/collapsed shell, available content crossing 1160px and 200% zoom. Local chart scrolling is allowed; page-level horizontal overflow is not.
- Notes/Assistant controls have separate hit areas and clear the dock. History offers no notes-edit control in that floating location.
- Render empty/read error/partial/stale/conflict/busy states independently. Loading History does not show an empty diagnosis chart as proven absence.
- Announce date changes and read failures without moving focus into asynchronously loaded rows. Returning focus must not scroll the page unexpectedly.

## Blast Radius

Deletion additionally touches condition/treatment routes/services/repos, note-context guards, Activity, DTOs and current-read uniqueness predicates as detailed in deletion-design.md.

Existing files likely touched: PatientDetail, PatientDiagnosis, PatientOdontogram, presentation/clinicalDate helpers, typed api.ts, relevant dental modal/notes code, scoped dental styles, main.py registration, conftest pool patch sites, Playwright workspace testMatch and documentation/brief at closeout.

New files expected: PatientDentalHistory.tsx and test, DentalHistoryTimeline.tsx and test, a render-only record summary if needed, usePatientDentalHistory.ts and test, routes/patient_dental_history.py, patients/dental_history.py, db/patient_dental_history_repo.py, temporal index migration, test_patient_dental_history.py, test_patient_dental_history_live.py, and patient-dental-history.spec.ts. Names are planned targets, not claims that files exist.

Untouched behavior: auth, LLM, RAG, approvals, Drive, signup/rate limit, direct create/edit/resolve semantics, plan retirement, Evoluciones and other patient tabs. main.py changes only register the history router; new delete endpoints belong to existing resource routers.

## Verification Strategy

1. New HTTP tests must fail for missing projection/wrong as-of resource, owner leakage, date mismatch, stale cursor/epoch and incomplete evidence. Extend pool monkeypatch sites for the new repository; stub tests cannot prove PostgreSQL ranking or transaction isolation.
2. Real scratch Postgres covers multi-revision corrections/replacements, same-timestamp commits, previously missing revisions, planned/performed/entered-in-error evidence, multi-tooth counts, day boundaries/DST and late committed back-timestamp events. Assert GET leaves every source row/revision/receipt unchanged.
3. Routed Vitest covers refresh/back/forward, invalid URLs, state guards, late patient responses, loaded versus complete counts, no-write History interactions, note context/draft survival and modal focus/exit identity.
4. Mocked Playwright covers chart/date/overlay journeys and screenshots at matched widths. Add its spec to the existing workspace project; label mocked evidence explicitly.
5. A disposable authenticated UI/HTTP/Postgres journey creates synthetic current records, edits/deletes them through reviewed commands, reloads and checks earlier/current historical views. Track cleanup ownership. No real patient screenshots or providers.
6. Measure 150/200ms CSS contracts, reduced-motion overrides, hit-area separation, Tab/Escape/focus return and no tooth-zero exit frame. If native 200% zoom/real mobile cannot run, record the gap rather than claim proof.
7. Full backend ruff/format/mypy/pytest and frontend tsc/biome/Vitest/build before a future commit, plus affected workspace browser specs. Run OpenSpec validation again after any contract adjustment.

## Rollout and rollback

Expand deletion-aware schema/read guards first, then enable delete commands, historical read endpoints and History; integrate Diagnosis summary and deletion UI before final overlay verification. Deletion markers/actions and active-key predicates expand first; new correction mutations retire after replacement journeys and legacy receipt tests pass. Rollback must retain a deletion-aware reader/guard floor; old binaries ignoring deleted_at are unsafe. Leave schema and original evidence intact. New History is additive; current diagnosis retains create/edit/resolve paths and adds explicit delete commands. Operational deployment and spec archival require their own later workflow.

Escape is consumed by the topmost overlay: cancelling a nested confirmation must not also close its parent editor, discard its draft or disarm an underlying tool. Verify this explicitly rather than copying the reference event propagation.
