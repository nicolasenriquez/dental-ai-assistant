# dentalpin-inspired-clinical-workspace

Patient-first clinical workspace informed by DentalPin, preserving Dental AI Assistant's dark/blue identity, Pacientes/Asistente/Chat navigation and approved-evolution boundary. `/patients` remains entry and brand destination. This is an implementation-ready specification, not shipped runtime.

## Reading order and authority

1. `proposal.md`: scope and approved decisions.
2. `specs/clinical-workspace-discovery/spec.md`: observable normative requirements.
3. `patient-clinical-contract.md`: ordered search classification, schema, condition identity and draft transitions.
4. `patient-api-contract.md`: exact routes/DTOs/pagination/errors/retry/event identity.
5. `design.md` and `implementation-blueprint.md`: owners and composition.
6. `tasks.md`: seven bounded slices and real dependency edges.
7. `readiness-review.md`: findings closure, score and evidence/limitations.

Source evidence is descriptive, not target behavior: `codebase-prime.md`, `live-baseline-2026-10-02.md`, `dentalpin-patients-e2e-2026-10-02.md`, `clinical-visual-review-2026-10-02.md`, `evidence.md` and the retained original handoff under references/. The sibling DentalPin checkout is optional once these maps are read.

## Current synthetic visual references

- `wireframes/clinical-workspace.html`: directory/create/compact rail; production uses semantic table and existing mobile drawer.
- `wireframes/patient-detail.html`: Resumen/Información/Actividad sketches; Clínica now opens the diagnostic reference.
- `wireframes/diagnosis.html`: current chart-first diagnostic composition with anatomical families, both dentitions, twelve illustrated tools, surfaces, active/resolved records, draft editor, context-panel reflow and synthetic state selector.

Current diagnostic PNGs: diagnosis-desktop-preview.png, diagnosis-tablet-preview.png, diagnosis-mobile-preview.png, diagnosis-mobile-selection-preview.png, diagnosis-context-preview.png, diagnosis-empty-preview.png, diagnosis-loading-preview.png, diagnosis-error-preview.png and diagnosis-conflict-preview.png under wireframes/. They contain synthetic data only. Old patient-detail diagnostic PNG/glyphs are historical, not acceptance baselines. Other patient-directory/create/collapsed/info/activity PNGs remain structural references.

All wireframes simulate interaction in memory; they do not call patient APIs, prove ownership/concurrency or save clinical data. Browser proof of runtime behavior remains implementation work. Source Notes/IA mobile overlap is explicitly a regression to avoid.
