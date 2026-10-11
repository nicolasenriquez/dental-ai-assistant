# OpenSpec traceability and gap analysis

Active change: `refine-clinical-assistant-ux`, schema `spec-driven`. The only other changes are archived. Read proposal, design, tasks and all three capability deltas. Existing future implementation tasks are unchecked; audit completion does not complete them. C0 must reconcile the now-archived continuity predecessor and prove served-build provenance. This pass does neither on behalf of implementation.

| Finding | Evidence | Existing requirement / task | Classification | Action |
|---|---|---|---|---|
| SHADCN-001 | 17; close/reopen observation | Accessible unsent-work context decision; Truthful retained composer origin / 2.1–2.4 | COVERED | Record served-build variant; no duplicate guard task. Future reproduction should include closing/reopening before changing context. |
| SHADCN-002 | 15/16 and heading JSON | Composition-aware artifact headings / 5.1–5.4 | PARTIALLY COVERED | Existing artifact hierarchy does not explicitly specify contextual shell/empty hierarchy. Add a separate narrowly named requirement and 5.6. |
| SHADCN-003 | 16 and dialog geometry | Pane-aware clinical writing layout / 1.1–1.3; surface formula | UNDER-SPECIFIED | Writing acceptance alone permits the wrong wrapper width. Add Sheet width ownership requirement and 1.4. |
| SHADCN-004 | Initial header and expanded sidebar DOM observation | Visibility-aware pending navigation / 5.3–5.4 | COVERED | Keep incumbent acceptance. No new task. |
| SHADCN-005 | provenance.json | C0 / 0.1–0.2 | COVERED | Keep gate. No build restart or application patch. |

Neither new refinement adds an endpoint, persistence rule, component dependency, runtime state machine, provider or new UI flow. Both are existing contextual composition contracts. The two additional tasks run within C1/C5 before dependent C6/C7/integrated verification. Existing task text, IDs and checkboxes remain unchanged.

## Exact additive changes

- `proposal.md`: one source/refinement note.
- `design.md`: one bounded decision section with ownership, reference and regression constraints.
- `tasks.md`: task 1.4 in C1 and task 5.6 in C5; both unchecked. Each includes reproduction, minimal correction, focused regression and rendered proof.
- `specs/conversational-runtime/spec.md`: `Contextual Assistant Sheet width ownership`, three scenarios.
- `specs/clinical-agentic-feedback/spec.md`: `Single contextual Assistant shell title`, two scenarios.

No existing requirement or task is rewritten. `clinical-workspace-discovery` is unchanged. DESIGN.md, PRODUCT.md and surface briefs stay untouched during this specification pass; later implementation updates only the relevant brief if necessary.

## Dependencies and risk

```text
Continuity reconciliation + C0 provenance
  -> C1, including 1.4 Sheet width proof
  -> C2 original-context safety
  -> C3/C4 recovery and pagination
  -> C5, including 5.6 contextual hierarchy proof
  -> C6 -> C7 -> integrated verification
```

This is sequencing guidance; the existing design remains the dependency authority. Do not make C1 depend on C5 or C5 on later C6. Wider Sheet content can change wrapping, local scroll and focus behavior. A global `.drive-sheet-content` width edit would change Drive/profile consumers and is rejected. Removing the wrong title could remove the dialog's accessible name or flatten artifact sections; preserve SheetTitle and use the existing caller seams.

Validation: strict OpenSpec validation; compare all original requirements/scenarios/task lines to `spec-before.json`; check evidence paths, duplicate requirement names and changed file scope. Application suites are implementation gates and were not run for these documentary edits.
