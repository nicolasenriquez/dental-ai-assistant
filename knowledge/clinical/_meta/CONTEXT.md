# _meta — rules and policies

Factory files. Stable across builds; no concept content lives here.

| File | Answers |
|---|---|
| `catalog.toml` | catalog identity and editorial policy (compiled into runtime JSON) |
| `schema.md` | concept card schema and allowed field values |
| `source-policy.md` | when and how a source is registered |
| `clinical-safety.md` | evidence boundaries terminology must never cross |
| `release-policy.md` | what `--release-check` enforces |

Human check: policy changes need review by the clinical owner before
`--release-check` can pass.
