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

## Installation

```bash
# Git
pi install git:github.com/3DAlgoLab/pi-tdd-pipeline

# Local development
pi -e ./path/to/pi-tdd-pipeline
```

## Commands

| Command | Description |
|---------|-------------|
| `/tdd start <name> <features>` | Start a new TDD pipeline |
| `/tdd stop` | Pause current pipeline |
| `/tdd resume <name>` | Resume a paused pipeline |
| `/tdd status` | Show all pipelines |
| `/tdd cancel <name>` | Delete pipeline state |

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
