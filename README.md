# pi-tdd-pipeline

TDD pipeline with loop infrastructure and specialized subagents for [Pi](https://github.com/earendil-works/pi).

## What It Does

Provides a structured TDD workflow where the main agent orchestrates specialized subagents through a sequential pipeline:

```
You (plan) → test-writer → coder → reviewer → (pass/fail)
```

- **Loop infrastructure** — Start, pause, resume, and track multi-feature TDD pipelines
- **Single-mode subagent** — Delegate to bundled agents with isolated context
- **Bundled agents** — No external dependencies; all agents ship with the package

## Agents

| Agent | Role |
|-------|------|
| `test-writer` | Writes failing tests from the spec (red phase) |
| `coder` | Implements changes to pass the tests (green phase) |
| `reviewer` | Validates code and tests for correctness, security, coverage |
| `veteran` | Senior consultant called when the pipeline stalls |

## How It Works

### Planning

Before the pipeline runs, the main agent interviews you about the task — asking targeted questions, exploring the codebase, resolving tradeoffs — until there's a shared understanding. Then it writes a plan file (`plan_[YYMMDD]_[hhmmss].md`) with goals, checklist, and test cases.

### TDD Pipeline

For each feature, the pipeline runs sequentially:

1. **Test Writer** — Writes failing tests from the plan (red phase)
2. **Coder** — Implements code to pass the tests (green phase)
3. **Reviewer** — Validates code and tests; if `NEEDS CHANGES`, coder retries
4. **Veteran** — Escalation after 3 review cycles without `PASS`

If even the veteran's final retry fails, a structured failure report is written to `.tdd/<name>-failure.md` and presented to you.

### Loop Control

Use `/tdd` commands to manage multi-feature pipelines:

| Command | Description |
|---------|-------------|
| `/tdd start <name> <features>` | Start a new TDD pipeline |
| `/tdd stop` | Pause current pipeline |
| `/tdd resume <name>` | Resume a paused pipeline |
| `/tdd status` | Show all pipelines |
| `/tdd cancel <name>` | Delete pipeline state |

## Configuration

The bundled agents use `dpi-factory/coder` as the default model. Before using the pipeline, update the `model` field in each agent file (`agents/*.md`) to match your preferred model. For example:

```yaml
---
name: coder
description: ...
model: openai/gpt-4o
---
```

The `veteran` agent defaults to `deepseek/deepseek-v4-pro` — change it if you prefer a different model for escalation.

## Installation

```bash
# Git
pi install git:github.com/3DAlgoLab/pi-tdd-pipeline

# Local development
pi -e ./path/to/pi-tdd-pipeline
```

## Structure

```
pi-tdd-pipeline/
├── index.ts              # Extension (loop + subagent)
├── package.json          # Pi package manifest
├── agents/               # Bundled agents
│   ├── test_writer.md
│   ├── coder.md
│   ├── reviewer.md
│   └── veteran.md
└── tdd-pipeline/
    └── SKILL.md          # TDD workflow
```
