# Historical audit reconciliation

Independent observations were frozen before reading historical conclusions. The historical directory is `docs/design/audits/`, with two report families dated 2026-10-10. Their own skills/results remain attributed to those authors; no Impeccable, Emil or UI/UX Pro Max skill was executed in this pass.

Inventory: `assistant-ux-full-review-2026-10-10/` contains journey/ownership, critique, research, design-engineering review, Shape, polish, R01–R11 traceability, candidates, README and browser evidence. `assistant-independent-uiux-pro-max-2026-10-10/` contains browser inventory, independent assessment, research, PMAX-001–005 matrix, reconciliation, refinement decision, README and fixture/browser evidence. Reports were inspected after freeze; screenshot inventories and relevant responsive/context evidence were compared. Not every historical screenshot/state was rerun. Earlier `design-qa.md` and `docs/assistant-drive-ui-audit.md` are additional historical context, not fresh findings or authorities.

Historical READMEs describe the scope at their creation. In particular, the PMAX report's original exclusions/no-C7 statement predates the active spec's subsequently authorized C7 expansion. Do not use that historical statement to undo current tasks or scope.

| Independent observation | Historical relationship | Current classification | Consequence |
|---|---|---|---|
| SHADCN-001 | R02 decision / R04 retained origin; historical fixture did show a guard | CONFIRMED related symptom; exact guard absence is a served-build variant | Existing C2 covers it. Reproduce after C0; do not infer a regression in HEAD. |
| SHADCN-002 | R08 addressed artifact levels and mentioned avoiding duplicate headings, but did not isolate repeated contextual shell titles | NEW concrete acceptance gap within existing semantic intent | Add local shell requirement and C5 follow-up; preserve artifact hierarchy. |
| SHADCN-003 | R03 measured writing width, but no finding asserted the Sheet border-box formula was overridden | NEW measurable contract gap | Add width ownership requirement in C1; no new library or global width. |
| SHADCN-004 | R10 duplicate Pending destination | CONFIRMED / DUPLICATE recommendation | No new task. Keep existing visibility-aware requirement. |
| SHADCN-005 | R01 same served/local asset mismatch | CONFIRMED / DUPLICATE recommendation | C0 remains the gate; no extra provenance project. |

## Remaining historical findings

| Historical IDs | Current status | Evidence / limitation |
|---|---|---|
| R03 narrow 24.85 px composer | UNVERIFIED for that exact failing composition/build | Current observed collapsed-navigation desktop width 230.95 px and Sheet width 239.56 px do not reproduce or disprove the historical frame. |
| R05 repeated save error; R06 recovery dock; R08 artifact levels; R09 timestamps; R11 failed-read empty state | UNVERIFIED | No populated synthetic artifact, save failure or failed thread read was exercised. Existing tasks remain. |
| R07 Pending pagination reset | UNVERIFIED | Populated list was read; no next-page/retry tested. |
| PMAX-001 same-minute evolution links; PMAX-002 conversation collisions | UNVERIFIED | Did not construct collisions or open clinical result content. C5 5.5 and C7 are already present. |
| PMAX-003 disconnected banner; PMAX-004 long identity | UNVERIFIED | Actual Drive was connected; no maximum-length synthetic identity or disconnected fixture. C6/C7 retain coverage. |
| PMAX-005 Patients filter density | UNVERIFIED / OUT OF SCOPE recommendation | This pass does not expand Patients controls or the active change. |
| F01–F10 continuity history referenced by R report | UNVERIFIED except observed close/reopen text and masked identity strengths | Prior approval, queue, Stop and save evidence is attributed to its fixture run, not claimed as fresh validation. |

No historical issue is marked RESOLVED or IMPROVED solely because this pass did not reproduce it. No historical completion marker was reopened. Two discarded transient observations in this pass are not historical product fixes.

New count: 2 concrete gaps. Previously documented/related count: 3. Existing adequately covered recommendation count: 3. Partially covered/under-specified count: 2. Accepted out-of-scope additions: 0. Rejected visual defect hypotheses: 2; library churn and clinical previews are separately rejected design proposals.
