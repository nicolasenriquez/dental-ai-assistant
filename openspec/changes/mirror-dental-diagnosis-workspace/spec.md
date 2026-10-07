# Aggregate implementation contract

Profile: runtime-change. Approved scope: D01 full plans, D02 clinical lifecycle without budgets, agenda or payments; D03 direct reference application; D04 editable clinical notes without media. This aggregate indexes the normative deltas; it does not replace or duplicate them.

| Capability | Requirement IDs | Normative source |
|---|---|---|
| Diagnosis workspace | W1–W10 | specs/dental-diagnosis-workspace/spec.md |
| Therapeutic records | T1–T5 | specs/patient-dental-treatments/spec.md |
| Clinical plans | P1–P6 | specs/patient-clinical-treatment-plans/spec.md |
| Dental notes | N1–N5 | specs/patient-dental-clinical-notes/spec.md |
| Modified existing workspace | Manual diagnosis, backed activity, chart composition | specs/clinical-workspace-discovery/spec.md |

catalog.md fixes63 therapeutic variants plus12 incumbent findings. design.md fixes ownership, field limits, routes, status transitions, transaction/retry semantics, UI events, visual contract, migration/rollback and test seams. investigation.md records comparator facts, evidence limitations and human decisions. mirror-audit.md fixes source-backed anatomy, motion, notes events and permitted adaptations; notes-contract.md fixes note templates/types/fields and acceptance fixtures; tasks.md is the only execution graph.

Existing condition APIs, IDs, revisions, owner scope, expectedRevision conflict handling, correction links and revision, retry and logical correction protections remain binding; D03 supersedes mandatory create Guardar in chart interactions. Product code is not changed by preparing this specification. No third-party assets, commercial integration, AI-generated clinical action or clinical attachment storage is included.

architecture-cleanup.md fixes deep Module Interfaces, dependency injection Seams, bounded removal inventory and non-destructive contract gates. notes-contract.md separates tooth candidate from highlight and fixes source layout measurements. W8/W9 and N5 make these behavior/cleanup obligations normative.

W10 and visual-parity-contract.md add variant icons, semantic clinical color roles and unobstructed action/modal access. P3 includes next-pending-session item shortcut and atomic optional treatment note on execution. live-parity-audit.md records current native observations and real incumbent test boundaries, not future mirror acceptance.
