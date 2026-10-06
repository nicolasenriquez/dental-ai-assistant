# Sync and archive checklist (prepared 2026-10-06)

Prepared by the agent for a human to execute later. Nothing here has been
synced or archived. Run strict validation first:

```powershell
openspec validate harden-odontogram-human-workflow --strict
```

## 1. Canonical wording replacements through the MODIFIED delta

`openspec/specs/clinical-workspace-discovery/spec.md` still carries the old
resolve-and-create/read-only wording. During sync, replace:

| Location | Current canonical wording | Replacement from the MODIFIED delta |
|---|---|---|
| `Fixed tooth-condition identity and recurrence` | `Resolved records SHALL be read-only.` | Resolved records reject ordinary editing/resolution but permit the separate error-correction annotation; correction marks the original entered_in_error and optionally links a replacement atomically, without implying clinical resolution or overwriting evidence. |
| Scenario `Correction and recurrence`, first THEN | `clinician explicitly resolves the incorrect record and creates a correct record; history retains both` | The clinician reviews a separate correction with mandatory reason and explicitly saves it; the original keeps its identity/history, becomes entered_in_error, and an optional valid linked replacement commits in the same transaction. |
| Scenario `Optimistic update and retry`, last THEN | `preserve the UI draft until explicit reload/rebase, never force overwrite` | After409 the UI shows base/local/current per-field comparison with explicit Mantener/Usar choices, retains untouched local fields at latest values, blocks saving while recovery is incomplete, and a second409 repeats the comparison — never a generic whole-payload rebase. |

Also fold the MODIFIED delta's new scenarios (concurrent active duplicate,
correction of a resolved original, correction after concurrent resolution)
into the synced requirement; the delta spec replaces the canonical
requirement/sections, not an append-only merge.

## 2. Spec sync

- Sync the ADDED requirements R1–R17 of
  `specs/odontogram-human-workflow/spec.md` into
  `openspec/specs/odontogram-human-workflow/spec.md` (new capability).
- Sync the MODIFIED delta of
  `specs/clinical-workspace-discovery/spec.md` into
  `openspec/specs/clinical-workspace-discovery/spec.md` as above.
- Keep `openspec/specs/patient-dental-evolutions/spec.md` untouched unless a
  canonical requirement there also names resolve-and-create correction
  (audited: it does not).
- Run `openspec validate --strict` again after sync.

## 3. Shipped-doc sync (already updated in this change)

- `docs/API.md`: correction endpoint/receipt, entered_in_error status,
  additive catalog metadata, nullable DTO fields, canonical ficha URL state,
  rollback boundary. Verify the shipped wording matches the synced specs.
- `.impeccable/surfaces/patient-workspace.md`: field-aware conflict review,
  actor labels, current/history defaults, canonical URL state.
- `.agents/skills/verify-dental-assistant/features/patients.md`: correction,
  actors, views and navigation manual checks.
- `CHANGELOG.md`: correction/conflict/catalog/URL entry added.

## 4. Archive

Only after a human reviews the above and the strict validation passes:

```powershell
openspec archive harden-odontogram-human-workflow --yes
```

Confirm the archived copy keeps `evidence.md`, checker `.cjs` scripts and
screenshots; they are the audit trail for R10 (CODE/BROWSER/API/DB/TEST).

## 5. Human-review points

- Clinical language: `Corregir registro` vs `Resolver condición`,
  `Se marcará como registrado por error, no como resuelto`, and the
  entered_in_error legend wording — read the actual shipped strings.
- Contrast/screen-reader/virtual-keyboard: contrast measured on the live app
  (all pairs ≥5.17:1), keyboard measured; real assistive technology and
  device virtual keyboards remain NOT COVERED and stay deferred.
- The pre-existing `test_clinical_catalog_build.py` CRLF byte-comparison
  failure in the full backend suite is unrelated to this change; it must be
  fixed under its own issue.
