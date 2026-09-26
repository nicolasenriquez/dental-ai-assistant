# Release policy

`--release-check` checks generated artifact parity and declared states. For
every active concept it requires:

- `review_status = "approved"` — a dentist reviewed wording, terms, and aliases
- `provenance_status = "documented"` — authorship and paraphrase basis recorded

and, for every source referenced by an active concept:

- `license_status = "cleared"` — reuse rights established
- `review_status = "reviewed"` — rights analysis recorded

All imported cards and sources are unresolved, so the gate fails today. That
is the correct state: `docs/clinical-grounding.md` holds release until
permission and entry-level evidence exist. Passing the build or checksum
proves artifact identity, never rights or clinical correctness.

State fields alone cannot prove authorship, clinical correctness, or rights.
Clearing a source or card requires recorded human review and evidence. No agent
may set `approved` or `cleared` on its own. If
clearance cannot be established, replace the affected entries with
independently authored, reviewed wording and rebuild.
