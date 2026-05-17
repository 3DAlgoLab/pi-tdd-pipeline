---
name: tdd-pipeline
description: TDD pipeline with loop infrastructure and specialized subagents (test-writer, coder, reviewer, veteran). You (the main agent) plan; subagents execute. Use when implementing features, fixing bugs, or making code changes where correctness and test coverage matter.
---

# TDD Pipeline Workflow

## Philosophy

All code changes MUST be delegated to subagents. You are the orchestrator — you plan, route, review gates, and present results. You never write implementation code directly.

## ⛔ Hard Rules

1. **NEVER write implementation code directly.** All code changes go through `coder`.
2. **NEVER skip the review gate.** No result is presented to the user without `reviewer` saying `PASS`.
3. **NEVER skip a step.** The workflow below is sequential.
4. **NEVER advance to the next feature until the current feature is fully complete** (reviewer PASS or final failure report).

## Pipeline Setup

Before running the TDD pipeline, use the `tdd` tool to initialize the pipeline:

```
tdd(command='start', name='<pipeline_name>', features=['feature1', 'feature2', 'feature3'])
```

This creates a task file in `.tdd/` with the feature checklist.

Available commands:
- `start` — Initialize a new pipeline (requires `name` and `features`)
- `stop` — Pause the current pipeline
- `resume` — Resume a paused pipeline (requires `name`)
- `status` — List all pipelines
- `cancel` — Delete pipeline state (requires `name`)

## ✅ Required Workflow (every feature/bug, no exceptions)

| Step | Action                                          | Who                    | Gate condition to proceed                  |
| ---- | ----------------------------------------------- | ---------------------- | ------------------------------------------ |
| 1    | Interview user, read codebase, write plan file  | **YOU**                | Plan file written, including test cases    |
| 2    | Write failing tests from the spec               | **test-writer**        | Tests written (expected to fail initially) |
| 3    | Implement changes to pass the tests             | **coder**              | All tests pass                             |
| 4    | Fix failures (if any)                           | **coder**              | Max 2 retries → then escalate to `veteran` |
| 5    | Review code quality, correctness, security      | **reviewer**           | Reviewer says PASS                         |
| 6    | If reviewer says NEEDS CHANGES → back to step 3 | **coder**              | Re-test (step 2) then re-review (step 5)   |
| 7    | If there is remaining items, goto next item or Present final result to user | **YOU** | Only after reviewer PASS      |

> **Track Progress:** After reviewer says PASS, edit `.tdd/<pipeline_name>.md` and mark the feature `[x]` in the checklist. That file is the single source of truth for progress — `tdd status` and `tdd resume` read it.

## Planning Process

Before running the TDD pipeline, you MUST reach a shared understanding of the task:

1. **Interview the user**  
   - Interview me(user) relentlessly about every aspect of this plan until we reach a shared understanding. 
   - For each question, provide your recommended answer.
   - **Ask the questions one at a time.**   
2. **Explore the codebase** — If a question can be answered by reading files, do it instead of asking.
3. **Resolve each branch** — Walk down the decision tree until all tradeoffs are clear.

Based on this investigation, write a plan file:
- File name: `plan_[YYMMDD]_[hhmmss].md`
- Save location: Project root or `.pi/plans/`

### Plan File Format

```markdown
# Task Title

Brief description.

## Goals
- Goal 1
- Goal 2

## Checklist
- [ ] Item 1
- [ ] Item 2
- [x] Completed item

## Verification
- Evidence, commands run, or file paths

## Notes
(Blockers, decisions, reflections)
```

### Keep the Plan File Updated

The plan file is your working record. Update it at each milestone:
- **After each feature passes review:** mark the corresponding checklist item `[x]`
- **After each feature passes review:** add a line under `## Verification` with evidence (file paths, test results)
- **When a blocker arises:** note it under `## Notes`

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
3. **Advance** to the next feature (or complete the loop if last)

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
