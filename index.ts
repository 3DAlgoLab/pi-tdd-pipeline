/**
 * TDD Pipeline - TDD workflow with loop infrastructure and specialized subagents.
 *
 * Provides:
 * - Single-mode subagent (delegates to bundled agents)
 * - TDD pipeline management tool (start/stop/resume/status/cancel)
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
// LOOP INFRASTRUCTURE
// ============================================================================

const STATUS_ICONS: Record<string, string> = { active: "▶", paused: "⏸", completed: "✓" };

function formatPipeline(p: PipelineState): string {
  const status = `${STATUS_ICONS[p.status]} ${p.status}`;
  const progress = `${p.currentFeatureIndex + 1}/${p.features.length}`;
  return `${p.name}: ${status} (feature ${progress})`;
}

export default function (pi: ExtensionAPI) {
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

      // Spawn the subagent process
      let resultOutput = "";

      const exitCode = await new Promise<number>((resolve) => {
        const proc = spawn("pi", args, {
          cwd: ctx.cwd,
          shell: false,
          stdio: ["ignore", "pipe", "pipe"],
        });

        let buffer = "";

        proc.stdout.on("data", (data: Buffer) => {
          buffer += data.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const event = JSON.parse(line);
              if (event.type === "message_end" && event.message) {
                const msg = event.message;
                if (msg.role === "assistant") {
                  for (const part of msg.content) {
                    if (part.type === "text") resultOutput += part.text;
                  }
                }
              }
            } catch {
              // Ignore non-JSON lines
            }
          }
        });

        proc.on("close", (code: number | null) => {
          // Flush remaining buffer (final line may lack trailing newline)
          if (buffer.trim()) {
            try {
              const event = JSON.parse(buffer);
              if (event.type === "message_end" && event.message) {
                const msg = event.message;
                if (msg.role === "assistant") {
                  for (const part of msg.content) {
                    if (part.type === "text") resultOutput += part.text;
                  }
                }
              }
            } catch {
              // Ignore non-JSON remnants
            }
          }
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
        content: [{ type: "text", text: resultOutput || "(no output)" }],
        details: {},
      };
    },
  });

  // Register TDD pipeline management tool
  pi.registerTool({
    name: "tdd",
    label: "TDD Pipeline",
    description: "Manage TDD pipeline state: start, stop, resume, status, cancel",
    parameters: Type.Object({
      command: Type.Union([
        Type.Literal("start"),
        Type.Literal("stop"),
        Type.Literal("resume"),
        Type.Literal("status"),
        Type.Literal("cancel"),
      ]),
      name: Type.Optional(Type.String({ description: "Pipeline name" })),
      features: Type.Optional(Type.Array(Type.String({ description: "Features to implement" }))),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      switch (params.command) {
        case "start": {
          if (!params.name || !params.features?.length) {
            return {
              content: [{ type: "text", text: "Usage: command='start', name='<name>', features=['feature1', 'feature2']" }],
              details: {},
            };
          }
          const state: PipelineState = {
            name: sanitize(params.name),
            features: params.features,
            currentFeatureIndex: 0,
            status: "active",
            startedAt: new Date().toISOString(),
          };
          saveState(ctx, state);
          const taskFile = path.join(TDD_DIR, `${state.name}.md`);
          const taskContent = `# TDD Pipeline: ${params.name}\n\n## Features\n${params.features.map((f) => `- [ ] ${f}`).join("\n")}\n\n## Progress\n(Update as you work through each feature)\n\n## Notes\n(Blockers, decisions, reflections)\n`;
          const fullPath = path.resolve(ctx.cwd, taskFile);
          ensureDir(fullPath);
          fs.writeFileSync(fullPath, taskContent, "utf-8");
          return {
            content: [{ type: "text", text: `Started TDD pipeline: ${params.name} (${params.features.length} features)` }],
            details: {},
          };
        }
        case "stop": {
          const active = listPipelines(ctx).find((p) => p.status === "active");
          if (!active) {
            return {
              content: [{ type: "text", text: "No active TDD pipeline" }],
              details: {},
            };
          }
          active.status = "paused";
          saveState(ctx, active);
          return {
            content: [{ type: "text", text: `Paused TDD pipeline: ${active.name}` }],
            details: {},
          };
        }
        case "resume": {
          if (!params.name) {
            return {
              content: [{ type: "text", text: "Usage: command='resume', name='<name>'" }],
              details: {},
            };
          }
          const state = loadState(ctx, params.name);
          if (!state) {
            return {
              content: [{ type: "text", text: `Pipeline "${params.name}" not found` }],
              details: {},
            };
          }
          state.status = "active";
          saveState(ctx, state);
          return {
            content: [{ type: "text", text: `Resumed TDD pipeline: ${state.name} (feature ${state.currentFeatureIndex + 1}/${state.features.length})` }],
            details: {},
          };
        }
        case "status": {
          const pipelines = listPipelines(ctx);
          if (pipelines.length === 0) {
            return {
              content: [{ type: "text", text: "No TDD pipelines found" }],
              details: {},
            };
          }
          return {
            content: [{ type: "text", text: `TDD pipelines:\n${pipelines.map((p) => formatPipeline(p)).join("\n")}` }],
            details: {},
          };
        }
        case "cancel": {
          if (!params.name) {
            return {
              content: [{ type: "text", text: "Usage: command='cancel', name='<name>'" }],
              details: {},
            };
          }
          const statePath = getPath(ctx, params.name, ".state.json");
          if (fs.existsSync(statePath)) fs.unlinkSync(statePath);
          return {
            content: [{ type: "text", text: `Cancelled TDD pipeline: ${params.name}` }],
            details: {},
          };
        }
        default: {
          return {
            content: [{ type: "text", text: `Unknown command: ${params.command}` }],
            details: {},
          };
        }
      }
    },
  });
}
