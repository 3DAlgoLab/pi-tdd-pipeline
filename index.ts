/**
 * TDD Pipeline - TDD workflow with loop infrastructure and specialized subagents.
 *
 * Provides:
 * - Single-mode subagent (delegates to bundled agents)
 * - Loop infrastructure (start/stop/resume/iteration tracking)
 *
 * Agents are bundled in the agents/ directory and loaded automatically.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { spawn } from "node:child_process";
import { Type } from "typebox";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

// ============================================================================
// CONSTANTS
// ============================================================================

const TDD_DIR = ".tdd";
const AGENTS_DIR = path.join(__dirname, "agents");

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

interface PipelineState {
  name: string;
  features: string[];
  currentFeatureIndex: number;
  status: "active" | "paused" | "completed";
  startedAt: string;
  completedAt?: string;
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_");
}

function getPath(ctx: ExtensionContext, name: string, ext: string): string {
  return path.join(TDD_DIR, `${sanitize(name)}${ext}`);
}

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function tryRead(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function loadState(ctx: ExtensionContext, name: string): PipelineState | null {
  const content = tryRead(getPath(ctx, name, ".state.json"));
  return content ? JSON.parse(content) : null;
}

function saveState(ctx: ExtensionContext, state: PipelineState): void {
  const filePath = getPath(ctx, state.name, ".state.json");
  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");
}

function listPipelines(ctx: ExtensionContext): PipelineState[] {
  const dir = path.join(ctx.cwd, TDD_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".state.json"))
    .map((f) => {
      const content = tryRead(path.join(dir, f));
      return content ? JSON.parse(content) : null;
    })
    .filter((s): s is PipelineState => s !== null);
}

// ============================================================================
// AGENT LOADING
// ============================================================================

interface AgentConfig {
  name: string;
  description: string;
  tools?: string[];
  model?: string;
  systemPrompt: string;
  filePath: string;
}

function loadBundledAgents(): AgentConfig[] {
  const agents: AgentConfig[] = [];

  if (!fs.existsSync(AGENTS_DIR)) {
    return agents;
  }

  const entries = fs.readdirSync(AGENTS_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.name.endsWith(".md")) continue;
    if (!entry.isFile()) continue;

    const filePath = path.join(AGENTS_DIR, entry.name);
    const content = fs.readFileSync(filePath, "utf-8");

    // Parse frontmatter (simple YAML-like)
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!frontmatterMatch) continue;

    const frontmatterText = frontmatterMatch[1];
    const body = frontmatterMatch[2];

    const nameMatch = frontmatterMatch[1].match(/^name:\s*(.+)$/m);
    const descMatch = frontmatterMatch[1].match(/^description:\s*(.+)$/m);
    const modelMatch = frontmatterMatch[1].match(/^model:\s*(.+)$/m);
    const toolsMatch = frontmatterMatch[1].match(/^tools:\s*(.+)$/m);

    if (!nameMatch || !descMatch) continue;

    agents.push({
      name: nameMatch[1].trim(),
      description: descMatch[1].trim(),
      model: modelMatch ? modelMatch[1].trim() : undefined,
      tools: toolsMatch ? toolsMatch[1].split(",").map((t) => t.trim()) : undefined,
      systemPrompt: body,
      filePath,
    });
  }

  return agents;
}

// ============================================================================
// SUBAGENT (SINGLE MODE ONLY)
// ============================================================================

function formatUsageStats(usage: { input: number; output: number; turns: number }): string {
  const parts: string[] = [];
  if (usage.turns) parts.push(`${usage.turns} turn${usage.turns > 1 ? "s" : ""}`);
  if (usage.input) parts.push(`↑${usage.input}`);
  if (usage.output) parts.push(`↓${usage.output}`);
  return parts.join(" ");
}

// ============================================================================
// LOOP INFRASTRUCTURE
// ============================================================================

const STATUS_ICONS: Record<string, string> = { active: "▶", paused: "⏸", completed: "✓" };

function updateUI(ctx: ExtensionContext): void {
  // No active loop tracking - UI updates happen on command execution
}

function formatPipeline(p: PipelineState): string {
  const status = `${STATUS_ICONS[p.status]} ${p.status}`;
  const progress = `${p.currentFeatureIndex + 1}/${p.features.length}`;
  return `${p.name}: ${status} (feature ${progress})`;
}

// ============================================================================
// COMMANDS
// ============================================================================

const HELP = `TDD Pipeline - TDD workflow with loop infrastructure

Commands:
  /tdd start <name> <features>  Start a new TDD pipeline
  /tdd stop                     Pause current pipeline
  /tdd resume <name>            Resume a paused pipeline
  /tdd status                   Show all pipelines
  /tdd list                     Show all pipelines
  /tdd cancel <name>            Delete pipeline state

Features should be comma-separated or listed one per line.

Example:
  /tdd start auth "Add login, Fix session, Refresh token"`;

export default function (pi: ExtensionAPI) {
  // Load bundled agents
  const agents = loadBundledAgents();

  // Register subagent tool (single mode only)
  pi.registerTool({
    name: "subagent",
    label: "Subagent",
    description: "Delegate tasks to specialized subagents with isolated context. Only single mode is supported.",
    parameters: Type.Object({
      agent: Type.String({ description: "Name of the agent to invoke" }),
      task: Type.String({ description: "Task to delegate to the agent" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const agent = agents.find((a) => a.name === params.agent);
      if (!agent) {
        const available = agents.map((a) => a.name).join(", ") || "none";
        return {
          content: [{ type: "text", text: `Unknown agent: "${params.agent}". Available: ${available}` }],
          details: {},
        };
      }

      // Build CLI args for the subagent invocation
      const args: string[] = ["--mode", "json", "-p", "--no-session"];
      if (agent.model) args.push("--model", agent.model);

      // Write system prompt to temp file
      const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-tdd-"));
      const tmpPath = path.join(tmpDir, `${sanitize(agent.name)}.md`);
      await fs.promises.writeFile(tmpPath, agent.systemPrompt, "utf-8");
      args.push("--append-system-prompt", tmpPath);
      args.push(`Task: ${params.task}`);

      // Get the pi invocation
      const currentScript = process.argv[1];
      const isBunVirtual = currentScript?.startsWith("/$bunfs/root/");
      if (currentScript && !isBunVirtual && fs.existsSync(currentScript)) {
        return {
          content: [{ type: "text", text: "Subagent execution requires pi subprocess" }],
          details: {},
        };
      }

      // Spawn the subagent process
      const exitCode = await new Promise<number>((resolve) => {
        const proc = spawn("pi", args, {
          cwd: ctx.cwd,
          shell: false,
          stdio: ["ignore", "pipe", "pipe"],
        });

        let buffer = "";
        let output = "";

        proc.stdout.on("data", (data) => {
          buffer += data.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) return;
            try {
              const event = JSON.parse(line);
              if (event.type === "message_end" && event.message) {
                const msg = event.message;
                if (msg.role === "assistant") {
                  for (const part of msg.content) {
                    if (part.type === "text") output += part.text;
                  }
                }
              }
            } catch {
              // Ignore non-JSON lines
            }
          }
        });

        proc.on("close", (code) => {
          resolve(code ?? 0);
        });

        proc.on("error", () => {
          resolve(1);
        });
      });

      // Clean up temp file
      try {
        fs.unlinkSync(tmpPath);
        fs.rmdirSync(tmpDir);
      } catch {
        // Ignore cleanup errors
      }

      if (exitCode !== 0) {
        return {
          content: [{ type: "text", text: `Agent ${params.agent} failed (exit code ${exitCode})` }],
          details: {},
        };
      }

      return {
        content: [{ type: "text", text: output || "(no output)" }],
        details: {},
      };
    },
  });

  pi.registerCommand("tdd", {
    description: "TDD Pipeline - TDD workflow with loop infrastructure",
    handler: async (args, ctx) => {
      const [cmd] = args.trim().split(/\s+/);
      const rest = args.slice(cmd.length).trim();

      if (cmd === "start") {
        const parts = rest.split(/\s+/);
        if (parts.length < 2) {
          ctx.ui.notify("Usage: /tdd start <name> <features...>", "warning");
          return;
        }

        const name = parts[0];
        const features = parts.slice(1).join(" ").split(",").map((f) => f.trim()).filter(Boolean);

        const state: PipelineState = {
          name: sanitize(name),
          features,
          currentFeatureIndex: 0,
          status: "active",
          startedAt: new Date().toISOString(),
        };

        saveState(ctx, state);

        // Create task file
        const taskFile = path.join(TDD_DIR, `${state.name}.md`);
        const taskContent = `# TDD Pipeline: ${name}

## Features
${features.map((f, i) => `- [ ] ${f}`).join("\n")}

## Progress
(Update as you work through each feature)

## Notes
(Blockers, decisions, reflections)
`;
        const fullPath = path.resolve(ctx.cwd, taskFile);
        ensureDir(fullPath);
        fs.writeFileSync(fullPath, taskContent, "utf-8");

        ctx.ui.notify(`Started TDD pipeline: ${name} (${features.length} features)`, "info");
        return;
      }

      if (cmd === "stop") {
        const active = listPipelines(ctx).find((p) => p.status === "active");
        if (!active) {
          ctx.ui.notify("No active TDD pipeline", "warning");
          return;
        }

        active.status = "paused";
        saveState(ctx, active);
        ctx.ui.notify(`Paused TDD pipeline: ${active.name}`, "info");
        return;
      }

      if (cmd === "resume") {
        const name = rest.trim();
        if (!name) {
          ctx.ui.notify("Usage: /tdd resume <name>", "warning");
          return;
        }

        const state = loadState(ctx, name);
        if (!state) {
          ctx.ui.notify(`Pipeline "${name}" not found`, "error");
          return;
        }

        state.status = "active";
        saveState(ctx, state);
        ctx.ui.notify(`Resumed TDD pipeline: ${state.name} (feature ${state.currentFeatureIndex + 1}/${state.features.length})`, "info");
        return;
      }

      if (cmd === "status" || cmd === "list") {
        const pipelines = listPipelines(ctx);
        if (pipelines.length === 0) {
          ctx.ui.notify("No TDD pipelines found", "info");
          return;
        }

        ctx.ui.notify(`TDD pipelines:\n${pipelines.map((p) => formatPipeline(p)).join("\n")}`, "info");
        return;
      }

      if (cmd === "cancel") {
        const name = rest.trim();
        if (!name) {
          ctx.ui.notify("Usage: /tdd cancel <name>", "warning");
          return;
        }

        try {
          const statePath = getPath(ctx, name, ".state.json");
          if (fs.existsSync(statePath)) fs.unlinkSync(statePath);
          ctx.ui.notify(`Cancelled TDD pipeline: ${name}`, "info");
        } catch {
          ctx.ui.notify(`Pipeline "${name}" not found`, "error");
        }
        return;
      }

      ctx.ui.notify(HELP, "info");
    },
  });
}
