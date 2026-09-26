# Concept schema

One concept per Markdown file: a `+++` TOML frontmatter block, then a
`# Definition` section. Additional `#` sections are authoring notes and never
enter the runtime catalog. The file name equals the concept `id` plus `.md`.

## Fields

| Field | Required | Rule |
|---|---|---|
| `id` | yes | stable dotted ID, e.g. `ortho.tad` |
| `ordinal` | yes | integer preserving runtime array order; never renumber existing cards |
| `domain` | yes | folder name under `concepts/` |
| `category` | yes | e.g. `anatomia`, `procedimiento` |
| `term_es` | yes | preferred Spanish term |
| `term_en` | yes | preferred English term |
| `aliases` | yes | list of strings; may be empty; order preserved |
| `tags` | yes | list of strings; order preserved |
| `source_ids` | yes | IDs from `../sources/sources.toml` |
| `status` | yes | `active` or `inactive`; inactive cards stay in the tree and leave the runtime catalog |
| `review_status` | yes | `legacy_unreviewed`, `in_review`, or `approved` |
| `provenance_status` | yes | `unresolved` or `documented` |
| `runtime_metadata` | no | extra runtime metadata keys, e.g. `chile_usage` |

Sections:

- `# Definition` — required; compiled verbatim into the runtime definition.
- `# Boundaries` — optional human guidance; never compiled.

Runtime array order follows `ordinal`. The reviewed catalog checksum covers
array order, so imports must preserve it and new cards must append.
The catalog's `locale = "es-CL"` and terminology-only scope live once in
`_meta/catalog.toml` and the compiler, respectively.

## Migration state

All 161 imported cards are `legacy_unreviewed` + `unresolved`. The mechanical
import preserved definitions, aliases, tags, source links, and order; it is
not clinical review. Unknown metadata fields were preserved under
`runtime_metadata`; nothing was silently dropped.

## Build contract

`app/backend/scripts/build_clinical_catalog.py` reuses the runtime validator,
so a card set that compiles is loadable by the application unchanged. The
compiler rejects duplicate IDs or ordinals, unknown source IDs, malformed
aliases, missing metadata, wrong locale or schema, and any state where TAD,
TMJ, CBCT, or BOP does not resolve to exactly one active concept.
