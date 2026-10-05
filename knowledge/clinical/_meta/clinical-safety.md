# Clinical safety boundaries

The runtime keeps evidence classes separate: `CURRENT_INPUT`,
`PATIENT_EVIDENCE`, and `TERMINOLOGY_EVIDENCE`. A terminology definition is
vocabulary, never a patient fact. It cannot establish a diagnosis, finding,
procedure, indication, laterality, certainty, history, or patient attribute.

- Exact matches may be authoritative; fuzzy candidates never are.
- TAD, TMJ, CBCT, and BOP must each resolve to exactly one active concept.
  The build fails otherwise, and so does application startup.
- Unknown or ambiguous terms stay literal or are clarified. They are never
  expanded by guessing; `TAD en IZC` must not invent a meaning for IZC.
- `# Boundaries` sections document what a definition must not be used to
  infer. They are guidance for reviewers, not runtime constraints.
- Patient records never belong in this workspace or in build artifacts.
