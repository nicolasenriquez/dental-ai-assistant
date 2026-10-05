# dentalpin-inspired-clinical-workspace

Patient-first clinical workspace informed by DentalPin, preserving Dental AI Assistant's dark/blue identity, Pacientes/Asistente/Chat navigation and approved-evolution boundary. `/patients` remains entry and brand destination. All seven implementation slices and the integrated gate are verified in the local production build. See execution-slices-7-8-2026-10-03.md for final evidence; deployment, main-spec sync and archive remain separate operations.

## Reading order and authority

1. `proposal.md`: scope and approved decisions.
2. `specs/clinical-workspace-discovery/spec.md`: observable normative requirements.
3. `patient-clinical-contract.md`: ordered search classification, schema, condition identity and draft transitions.
4. `patient-api-contract.md`: exact routes/DTOs/pagination/errors/retry/event identity.
5. `design.md` and `implementation-blueprint.md`: owners and composition.
6. `tasks.md`: seven bounded slices and real dependency edges.
7. `readiness-review.md`: findings closure, score and evidence/limitations.

8. `audit-2026-10-03/report.md`: current scoped UX comparison,15/15 source ficha coverage, priorities and screenshots. Read the UI-01…UI-09 section in implementation-blueprint.md before composing the directory, header or modal.

Source evidence is descriptive, not target behavior: `codebase-prime.md`, `live-baseline-2026-10-02.md`, `dentalpin-patients-e2e-2026-10-02.md`, `clinical-visual-review-2026-10-02.md`, `evidence.md` and the retained original handoff under references/. The sibling DentalPin checkout is optional once these maps are read.

The numbered order above is the canonical document precedence. It does not authorize resolving contradictions by inference: stop the affected slice and report the conflict before implementation. Source observations and historical screenshots never override approved target contracts.

Latest approved correction: hide RUT in directory rows/cards while retaining private RUT search; show Phone/Mail/IdCard header controls with deliberate hover/focus/tap disclosure and masked RUT. Keep existing action buttons, four local tabs and sidebar appearance. Phone/email semantics are fixed in patient-api-contract.md. tasks.md now starts with AI Implementation Guardrails and requires serial verified slices.

## Current synthetic visual references

- `wireframes/clinical-workspace.html`: directory/create/compact rail; production uses semantic table and existing mobile drawer.
- `wireframes/patient-detail.html`: Resumen/Información/Actividad sketches; Clínica now opens the diagnostic reference.
- `wireframes/diagnosis.html`: current chart-first diagnostic composition with anatomical families, both dentitions, twelve illustrated tools, surfaces, active/resolved records, draft editor, context-panel reflow and synthetic state selector.

Current diagnostic PNGs: diagnosis-desktop-preview.png, diagnosis-tablet-preview.png, diagnosis-mobile-preview.png, diagnosis-mobile-selection-preview.png, diagnosis-context-preview.png, diagnosis-empty-preview.png, diagnosis-loading-preview.png, diagnosis-error-preview.png and diagnosis-conflict-preview.png under wireframes/. They contain synthetic data only and precede the sidebar adjustment. Directory/ficha/shell PNGs under wireframes/ are historical after the2026-10-03 polish; audit-2026-10-03/22–26 record the preceding polish and predate the latest directory/header correction. The three HTML files remain the editable composition references. patient-detail.html contains no obsolete diagnostic implementation; Clínica opens diagnosis.html.

All wireframes simulate interaction in memory; they do not call patient APIs, prove ownership/concurrency or save clinical data. Browser proof of runtime behavior remains implementation work. Source Notes/IA mobile overlap is explicitly a regression to avoid.
