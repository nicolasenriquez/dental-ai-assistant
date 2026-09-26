# Sources

Machine-readable provenance registry. `sources.toml` is the single source of
truth for every source any concept cites.

Inputs: source documentation, publisher terms, and review findings.
Process: add or update a `[[source]]` entry; record `license_status`,
`review_status`, `reviewed_at`, and `reuse_notes` honestly.
Outputs: the compiled `sources` block in the runtime JSON, plus the generated
manifest's per-source dependency lists.
Human check: rights review is recorded before any `cleared` value; do not
invent permission, and do not copy source text into this tree.
