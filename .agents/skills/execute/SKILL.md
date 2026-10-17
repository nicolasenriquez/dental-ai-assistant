---
name: execute
description: "Execute an implementation plan: read it fully, implement tasks in order, run validations."
argument-hint: "[path-to-plan] [--sync-issues]"
disable-model-invocation: true
---

# Execute: Implement from Plan

## Plan to Execute

Read first non-flag argument as plan file: `$ARGUMENTS`
Strip optional flags such as `--sync-issues` before resolving the path.

Select execution mode from path:

- A regular plan uses existing `Step by Step Tasks` behavior.
- An OpenSpec plan is `openspec/changes/<change-name>/tasks.md`.
- `--sync-issues` is opt-in and only applies to OpenSpec plans.

Keep regular-plan behavior unchanged.

## Execution Instructions

### 1. Read and Understand

- Read the ENTIRE plan carefully
- Understand all tasks and their dependencies
- Note the validation commands to run
- Review the testing strategy

### 2. Execute Regular Plan Tasks in Order

For EACH task in "Step by Step Tasks":

#### a. Navigate to the task
- Identify the file and action required
- Read existing related files if modifying

#### b. Implement the task
- Follow the detailed specifications exactly
- Maintain consistency with existing code patterns
- Include proper type hints and documentation
- Add structured logging where appropriate

#### c. Verify as you go
- After each file change, check syntax
- Ensure imports are correct
- Verify types are properly defined

### 3. Execute OpenSpec Tasks

When plan path is an OpenSpec `tasks.md`:

1. Resolve change name from path.
2. Run `openspec status --change "<change-name>" --json`.
3. Run `openspec instructions apply --change "<change-name>" --json`.
4. Read every context file returned by `contextFiles`.
5. Read `## Execution Order` when present. Use it instead of numeric order.
6. Use numeric order only when the change has one simple slice and no explicit
   dependency edge.
7. Inventory pending, completed, blocked, and validation-gate tasks.
8. Require every pending checkbox task to have an adjacent `Traceability:` line.
9. When an implementation SDLC map is referenced, require mapped tasks to use:

   ```text
   Traceability: Group G1; Slice S1; Issue 18; Acceptance AC 18.1, AC 18.2.
   ```

10. Pause before implementation when task IDs are missing, execution order is
    cyclic, or issue traceability is ambiguous.

For each pending OpenSpec task:

- announce task ID, group, slice, issue, and acceptance identifiers;
- read related repository files before editing;
- implement only task scope;
- run task-level validation;
- mark its checkbox `[x]` immediately after proof passes;
- append adjacent `Notes:` with concise evidence;
- save `tasks.md` before continuing.

Completed retrospective tasks may be reconciled from existing evidence. Do not
reimplement work that the source issue already proves complete.

### 4. Synchronize Linked Issues

Synchronize scratch issues only when argument includes `--sync-issues`.

Before changing any issue, resolve its source map from OpenSpec `proposal.md`
`## Notes` or task traceability context. Require one unique issue file.

For each completed OpenSpec task with explicit issue traceability:

- append a dated entry under the issue `## Progress`;
- include OpenSpec task ID and validation evidence;
- replace `OpenSpec: decisión humana pendiente` with the change name when the
  link is first established;
- mark only explicitly mapped acceptance checkboxes whose proof is complete;
- preserve unchecked criteria when proof is incomplete;
- preserve `ready-for-human` when human review remains required;
- set `Status: done` only when all issue criteria and required validation pass;
- leave status unchanged and append the blocker when work is blocked.

Never infer an issue from task numbering. Never update a Wayfinder decision
issue. Pause before mutation when issue identity or acceptance ownership is
ambiguous.

Save the OpenSpec task file and each linked issue after every completed task.

### 5. Implement Testing Strategy

After completing implementation tasks:

**Recommended Approach:** Write failing tests first for complex logic (especially path handling, type conversions). This provides faster feedback than implementing then testing.

- Create all test files specified in the plan
- Implement all test cases mentioned
- Follow the testing approach outlined
- Ensure tests cover edge cases

### 6. Run Validation Commands

Execute validation commands from the plan in order. Skip commands on tasks
marked `Human-gated:` unless the user explicitly requested them.

```bash
# Run each command exactly as specified in plan
```

If any command fails:
- Fix the issue
- Re-run the command
- Continue only when it passes

### 7. Final Verification

Before completing:
- All tasks from plan completed
- All tests created and passing
- All validation commands pass
- Code follows project conventions
- Documentation added/updated as needed
- OpenSpec task checkboxes and adjacent `Notes:` lines match completed work
- When `--sync-issues` is used, linked issue progress and acceptance criteria
  match explicit task traceability

## Output Report

Provide summary:

### Completed Tasks
- List of all tasks completed
- For OpenSpec plans, include task ID, group, slice, and linked issue IDs
- Files created (with paths)
- Files modified (with paths)

### Tests Added
- Test files created
- Test cases implemented
- Test results

### Validation Results
```bash
# Output from each validation command
```

### Ready for Commit
- Confirm all changes are complete
- Confirm all validations pass
- Ready for `/commit` command

## Notes

- If you encounter issues not addressed in the plan, document them
- If you need to deviate from the plan, explain why
- If tests fail, fix implementation until they pass
- Don't skip validation steps
- OpenSpec mode must not update scratch issues without `--sync-issues`
