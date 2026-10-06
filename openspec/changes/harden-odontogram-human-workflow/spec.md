# Specification contract

The authoritative runtime requirements and scenarios are [specs/odontogram-human-workflow/spec.md](specs/odontogram-human-workflow/spec.md). This index closes the selected scope; it does not duplicate or replace the capability delta.

## Scope

Human manual workflow only. R1–R5 cover correction/persistence/current-state/actor; R6–R7 spatial editing; R8 conflict decisions; R9 navigation; R10 evidence; R11 shared application; R12 bounded exclusions; R13 per-record post-save continuity; R14 symbols/grouping; R15 reference/spatial/navigation compatibility. D-01 and D-02 in investigation.md are the human decisions. design.md fixes transport/storage/retry defaults and tasks.md owns future execution order.

D-03 in investigation.md closes correction recovery after concurrent resolution. The [clinical-workspace-discovery delta](specs/clinical-workspace-discovery/spec.md) modifies the existing identity/correction/recurrence requirement so future synchronization replaces the predecessor resolve-and-create policy instead of retaining contradictory requirements. Canonical specs remain untouched during this preparation.

D-04 authorizes the bounded catalog refinement. R16 fixes backend definitions/additive catalog/schema agreement; R17 fixes shared presentation, unknown/failure behavior and synthetic extensibility without shipping clinical families. See design decision9 and extensibility-audit.md. Backend/SQL authority and Condition-versus-Procedure separation remain required.

## ADDED Requirements

### Requirement: Planning does not authorize clinical implementation
The specification SHALL stop after artifact validation and SHALL NOT register tools, perform clinical writes or change production code in this preparation phase.

#### Scenario: Specification is ready
- **WHEN** required artifacts pass validation and material decisions are closed
- **THEN** readiness is reported and implementation remains a separate explicitly requested workflow

## Acceptance ownership

R1–R4/R11: S1 backend correction; R1/R4: S2 correction UI; R4–R5: S3 readings/actor; R6–R7: S4 spatial editor; R8: S5 conflict review; R9: S6 URL continuity; R13: S2/S4; R14: S3/S4; R15: S4/S6; R10/R12: integrated verification and closeout. No required scenario is covered only by artifact validation.

R16: S3 backend catalog/typed client/real DB agreement. R17: S3 shared resolution/read/list/history/legend and S4 palette/chart/editor/interaction, with S4 blocked by S3's verified contract. Catalog integration also preserves S2's replacement validation and retry guarantees during integrated verification.
