# Source policy

A source is anything a definition paraphrases or aligns with. Register it in
`sources/sources.toml` before citing it from a card.

Required fields: identity (`name`, `organization`, `type`, `url`, `scope`),
`license_status`, and `review_status`. Claims about permission must be
documented in the registry; never invent clearance.

- Write short, independently authored paraphrases. Do not reproduce
  copyrighted text, licensed excerpts, or ISO content.
- ADA, AAO, ISO, and MINSAL material carries reuse restrictions. Their reuse
  rights remain unresolved until documented per source.
- Only sources with `license_status = "cleared"` and
  `review_status = "reviewed"` can satisfy `--release-check`.
- The runtime JSON receives only name/organization/type/url/scope. Review and
  licensing fields stay in the registry and appear in the generated manifest
  with the concepts that depend on each source.
