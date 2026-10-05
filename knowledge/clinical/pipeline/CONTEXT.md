# Pipeline — intake → review → release

Working files stay in `../concepts/<domain>/` and `../sources/sources.toml`.
No patient data belongs here. Rules live in `../_meta/`; release hold lives in
`../../../docs/clinical-grounding.md`.

1. **Intake.** Input: source and proposed term/definition. Register source,
   then draft concept using `../_meta/schema.md`. Output: one concept card,
   plus registry entry if new. Human check: concept belongs in glossary;
   source exists and is citable.
2. **Review.** Input: card and cited sources. Check wording, aliases, safety
   boundaries (`../_meta/clinical-safety.md`), authorship, and reuse rights.
   Output: updated card and source review fields. Human check: clinical and
   rights reviewers record actual evidence; unresolved stays unresolved.
3. **Release.** Input: reviewed cards and sources. From `app/backend/`, run
   `uv run python scripts/build_clinical_catalog.py --write`, then `--check`
   and `--release-check`. Output: generated JSON, SHA-256, and manifest under
   `app/backend/data/`. Human check: generated diff matches reviewed cards;
   release check passes before any shared/production deployment.
