# Concepts

One independently reviewable concept per Markdown file with TOML frontmatter.
Files live in a folder named after the concept's `domain`. Create a domain
folder only when a real card occupies it; do not scaffold empty domains.

Current domains: `cirugia_oral`, `dolor_orofacial`, `endodoncia`,
`imagenologia`, `implantologia`, `odontologia_general`, `odontopediatria`,
`ortodoncia`, `patologia_oral`, `periodoncia`, `rehabilitacion_oral`.

Inputs: the card itself, `../sources/sources.toml`, `../_meta/schema.md`.
Process: edit one card; keep `ordinal` stable; rebuild and check.
Outputs: compiled runtime catalog entries (generated; never edited here).
Human check: a dentist reviews the `# Definition`, terms, and aliases before
`review_status` becomes `approved`, and provenance must be documented in the
same change.
