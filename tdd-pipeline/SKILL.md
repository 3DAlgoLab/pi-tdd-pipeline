---
name: pi-tdd-pipeline
description: TDD pipeline with loop infrastructure and specialized subagents (test-writer, coder, reviewer, veteran). You (the main agent) plan; subagents execute. Use when implementing features, fixing bugs, or making code changes where correctness and test coverage matter.
---

# TDD Pipeline Workflow

## Philosophy

All code changes MUST be delegated to subagents. You are the orchestrator — you plan, route, review gates, and present results. You never write implementation code directly.

## ⛔ Hard Rules

1. **NEVER write implementation code directly.** All code changes go through `coder`.
2. **NEVER skip the review gate.** No result is presented to the user without `reviewer` saying `PASS`.
3. **NEVER skip a step.** The workflow below is sequential.
4. **NEVER call tdd_done until the current feature is fully complete** (reviewer PASS or final failure report).

## ✅ Required Workflow (every feature/bug, no exceptions)

| Step | Action                                          | Who                    | Gate condition to proceed                  |
| ---- | ----------------------------------------------- | ---------------------- | ------------------------------------------ |
| 1    | Read codebase, plan implementation, write spec  | **YOU**                | Spec written, including test cases         |
| 2    | Write failing tests from the spec               | **test-writer**        | Tests written (expected to fail initially) |
| 3    | Implement changes to pass the tests             | **coder**              | All tests pass                             |
| 4    | Fix failures (if any)                           | **coder**              | Max 2 retries → then escalate to `veteran` |
| 5    | Review code quality, correctness, security      | **reviewer**           | Reviewer says PASS                         |
| 6    | If reviewer says NEEDS CHANGES → back to step 3 | **coder**              | Re-test (step 2) then re-review (step 5)   |
| 7    | If there is remaining items, goto next item or Present final result to user | **YOU** | Only after reviewer PASS      |

> **Track Progress:** Update the checklist in the task file as each item is completed. Mark items with `[x]` when finished.

## Escalation: veteran → YOU

After 3 review cycles (step 5→6 loop) without `PASS`:

1. **Consult veteran** — delegate full context (task, plan, all coder outputs, all reviewer feedback) to `veteran`
2. **YOU decide:**
   - **Retry** — pass the veteran's strategic advice back to `coder`, then through `reviewer` again (one final attempt)
   - **Stop** — present the current state to the user with your analysis of the blocker

The veteran advises YOU — it does not edit files or replace workflow steps.

## Final Failure: When Even the Veteran Can't Save It

If the final retry also fails:

1. **Write a structured failure report** to `.tdd/<loop-name>-failure.md`:
   - Task summary
   - Plan
   - Code changes made
   - All reviewer feedback
   - Veteran's diagnosis
   - Current blockers
2. **Present the failure to the user** with the report path and a clear summary
3. **Call `tdd_done`** to advance to the next feature (or complete the loop if last)

## 🔍 Self-audit (before every response to user)

Before responding to the user, verify:
- [ ] Did I delegate code changes to `coder`? (Not write them myself?)
- [ ] Did `reviewer` say `PASS`? (Or did I make a final decision after 3 review cycles?)
- [ ] Did I write a failure report if the final retry failed?
- If any answer is NO → return to the workflow.

## Agent Reference

These agents are bundled with the extension and available via subagent:

| Agent | Role |
|-------|------|
| `test-writer` | Writes failing tests from the spec (red phase) |
| `coder` | Implements changes to pass the tests (green phase) |
| `reviewer` | Validates code and tests for correctness, security, coverage |
| `veteran` | Senior consultant called when workflow stalls |
